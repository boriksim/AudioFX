import { describe, it, expect, beforeEach, vi } from "vitest";
import { AnalyserBus } from "../../engine/AnalyserBus.js";

describe("AnalyserBus", () => {
  let ctx, bus;

  beforeEach(() => {
    ctx = new AudioContext();
    bus = new AnalyserBus(ctx);
  });

  it("attach() creates an AnalyserNode connected to the source", () => {
    const source = ctx.createGain();
    const analyser = bus.attach("k1", source);
    expect(analyser).toBeTruthy();
    expect(analyser.type).toBe("AnalyserNode");
    expect(source.connections).toContain(analyser);
    expect(bus.get("k1")).toBe(analyser);
  });

  it("attach() is idempotent on the same key", () => {
    const source = ctx.createGain();
    const a1 = bus.attach("k1", source);
    const a2 = bus.attach("k1", source);
    expect(a1).toBe(a2);
  });

  it("detach() removes the tap and disconnects the analyser", () => {
    const source = ctx.createGain();
    const analyser = bus.attach("k1", source);
    bus.detach("k1");
    expect(bus.get("k1")).toBeUndefined();
    expect(analyser.connections).toEqual([]);
  });

  it("detach() on a missing key is a no-op", () => {
    expect(() => bus.detach("nope")).not.toThrow();
  });

  describe("render loop", () => {
    it("does not start the loop with no renderers", () => {
      expect(bus._running).toBe(false);
    });

    it("starts when the first renderer is added", () => {
      bus.addRenderer({ render: vi.fn() });
      expect(bus._running).toBe(true);
    });

    it("stops when the last renderer is removed", () => {
      const r = { render: vi.fn() };
      bus.addRenderer(r);
      bus.removeRenderer(r);
      expect(bus._running).toBe(false);
    });

    it("calls render() on every renderer each frame", () => {
      const r1 = { render: vi.fn() };
      const r2 = { render: vi.fn() };
      bus.addRenderer(r1);
      bus.addRenderer(r2);
      // Wait for two rAF ticks (one in-flight, one more).
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            expect(r1.render).toHaveBeenCalled();
            expect(r2.render).toHaveBeenCalled();
            resolve();
          });
        });
      });
    });

    it("catches and logs renderer errors so one bad renderer doesn't break the loop", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const bad = { render: () => { throw new Error("boom"); } };
      const good = { render: vi.fn() };
      bus.addRenderer(bad);
      bus.addRenderer(good);
      // Manually run one tick of the loop.
      bus._startLoop();
      // The next rAF callback should still execute good.render despite bad throwing.
      // We can't easily await rAF in vitest without fake timers, so we trigger
      // the rAF callback synchronously.
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          expect(good.render).toHaveBeenCalled();
          expect(consoleSpy).toHaveBeenCalled();
          consoleSpy.mockRestore();
          resolve();
        });
      });
    });
  });

  it("destroy() stops the loop and detaches every tap", () => {
    const source1 = ctx.createGain();
    const source2 = ctx.createGain();
    bus.attach("k1", source1);
    bus.attach("k2", source2);
    bus.addRenderer({ render: vi.fn() });

    bus.destroy();
    expect(bus.taps.size).toBe(0);
    expect(bus.renderers.size).toBe(0);
    expect(bus._running).toBe(false);
  });
});
