/**
 * SpectrumBars: render a frequency spectrum as N vertical bars.
 *
 * Reads `getByteFrequencyData()` once per frame from the bound
 * AnalyserNode and resamples the FFT bins down to `bars` columns.
 * The HSL gradient runs from blue (low frequencies) to red (high).
 */
export class SpectrumBars {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AnalyserNode} [analyser]
   * @param {object} [options]
   * @param {number} [options.bars=64]
   * @param {number} [options.gap=2]  pixel gap between bars
   */
  constructor(canvas, analyser, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.bars = options.bars ?? 64;
    this.gap = options.gap ?? 2;
    this._analyser = analyser ?? null;
    this._data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  }

  /** @param {AnalyserNode} analyser */
  setAnalyser(analyser) {
    this._analyser = analyser;
    this._data = new Uint8Array(analyser.frequencyBinCount);
  }

  render() {
    if (!this._analyser || !this._data) return;
    this._analyser.getByteFrequencyData(this._data);
    this._draw();
  }

  _draw() {
    const { canvas, context, _data: data, bars, gap } = this;
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / bars;

    context.clearRect(0, 0, width, height);
    const step = Math.max(1, Math.floor(data.length / bars));

    for (let i = 0; i < bars; i++) {
      // Average a small window of bins to get a smoother bar.
      let sum = 0;
      const start = i * step;
      const end = Math.min(start + step, data.length);
      for (let j = start; j < end; j++) sum += data[j];
      const value = sum / (end - start) / 255;

      const barHeight = value * height;
      const x = i * barWidth;
      const y = height - barHeight;
      context.fillStyle = `hsl(${(i / bars) * 270}, 100%, 50%)`;
      context.fillRect(x, y, Math.max(0, barWidth - gap), barHeight);
    }
  }
}
