import { describe, it, expect, beforeEach, vi } from "vitest";
import { SpectrumBars } from "../../visualization/renderers/SpectrumBars.js";
import { Waveform } from "../../visualization/renderers/Waveform.js";

/**
 * jsdom's canvas returns null from getContext. The renderers call
 * a handful of 2d-context methods, so we stub a minimal context that
 * records calls. We don't care about pixel-level correctness in tests;
 * we care that the right methods are invoked the right number of times.
 */
function makeMockContext() {
  const noop = () => {};
  return {
    clearRect: vi.fn(noop),
    fillRect: vi.fn(noop),
    beginPath: vi.fn(noop),
    moveTo: vi.fn(noop),
    lineTo: vi.fn(noop),
    stroke: vi.fn(noop),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
  };
}

function makeCanvas(w = 400, h = 100) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const mockCtx = makeMockContext();
  canvas.getContext = vi.fn(() => mockCtx);
  canvas.__ctx = mockCtx;
  return canvas;
}

describe("SpectrumBars", () => {
  let ctx, canvas, analyser, renderer;

  beforeEach(() => {
    ctx = new AudioContext();
    canvas = makeCanvas();
    analyser = ctx.createAnalyser();
    renderer = new SpectrumBars(canvas, analyser, { bars: 16 });
  });

  it("exposes the bound analyser", () => {
    expect(renderer._analyser).toBe(analyser);
  });

  it("uses the analyser's fftSize to size its data buffer", () => {
    expect(renderer._data.length).toBe(analyser.frequencyBinCount);
  });

  it("setAnalyser() swaps the analyser and resizes the buffer", () => {
    const a2 = ctx.createAnalyser();
    a2.fftSize = 1024;
    renderer.setAnalyser(a2);
    expect(renderer._analyser).toBe(a2);
    expect(renderer._data.length).toBe(512);
  });

  it("render() does not throw with no analyser", () => {
    const r = new SpectrumBars(makeCanvas());
    expect(() => r.render()).not.toThrow();
  });

  it("render() clears the canvas and draws bars", () => {
    const clearSpy = vi.spyOn(canvas.getContext("2d"), "clearRect");
    const fillSpy = vi.spyOn(canvas.getContext("2d"), "fillRect");
    renderer.render();
    expect(clearSpy).toHaveBeenCalled();
    // 16 bars => 16 fillRect calls.
    expect(fillSpy).toHaveBeenCalledTimes(16);
  });
});

describe("Waveform", () => {
  let ctx, canvas, analyser, renderer;

  beforeEach(() => {
    ctx = new AudioContext();
    canvas = makeCanvas();
    analyser = ctx.createAnalyser();
    renderer = new Waveform(canvas, analyser);
  });

  it("render() strokes a polyline across the canvas", () => {
    const strokeSpy = vi.spyOn(canvas.getContext("2d"), "stroke");
    renderer.render();
    expect(strokeSpy).toHaveBeenCalled();
  });

  it("renders a center axis and the signal", () => {
    const moveToSpy = vi.spyOn(canvas.getContext("2d"), "moveTo");
    renderer.render();
    // At least 2 strokes (axis + signal) means moveTo is called at least twice.
    expect(moveToSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("setAnalyser() resizes the time-domain buffer", () => {
    const a2 = ctx.createAnalyser();
    a2.fftSize = 1024;
    renderer.setAnalyser(a2);
    expect(renderer._data.length).toBe(1024);
  });
});
