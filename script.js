import { Visualizer } from "./visualizer.js";

const canvas = document.getElementById("visualizer");
const panel_demo = document.getElementById("panel-demo")
const startButton_demo = document.getElementById("startButton-demo");
const stopButton_demo = document.getElementById("stopButton-demo");

const mode_radios = document.querySelectorAll("input[name='mode']");

const input_file = document.getElementById("input-file");
const audio_player = document.getElementById("audio-player");
audio_player.volume = 0.5;

const audio_context = new window.AudioContext();
const analyzer = audio_context.createAnalyser();
const fftSize = 8192;
analyzer.fftSize = fftSize;
const frequency_data = new Uint8Array(analyzer.frequencyBinCount);

let source_node = null;

const panel_file = document.getElementById("panel-file");
const startButton_file = document.getElementById("startButton-file");
const stopButton_file = document.getElementById("stopButton-file");

const panel_mic = document.getElementById("panel-mic");
const startButton_mic = document.getElementById("startButton-mic");
const stopButton_mic = document.getElementById("stopButton-mic");

let mic_stream = null;
let mic_source = null;
let mic_analyzer = null;

async function initMicVisualizer() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic_stream = stream;

        const audio_context = new AudioContext();
        mic_source = audio_context.createMediaStreamSource(stream);

        mic_analyzer = audio_context.createAnalyser();
        mic_analyzer.fftSize = fftSize;
        const data_array = new Uint8Array(mic_analyzer.frequencyBinCount);

        mic_source.connect(mic_analyzer);

        visualizer.setDataProvider(() => {
            mic_analyzer.getByteFrequencyData(data_array);
            return data_array;
        });

    } catch (err) {
        console.error("Mic access error:", err);
        alert("Microphone access denied or unavailable.");
    }
}

mode_radios.forEach((radio) => {
    radio.addEventListener("change", () => {
        if (radio.checked) {
            if (radio.value === "demo") {
                panel_demo.style.display = "flex";
                panel_file.style.display = "none";
                panel_mic.style.display = "none";
            }
            else if (radio.value === "file") {
                panel_demo.style.display = "none";
                panel_file.style.display = "flex";
                panel_mic.style.display = "none";
            }
            else if (radio.value === "mic") {
                panel_demo.style.display = "none";
                panel_file.style.display = "none";
                panel_mic.style.display = "flex";
                initMicVisualizer();
            }
        }
    });
});

input_file.addEventListener("change", () => {
    const file = input_file.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    audio_player.src = url;

    if (!source_node) {
        source_node = audio_context.createMediaElementSource(audio_player);
        source_node.connect(analyzer);
        analyzer.connect(audio_context.destination);
    }

    audio_context.resume()

    visualizer.setDataProvider(() => {
        analyzer.getByteFrequencyData(frequency_data);
        return frequency_data;
    });
});

const update_interval = 50;

const bars_count = fftSize / 2;

const visualizer = new Visualizer(canvas, bars_count);

let current_data = Array(bars_count).fill(canvas.height / 2);

function randomData() {
    for (let i = 0; i < bars_count; i++) {
        let delta = (Math.random() * 2 - 1) * (Math.random() * 20);
        current_data[i] += delta;
        current_data[i] = Math.max(0, Math.min(current_data[i], canvas.height));
    };
};

visualizer.setDataProvider(() => current_data);

let update_timer = null;

startButton_demo.addEventListener("click", () => {
    startButton_demo.disabled = true;
    stopButton_demo.disabled = false;
    update_timer = setInterval(randomData, update_interval)
    visualizer.start();
});

stopButton_demo.addEventListener("click", () => {
    stopButton_demo.disabled = true;
    startButton_demo.disabled = false;
    clearInterval(update_timer);
    update_timer = null;
    visualizer.stop()
    current_data = Array(bars_count).fill(canvas.height / 2);
});


startButton_file.addEventListener("click", () => {
    startButton_file.disabled = true;
    stopButton_file.disabled = false;
    visualizer.start();
});

stopButton_file.addEventListener("click", () => {
    stopButton_file.disabled = true;
    startButton_file.disabled = false;
    visualizer.stop()
});


startButton_mic.addEventListener("click", () => {
    startButton_mic.disabled = true;
    stopButton_mic.disabled = false;
    visualizer.start();
});

stopButton_mic.addEventListener("click", () => {
    stopButton_mic.disabled = true;
    startButton_mic.disabled = false;
    visualizer.stop()
});

