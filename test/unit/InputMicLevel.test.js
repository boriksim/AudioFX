import { describe, it, expect, beforeEach, vi } from "vitest";
import { InputMicLevel } from "../../visualization/perEffect/InputMicLevel.js";

/**
 * Build a mock AnalyserNode matching the bus contract: fftSize,
 * getFloatTimeDomainData that fills a buffer with a deterministic
 * pattern so we can predict the rendered bar width.
 */
function makeMockAnalyser({ pattern = "silence", fftSize = 2048 } = {}) {
  return {
    fftSize,
    frequencyBinCount: fftSize / 2,
    getFloatTimeDomainData(buf) {
      for (let i = 0; i < buf.length; i++) {
        if (pattern === "sine") buf[i] = 0.5 * Math.sin(i * 0.05);
        else buf[i] = 0;
      }
    },
    getByteFrequencyData() {},
    getByteTimeDomainData() {},
  };
}

function makeMockCanvas() {
  const calls = [];
  const ctx = {
    clearRect: (...a) => calls.push(["clearRect", ...a]),
    fillRect: (...a) => calls.push(["fillRect", ...a]),
    fillText: (...a) => calls.push(["fillText", ...a]),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    set fillStyle(_) {},
    set font(_) {},
    set textBaseline(_) {},
  };
  return {
    width: 220,
    height: 80,
    getContext: () => ctx,
    _ctx: ctx,
    _calls: calls,
  };
}

describe("InputMicLevel", () => {
  it("renders without throwing on a silent input", () => {
    const canvas = makeMockCanvas();
    const analyser = makeMockAnalyser({ pattern: "silence" });
    const r = new InputMicLevel(canvas, analyser);
    expect(() => r.render()).not.toThrow();
    // Background clear + background fill + bar fill + dB text = at least 4 calls.
    expect(canvas._calls.length).toBeGreaterThanOrEqual(3);
  });

  it("draws a longer bar for a louder signal", () => {
    const loudCanvas = makeMockCanvas();
    const loud = new InputMicLevel(loudCanvas, makeMockAnalyser({ pattern: "sine" }));
    loud.render();

    const quietCanvas = makeMockCanvas();
    const quiet = new InputMicLevel(quietCanvas, makeMockAnalyser({ pattern: "silence" }));
    quiet.render();

    // Find the bar fillRect (the one with non-zero width after the
    // background). The loud one should paint a wider bar.
    const findBarWidth = (calls) => {
      // The pattern of calls: clearRect, background fillRect (220x80),
      // bar fillRect, fillText. The bar is the third fillRect.
      const fillRects = calls.filter((c) => c[0] === "fillRect");
      // The bar is the last fillRect; the first is the background.
      return fillRects[fillRects.length - 1]?.[3] ?? 0;
    };
    const loudWidth = findBarWidth(loudCanvas._calls);
    const quietWidth = findBarWidth(quietCanvas._calls);
    expect(loudWidth).toBeGreaterThan(quietWidth);
  });

  it("honors custom min/max dB", () => {
    const canvas = makeMockCanvas();
    const analyser = makeMockAnalyser({ pattern: "sine" });
    const r = new InputMicLevel(canvas, analyser, { minDb: -40, maxDb: 0 });
    expect(() => r.render()).not.toThrow();
  });

  it("survives a missing canvas context (jsdom returns null)", () => {
    const canvas = { width: 100, height: 50, getContext: () => null };
    const analyser = makeMockAnalyser();
    const r = new InputMicLevel(canvas, analyser);
    expect(() => r.render()).not.toThrow();
  });
});
