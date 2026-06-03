import { EffectChainManager } from "./core/EffectChainManager.js";
import { PluginRegistry } from "./core/PluginRegistry.js";
import { InputMic } from "./effects/InputMic.js";
import { DistortionEffect } from "./effects/DistortionEffect.js";
import { LowpassEffect } from "./effects/LowpassEffect.js";
import { DelayEffect } from "./effects/DelayEffect.js";
import { AnalyserBus } from "./engine/AnalyserBus.js";
import { SpectrumBars } from "./visualization/renderers/SpectrumBars.js";
import { Waveform } from "./visualization/renderers/Waveform.js";
import { PresetManagerUI } from "./ui/PresetManager.js";
import { PedalboardUI } from "./ui/PedalboardUI.js";
import { HistoryController } from "./persistence/history.js";
import { serializeProject, deserializeProject } from "./persistence/project.js";
import { DistortionCurve } from "./visualization/perEffect/DistortionCurve.js";
import { BiquadResponse } from "./visualization/perEffect/BiquadResponse.js";
import { DelayImpulse } from "./visualization/perEffect/DelayImpulse.js";
import { InputFile } from "./effects/InputFile.js";
import { InputOscillator } from "./effects/InputOscillator.js";

/**
 * Per-effect live visualization factories, keyed by manifest id.
 * Each factory takes the effect and a canvas, returns a renderer
 * that can be added to the AnalyserBus.
 */
const PER_EFFECT_VIZ = {
  distortion: (effect, canvas) => new DistortionCurve(canvas, effect),
  lowpass: (effect, canvas) => new BiquadResponse(canvas, effect.lowpassNode),
  delay: (effect, canvas) => new DelayImpulse(canvas, effect),
};

function setStatus(msg, kind = "info") {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("error", kind === "error");
}

/**
 * Build a registry pre-populated with the built-in effects. Each class
 * is registered by its static `manifest.id`, which is the canonical
 * identifier used in serialization, the UI, and `addEffect()` calls.
 */
function buildRegistry() {
  return new PluginRegistry()
    .register(InputMic)
    .register(InputFile)
    .register(InputOscillator)
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

  // Per-effect live viz: one small canvas inside every card with a
  // registered factory. Each renderer joins the same rAF loop as the
  // main visualizer.
  const perEffectRenderers = [];
  function syncPerEffect() {
    for (const r of perEffectRenderers) bus.removeRenderer(r);
    perEffectRenderers.length = 0;
    for (const card of ecm.container.querySelectorAll(".effect-instance")) {
      const effectObj = ecm.effectChain.find((e) => e.dom === card);
      if (!effectObj) continue;
      const factory = PER_EFFECT_VIZ[effectObj.manifestId];
      if (!factory) continue;
      const small = card.querySelector(".pe-viz canvas");
      if (!small) continue;
      perEffectRenderers.push(factory(effectObj.audioNode, small));
    }
    for (const r of perEffectRenderers) bus.addRenderer(r);
  }
  // Re-sync per-effect viz when the chain changes.
  const originalOnChange = ecm.onChange;
  ecm.onChange = () => {
    if (originalOnChange) originalOnChange();
    setTimeout(syncPerEffect, 0);
  };

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
  syncPerEffect();
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
    { useSchemaUI: true, onChange: null }, // set after history is built
  );

  const history = new HistoryController({
    snapshot: () => serializeProject(ecm),
    apply: async (project) => {
      // Restore a snapshot: clear the chain, deserialize, then
      // re-attach the mic stream so the source is live again.
      ecm.clear();
      await deserializeProject(project, ecm);
      const mic = ecm.effectChain[0]?.audioNode;
      if (mic instanceof InputMic) mic.initStream(stream);
    },
  });
  ecm.onChange = () => history.push();

  const inputMic = (await ecm.addEffect("input-mic")).audioNode;
  inputMic.initStream(stream);

  await ecm.addEffect("distortion");
  await ecm.addEffect("lowpass");
  await ecm.addEffect("delay");

  setupVisualizer(audioContext, ecm);

  const pedalboard = new PedalboardUI(ecm, {
    resolveSourceActions: (card) => {
      const effectObj = ecm.effectChain.find((e) => e.dom === card);
      if (!effectObj) return null;
      const fn = effectObj.audioNode?.renderSourceActions;
      return typeof fn === "function" ? fn.call(effectObj.audioNode) : null;
    },
  });

  const presetUI = new PresetManagerUI(ecm);
  presetUI.onStatus((msg, kind) => setStatus(msg, kind));

  // Wire undo / redo to the buttons and keep them in sync with the
  // controller's state.
  const undoBtn = document.getElementById("undo");
  const redoBtn = document.getElementById("redo");
  history.subscribe((s) => {
    if (undoBtn) undoBtn.disabled = !s.canUndo;
    if (redoBtn) redoBtn.disabled = !s.canRedo;
  });
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (history.undo()) setStatus("Undone");
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      if (history.redo()) setStatus("Redone");
    });
  }

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
      setStatus("Audio started");
    } catch (error) {
      console.error("Error starting audio:", error);
      button.textContent = "Error - Click to retry";
      button.disabled = false;
      setStatus(`Audio failed: ${error.message}`, "error");
    }
  });
});
