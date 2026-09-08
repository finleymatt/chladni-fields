// Renders the site's link-preview cards (og-plates, og-resonance, og-law at 1200x630) from og.html in the
// repo root, with a Chromium on port 9333.   node tools/render-og.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), SRC = path.join(ROOT, "og.html").replace(/\\/g, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
  let page = targets.find((t) => t.type === "page");
  if (!page) page = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  for (const card of ["plates", "resonance", "law"]) {
    await send("Page.navigate", { url: "file:///" + SRC + "?card=" + card + "&t=" + Date.now() });
    await sleep(3500);
    const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
    const file = path.join(ROOT, "og-" + card + ".png");
    fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("wrote", path.relative(ROOT, file), Math.round(fs.statSync(file).size / 1024) + " KB");
  }
  ws.close();
})().catch((e) => { console.error("RENDER FAILURE: " + e.message); process.exit(1); });
