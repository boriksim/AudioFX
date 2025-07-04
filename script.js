import { Visualizer } from "./visualizer.js";

const canvas = document.getElementById("visualizer");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

const update_interval = 50;

const bars_count = 64;

const visualizer = new Visualizer(canvas, bars_count);

let current_data = Array(bars_count).fill(canvas.height / 2);

function updateData() {
    for (let i = 0; i < bars_count; i++) {
        let delta = (Math.random() * 2 - 1) * (Math.random() * 20);
        current_data[i] += delta;
        current_data[i] = Math.max(0, Math.min(current_data[i], canvas.height));
    }
};

visualizer.setDataProvider(() => current_data);

let update_timer = null;

startButton.addEventListener("click", () => {
    startButton.disabled = true;
    stopButton.disabled = false;
    update_timer = setInterval(updateData, update_interval)
    visualizer.start();
});

stopButton.addEventListener("click", () => {
    stopButton.disabled = true;
    startButton.disabled = false;
    clearInterval(update_timer);
    update_timer = null;
    visualizer.stop()
    current_data = Array(bars_count).fill(canvas.height / 2);
});