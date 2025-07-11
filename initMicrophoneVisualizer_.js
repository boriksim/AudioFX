export async function initMicrophoneVisualizer(visualizer, fftSize) {
    const toggle_distortion = document.getElementById("toggle-distortion");
    const toggle_delay = document.getElementById("toggle-delay");
    const toggle_lowpass = document.getElementById("toggle-lowpass");

    const lowpass_slider = document.getElementById("lowpass-slider");
    const lowpass_label = document.getElementById("lowpass-value");

    navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        }
    }).then(stream => {
        alert("obsolete");
        const audio_context = new AudioContext();
        const mic_source = audio_context.createMediaStreamSource(stream);

        const analyzer = audio_context.createAnalyser();
        analyzer.fftSize = fftSize;
        const data_array = new Uint8Array(analyzer.frequencyBinCount);

        const gain_node = audio_context.createGain();
        gain_node.gain.value = 10.0;

        const distortion_node = audio_context.createWaveShaper();
        distortion_node.curve = makeDistortionCurve(400);
        distortion_node.oversample = "4x";

        let distortion_enabled = false;
        toggle_distortion.addEventListener("click", () => {
            distortion_enabled = !distortion_enabled;
            toggle_distortion.textContent = `Distortion: ${distortion_enabled ? "On" : "Off"}`;
            connectNodes();
        });

        const lowpass_node = audio_context.createBiquadFilter();
        lowpass_node.type = "lowpass";
        lowpass_node.frequency.value = lowpass_slider.value;

        let lowpass_enabled = true;
        toggle_lowpass.addEventListener("click", () => {
            lowpass_enabled = !lowpass_enabled;
            toggle_lowpass.textContent = `Lowpass filter: ${lowpass_enabled ? "On" : "Off"}`;
            connectNodes();
        });

        lowpass_slider.addEventListener("input", () => {
            const freq = parseInt(lowpass_slider.value);
            lowpass_node.frequency.value = freq;
            lowpass_label.textContent = freq;
        });

        const delay_node = audio_context.createDelay();
        delay_node.delayTime.value = 0.4;

        const feedback_gain = audio_context.createGain();
        feedback_gain.gain.value = 0.45;

        const main_out = audio_context.createGain();
        main_out.gain.value = 1.0;

        let delay_enabled = false;
        toggle_delay.addEventListener("click", () => {
            delay_enabled = !delay_enabled;
            toggle_delay.textContent = `Delay: ${delay_enabled ? "On" : "Off"}`;
            connectNodes();
        });

        function connectNodes() {
            mic_source.disconnect();
            distortion_node.disconnect();
            delay_node.disconnect();
            feedback_gain.disconnect();
            gain_node.disconnect();
            analyzer.disconnect();

            let input = mic_source;

            if (distortion_enabled) {
                input.connect(distortion_node);
                input = distortion_node;
            }

            if (lowpass_enabled) {
                input.connect(lowpass_node);
                input = lowpass_node;
            }

            if (delay_enabled) {
                input.connect(delay_node);
                delay_node.connect(feedback_gain);
                feedback_gain.connect(delay_node);
                input = delay_node;
            }

            input.connect(gain_node);
            gain_node.connect(analyzer);
            analyzer.connect(main_out);
            main_out.connect(audio_context.destination);
        }

        connectNodes();

        visualizer.setDataProvider(() => {
            analyzer.getByteFrequencyData(data_array);
            return data_array;
        });
    }).catch(err => {
        console.error("Mic access error:", err);
        alert("Microphone access denied or unavailable.");
    });
}

function makeDistortionCurve(amount = 800) {
    const k = typeof amount === "number" ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    let i = 0;
    for (; i < n_samples; ++i) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
}