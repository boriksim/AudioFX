import { EffectChainManager } from "./core/EffectChainManager.js";
import { InputMic } from "./effects/InputMic.js";

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
        }
    });

    const inputMic = new InputMic(audioContext, stream);

    const ecm = new EffectChainManager(audioContext);

    ecm.effectChain.unshift({
        id: "input-mic",
        name: "InputMic",
        dom: null,
        audioNode: inputMic,
    });

    const delayEffect = await ecm.addEffect("DelayEffect");

    delayEffect.audioNode.setBypassed(false);

    console.log("Audio, context state: ", audioContext.state);
    console.log("Effect chain: ", ecm.effectChain);
}

document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.textContent = 'Start Audio';
    button.style.cssText = 'padding: 10px 20px; margin: 20px; font-size: 16px;';
    document.body.insertBefore(button, document.querySelector('.container'));

    button.addEventListener('click', async () => {
        try {
            await initAudio();
            button.textContent = 'Audio Started';
            button.disabled = true;
        } catch (error) {
            console.error('Error starting audio:', error);
            button.textContent = 'Error - Click to retry';
        }
    });
});