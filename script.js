const canvas = document.getElementById("waveform");
const context = canvas.getContext("2d");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");

const bar_count = 64;

const update_interval = 100;
let interval_id = null;

function drawBars() {
    const width = canvas.width;
    const height = canvas.height;
    const center = height / 2;
    const bar_width = width / bar_count;

    context.clearRect(0, 0, width, height);

    for (let i = 0; i < bar_count; i++) {
        const bar_height = Math.random() * (height / 2);
        const x = i * bar_width + bar_width / 2;
        const y_top = center - bar_height;

        context.fillStyle = "#fff";
        drawBar(x, y_top, bar_width - 4, bar_height * 2, 4);
    }
}

function drawBar(x_center, y, width, height, radius) {
    const x = x_center - width / 2;

    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.fill();
}

startButton.addEventListener("click", () => {
    startButton.disabled = true;
    stopButton.disabled = false;
    interval_id = setInterval(drawBars, update_interval);
});

stopButton.addEventListener("click", () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    stopButton.disabled = true;
    startButton.disabled = false;
    clearInterval(interval_id)
    interval_id = null;
});