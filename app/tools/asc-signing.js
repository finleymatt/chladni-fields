// One-time signing setup through the App Store Connect API: creates an Apple Distribution certificate from a
// locally generated key, and an App Store provisioning profile for the bundle ID. Writes dist.p12 and the
// .mobileprovision into --out (never commit that folder). Needs: node 18+, openssl on PATH.
//
//   node asc-signing.js --key AuthKey_XXXX.p8 --key-id XXXX --issuer <issuer uuid> --bundle lol.iamra.chladni --out ./signing
//
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { execFileSync } = require("child_process");
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null).filter(Boolean));
for (const k of ["key", "key-id", "issuer", "bundle", "out"]) if (!args[k]) { console.error("missing --" + k); process.exit(1); }
const OUT = path.resolve(args.out); fs.mkdirSync(OUT, { recursive: true });
const NAME = args.name || "Chladni Fields App Store";

function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "ES256", kid: args["key-id"], typ: "JWT" });
  const body = b64({ iss: args.issuer, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
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
  // 1. key + CSR
  const keyPem = path.join(OUT, "dist.key"), csr = path.join(OUT, "dist.csr");
  if (!fs.existsSync(keyPem)) execFileSync("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPem, "-out", csr, "-subj", "/CN=Chladni Fields Distribution"], { stdio: "pipe" });
  const csrContent = fs.readFileSync(csr, "utf8");

  // 2. distribution certificate (reuse one we made before if the .cer is on disk)
  const cerPath = path.join(OUT, "distribution.cer");
  let certId;
  if (fs.existsSync(cerPath) && fs.existsSync(path.join(OUT, "cert-id.txt"))) {
    certId = fs.readFileSync(path.join(OUT, "cert-id.txt"), "utf8").trim();
    console.log("certificate: reusing", certId);
  } else {
    const c = await api("POST", "certificates", { data: { type: "certificates", attributes: { certificateType: "DISTRIBUTION", csrContent } } });
    certId = c.data.id;
    fs.writeFileSync(cerPath, Buffer.from(c.data.attributes.certificateContent, "base64"));
    fs.writeFileSync(path.join(OUT, "cert-id.txt"), certId);
    console.log("certificate: created", certId, "expires", c.data.attributes.expirationDate);
  }

  // 3. bundle id
  const b = await api("GET", "bundleIds?filter[identifier]=" + encodeURIComponent(args.bundle) + "&filter[platform]=IOS");
  const bundle = (b.data || []).find((x) => x.attributes.identifier === args.bundle);
  if (!bundle) throw new Error("bundle id not registered: " + args.bundle);
  console.log("bundle id:", bundle.id);

  // 4. App Store profile (replace an older one with the same name so it always carries the current certificate)
  const existing = await api("GET", "profiles?filter[name]=" + encodeURIComponent(NAME));
  for (const p of existing.data || []) { await api("DELETE", "profiles/" + p.id); console.log("profile: removed old", p.id); }
  const p = await api("POST", "profiles", { data: { type: "profiles", attributes: { name: NAME, profileType: "IOS_APP_STORE" },
    relationships: { bundleId: { data: { type: "bundleIds", id: bundle.id } }, certificates: { data: [{ type: "certificates", id: certId }] } } } });
  const profPath = path.join(OUT, "appstore.mobileprovision");
  fs.writeFileSync(profPath, Buffer.from(p.data.attributes.profileContent, "base64"));
  console.log("profile: created", p.data.id, "uuid", p.data.attributes.uuid, "expires", p.data.attributes.expirationDate);

  // 5. p12 for the CI keychain
  const pem = path.join(OUT, "distribution.pem"), p12 = path.join(OUT, "dist.p12");
  execFileSync("openssl", ["x509", "-in", cerPath, "-inform", "DER", "-out", pem], { stdio: "pipe" });
  const pass = args.password || crypto.randomBytes(12).toString("hex");
  execFileSync("openssl", ["pkcs12", "-export", "-inkey", keyPem, "-in", pem, "-out", p12, "-passout", "pass:" + pass, "-legacy"], { stdio: "pipe" });
  fs.writeFileSync(path.join(OUT, "p12-password.txt"), pass);
  console.log("p12:", p12, "(password in p12-password.txt)");
  console.log("\nSecrets to set: IOS_P12_BASE64 (base64 of dist.p12), IOS_P12_PASSWORD, IOS_PROFILE_BASE64 (base64 of appstore.mobileprovision)");
})().catch((e) => { console.error("FAILED: " + e.message); process.exit(1); });
