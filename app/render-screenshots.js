// Renders the five App Store screenshots (1320x2868, the 6.9-inch iPhone size) from store/shot.html,
// which frames the built www/ pages. Run `node build-www.js` first, with headless Chromium on port 9333.
const fs = require("fs"), path = require("path");
const PORT = 9333, SRC = path.join(__dirname, "store", "shot.html").replace(/\\/g, "/");
const OUT = path.join(__dirname, "store", "screenshots"); fs.mkdirSync(OUT, { recursive: true });
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
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 956, deviceScaleFactor: 3, mobile: true });
  // the framed pages get the app's own chrome (tab bar, native layout) through a stand-in bridge, in every frame
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(__dirname, "store", "fake-bridge.js"), "utf8") +
    "\ndocument.addEventListener('DOMContentLoaded', function () { var s = document.createElement('style'); s.textContent = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}'; document.head.appendChild(s); });" });
  for (const n of ["1", "2", "3", "4", "5", "6", "7"]) {
    await send("Page.navigate", { url: `file:///${SRC}?shot=${n}&t=${Date.now()}` });
    await sleep(n === "1" ? 6000 : 4500); // the framed page boots its audio engine and settles its plate
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 440, height: 956, scale: 1 } });
    const file = path.join(OUT, `iphone-6.9-${n}.png`);
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("wrote", path.relative(__dirname, file), Math.round(fs.statSync(file).size / 1024) + " KB");
  }
  ws.close();
}
main().catch((e) => { console.error("RENDER FAILURE: " + e.message); process.exit(1); });
