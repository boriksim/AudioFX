import { EffectChainManager } from "./core/EffectChainManager.js";

/**
 * Build the default chain: mic -> [optional effects] -> destination.
 * The mic source has no input; effects connect head-to-tail.
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

  const ecm = new EffectChainManager(audioContext);

  const inputMic = (await ecm.addEffect("InputMic")).audioNode;
  inputMic.initStream(stream);

  await ecm.addEffect("DistortionEffect");
  await ecm.addEffect("LowpassEffect");
  await ecm.addEffect("DelayEffect");

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
  console.log("Effect chain:", ecm.effectChain.map(e => e.name));
  return { audioContext, ecm };
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button');
  button.textContent = 'Start Audio';
  button.style.cssText = 'padding: 10px 20px; margin: 20px; font-size: 16px;';
  document.body.insertBefore(button, document.querySelector('.effects-container'));

  button.addEventListener('click', async () => {
    try {
      await initAudio();
      button.textContent = 'Audio Started';
      button.disabled = true;
    } catch (error) {
      console.error('Error starting audio:', error);
      button.textContent = 'Error - Click to retry';
      button.disabled = false;
    }
  });
});
