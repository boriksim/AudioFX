import { JSDOM } from "jsdom";
const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div class="viz-panel"><canvas id="visualizer" width="800" height="160"></canvas></div>
<div id="effects-container"></div>
</body></html>`, { runScripts: "outside-only" });
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
globalThis.performance = { now: () => Date.now() };

const { EffectChainManager } = await import("./core/EffectChainManager.js");
const { PluginRegistry } = await import("./core/PluginRegistry.js");
const { InputMic } = await import("./effects/InputMic.js");
const { DistortionEffect } = await import("./effects/DistortionEffect.js");
const { LowpassEffect } = await import("./effects/LowpassEffect.js");
const { DelayEffect } = await import("./effects/DelayEffect.js");
const { PatchboardUI } = await import("./ui/PatchboardUI.js");

const reg = new PluginRegistry()
  .register(InputMic)
  .register(DistortionEffect)
  .register(LowpassEffect)
  .register(DelayEffect);
const ecm = new EffectChainManager({ createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }), createAnalyser: () => ({ fftSize: 2048, frequencyBinCount: 1024, getByteFrequencyData() {}, getFloatTimeDomainData() {} }), createBiquadFilter: () => ({ frequency: { value: 0 }, Q: { value: 0 }, type: "", connect() {}, disconnect() {}, getFrequencyResponse() {} }), createDelay: () => ({ delayTime: { value: 0 }, connect() {}, disconnect() {} }), createWaveShaper: () => ({ curve: null, oversample: "none", connect() {}, disconnect() {} }), createChannelSplitter: () => ({ connect() {}, disconnect() {} }), createChannelMerger: () => ({ connect() {}, disconnect() {} }), destination: { connect() {}, disconnect() {} }, currentTime: 0, sampleRate: 44100, state: "running", addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, "#effects-container", reg, { useSchemaUI: true });
await ecm.addEffect("input-mic");
await ecm.addEffect("distortion");
await ecm.addEffect("lowpass");
await ecm.addEffect("delay");
console.log("Chain length:", ecm.effectChain.length);
console.log("Positions:", ecm.effectChain.map((e) => e.position));
const container = document.getElementById("effects-container");
console.log("Container class:", container.className);
console.log("Container children count:", container.children.length);
const cards = container.querySelectorAll(".effect-instance");
console.log("Cards found:", cards.length);
for (const c of cards) {
  console.log(" Card class:", c.className, "transform:", c.style.transform, "position:", c.style.position, "zIndex:", c.style.zIndex);
}

const ui = new PatchboardUI(ecm, { container });
console.log("---After PatchboardUI---");
console.log("Container class:", container.className);
console.log("Container style.position:", container.style.position);
console.log("Container outerHTML (first 1500 chars):");
console.log(container.outerHTML.substring(0, 1500));
const cards2 = container.querySelectorAll(".effect-instance");
console.log("Cards:", cards2.length);
for (const c of cards2) {
  console.log(" Card class:", c.className, "transform:", c.style.transform, "ports:", c.querySelectorAll(".pb-port").length, "grip:", !!c.querySelector(".pb-grip"));
}
const svg = container.querySelector(".pb-svg");
console.log("SVG installed:", !!svg, "child paths:", svg ? svg.querySelectorAll("path").length : 0);
