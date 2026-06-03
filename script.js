import { EffectChainManager } from "./core/EffectChainManager.js";
import { PluginRegistry } from "./core/PluginRegistry.js";
import { InputMic } from "./effects/InputMic.js";
import { DistortionEffect } from "./effects/DistortionEffect.js";
import { LowpassEffect } from "./effects/LowpassEffect.js";
import { DelayEffect } from "./effects/DelayEffect.js";
import { AnalyserBus } from "./engine/AnalyserBus.js";
import { SpectrumBars } from "./visualization/renderers/SpectrumBars.js";
import { Waveform } from "./visualization/renderers/Waveform.js";

/**
 * Build a registry pre-populated with the built-in effects. Each class
 * is registered by its static `manifest.id`, which is the canonical
 * identifier used in serialization, the UI, and `addEffect()` calls.
 */
function buildRegistry() {
  return new PluginRegistry()
    .register(InputMic)
    .register(DistortionEffect)
    .register(LowpassEffect)
    .register(DelayEffect);
}

/**
 * Wire the visualizer to the chain's last effect output. The bus owns
 * one AnalyserNode per tap key; both renderers read from the same
 * analyser using different methods (frequency vs time-domain).
 */
function setupVisualizer(audioContext, ecm) {
  const canvas = document.getElementById("visualizer");
  const modeSelect = document.getElementById("viz-mode");
  const bus = new AnalyserBus(audioContext);

  const lastEffect = ecm.effectChain[ecm.effectChain.length - 1].audioNode;
  bus.attach("output", lastEffect.output);

  let activeRenderer = null;

  function setMode(mode) {
    if (activeRenderer) {
      bus.removeRenderer(activeRenderer);
      activeRenderer = null;
    }
    if (mode === "off") {
      const ctx2d = canvas.getContext("2d");
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const analyser = bus.get("output");
    if (mode === "waveform") {
      activeRenderer = new Waveform(canvas, analyser);
    } else {
      activeRenderer = new SpectrumBars(canvas, analyser);
    }
    bus.addRenderer(activeRenderer);
  }

  modeSelect.addEventListener("change", (e) => setMode(e.target.value));
  setMode(modeSelect.value);
  return bus;
}

/**
 * Build the default chain: mic -> [optional effects] -> destination.
 *
 * Latency choices:
 *  - `latencyHint: 'interactive'` biases the browser toward the smallest
 *    render quantum (typically 128 samples / ~2.9 ms at 44.1 kHz instead of
 *    the 256-1024 samples used by the default 'balanced' hint).
 *  - `channelCount: 1` on the mic constraint avoids internal upmixing
 *    the OS may otherwise apply before the stream reaches Web Audio.
 *  - `echoCancellation`, `noiseSuppression`, and `autoGainControl` are all
 *    disabled so the raw signal reaches the effect chain untouched.
 */
async function initAudio() {
  const audioContext = new window.AudioContext({ latencyHint: "interactive" });

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });

  const registry = buildRegistry();
  const ecm = new EffectChainManager(
    audioContext,
    "#effects-container",
    registry,
    { useSchemaUI: true },
  );

  const inputMic = (await ecm.addEffect("input-mic")).audioNode;
  inputMic.initStream(stream);

  await ecm.addEffect("distortion");
  await ecm.addEffect("lowpass");
  await ecm.addEffect("delay");

  setupVisualizer(audioContext, ecm);

  const latency = ecm.getLatency();
  console.log("Audio context state:", audioContext.state);
  console.log("Sample rate:", audioContext.sampleRate, "Hz");
  console.log(
    "Latency — base:",
    (latency.baseLatency * 1000).toFixed(2), "ms,",
    "output:",
    (latency.outputLatency * 1000).toFixed(2), "ms,",
    "total:", (latency.total * 1000).toFixed(2), "ms"
  );
  console.log("Effect chain:", ecm.effectChain.map((e) => e.name));
  console.log("Available effects:", registry.list().map((m) => `${m.id}@${m.version}`).join(", "));
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.createElement("button");
  button.textContent = "Start Audio";
  button.style.cssText = "padding: 10px 20px; margin: 20px; font-size: 16px;";
  const viz = document.querySelector(".viz-panel");
  const effects = document.querySelector(".effects-container");
  if (viz) document.body.insertBefore(button, viz);
  else if (effects) document.body.insertBefore(button, effects);

  button.addEventListener("click", async () => {
    try {
      await initAudio();
      button.textContent = "Audio Started";
      button.disabled = true;
    } catch (error) {
      console.error("Error starting audio:", error);
      button.textContent = "Error - Click to retry";
      button.disabled = false;
    }
  });
});
