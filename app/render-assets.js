// Renders assets/art.html into the Xcode asset catalog: the 1024 app icon and the 2732 launch image.
// Needs a Chromium with remote debugging on port 9333 (see README: headless Edge on Windows).
const fs = require("fs"), path = require("path");
const PORT = 9333, SRC = path.join(__dirname, "assets", "art.html").replace(/\\/g, "/");
const CAT = path.join(__dirname, "ios", "App", "App", "Assets.xcassets");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  let page = targets.find((t) => t.type === "page");
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable");
  const jobs = [
    { art: "icon", size: 1024, out: path.join(CAT, "AppIcon.appiconset", "AppIcon-512@2x.png") },
    { art: "icon", variant: "dark", size: 1024, out: path.join(CAT, "AppIcon.appiconset", "AppIcon-dark.png") },
    { art: "icon", variant: "tinted", size: 1024, transparent: true, out: path.join(CAT, "AppIcon.appiconset", "AppIcon-tinted.png") },
    { art: "splash", size: 2732, out: path.join(CAT, "Splash.imageset", "splash-2732x2732.png") },
    { art: "splash", size: 2732, out: path.join(CAT, "Splash.imageset", "splash-2732x2732-1.png") },
    { art: "splash", size: 2732, out: path.join(CAT, "Splash.imageset", "splash-2732x2732-2.png") },
  ];
  for (const j of jobs) {
    await send("Emulation.setDeviceMetricsOverride", { width: j.size, height: j.size, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setDefaultBackgroundColorOverride", j.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    await send("Page.navigate", { url: `file:///${SRC}?art=${j.art}${j.variant ? "&variant=" + j.variant : ""}&t=${Date.now()}` });
    await sleep(800);
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: j.size, height: j.size, scale: 1 } });
    fs.writeFileSync(j.out, Buffer.from(r.result.data, "base64"));
    console.log("wrote", path.relative(__dirname, j.out), Math.round(fs.statSync(j.out).size / 1024) + " KB");
  }
  ws.close();
}
main().catch((e) => { console.error("RENDER FAILURE: " + e.message); process.exit(1); });
