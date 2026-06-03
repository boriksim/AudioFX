/**
 * BiquadResponse: frequency-response overlay for a BiquadFilterNode.
 *
 * Uses the Web Audio API's `getFrequencyResponse(freqArr, magOut, phaseOut)`
 * to compute magnitude in dB and phase in radians across a log-scaled
 * sweep from 20 Hz to 20 kHz. Drawn against a dB-scaled vertical axis
 * (-48..+12 dB) and a log-frequency horizontal axis.
 *
 * Re-rendering is cheap (a few hundred multiplies), so we just draw
 * every frame. The interesting bit is the educational reveal: moving
 * the cutoff slider sweeps the response curve in real time.
 */
export class BiquadResponse {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {BiquadFilterNode} biquadNode
   * @param {object} [options]
   * @param {number} [options.samples=256]
   * @param {string} [options.color="#6cf"]
   */
  constructor(canvas, biquadNode, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.biquad = biquadNode;
    this.samples = options.samples ?? 256;
    this.color = options.color ?? "#6cf";
    this._freqArr = new Float32Array(this.samples);
    this._magOut = new Float32Array(this.samples);
    this._phaseOut = new Float32Array(this.samples);
    // Pre-fill the log-scaled frequency array once. The same
    // frequencies work for every render.
    for (let i = 0; i < this.samples; i++) {
      this._freqArr[i] = 20 * Math.pow(1000, i / (this.samples - 1));
    }
  }

  render() {
    if (!this.biquad) return;
    try {
      this.biquad.getFrequencyResponse(this._freqArr, this._magOut, this._phaseOut);
    } catch (_) {
      return; // node disconnected
    }
    this._draw();
  }

  _draw() {
    const { canvas, context, _magOut: mag, color, _freqArr: freq } = this;
    const w = canvas.width;
    const h = canvas.height;

    context.clearRect(0, 0, w, h);

    // dB axis: -48 (bottom) to +12 (top)
    const dbMin = -48;
    const dbMax = 12;
    const dbToY = (db) => h - ((db - dbMin) / (dbMax - dbMin)) * h;

    // Reference grid lines at 0 dB and -24 dB.
    context.strokeStyle = "#222";
    context.lineWidth = 1;
    context.beginPath();
    [0, -12, -24, -36].forEach((db) => {
      const y = dbToY(db);
      context.moveTo(0, y);
      context.lineTo(w, y);
    });
    context.stroke();

    // Frequency response curve.
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    const fMin = freq[0];
    const fMax = freq[freq.length - 1];
    for (let i = 0; i < mag.length; i++) {
      const db = 20 * Math.log10(Math.max(mag[i], 1e-6));
      const x = ((Math.log(freq[i] / fMin)) / Math.log(fMax / fMin)) * w;
      const y = dbToY(Math.max(dbMin, Math.min(dbMax, db)));
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}
