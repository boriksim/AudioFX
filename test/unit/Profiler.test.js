/**
 * Tests for the Profiler: rolling-window render timings, drop-out
 * counting, state transitions, and stats aggregation.
 *
 * jsdom doesn't have a real `PerformanceObserver`, so longtask
 * observation is skipped. Tests focus on `recordFrame` and
 * `getStats` behavior, plus the statechange listener and
 * `subscribe` notification contract.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Profiler } from "../../engine/Profiler.js";

describe("Profiler", () => {
  let ctx, profiler;

  beforeEach(() => {
    ctx = new AudioContext();
    profiler = new Profiler(ctx, { windowMs: 1000 });
  });

  it("starts with empty stats", () => {
    const stats = profiler.getStats();
    expect(stats.frameCount).toBe(0);
    expect(stats.averageFrameTimeMs).toBe(0);
    expect(stats.peakFrameTimeMs).toBe(0);
    expect(stats.dropOutCount).toBe(0);
    expect(stats.stateTransitions).toBe(0);
  });

  it("records a single frame and reports it", () => {
    profiler.recordFrame(10);
    const stats = profiler.getStats();
    expect(stats.frameCount).toBe(1);
    expect(stats.averageFrameTimeMs).toBe(10);
    expect(stats.peakFrameTimeMs).toBe(10);
  });

  it("computes average across many frames", () => {
    profiler.recordFrame(5);
    profiler.recordFrame(15);
    profiler.recordFrame(10);
    const stats = profiler.getStats();
    expect(stats.frameCount).toBe(3);
    expect(stats.averageFrameTimeMs).toBe(10);
  });

  it("tracks the peak frame time", () => {
    profiler.recordFrame(2);
    profiler.recordFrame(50);
    profiler.recordFrame(8);
    const stats = profiler.getStats();
    expect(stats.peakFrameTimeMs).toBe(50);
  });

  it("ignores negative or non-numeric durations", () => {
    profiler.recordFrame(-5);
    profiler.recordFrame("not a number");
    profiler.recordFrame(NaN);
    expect(profiler.getStats().frameCount).toBe(0);
  });

  it("exposes the current audio context state and output latency", () => {
    const stats = profiler.getStats();
    expect(stats.audioContextState).toBe(ctx.state);
    // The polyfill sets outputLatency = 0.020s = 20ms.
    expect(stats.outputLatencyMs).toBe(20);
  });

  it("notifies subscribers on every recordFrame", () => {
    const fn = vi.fn();
    profiler.subscribe(fn);
    profiler.recordFrame(5);
    profiler.recordFrame(7);
    expect(fn).toHaveBeenCalledTimes(2);
    // Each call receives the current stats.
    expect(fn.mock.calls[0][0].frameCount).toBe(1);
    expect(fn.mock.calls[1][0].frameCount).toBe(2);
  });

  it("unsubscribes correctly", () => {
    const fn = vi.fn();
    const unsub = profiler.subscribe(fn);
    profiler.recordFrame(5);
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
    profiler.recordFrame(7);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("start() and stop() are idempotent", () => {
    profiler.start();
    profiler.start();
    profiler.stop();
    profiler.stop();
    // No assertion needed; just verify it doesn't throw.
  });

  it("counts state transitions when the audio context changes state", () => {
    profiler.start();
    // The polyfill's `state` is a string field; mutate it and
    // dispatch the event manually (the polyfill doesn't fire
    // statechange on its own).
    ctx.state = "suspended";
    if (typeof ctx.dispatchEvent === "function") {
      ctx.dispatchEvent(new Event("statechange"));
    }
    const stats = profiler.getStats();
    expect(stats.stateTransitions).toBe(1);
    profiler.stop();
  });

  it("does not throw when started without a PerformanceObserver", () => {
    // jsdom doesn't have PerformanceObserver, so the longtask path
    // is silently disabled. The Profiler must still work.
    expect(() => profiler.start()).not.toThrow();
    expect(() => profiler.stop()).not.toThrow();
  });

  it("isolates subscriber exceptions", () => {
    const fn1 = vi.fn(() => { throw new Error("boom"); });
    const fn2 = vi.fn();
    profiler.subscribe(fn1);
    profiler.subscribe(fn2);
    expect(() => profiler.recordFrame(5)).not.toThrow();
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
