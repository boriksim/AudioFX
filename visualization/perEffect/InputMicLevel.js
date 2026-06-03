/**
 * InputMicLevel: a level meter for a microphone source card.
 *
 * Reads the AnalyserNode that's been tapped on the mic's gain node
 * and paints a horizontal bar that animates with the current RMS
 * level. Keeps the same `{render()}` interface as the other
 * renderers so it can join the bus's single rAF loop.
 *
 * The polyfill's getFloatTimeDomainData writes a deterministic sine
 * pattern; in a real browser this would be the live mic signal.
 */
export class InputMicLevel {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AnalyserNode} analyser
   * @param {object} [options]
   * @param {number} [options.minDb=-60]
   * @param {number} [options.maxDb=0]
   */
  constructor(canvas, analyser, options = {}) {
    this.canvas = canvas;
    this.analyser = analyser;
    this.minDb = options.minDb ?? -60;
    this.maxDb = options.maxDb ?? 0;
    this._buffer = new Float32Array(this.analyser?.fftSize ?? 2048);
  }

  render() {
    const { canvas, analyser } = this;
    if (!analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    analyser.getFloatTimeDomainData(this._buffer);
    // RMS in [0, 1].
    let sum = 0;
    for (let i = 0; i < this._buffer.length; i++) {
      const v = this._buffer[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._buffer.length);
    // Convert to dBFS, clamp to [minDb, maxDb].
    const db = rms > 0 ? 20 * Math.log10(rms) : this.minDb;
    const clamped = Math.max(this.minDb, Math.min(this.maxDb, db));
    const t = (clamped - this.minDb) / (this.maxDb - this.minDb);

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    // Background.
    ctx.fillStyle = "#0c0c10";
    ctx.fillRect(0, 0, w, h);
    // Bar.
    const barW = Math.max(0, Math.min(1, t)) * w;
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "#2a4");
    gradient.addColorStop(0.7, "#cc4");
    gradient.addColorStop(1, "#f44");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h * 0.25, barW, h * 0.5);
    // dB readout.
    ctx.fillStyle = "#cfcfdc";
    ctx.font = "10px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(`${clamped.toFixed(0)} dB`, 6, h * 0.5);
  }
}
