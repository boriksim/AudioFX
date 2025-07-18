import { EffectChainManager } from "./core/EffectChainManager.js";
import { InputMic } from "./effects/InputMic.js";

const audioContext = new window.AudioContext();

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
    id: 'input-mic',
    name: 'InputMic',
    dom: null,
    audioNode: inputMic
});

ecm.addEffect('DelayEffect');

