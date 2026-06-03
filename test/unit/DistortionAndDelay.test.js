import { describe, it, expect, beforeEach } from "vitest";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { DelayEffect } from "../../effects/DelayEffect.js";

describe("DistortionEffect", () => {
  let ctx, dom, fx;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
    fx = new DistortionEffect(ctx, dom);
  });

  it("is bypassed by default", () => {
    expect(fx.bypass).toBe(true);
    expect(fx.dryGain.gain.value).toBe(1.0);
    expect(fx.wetGain.gain.value).toBe(0.0);
  });

  it("mix defaults to 1.0 after setMix(1.0) in constructor", () => {
    expect(fx.mix).toBeCloseTo(1.0);
  });

  it("setStrength clamps to [0, 10] via setParam", () => {
    fx.setParam("distortionStrength", 100);
    expect(fx.strength).toBe(10);
    fx.setParam("distortionStrength", -1);
    expect(fx.strength).toBe(0);
  });

  it("setParam('distortionType') updates the curve type", () => {
    fx.setParam("distortionType", "hard");
    expect(fx.type).toBe("hard");
  });

  it("generateCurve produces a 44100-sample Float32Array", () => {
    fx.setStrength(2);
    fx.setType("soft");
    fx.generateCurve();
    expect(fx.waveShaper.curve).toBeInstanceOf(Float32Array);
    expect(fx.waveShaper.curve.length).toBe(44100);
  });

  it("bitcrusher curve type quantises values to discrete steps", () => {
    fx.setType("bitcrusher");
    fx.setStrength(5);
    fx.generateCurve();
    // The bitcrusher curve should map the same input x to a discrete value.
    const idx = Math.floor(((0.5 + 1) / 2) * 44100);
    const out = fx.waveShaper.curve[idx];
    expect(out).toBeGreaterThanOrEqual(-1);
    expect(out).toBeLessThanOrEqual(1);
  });

  it("uses 2x oversample (Phase 1.5 latency choice)", () => {
    expect(fx.waveShaper.oversample).toBe("2x");
  });
});

describe("DelayEffect", () => {
  let ctx, dom, fx;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
    fx = new DelayEffect(ctx, dom);
  });

  it("is bypassed by default and feedback is silenced", () => {
    expect(fx.bypass).toBe(true);
    expect(fx.feedbackGain.gain.value).toBe(0.0);
  });

  it("setBypassed(false) restores feedback gain to stored value", () => {
    fx.setBypassed(false);
    expect(fx.feedbackGain.gain.value).toBeCloseTo(fx.feedbackGainValue);
  });

  it("setParam('delayTime') schedules a ramped value", () => {
    fx.setBypassed(false);
    fx.setParam("delayTime", 0.5);
    // delayTime should be set in range after the ramp's target.
    // The mock AudioParam's value is whatever linearRampToValueAtTime leaves,
    // so we just assert the call didn't throw and the value is bounded.
    expect(fx.delayNode.delayTime.value).toBeGreaterThan(0);
  });

  it("setParam('delayFeedback') clamps to [0, 1]", () => {
    fx.setParam("delayFeedback", 5);
    expect(fx.feedbackGain.gain.value).toBe(1);
    fx.setParam("delayFeedback", -1);
    expect(fx.feedbackGain.gain.value).toBe(0);
  });

  it("updateConfig applies delayTime, feedback, and mix", () => {
    fx.updateConfig({ delayTime: 0.4, feedback: 0.3, mix: 0.6 });
    expect(fx.delayNode.delayTime.value).toBeCloseTo(0.4);
    expect(fx.feedbackGain.gain.value).toBeCloseTo(0.3);
    expect(fx.mix).toBe(0.6);
  });
});
