// Lists the app's recent builds and their processing state through the App Store Connect API.
//   node asc-builds.js --key AuthKey_XXXX.p8 --key-id XXXX --issuer <issuer uuid> --app 6809908576 [--wait]
// --wait polls every 60 s (up to 30 min) until the newest build leaves PROCESSING.
const fs = require("fs"), crypto = require("crypto");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "app"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
function jwt() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" }), body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(args.key, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return head + "." + body + "." + sig;
}
async function builds() {
  const r = await fetch("https://api.appstoreconnect.apple.com/v1/builds?filter[app]=" + args.app + "&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate,expired", { headers: { Authorization: "Bearer " + jwt() } });
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j.errors || j));
  return j.data.map((b) => ({ build: b.attributes.version, state: b.attributes.processingState, uploaded: b.attributes.uploadedDate }));
}
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 30; i++) {
    const list = await builds();
    console.log(new Date().toISOString().slice(11, 19), list.map((b) => `(${b.build}) ${b.state}`).join("  ") || "no builds yet");
    if (!args.wait || (list[0] && list[0].state !== "PROCESSING")) break;
    await sleep(60000);
  }
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
