/**
 * DelayImpulse: a "what does this delay do" meter.
 *
 * Two pieces of information on one canvas:
 *   1. A feedback decay envelope — a stem plot of the impulse
 *      response at multiples of `delayTime` with amplitude
 *      `feedback^n`. Shows how much the signal repeats and how
 *      quickly it dies out.
 *   2. A live "tail length" readout — how long until the impulse
 *      drops below -60 dB. Useful as a "are you about to cause an
 *      infinite feedback" sanity check.
 *
 * Pure math, no AnalyserNode. Re-renders cheaply on every frame so
 * moving the time / feedback sliders redraws the picture live.
 */
export class DelayImpulse {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} effect - a DelayEffect instance.
   * @param {object} [options]
   * @param {string} [options.color="#6cf"]
   * @param {number} [options.maxEchoes=32]
   */
  constructor(canvas, effect, options = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.effect = effect;
    this.color = options.color ?? "#6cf";
    this.maxEchoes = options.maxEchoes ?? 32;
  }

  render() {
    if (!this.effect?.delayNode || !this.effect?.feedbackGain) return;
    this._draw();
  }

  _draw() {
    const { canvas, context, effect, color, maxEchoes } = this;
    const w = canvas.width;
    const h = canvas.height;

    const time = effect.delayNode.delayTime.value;
    const feedback = effect.feedbackGain.gain.value;

    context.clearRect(0, 0, w, h);

    // Top half: feedback decay bars.
    const decayTop = 0;
    const decayBottom = h * 0.6;
    const maxTime = Math.max(time * maxEchoes, time);
    const barW = Math.max(1, w / maxEchoes - 2);
    for (let n = 0; n < maxEchoes; n++) {
      const amp = Math.pow(feedback, n);
      if (amp < 0.001) break;
      const x = (n / maxEchoes) * w;
      const barH = amp * (decayBottom - decayTop);
      context.fillStyle = color;
      context.fillRect(x, decayBottom - barH, barW, barH);
    }

    // Bottom half: readouts.
    context.fillStyle = "#aaa";
    context.font = "11px monospace";
    const tailDb60 = feedback <= 0 ? 0 : Math.log(0.001) / Math.log(feedback) * time;
    const lines = [
      `time:     ${time.toFixed(3)} s`,
      `feedback: ${feedback.toFixed(2)}`,
      `-60 dB:   ${tailDb60.toFixed(2)} s`,
    ];
    lines.forEach((line, i) => {
      context.fillText(line, 6, decayBottom + 14 + i * 13);
    });
  }
}
