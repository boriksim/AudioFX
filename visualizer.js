export class Visualizer {
    #animation_frame_id;

    constructor(canvas, bars_count) {
        this.canvas = canvas;
        this.context = this.canvas.getContext("2d");
        this.bars_count = bars_count;

        this.running = false;
        this.#animation_frame_id = null;
    }

    setDataProvider(fn) {
        if (typeof fn === "function") {
            this.dataProvider = fn;
        }
        else {
            throw new Error("Data provider must be a function")
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.#animate();
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.#animation_frame_id);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    #animate = () => {
        if (!this.running) return;
        const data = this.dataProvider();
        this.drawBars(data);
        this.#animation_frame_id = requestAnimationFrame(this.#animate);
    }

    drawBars(data) {
        const context = this.context
        const width = this.canvas.width;
        const height = this.canvas.height;
        const bar_width = width / this.bars_count;

        this.context.clearRect(0, 0, width, height);

        for (let i = 0; i < this.bars_count; i++) {
            let bar_height = data[i] ?? 0;

            if (!Number.isFinite(bar_height)) continue;
            
            bar_height = Math.max(0, Math.min(bar_height, height));
            const x = i * bar_width;
            const y = height - bar_height;

            context.fillStyle = `hsl(${(i / this.bars_count) * 360}, 100%, 50%)`;
            context.fillRect(x, y, bar_width - 2, bar_height);
            console.log(bar_height)
        }
    }
}