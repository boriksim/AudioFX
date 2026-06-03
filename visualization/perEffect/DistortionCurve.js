/**
 * DistortionCurve: plot the WaveShaper's transfer function.
 *
 * Reads `effect.waveShaper.curve` (a Float32Array mapping input x in
 * [-1, 1] to output y) and draws it on a square canvas. The point is
 * educational: watching the curve morph as you sweep `strength` and
 * change `type` is the most direct way to see what distortion does
 * to a signal.
 *
 * This renderer has no AnalyserNode — it only needs the curve, which
 * the effect re-generates every time its params change. It still
 * implements the { render() } interface so it can share the
 * AnalyserBus rAF loop.
 */
export class DistortionCurve {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} effect - a DistortionEffect instance.
   * @param {object} [options]
   * @param {string} [options.color="#6cf"]
   */
  constructor(canvas, effect, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.effect = effect;
    this.color = options.color ?? "#6cf";
  }

  render() {
    if (!this.effect?.waveShaper?.curve) return;
    this._draw(this.effect.waveShaper.curve);
  }

  _draw(curve) {
    const { canvas, context, color } = this;
    const w = canvas.width;
    const h = canvas.height;

    context.clearRect(0, 0, w, h);

    // Axes
    const midY = h / 2;
    const midX = w / 2;
    context.strokeStyle = "#333";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, midY);
    context.lineTo(w, midY);
    context.moveTo(midX, 0);
    context.lineTo(midX, h);
    context.stroke();

    // Curve
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * w;
      const y = midY - curve[i] * (h / 2 - 4);
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}
