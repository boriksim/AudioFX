import { describe, it, expect, beforeEach, vi } from "vitest";
import { DistortionCurve } from "../../visualization/perEffect/DistortionCurve.js";
import { BiquadResponse } from "../../visualization/perEffect/BiquadResponse.js";
import { DelayImpulse } from "../../visualization/perEffect/DelayImpulse.js";

function makeMockContext() {
  const noop = () => {};
  return {
    clearRect: vi.fn(noop),
    fillRect: vi.fn(noop),
    beginPath: vi.fn(noop),
    moveTo: vi.fn(noop),
    lineTo: vi.fn(noop),
    stroke: vi.fn(noop),
    fillText: vi.fn(noop),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
  };
}

function makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 100;
  const ctx = makeMockContext();
  canvas.getContext = vi.fn(() => ctx);
  canvas.__ctx = ctx;
  return canvas;
}

describe("DistortionCurve", () => {
  it("renders without an effect (no-op)", () => {
    const canvas = makeCanvas();
    const r = new DistortionCurve(canvas, null);
    expect(() => r.render()).not.toThrow();
    expect(canvas.__ctx.clearRect).not.toHaveBeenCalled();
  });

  it("draws axes and the curve when a curve is present", () => {
    const canvas = makeCanvas();
    const waveShaper = { curve: new Float32Array(64) };
    for (let i = 0; i < waveShaper.curve.length; i++) {
      waveShaper.curve[i] = (i / waveShaper.curve.length) * 2 - 1;
    }
    const r = new DistortionCurve(canvas, { waveShaper });
    r.render();
    // 1 stroke for axes + 1 for the curve.
    expect(canvas.__ctx.stroke).toHaveBeenCalledTimes(2);
    // The curve produces (curve.length - 1) lineTo + 1 moveTo calls.
    expect(canvas.__ctx.lineTo.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("BiquadResponse", () => {
  it("calls getFrequencyResponse on render", () => {
    const canvas = makeCanvas();
    const biquad = {
      getFrequencyResponse: vi.fn((_f, mag) => {
        for (let i = 0; i < mag.length; i++) mag[i] = 1;
      }),
    };
    const r = new BiquadResponse(canvas, biquad, { samples: 32 });
    r.render();
    expect(biquad.getFrequencyResponse).toHaveBeenCalled();
    expect(canvas.__ctx.stroke).toHaveBeenCalled();
  });

  it("survives a disconnected biquad (getFrequencyResponse throws)", () => {
    const canvas = makeCanvas();
    const biquad = {
      getFrequencyResponse: vi.fn(() => {
        throw new Error("disconnected");
      }),
    };
    const r = new BiquadResponse(canvas, biquad);
    expect(() => r.render()).not.toThrow();
  });
});

describe("DelayImpulse", () => {
  it("renders without an effect (no-op)", () => {
    const canvas = makeCanvas();
    const r = new DelayImpulse(canvas, null);
    expect(() => r.render()).not.toThrow();
  });

  it("draws a decay bar for each echo above the silence floor", () => {
    const canvas = makeCanvas();
    const effect = {
      delayNode: { delayTime: { value: 0.3 } },
      feedbackGain: { gain: { value: 0.5 } },
    };
    const r = new DelayImpulse(canvas, effect, { maxEchoes: 16 });
    r.render();
    // At least one bar drawn (the first echo at amplitude 1.0).
    expect(canvas.__ctx.fillRect).toHaveBeenCalled();
    // Readouts: 3 lines of fillText.
    expect(canvas.__ctx.fillText).toHaveBeenCalledTimes(3);
  });

  it("zero feedback draws only the first bar", () => {
    const canvas = makeCanvas();
    const effect = {
      delayNode: { delayTime: { value: 0.3 } },
      feedbackGain: { gain: { value: 0 } },
    };
    const r = new DelayImpulse(canvas, effect, { maxEchoes: 16 });
    r.render();
    // feedback=0 -> 0^1 = 0 < 0.001, so the loop breaks after the first bar.
    expect(canvas.__ctx.fillRect).toHaveBeenCalledTimes(1);
  });
});
