/**
 * Waveform: render the time-domain signal as a centered polyline.
 *
 * Reads `getFloatTimeDomainData()` once per frame. The signal is in
 * the range [-1, 1]; we center it vertically on the canvas.
 */
export class Waveform {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {AnalyserNode} [analyser]
   * @param {object} [options]
   * @param {string} [options.color="#0f0"]
   * @param {number} [options.lineWidth=2]
   */
  constructor(canvas, analyser, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.color = options.color ?? "#0f0";
    this.lineWidth = options.lineWidth ?? 2;
    this._analyser = analyser ?? null;
    this._data = analyser ? new Float32Array(analyser.fftSize) : null;
  }

  /** @param {AnalyserNode} analyser */
  setAnalyser(analyser) {
    this._analyser = analyser;
    this._data = new Float32Array(analyser.fftSize);
  }

  render() {
    if (!this._analyser || !this._data) return;
    this._analyser.getFloatTimeDomainData(this._data);
    this._draw();
  }

  _draw() {
    const { canvas, context, _data: data, color, lineWidth } = this;
    const width = canvas.width;
    const height = canvas.height;
    const midY = height / 2;

    context.clearRect(0, 0, width, height);

    // Center axis
    context.strokeStyle = "#222";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, midY);
    context.lineTo(width, midY);
    context.stroke();

    // Waveform
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();

    const step = width / data.length;
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = midY - data[i] * (height / 2);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}
