// Signing for the widget extension, through the App Store Connect API: registers the extension's bundle ID,
// turns on App Groups for both bundle IDs, and (re)creates the two App Store profiles with the existing
// distribution certificate. The App Group itself (group.lol.iamra.chladni) has no public API: create it once
// in developer.apple.com → Identifiers → App Groups and assign it to both App IDs, then run this.
//   node asc-widgets-signing.js --key AuthKey.p8 --key-id X --issuer <uuid> --out ./signing
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "out"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
const OUT = path.resolve(args.out);
const APP = "lol.iamra.chladni", WIDGET = "lol.iamra.chladni.widgets";
const PROFILES = [[APP, "Chladni Fields App Store", "appstore.mobileprovision"], [WIDGET, "Chladni Fields Widgets App Store", "widgets.mobileprovision"]];
function jwt() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" }), body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(args.key, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return head + "." + body + "." + sig;
}
async function api(method, url, body) {
  const r = await fetch("https://api.appstoreconnect.apple.com/v1/" + url, { method, headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch (e) {}
  if (!r.ok) throw new Error(method + " " + url + " → " + r.status + " " + (json.errors ? json.errors.map((e) => e.title + ": " + e.detail).join("; ") : text.slice(0, 300)));
  return json;
}
(async () => {
  const certId = fs.readFileSync(path.join(OUT, "cert-id.txt"), "utf8").trim();
  console.log("certificate:", certId);
  const ids = {};
  for (const bid of [APP, WIDGET]) {
    const b = await api("GET", "bundleIds?filter[identifier]=" + encodeURIComponent(bid) + "&filter[platform]=IOS&include=bundleIdCapabilities");
    let rec = (b.data || []).find((x) => x.attributes.identifier === bid);
    if (!rec) {
      rec = (await api("POST", "bundleIds", { data: { type: "bundleIds", attributes: { identifier: bid, name: "Chladni Fields Widgets", platform: "IOS" } } })).data;
      console.log("bundle id: registered", bid, rec.id);
    } else console.log("bundle id:", bid, rec.id);
    ids[bid] = rec.id;
    const caps = (b.included || []).filter((c) => c.type === "bundleIdCapabilities" && c.relationships === undefined ? true : true).map((c) => c.attributes.capabilityType);
    if (!caps.includes("APP_GROUPS")) {
      try {
        await api("POST", "bundleIdCapabilities", { data: { type: "bundleIdCapabilities", attributes: { capabilityType: "APP_GROUPS" }, relationships: { bundleId: { data: { type: "bundleIds", id: rec.id } } } } });
        console.log("  App Groups capability: enabled");
      } catch (e) { console.log("  App Groups capability: " + e.message); }
    } else console.log("  App Groups capability: already on");
  }
  for (const [bid, name, file] of PROFILES) {
    const existing = await api("GET", "profiles?filter[name]=" + encodeURIComponent(name));
    for (const p of existing.data || []) { await api("DELETE", "profiles/" + p.id); console.log("profile: removed old", name, p.id); }
    const p = await api("POST", "profiles", { data: { type: "profiles", attributes: { name, profileType: "IOS_APP_STORE" },
      relationships: { bundleId: { data: { type: "bundleIds", id: ids[bid] } }, certificates: { data: [{ type: "certificates", id: certId }] } } } });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(p.data.attributes.profileContent, "base64"));
    console.log("profile: created", name, p.data.id, "→", file);
  }
  console.log("\nSecrets: IOS_PROFILE_BASE64 (appstore.mobileprovision) and IOS_PROFILE_WIDGET_BASE64 (widgets.mobileprovision)");
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
