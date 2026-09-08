// Lists the app's in-app purchases and subscriptions with their review state through the App Store Connect API.
//   node asc-iap.js --key AuthKey_XXXX.p8 --key-id XXXX --issuer <issuer uuid> --app 6809908576
const fs = require("fs"), crypto = require("crypto");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "app"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
function jwt() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" }), body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(args.key, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return head + "." + body + "." + sig;
}
async function get(url) {
  const r = await fetch("https://api.appstoreconnect.apple.com/v1" + url, { headers: { Authorization: "Bearer " + jwt() } });
  const j = await r.json(); if (!r.ok) throw new Error(url + " → " + JSON.stringify(j.errors || j));
  return j;
}
(async () => {
  const iaps = await get("/apps/" + args.app + "/inAppPurchasesV2?fields[inAppPurchases]=name,productId,inAppPurchaseType,state&limit=50");
  console.log("in-app purchases:");
  for (const p of iaps.data) console.log(`  ${p.attributes.productId.padEnd(34)} ${p.attributes.inAppPurchaseType.padEnd(16)} ${p.attributes.state}`);
  const groups = await get("/apps/" + args.app + "/subscriptionGroups?include=subscriptions&fields[subscriptions]=name,productId,state,subscriptionPeriod,groupLevel");
  for (const g of groups.data) {
    console.log("subscription group " + g.attributes.referenceName + " (" + g.id + "):");
    for (const s of groups.included || []) console.log(`  ${s.attributes.productId.padEnd(34)} ${s.attributes.subscriptionPeriod.padEnd(16)} level ${s.attributes.groupLevel}  ${s.attributes.state}`);
  }
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
