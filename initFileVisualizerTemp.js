import { DistortionEffect } from "./effects/DistortionEffect.js";
import { LowpassEffect } from "./effects/LowpassEffect.js";
import { DelayEffect } from "./effects/DelayEffect.js"

export function initFileVisualizer(inputFile, audioPlayer, visualizer, fftSize, audioContext) {

    const toggleDistortion = document.getElementById("toggle-distortion");
    const sliderDistortionStrength = document.getElementById("slider-distortion-strength");
    const labelDistortionStrength = document.getElementById("value-distortion-strength");
    const sliderDistortionMix = document.getElementById("slider-distortion-mix");
    const labelDistortionMix = document.getElementById("value-distortion-mix");
    const selectDistortionType = document.getElementById("select-distortion-type");


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

    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = fftSize;
    const frequency_data = new Uint8Array(analyzer.frequencyBinCount);
    let sourceNode = null;

    const distortion = new DistortionEffect(audioContext);
    distortion.setBypassed(true);

    const lowpass = new LowpassEffect(audioContext);
    lowpass.setBypassed(true);

    const delay = new DelayEffect(audioContext);
    delay.setBypassed(true);

    

    inputFile.addEventListener("change", () => {
        const file = inputFile.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        audioPlayer.src = url;

        if (!sourceNode) {
            sourceNode = audioContext.createMediaElementSource(audioPlayer);
            sourceNode.connect(distortion.getInputNode());
            distortion.connect(lowpass);
            lowpass.connect(delay);
            delay.connect(analyzer);
            analyzer.connect(audioContext.destination);
        }

        audioContext.resume();

        // Distortion Buttons
        toggleDistortion.addEventListener("click", () => {
            const state = !distortion.bypassed;
            distortion.setBypassed(state);
            toggleDistortion.textContent = `Distortion: ${!state ? "On" : "Off"}`;
        });

        sliderDistortionStrength.addEventListener("input", () => {
            const value = parseFloat(sliderDistortionStrength.value);
            labelDistortionStrength.textContent = sliderDistortionStrength.value;
            distortion.setStrength(value);
        });

        sliderDistortionMix.addEventListener("input", () => {
            const value = parseFloat(sliderDistortionMix.value / 100);
            labelDistortionMix.textContent = sliderDistortionMix.value;
            distortion.setMix(value);
        });

        selectDistortionType.addEventListener("change", () => {
            const value = selectDistortionType.value;
            distortion.setType(value);
        });

        // Lowpass Buttons
        toggleLowpass.addEventListener("click", () => {
            const state = !lowpass.bypassed;
            lowpass.setBypassed(state);
            toggleLowpass.textContent = `Lowpass: ${!state ? "On" : "Off"}`;
        });

        sliderLowpassFrequency.addEventListener("input", () => {
            const value = parseFloat(sliderLowpassFrequency.value);
            labelLowpassFrequency.textContent = sliderLowpassFrequency.value;
            lowpass.setFrequency(value);
        });

        sliderLowpassMix.addEventListener("input", () => {
            const value = parseFloat(sliderLowpassMix.value / 100);
            labelLowpassMix.textContent = sliderLowpassMix.value;
            lowpass.setMix(value);
        });

        // Delay Buttons and
        toggleDelay.addEventListener("click", () => {
            const state = !delay.bypassed;
            delay.setBypassed(state);
            toggleDelay.textContent = `Delay: ${!state ? "On" : "Off"}`;
        });

        sliderDelayTime.addEventListener("input", () => {
            const value = parseFloat(sliderDelayTime.value);
            labelDelayTime.textContent = value;
            delay.setTime(value / 100);
        });

        sliderDelayFeedback.addEventListener("input", () => {
            const value = parseFloat(sliderDelayFeedback.value);
            labelDelayFeedback.textContent = value;
            delay.setFeedback(value / 100);
        });

        sliderDelayMix.addEventListener("input", () => {
            const value = parseFloat(sliderDelayMix.value / 100);
            labelDelayMix.textContent = sliderDelayMix.value;
            delay.setMix(value);
        });

        visualizer.setDataProvider(() => {
            analyzer.getByteFrequencyData(frequency_data);
            return frequency_data;
        });
    });
}