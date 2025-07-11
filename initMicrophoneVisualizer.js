import { DelayEffect } from "./effects/DelayEffect.js"
// import { LowpassEffect } from "./effects/LowpassEffect.js";
// import { DistortionEffect } from "./effects/DistortionEffect.js";



export async function initMicrophoneVisualizer(visualizer, fftSize) {
    // const toggleDistortion = document.getElementById("toggle-distortion");
    // const toggleLowpass = document.getElementById("toggle-lowpass");
    // const lowpassSlider = document.getElementById("lowpass-slider");
    // const lowpassLabel = document.getElementById("lowpass-value");

    
    const toggleDelay = document.getElementById("toggle-delay");
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

        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = fftSize;
        const dataArray = new Uint8Array(analyzer.frequencyBinCount);

        // const distortion = new DistortionEffect(audioContext);
        const delay = new DelayEffect(audioContext);
        // const lowpass = new LowpassEffect(audioContext);

        const gain = audioContext.createGain();
        gain.gain.value = 2.0;

        // micSource.connect(distortion.getInputNode());
        // distortion.connect(lowpass);
        // lowpass.connect(delay);
        // delay.connect(gain);
        // gain.connect(analyser);
        // analyser.connect(audioContext.destination);

        micSource.connect(delay.getInputNode());
        delay.connect(gain);
        gain.connect(analyzer);
        analyzer.connect(audioContext.destination);

        toggleDelay.addEventListener("click", () => {
            const state = !delay.bypassed;
            // delay.setBypassed(state);
            delay.setMix(state ? 1 : 0);
            toggleDelay.textContent = `Delay: ${!state ? "On" : "Off"}`;
        });

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