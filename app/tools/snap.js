// Screenshots a built www/ page as the app shows it (phone size, the stand-in bridge in place), for checking
// layout and for the App Review screenshots of the purchase sheets. Needs a Chromium on port 9333.
//   node tools/snap.js frequencies.html out.png [--sheet paywall|tips] [--preset "Rainy night"] [--hash sleep] [--wait 4000] [--vibe dmt]
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2), pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const opt = Object.fromEntries(args.map((a, i) => a.startsWith("--") ? [a.slice(2), args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true] : null).filter(Boolean));
const PAGE = pos[0], OUT = pos[1]; if (!PAGE || !OUT) { console.error("usage: snap.js <page.html> <out.png> [--sheet ..] [--preset ..] [--hash ..] [--vibe dmt]"); process.exit(1); }
const WWW = path.join(__dirname, "..", "www").replace(/\\/g, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9333/json")).json();
  let page = targets.find((t) => t.type === "page");
  if (!page) page = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 3, mobile: true });
  const boot = fs.readFileSync(path.join(__dirname, "..", "store", "fake-bridge.js"), "utf8") +
    "\ntry { localStorage.setItem('chladni-theme','dark'); localStorage.setItem('chladni-vibe', " + JSON.stringify(opt.vibe === "dmt" ? "dmt" : "") + "); localStorage.setItem('cf:onboarded','true'); sessionStorage.setItem('cf:launched','1'); } catch (e) {}" +
    "\ndocument.addEventListener('DOMContentLoaded', function () { var s = document.createElement('style'); s.textContent = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}'; document.head.appendChild(s); });";
  await send("Page.addScriptToEvaluateOnNewDocument", { source: boot });
  const q = opt.sheet ? "?sheet=" + opt.sheet : "?snap=1";
  await send("Page.navigate", { url: "file:///" + WWW + "/" + PAGE + q + (opt.hash ? "#" + opt.hash : "") });
  await sleep(1800);
  if (opt.preset) {
    await send("Runtime.evaluate", { expression: "(function(){var b=Array.prototype.find.call(document.querySelectorAll('.preset'),function(x){return x.textContent.indexOf(" + JSON.stringify(opt.preset) + ")>=0});if(b)b.click();return !!b})()" });
    await sleep(1200);
    if (opt.hash) await send("Runtime.evaluate", { expression: "document.getElementById(" + JSON.stringify(opt.hash) + ").scrollIntoView()" });
  }
  await sleep(parseInt(opt.wait || "2500", 10));
  if (opt.eval) { const e = await send("Runtime.evaluate", { expression: opt.eval, returnByValue: true }); console.log("eval:", JSON.stringify(e.result && e.result.result && e.result.result.value)); }
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(OUT, Buffer.from(r.result.data, "base64"));
  console.log("wrote", OUT, Math.round(fs.statSync(OUT).size / 1024) + " KB");
  ws.close();
}
main().catch((e) => { console.error("SNAP FAILURE: " + e.message); process.exit(1); });
