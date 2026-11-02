// Dev helper: open a URL in headless Edge, wait, print console errors, save screenshot.
// Usage: node scripts/browser-check.mjs <url> <outPng> [waitMs] [evalJs]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [url, out, wait = "15000", evalJs] = process.argv.slice(2);
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9333 + Math.floor(Math.random() * 500);
const proc = spawn(edge, [
  "--headless=new", "--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  `--remote-debugging-port=${port}`, "--window-size=1400,900", `--user-data-dir=${process.env.TEMP}\\pr-edge-${port}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.find((t) => t.type === "page")) break; } catch {}
  await sleep(250);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) return pending.get(d.id)(d.result);
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) console.log("[console." + d.params.type + "]", d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  if (d.method === "Runtime.exceptionThrown") console.log("[exception]", (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 400));
  if (d.method === "Network.loadingFailed") console.log("[net fail]", d.params.errorText, d.params.requestId);
};
await send("Runtime.enable");
await send("Network.enable");
await send("Page.enable");
if (process.env.MOBILE) {
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
}
await send("Page.navigate", { url });
await sleep(Number(wait));
if (evalJs) {
  const r = await send("Runtime.evaluate", { expression: evalJs, returnByValue: true, awaitPromise: true });
  console.log("[eval]", JSON.stringify(r.result?.value ?? r.exceptionDetails?.text));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
proc.kill();
process.exit(0);
