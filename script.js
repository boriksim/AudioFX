import { Visualizer } from "./visualizer.js";
import { initMicrophoneVisualizer } from "./initMicrophoneVisualizer.js";
import { initFileVisualizer } from "./initFileVisualizer.js";


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

const panel_file = document.getElementById("panel-file");
const startButton_file = document.getElementById("startButton-file");
const stopButton_file = document.getElementById("stopButton-file");

const panel_mic = document.getElementById("panel-mic");
const startButton_mic = document.getElementById("startButton-mic");
const stopButton_mic = document.getElementById("stopButton-mic");


mode_radios.forEach((radio) => {
    radio.addEventListener("change", () => {
        if (radio.checked) {
            visualizer.stop();
            if (radio.value === "demo") {
                startButton_demo.disabled = false;
                stopButton_demo.disabled = true;
                panel_demo.style.display = "flex";
                panel_file.style.display = "none";
                panel_mic.style.display = "none";
            }
            else if (radio.value === "file") {
                startButton_file.disabled = false;
                stopButton_file.disabled = true;
                panel_demo.style.display = "none";
                panel_file.style.display = "flex";
                panel_mic.style.display = "none";
                initFileVisualizer(input_file, audio_player, visualizer, fftSize, audio_context);
            }
            else if (radio.value === "mic") {
                startButton_mic.disabled = false;
                stopButton_mic.disabled = true;
                panel_demo.style.display = "none";
                panel_file.style.display = "none";
                panel_mic.style.display = "flex";
                initMicrophoneVisualizer(visualizer, fftSize, audio_context);
            }
        }
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

