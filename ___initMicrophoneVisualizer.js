import { DistortionEffect } from "./effects/DistortionEffect.js";
import { LowpassEffect } from "./effects/LowpassEffect.js";
import { DelayEffect } from "./effects/DelayEffect.js"
import { ChorusEffect } from "./effects/ChorusEffect.js";
import { PhaserEffect } from "./effects/PhaserEffect.js";
import { FlangerEffect } from "./effects/FlangerEffect.js";
// import { PitchShifterEffect } from "./effects/PitchShifterEffect.js";

export async function initMicrophoneVisualizer(visualizer, fftSize) {

    // const togglePitchShifter = document.getElementById("toggle-pitchshifter");
    // const sliderPitchShifterPitch = document.getElementById("slider-pitchshifter-pitch");
    // const labelPitchShifterPitch = document.getElementById("value-pitchshifter-pitch");
    // const sliderPitchShifterMix = document.getElementById("slider-pitchshifter-mix");
    // const labelPitchShifterMix = document.getElementById("value-pitchshifter-mix");

    const toggleChorus = document.getElementById("toggle-chorus");
    const sliderChorusRate = document.getElementById("slider-chorus-rate");
    const labelChorusRate = document.getElementById("value-chorus-rate");
    const sliderChorusDepth = document.getElementById("slider-chorus-depth");
    const labelChorusDepth = document.getElementById("value-chorus-depth");
    const sliderChorusMix = document.getElementById("slider-chorus-mix");
    const labelChorusMix = document.getElementById("value-chorus-mix");

    const togglePhaser = document.getElementById("toggle-phaser");
    const sliderPhaserRate = document.getElementById("slider-phaser-rate");
    const labelPhaserRate = document.getElementById("value-phaser-rate");
    const sliderPhaserDepth = document.getElementById("slider-phaser-depth");
    const labelPhaserDepth = document.getElementById("value-phaser-depth");
    const sliderPhaserMix = document.getElementById("slider-phaser-mix");
    const labelPhaserMix = document.getElementById("value-phaser-mix");

    const toggleFlanger = document.getElementById("toggle-flanger");
    const sliderFlangerRate = document.getElementById("slider-flanger-rate");
    const labelFlangerRate = document.getElementById("value-flanger-rate");
    const sliderFlangerDepth = document.getElementById("slider-flanger-depth");
    const labelFlangerDepth = document.getElementById("value-flanger-depth");
    const sliderFlangerFeedback = document.getElementById("slider-flanger-feedback");
    const labelFlangerFeedback = document.getElementById("value-flanger-feedback");
    const sliderFlangerMix = document.getElementById("slider-flanger-mix");
    const labelFlangerMix = document.getElementById("value-flanger-mix");

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

        const monoSource = createMonoInput(audioContext, micSource, "left")

        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = fftSize;
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        // const pitch = new PitchShifterEffect(audioContext);
        // pitch.setBypassed(true);

        const chorus = new ChorusEffect(audioContext);
        chorus.setBypassed(true);

        const phaser = new PhaserEffect(audioContext);
        phaser.setBypassed(true);

        const flanger = new FlangerEffect(audioContext);
        flanger.setBypassed(true);

        const distortion = new DistortionEffect(audioContext);
        distortion.setBypassed(true);

        const lowpass = new LowpassEffect(audioContext);
        lowpass.setBypassed(false);

        const delay = new DelayEffect(audioContext);
        delay.setBypassed(true);

        const gain = audioContext.createGain();
        gain.gain.value = 1.0;

        monoSource.connect(chorus.getInputNode());
        // pitch.connect(chorus);
        chorus.connect(phaser);
        phaser.connect(flanger);
        flanger.connect(distortion);
        distortion.connect(lowpass);
        lowpass.connect(delay);
        delay.connect(gain);
        gain.connect(analyzer);
        analyzer.connect(audioContext.destination);

        // // Pitch Shifter Buttons
        // togglePitchShifter.addEventListener("click", () => {
        //     const state = !pitch.bypassed;
        //     pitch.setBypassed(state);
        //     togglePitchShifter.textContent = `Pitch Shifter: ${!state ? "On" : "Off"}`;
        // });

        // sliderPitchShifterPitch.addEventListener("input", () => {
        //     const value = parseFloat(sliderPitchShifterPitch.value);
        //     labelPitchShifterPitch.textContent = value;
        //     pitch.setPitch(value);
        // });

        // sliderPitchShifterMix.addEventListener("input", () => {
        //     const value = parseFloat(sliderPitchShifterMix.value / 100);
        //     labelPitchShifterMix.textContent = sliderPitchShifterMix.value;
        //     pitch.setMix(value);
        // });

        // Chorus Buttons
        toggleChorus.addEventListener("click", () => {
            const state = !chorus.bypassed;
            chorus.setBypassed(state);
            toggleChorus.textContent = `Chorus: ${!state ? "On" : "Off"}`;
        });

        sliderChorusRate.addEventListener("input", () => {
            const value = parseFloat(sliderChorusRate.value);
            labelChorusRate.textContent = value;
            chorus.setRate(value);
        });

        sliderChorusDepth.addEventListener("input", () => {
            const value = parseFloat(sliderChorusDepth.value);
            labelChorusDepth.textContent = Math.round(value * 100);
            chorus.setDepth(value);
        });

        sliderChorusMix.addEventListener("input", () => {
            const value = parseFloat(sliderChorusMix.value / 100);
            labelChorusMix.textContent = sliderChorusMix.value;
            chorus.setMix(value);
        });

        // Phaser Buttons
        togglePhaser.addEventListener("click", () => {
            const state = !phaser.bypassed;
            phaser.setBypassed(state);
            togglePhaser.textContent = `Phaser: ${!state ? "On" : "Off"}`;
        });

        sliderPhaserRate.addEventListener("input", () => {
            const value = parseFloat(sliderPhaserRate.value);
            labelPhaserRate.textContent = value;
            phaser.setRate(value);
        });

        sliderPhaserDepth.addEventListener("input", () => {
            const value = parseFloat(sliderPhaserDepth.value);
            labelPhaserDepth.textContent = Math.round(value * 100);
            phaser.setDepth(value);
        });

        sliderPhaserMix.addEventListener("input", () => {
            const value = parseFloat(sliderPhaserMix.value / 100);
            labelPhaserMix.textContent = sliderPhaserMix.value;
            phaser.setMix(value);
        });

        // Flanger Buttons
        toggleFlanger.addEventListener("click", () => {
            const state = !flanger.bypassed;
            flanger.setBypassed(state);
            toggleFlanger.textContent = `Flanger: ${!state ? "On" : "Off"}`;
        });

        sliderFlangerRate.addEventListener("input", () => {
            const value = parseFloat(sliderFlangerRate.value);
            labelFlangerRate.textContent = value;
            flanger.setRate(value);
        });

        sliderFlangerDepth.addEventListener("input", () => {
            const value = parseFloat(sliderFlangerDepth.value);
            labelFlangerDepth.textContent = Math.round(value * 100);
            flanger.setDepth(value);
        });

        sliderFlangerFeedback.addEventListener("input", () => {
            const value = parseFloat(sliderFlangerFeedback.value);
            labelFlangerFeedback.textContent = Math.round(value * 100);
            flanger.setFeedback(value);
        });

        sliderFlangerMix.addEventListener("input", () => {
            const value = parseFloat(sliderFlangerMix.value / 100);
            labelFlangerMix.textContent = sliderFlangerMix.value;
            flanger.setMix(value);
        });

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

        // Delay Buttons
        toggleDelay.addEventListener("click", () => {
            const state = !delay.bypassed;
            delay.setBypassed(state);
            toggleDelay.textContent = `Delay: ${!state ? "On" : "Off"}`;
        });

        sliderDelayTime.addEventListener("input", () => {
            const value = parseFloat(sliderDelayTime.value);
            labelDelayTime.textContent = value;
            delay.setTime(value / 1000);
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
            analyzer.getByteFrequencyData(dataArray);
            return dataArray;
        });
    } catch (err) {
        console.error("Mic access error:", err);
        alert("Microphone access denied or unavailable.");
    }
}

function createMonoInput(audioContext, sourceNode, channel = "average") {
    const splitter = audioContext.createChannelSplitter(2);
    const merger = audioContext.createChannelMerger(1);

    sourceNode.connect(splitter);

    if (channel === "left") {
        splitter.connect(merger, 0, 0);
    } else if (channel === "right") {
        splitter.connect(merger, 1, 0);
    } else {
        const gainL = audioContext.createGain();
        const gainR = audioContext.createGain();
        gainL.gain.value = 0.5;
        gainR.gain.value = 0.5;

        splitter.connect(gainL, 0);
        splitter.connect(gainR, 1);
        gainL.connect(merger, 0, 0);
        gainR.connect(merger, 0, 0);
    }

    return merger;
}