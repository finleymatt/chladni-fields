// Pulls TestFlight beta feedback (screenshot submissions and crash reports) for the app through the App Store Connect API,
// prints each entry and downloads its screenshots.
//   node asc-feedback.js --key AuthKey_XXXX.p8 --key-id XXXX --issuer <issuer uuid> --app 6809908576 --out <dir>
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "app", "out"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
function jwt() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" }), body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: fs.readFileSync(args.key, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return head + "." + body + "." + sig;
}
async function get(url) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + jwt() } });
  const j = await r.json(); if (!r.ok) throw new Error(url + " → " + JSON.stringify(j.errors || j));
  return j;
}
(async () => {
  fs.mkdirSync(args.out, { recursive: true });
  const base = "https://api.appstoreconnect.apple.com/v1/apps/" + args.app;
  const shots = await get(base + "/betaFeedbackScreenshotSubmissions?sort=-createdDate&limit=50&include=build&fields[builds]=version");
  console.log("screenshot feedback: " + shots.data.length);
  let n = 0;
  for (const s of shots.data) {
    n++;
    const a = s.attributes, build = (shots.included || []).find((b) => b.id === (s.relationships?.build?.data?.id));
    console.log(`\n#${n}  ${a.createdDate}  build ${build ? build.attributes.version : "?"}  ${a.deviceModel || ""} iOS ${a.osVersion || ""}  ${a.screenWidth || ""}x${a.screenHeight || ""}`);
    console.log("   " + (a.comment || "(no comment)").replace(/\n/g, "\n   "));
    let i = 0;
    for (const img of a.screenshots || []) {
      i++;
      const file = path.join(args.out, `fb${String(n).padStart(2, "0")}-${i}.png`);
      const r = await fetch(img.url); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      console.log("   → " + file);
    }
  }
  const crashes = await get(base + "/betaFeedbackCrashSubmissions?sort=-createdDate&limit=50");
  console.log("\ncrash feedback: " + crashes.data.length);
  for (const c of crashes.data) console.log(`  ${c.attributes.createdDate}  ${c.attributes.deviceModel || ""}  ${c.attributes.comment || ""}`);
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
