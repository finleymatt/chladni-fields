// Builds www/ (Capacitor's webDir) from the site one folder up: the three pages plus the privacy page,
// the app's own You page, the icons, self-hosted fonts, and the native layer (safe areas, tab bar,
// sheets, haptics, account and Plus). GOOGLE_IOS_CLIENT_ID in the environment enables Google sign-in.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), WWW = path.join(__dirname, "www");
const PAGES = [["index.html", ROOT], ["frequencies.html", ROOT], ["law-of-one.html", ROOT], ["privacy.html", ROOT], ["faq.html", ROOT], ["you.html", path.join(__dirname, "native")]];
const ASSETS = ["favicon-64.png", "icon-512.png", "apple-touch-icon.png", "og-plates.png", "og-resonance.png", "og-law.png"];
const FONT_LINK = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" \/>/;
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, "fonts"), { recursive: true });
fs.mkdirSync(path.join(WWW, "native"), { recursive: true });

for (const f of fs.readdirSync(path.join(__dirname, "fonts"))) fs.copyFileSync(path.join(__dirname, "fonts", f), path.join(WWW, "fonts", f));
for (const f of ["native.css", "native.js", "plus.js"]) fs.copyFileSync(path.join(__dirname, "native", f), path.join(WWW, "native", f));
for (const f of ASSETS) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(WWW, f));

const config = { googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID || "", version: pkg.version };
fs.writeFileSync(path.join(WWW, "native", "config.js"), "window.CHLADNI_CONFIG = " + JSON.stringify(config) + ";\n");

const inject = '<link rel="stylesheet" href="fonts/fonts.css" />\n<link rel="stylesheet" href="native/native.css" />\n<script src="native/config.js"></script>\n<script src="native/native.js"></script>\n<script src="native/plus.js"></script>';
for (const [p, dir] of PAGES) {
  let html = fs.readFileSync(path.join(dir, p), "utf8");
  if (!FONT_LINK.test(html)) throw new Error(p + ": Google Fonts link not found where expected");
  html = html.replace(FONT_LINK, inject);
  // icons are referenced by absolute URL on the site; the bundle has its own copies
  html = html.replace(/href="https:\/\/iamra\.lol\/(favicon-64|icon-512|apple-touch-icon)\.png"/g, 'href="$1.png"');
  fs.writeFileSync(path.join(WWW, p), html);
}
console.log("www: " + PAGES.map((x) => x[0]).join(", ") + " + " + fs.readdirSync(path.join(WWW, "fonts")).length + " font files" + (config.googleIosClientId ? " · Google sign-in on" : " · Google sign-in off (no GOOGLE_IOS_CLIENT_ID)"));
