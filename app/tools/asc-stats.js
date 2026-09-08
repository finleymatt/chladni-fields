// Pulls the app's numbers from App Store Connect (App Analytics reports, TestFlight build metrics, testers,
// feedback) and writes a private dashboard: stats.json and stats.html in --out.
//   node asc-stats.js --key AuthKey.p8 --key-id X --issuer <uuid> --app 6809908576 --out <dir> [--days 30]
// Apple only generates analytics reports once a report request exists (this script creates ONGOING and
// ONE_TIME_SNAPSHOT requests if missing) and the first instances appear a day or two later.
const fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "app", "out"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
const DAYS = parseInt(args.days || "30", 10), OUT = path.resolve(args.out); fs.mkdirSync(OUT, { recursive: true });
function jwt() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" }), body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(args.key, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return head + "." + body + "." + sig;
}
async function api(method, url, body) {
  const r = await fetch(url.startsWith("http") ? url : "https://api.appstoreconnect.apple.com" + url, { method, headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  if (!r.ok) throw new Error(method + " " + url + " → " + r.status + " " + (j.errors ? j.errors.map((e) => e.title + ": " + e.detail).join("; ") : t.slice(0, 200)));
  return j;
}
const day = (d) => new Date(d).toISOString().slice(0, 10);
const today = day(Date.now()), since = day(Date.now() - DAYS * 864e5);

/* ---- App Analytics: a handful of reports, summed per day over the window ---- */
const WANT = [
  { key: "downloads", re: /^App Store Downloads$|^App Downloads/i, metrics: [/total downloads|downloads/i] },
  { key: "installs", re: /Installation and Deletion/i, metrics: [/installs|installations/i] },
  { key: "sessions", re: /^App Sessions/i, metrics: [/sessions/i] },
  { key: "impressions", re: /Discovery and Engagement/i, metrics: [/impressions/i] },
  { key: "crashes", re: /^App Crashes/i, metrics: [/crashes/i] },
  { key: "purchases", re: /App Store Purchases/i, metrics: [/proceeds|revenue/i] },
  { key: "subscriptions", re: /^Subscri/i, metrics: [/active|subscri/i] }
];
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean); if (!lines.length) return { head: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map((h) => h.replace(/^"|"$/g, "").trim());
  return { head, rows: lines.slice(1).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim())) };
}
async function analytics() {
  const out = { available: false, requestedAt: null, series: {} };
  let reqs = (await api("GET", "/v1/apps/" + args.app + "/analyticsReportRequests")).data;
  for (const type of ["ONGOING", "ONE_TIME_SNAPSHOT"]) {
    if (!reqs.some((r) => r.attributes.accessType === type)) {
      try { await api("POST", "/v1/analyticsReportRequests", { data: { type: "analyticsReportRequests", attributes: { accessType: type }, relationships: { app: { data: { type: "apps", id: args.app } } } } }); console.log("requested " + type + " analytics reports"); } catch (e) { console.log("request " + type + ": " + e.message); }
    }
  }
  reqs = (await api("GET", "/v1/apps/" + args.app + "/analyticsReportRequests")).data;
  const ongoing = reqs.find((r) => r.attributes.accessType === "ONGOING") || reqs[0];
  if (!ongoing) return out;
  const reports = (await api("GET", "/v1/analyticsReportRequests/" + ongoing.id + "/reports?limit=200")).data;
  for (const w of WANT) {
    const rep = reports.find((r) => w.re.test(r.attributes.name)); if (!rep) continue;
    let inst = [];
    try { inst = (await api("GET", "/v1/analyticsReports/" + rep.id + "/instances?filter[granularity]=DAILY&limit=200")).data; } catch (e) { continue; }
    inst = inst.filter((i) => i.attributes.processingDate >= since).sort((a, b) => a.attributes.processingDate.localeCompare(b.attributes.processingDate));
    const series = {};
    for (const i of inst) {
      let segs = []; try { segs = (await api("GET", "/v1/analyticsReportInstances/" + i.id + "/segments")).data; } catch (e) { continue; }
      for (const s of segs) {
        const r = await fetch(s.attributes.url); const buf = Buffer.from(await r.arrayBuffer());
        let text; try { text = zlib.gunzipSync(buf).toString("utf8"); } catch (e) { text = buf.toString("utf8"); }
        const { head, rows } = parseCsv(text);
        const dateCol = head.findIndex((h) => /^date$/i.test(h)), metricCol = head.findIndex((h) => w.metrics.some((m) => m.test(h)));
        if (metricCol < 0) continue;
        for (const row of rows) { const d = dateCol >= 0 ? row[dateCol] : i.attributes.processingDate; const v = parseFloat(row[metricCol]) || 0; series[d] = (series[d] || 0) + v; }
      }
      out.available = true;
    }
    out.series[w.key] = { name: rep.attributes.name, daily: series };
  }
  return out;
}

