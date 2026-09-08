// Uploads images to App Store Connect through the API: the App Review screenshot every in-app purchase and
// subscription needs before StoreKit will serve it, and the App Store screenshots for the version in preparation.
//   node asc-upload.js review-shots --key AuthKey.p8 --key-id X --issuer <uuid> --app 6809908576 --plus paywall.png --tips tips.png
//   node asc-upload.js screenshots  --key AuthKey.p8 --key-id X --issuer <uuid> --app 6809908576 --dir store/screenshots
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const cmd = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "app"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
const API = "https://api.appstoreconnect.apple.com";
function jwt() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" }), body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(args.key, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return head + "." + body + "." + sig;
}
async function api(method, url, body) {
  const r = await fetch(url.startsWith("http") ? url : API + url, { method, headers: { Authorization: "Bearer " + jwt(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(method + " " + url + " → " + r.status + " " + JSON.stringify(j.errors || j).slice(0, 400));
  return j;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the three-step asset upload every ASC image uses: reserve, PUT the bytes where told, commit with a checksum */
async function uploadAsset(createUrl, type, file, relationships) {
  const data = fs.readFileSync(file), md5 = crypto.createHash("md5").update(data).digest("hex");
  const made = await api("POST", createUrl, { data: { type, attributes: { fileName: path.basename(file), fileSize: data.length }, relationships } });
  const id = made.data.id, ops = made.data.attributes.uploadOperations || [];
  for (const op of ops) {
    const headers = {}; (op.requestHeaders || []).forEach((h) => { headers[h.name] = h.value; });
    const r = await fetch(op.url, { method: op.method || "PUT", headers, body: data.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error("upload chunk failed: " + r.status);
  }
  await api("PATCH", "/v1/" + type + "/" + id, { data: { type, id, attributes: { uploaded: true, sourceFileChecksum: md5 } } });
  for (let i = 0; i < 20; i++) {
    const s = await api("GET", "/v1/" + type + "/" + id);
    const st = s.data.attributes.assetDeliveryState || {};
    if (st.state === "COMPLETE") return id;
    if (st.state === "FAILED") throw new Error("asset processing failed: " + JSON.stringify(st.errors || st));
    await sleep(3000);
  }
  return id;
}

async function reviewShots() {
  if (!args.plus || !args.tips) throw new Error("need --plus <png> and --tips <png>");
  const iaps = await api("GET", "/v1/apps/" + args.app + "/inAppPurchasesV2?fields[inAppPurchases]=productId,state&limit=50");
  for (const p of iaps.data) {
    const file = /\.tip\./.test(p.attributes.productId) ? args.tips : args.plus;
    const have = await api("GET", "/v2/inAppPurchases/" + p.id + "/appStoreReviewScreenshot").catch(() => null);
    if (have && have.data) { console.log(p.attributes.productId + ": replacing existing screenshot"); await api("DELETE", "/v1/inAppPurchaseAppStoreReviewScreenshots/" + have.data.id); }
    await uploadAsset("/v1/inAppPurchaseAppStoreReviewScreenshots", "inAppPurchaseAppStoreReviewScreenshots", file, { inAppPurchaseV2: { data: { type: "inAppPurchases", id: p.id } } });
    const after = await api("GET", "/v2/inAppPurchases/" + p.id + "?fields[inAppPurchases]=state");
    console.log(p.attributes.productId + ": screenshot uploaded → " + after.data.attributes.state);
  }
  const groups = await api("GET", "/v1/apps/" + args.app + "/subscriptionGroups?include=subscriptions&fields[subscriptions]=productId,state");
  for (const s of (groups.included || []).filter((x) => x.type === "subscriptions")) {
    const have = await api("GET", "/v1/subscriptions/" + s.id + "/appStoreReviewScreenshot").catch(() => null);
    if (have && have.data) { console.log(s.attributes.productId + ": replacing existing screenshot"); await api("DELETE", "/v1/subscriptionAppStoreReviewScreenshots/" + have.data.id); }
    await uploadAsset("/v1/subscriptionAppStoreReviewScreenshots", "subscriptionAppStoreReviewScreenshots", args.plus, { subscription: { data: { type: "subscriptions", id: s.id } } });
    const after = await api("GET", "/v1/subscriptions/" + s.id + "?fields[subscriptions]=state");
    console.log(s.attributes.productId + ": screenshot uploaded → " + after.data.attributes.state);
  }
}

async function screenshots() {
  const dir = args.dir || path.join(__dirname, "..", "store", "screenshots");
  const versions = await api("GET", "/v1/apps/" + args.app + "/appStoreVersions?filter[platform]=IOS&limit=5&fields[appStoreVersions]=versionString,appStoreState");
  const v = versions.data.find((x) => /PREPARE_FOR_SUBMISSION|DEVELOPER_REJECTED|REJECTED|METADATA_REJECTED|WAITING_FOR_REVIEW/.test(x.attributes.appStoreState)) || versions.data[0];
  if (!v) throw new Error("no app store version found");
  console.log("version " + v.attributes.versionString + " (" + v.attributes.appStoreState + ")");
  const locs = await api("GET", "/v1/appStoreVersions/" + v.id + "/appStoreVersionLocalizations");
  const loc = locs.data.find((l) => l.attributes.locale === "en-US") || locs.data[0];
  const sets = await api("GET", "/v1/appStoreVersionLocalizations/" + loc.id + "/appScreenshotSets?include=appScreenshots&limit=20");
  for (const [type, prefix] of [["APP_IPHONE_67", "iphone-6.9-"], ["APP_IPHONE_65", "iphone-6.5-"]]) {
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".png")).sort((a, b) => parseInt(a.replace(prefix, "")) - parseInt(b.replace(prefix, "")));
    if (!files.length) { console.log(type + ": no files with prefix " + prefix); continue; }
    let set = sets.data.find((s) => s.attributes.screenshotDisplayType === type);
    if (!set) set = (await api("POST", "/v1/appScreenshotSets", { data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: loc.id } } } } })).data;
    const existing = (set.relationships && set.relationships.appScreenshots && set.relationships.appScreenshots.data) || [];
    for (const e of existing) await api("DELETE", "/v1/appScreenshots/" + e.id);
    console.log(type + ": removed " + existing.length + ", uploading " + files.length);
    const ids = [];
    for (const f of files) { ids.push(await uploadAsset("/v1/appScreenshots", "appScreenshots", path.join(dir, f), { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } })); console.log("  " + f); }
    await api("PATCH", "/v1/appScreenshotSets/" + set.id + "/relationships/appScreenshots", { data: ids.map((id) => ({ type: "appScreenshots", id })) });
  }
}

(cmd === "review-shots" ? reviewShots() : cmd === "screenshots" ? screenshots() : Promise.reject(new Error("command: review-shots | screenshots")))
  .catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
