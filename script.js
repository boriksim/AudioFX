import { EffectChainManager } from "./core/EffectChainManager.js";

/**
 * Build the default chain: mic -> [optional effects] -> destination.
 * The mic source has no input; effects connect head-to-tail.
 */
async function initAudio() {
  const audioContext = new window.AudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const ecm = new EffectChainManager(audioContext);

  const inputMic = (await ecm.addEffect("InputMic")).audioNode;
  inputMic.initStream(stream);

  await ecm.addEffect("DistortionEffect");
  await ecm.addEffect("LowpassEffect");
  await ecm.addEffect("DelayEffect");

  console.log("Audio context state:", audioContext.state);
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