/* ---- TestFlight ---- */
async function testflight() {
  const builds = (await api("GET", "/v1/builds?filter[app]=" + args.app + "&sort=-uploadedDate&limit=20&fields[builds]=version,uploadedDate,processingState")).data;
  const rows = [];
  for (const b of builds) {
    let v = {}; try { const m = await api("GET", "/v1/builds/" + b.id + "/metrics/betaBuildUsages"); v = (m.data[0] && m.data[0].dataPoints && m.data[0].dataPoints[0] && m.data[0].dataPoints[0].values) || {}; } catch (e) {}
    rows.push({ build: b.attributes.version, uploaded: b.attributes.uploadedDate, installs: v.installCount || 0, sessions: v.sessionCount || 0, crashes: v.crashCount || 0, feedback: v.feedbackCount || 0, invites: v.inviteCount || 0 });
  }
  const testers = (await api("GET", "/v1/betaTesters?filter[apps]=" + args.app + "&limit=200")).data.length;
  let feedback = 0; try { feedback = (await api("GET", "/v1/apps/" + args.app + "/betaFeedbackScreenshotSubmissions?limit=200")).data.length; } catch (e) {}
  return { builds: rows, testers, feedback };
}

/* ---- the page ---- */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
function sum(series, days) { const cut = day(Date.now() - days * 864e5); return Object.keys(series).filter((d) => d >= cut).reduce((a, d) => a + series[d], 0); }
function spark(series) {
  const days = []; for (let i = DAYS - 1; i >= 0; i--) days.push(day(Date.now() - i * 864e5));
  const vals = days.map((d) => series[d] || 0), max = Math.max(1, ...vals), W = 320, H = 56, bw = W / days.length;
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + vals.map((v, i) => { const h = Math.max(v ? 2 : 0, (v / max) * (H - 4)); return '<rect x="' + (i * bw + 1).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1"/>'; }).join("") + "</svg>";
}
function card(label, value, note, series) {
  return '<section class="card"><p class="lbl">' + esc(label) + '</p><p class="big">' + esc(value) + '</p>' + (note ? '<p class="note">' + esc(note) + '</p>' : "") + (series ? spark(series) : "") + "</section>";
}
function render(data) {
  const a = data.analytics, tf = data.testflight, s = a.series;
  const g = (k) => (s[k] && s[k].daily) || {};
  const totalTf = tf.builds.reduce((o, b) => ({ installs: o.installs + b.installs, sessions: o.sessions + b.sessions, crashes: o.crashes + b.crashes }), { installs: 0, sessions: 0, crashes: 0 });
  const storeCards = a.available
    ? [card("Downloads · " + DAYS + " days", sum(g("downloads"), DAYS).toLocaleString(), "last 7 days: " + sum(g("downloads"), 7).toLocaleString(), g("downloads")),
       card("Sessions · " + DAYS + " days", sum(g("sessions"), DAYS).toLocaleString(), "last 7 days: " + sum(g("sessions"), 7).toLocaleString(), g("sessions")),
       card("Store page views", sum(g("impressions"), DAYS).toLocaleString(), "impressions, " + DAYS + " days", g("impressions")),
       card("Crashes", sum(g("crashes"), DAYS).toLocaleString(), DAYS + " days", g("crashes")),
       card("Plus proceeds", "$" + sum(g("purchases"), DAYS).toFixed(2), DAYS + " days, after Apple's cut", g("purchases")),
       card("Subscribers", (Object.values(g("subscriptions")).slice(-1)[0] || 0).toLocaleString(), "active, latest day", g("subscriptions"))].join("")
    : '<section class="card card--wide"><p class="lbl">App Store analytics</p><p class="big">Collecting</p><p class="note">Apple generates these reports a day or two after they are first requested (requested ' + esc(data.generated.slice(0, 10)) + '). Downloads, sessions, store page views, crashes, Plus proceeds and subscribers appear here once the app is live and the first reports land.</p></section>';
  const tfRows = tf.builds.map((b) => '<tr><td>' + esc(b.build) + '</td><td>' + esc(b.uploaded.slice(0, 10)) + '</td><td>' + b.installs + '</td><td>' + b.sessions + '</td><td>' + b.crashes + '</td><td>' + b.feedback + '</td></tr>').join("");
  return `<title>Slowtide Numbers</title>
<style>
  :root { --bg:#0d120e; --panel:#151b14; --panel-2:#1b2119; --edge:#2c3326; --ink:#e9e5d7; --muted:#8b9568; --accent:#d3a851; --sound:#64bac8; }
  html { color-scheme: dark; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Iowan Old Style',Georgia,serif; font-size:16px; line-height:1.5; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 60px; }
  .eyebrow { font-family: ui-monospace, Menlo, monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
  h1 { font-family: 'Avenir Next', 'Segoe UI', system-ui, sans-serif; font-weight: 700; font-size: 2rem; line-height: 1.05; margin: 0 0 6px; }
  h1 .amp { color: var(--accent); font-weight: 500; }
  .sub { color: var(--muted); margin: 0 0 24px; }
  h2 { font-family: ui-monospace, Menlo, monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); margin: 30px 0 12px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 16px 16px 12px; display: grid; gap: 4px; }
  .card--wide { grid-column: 1 / -1; }
  .lbl { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); margin: 0; }
  .big { font-family: 'Avenir Next', 'Segoe UI', system-ui, sans-serif; font-weight: 700; font-size: 2rem; line-height: 1.1; margin: 0; font-variant-numeric: tabular-nums; }
  .note { margin: 0; color: var(--muted); font-size: .92rem; }
  .spark { width: 100%; height: 56px; margin-top: 8px; fill: var(--sound); opacity: .9; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; overflow: hidden; font-variant-numeric: tabular-nums; }
  .tablewrap { overflow-x: auto; }
  th, td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--edge); font-size: .95rem; }
  th { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); border-top: 0; }
  td:nth-child(n+3), th:nth-child(n+3) { text-align: right; }
  .foot { margin-top: 30px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--muted); letter-spacing: .04em; }
</style>
<div class="wrap">
  <p class="eyebrow">Slowtide · App Store Connect</p>
  <h1>How it's <span class="amp">going</span>.</h1>
  <p class="sub">Downloads, sessions, crashes and Plus, from Apple's App Analytics; TestFlight installs and feedback while the beta runs. Updated ${esc(data.generated.replace("T", " ").slice(0, 16))} UTC.</p>
  <h2>App Store</h2>
  <div class="grid">${storeCards}</div>
  <h2>TestFlight</h2>
  <div class="grid">
    ${card("Testers", tf.testers.toLocaleString(), "invited to the Team group")}
    ${card("Installs", totalTf.installs.toLocaleString(), "across all builds")}
    ${card("Sessions", totalTf.sessions.toLocaleString(), "across all builds")}
    ${card("Feedback", tf.feedback.toLocaleString(), "screenshots sent from TestFlight")}
  </div>
  <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Build</th><th>Uploaded</th><th>Installs</th><th>Sessions</th><th>Crashes</th><th>Feedback</th></tr></thead><tbody>${tfRows}</tbody></table></div>
  <p class="foot">Source: App Store Connect API. Nothing in the app reports usage; these are Apple's own counts from users who share analytics with developers (about a third of iPhone users), so treat them as a floor. Regenerate with node app/tools/asc-stats.js.</p>
</div>`;
}
(async () => {
  const data = { generated: new Date().toISOString(), analytics: await analytics(), testflight: await testflight() };
  fs.writeFileSync(path.join(OUT, "stats.json"), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(OUT, "stats.html"), render(data));
  console.log("wrote", path.join(OUT, "stats.html"), "· analytics " + (data.analytics.available ? "available" : "not yet generated") + " · testflight builds " + data.testflight.builds.length);
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
