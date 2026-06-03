import { describe, it, expect, beforeEach, vi } from "vitest";
import { LowpassEffect } from "../../effects/LowpassEffect.js";
import { renderSchemaForm } from "../../ui/SchemaForm.js";

/**
 * These tests pin down the bug fixes from Phase 1:
 *  - getParam('lowpassFreq') was reading the wrong field
 *  - destroy() referenced a non-existent this.delayNode
 *  - updateConfig called a non-existent setFrequency method
 *  - the redundant this.bypass = false field was dropped
 */
describe("LowpassEffect (Phase 1 fixes)", () => {
  let ctx;
  let dom;
  let lp;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
    lp = new LowpassEffect(ctx, dom);
  });

  it("is enabled by default (not bypassed)", () => {
    expect(lp.bypass).toBe(false);
    expect(lp.wetGain.gain.value).toBeCloseTo(1.0);
  });

  it("getParam('lowpassFreq') returns the biquad frequency, not a delay field", () => {
    lp.lowpassNode.frequency.value = 1500;
    expect(lp.getParam("lowpassFreq")).toBe(1500);
    // Sanity: there is no delayNode field on this effect.
    expect(lp.delayNode).toBeUndefined();
  });

  it("getParam('mix') and getParam('bypass') reflect current state", () => {
    lp.setBypassed(true);
    expect(lp.getParam("bypass")).toBe(true);
    lp.setMix(0.4);
    expect(lp.getParam("mix")).toBeCloseTo(0.4);
  });

  it("setParam clamps frequency to [100, 16000]", () => {
    lp.setParam("lowpassFreq", 50_000);
    expect(lp.lowpassNode.frequency.value).toBe(16000);
    lp.setParam("lowpassFreq", 1);
    expect(lp.lowpassNode.frequency.value).toBe(100);
    lp.setParam("lowpassFreq", 2500);
    expect(lp.lowpassNode.frequency.value).toBe(2500);
  });

  it("setFrequency is a public method that updateConfig uses", () => {
    expect(typeof lp.setFrequency).toBe("function");
    lp.setFrequency(440);
    expect(lp.lowpassNode.frequency.value).toBe(440);
  });

  it("updateConfig with lowpassFrequency applies via setFrequency", () => {
    lp.updateConfig({ lowpassFrequency: 880 });
    expect(lp.lowpassNode.frequency.value).toBe(880);
  });

  it("schema form's frequency slider drives the biquad", () => {
    // Regression: the schema key 'frequency' must match applyConfig.
    renderSchemaForm(dom, lp);
    const ranges = dom.querySelectorAll('input[type="range"]');
    const frequency = [...ranges].find((r) => parseFloat(r.max) === 16000);
    expect(frequency).toBeTruthy();
    frequency.value = "2200";
    frequency.dispatchEvent(new Event("input"));
    expect(lp.lowpassNode.frequency.value).toBe(2200);
  });

  it("updateConfig with mix applies via super", () => {
    lp.updateConfig({ mix: 0.25 });
    expect(lp.mix).toBe(0.25);
  });

  it("destroy() disconnects the biquad, not a non-existent delayNode", () => {
    const spy = vi.spyOn(lp.lowpassNode, "disconnect").mockImplementation(() => {});
    lp.destroy();
    expect(spy).toHaveBeenCalled();
  });

  it("destroy() does not throw when widgets are absent", () => {
    // dom has no sliders; destroy must be safe.
    expect(() => lp.destroy()).not.toThrow();
  });
});
