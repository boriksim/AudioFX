import { DelayEffect } from "./effects/DelayEffect.js"
import { DistortionEffect } from "./effects/DistortionEffect.js";
import { LowpassEffect } from "./effects/LowpassEffect.js";



export async function initMicrophoneVisualizer(visualizer, fftSize) {

    const toggleDistortion = document.getElementById("toggle-distortion");
    const sliderDistortionAmount = document.getElementById("slider-distortion-amount")
    const labelDistortionAmount = document.getElementById("value-distortion-amount")
    const sliderDistortionMix = document.getElementById("slider-distortion-mix")
    const labelDistortionMix = document.getElementById("value-distortion-mix")

    
    const toggleLowpass = document.getElementById("toggle-lowpass");
    const sliderLowpassFrequency = document.getElementById("slider-lowpass-frequency");
    const labelLowpassFrequency = document.getElementById("value-lowpass-frequency");
    const sliderLowpassMix = document.getElementById("slider-lowpass-mix");
    const labelLowpassMix = document.getElementById("value-lowpass-mix");

    
    const toggleDelay = document.getElementById("toggle-delay");
    const sliderDelayTime = document.getElementById("slider-delay-time");
    const labelDelayTime = document.getElementById("value-delay-time");
    const sliderDelayFeedback = document.getElementById("slider-delay-feedback");
    const labelDelayFeedback = document.getElementById("value-delay-feedback");
    const sliderDelayMix = document.getElementById("slider-delay-mix");
    const labelDelayMix = document.getElementById("value-delay-mix");


    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            }
        });

        const audioContext = new AudioContext();
        const micSource = audioContext.createMediaStreamSource(stream);

        const monoSource = createMonoInput(audioContext, micSource)

        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = fftSize;
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        const distortion = new DistortionEffect(audioContext);
        distortion.setBypassed(true);

        const lowpass = new LowpassEffect(audioContext);
        lowpass.setBypassed(false);

        const delay = new DelayEffect(audioContext);
        delay.setBypassed(true);

        const gain = audioContext.createGain();
        gain.gain.value = 2.0;

        monoSource.connect(distortion.getInputNode());
        distortion.connect(lowpass);
        lowpass.connect(delay);
        delay.connect(gain);
        gain.connect(analyzer);
        analyzer.connect(audioContext.destination);

        // Distortion Buttons and sliders
        toggleDistortion.addEventListener("click", () => {
            const state = !distortion.bypassed;
            distortion.setBypassed(state);
            toggleDistortion.textContent = `Distortion: ${!state ? "On" : "Off"}`;
        });

        sliderDistortionAmount.addEventListener("input", () => {
            const value = parseFloat(sliderDistortionAmount.value * 10);
            labelDistortionAmount.textContent = sliderDistortionAmount.value;
            distortion.setAmount(value);
        })

        sliderDistortionMix.addEventListener("input", () => {
            const value = parseFloat(sliderDistortionMix.value / 100);
            labelDistortionMix.textContent = sliderDistortionMix.value;
            distortion.setMix(value);
        })

        // Lowpass Buttons and sliders
        toggleLowpass.addEventListener("click", () => {
            const state = !lowpass.bypassed;
            lowpass.setBypassed(state);
            toggleLowpass.textContent = `Lowpass: ${!state ? "On" : "Off"}`;
        });

        sliderLowpassFrequency.addEventListener("input", () => {
            const value = parseFloat(sliderLowpassFrequency.value);
            labelLowpassFrequency.textContent = sliderLowpassFrequency.value;
            lowpass.setFrequency(value);
        })

        sliderLowpassMix.addEventListener("input", () => {
            const value = parseFloat(sliderLowpassMix.value / 100);
            labelLowpassMix.textContent = sliderLowpassMix.value;
            lowpass.setMix(value);
        })

        // Delay Buttons and sliders
        toggleDelay.addEventListener("click", () => {
            const state = !delay.bypassed;
            delay.setBypassed(state);
            toggleDelay.textContent = `Delay: ${!state ? "On" : "Off"}`;
        });

        sliderDelayTime.addEventListener("input", () => {
            const value = parseFloat(sliderDelayTime.value);
            labelDelayTime.textContent = value;
            delay.setTime(value / 100);
        })

        sliderDelayFeedback.addEventListener("input", () => {
            const value = parseFloat(sliderDelayFeedback.value);
            labelDelayFeedback.textContent = value;
            delay.setFeedback(value / 100);
        })

        sliderDelayMix.addEventListener("input", () => {
            const value = parseFloat(sliderDelayMix.value / 100);
            labelDelayMix.textContent = sliderDelayMix.value;
            delay.setMix(value);
        })

        visualizer.setDataProvider(() => {
            analyzer.getByteFrequencyData(dataArray);
            return dataArray;
        });
    } catch (err) {
        console.error("Mic access error:", err);
        alert("Microphone access denied or unavailable.");
    }
}

function createMonoInput (audioContext, sourceNode) {
    const splitter = audioContext.createChannelSplitter(2);
    const merger = audioContext.createChannelMerger(1);

    const gainL = audioContext.createGain();
    const gainR = audioContext.createGain();

    gainL.gain.value = 0.5;
    gainR.gain.value = 0.5;

    sourceNode.connect(splitter);
    splitter.connect(gainL, 0);
    splitter.connect(gainR, 1);

    gainL.connect(merger, 0, 0);
    gainR.connect(merger, 0, 0);

    return merger;
}