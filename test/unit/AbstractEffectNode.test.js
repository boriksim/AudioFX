import { describe, it, expect, beforeEach } from "vitest";
import AbstractEffectNode from "../../core/AbstractEffectNode.js";

class TrivialEffect extends AbstractEffectNode {
  initUI() {
    // No DOM widgets in tests.
  }
}

function makeDom() {
  return document.createElement("div");
}

describe("AbstractEffectNode", () => {
  let ctx;
  let dom;
  let effect;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = makeDom();
  });

  it("defaults to bypassed (full dry, no wet)", () => {
    effect = new TrivialEffect(ctx, dom);
    expect(effect.bypass).toBe(true);
    expect(effect.dryGain.gain.value).toBe(1.0);
    expect(effect.wetGain.gain.value).toBe(0.0);
  });

  it("setBypassed(false) applies the current mix", () => {
    effect = new TrivialEffect(ctx, dom);
    effect.mix = 0.7;
    effect.setBypassed(false);
    expect(effect.dryGain.gain.value).toBeCloseTo(0.3);
    expect(effect.wetGain.gain.value).toBeCloseTo(0.7);
  });

  it("setBypassed(true) restores full dry path regardless of mix", () => {
    effect = new TrivialEffect(ctx, dom);
    effect.setBypassed(false);
    effect.mix = 0.2;
    effect.setBypassed(true);
    expect(effect.dryGain.gain.value).toBe(1.0);
    expect(effect.wetGain.gain.value).toBe(0.0);
  });

  it("setMix clamps to [0, 1]", () => {
    effect = new TrivialEffect(ctx, dom);
    effect.setBypassed(false);
    effect.setMix(5);
    expect(effect.mix).toBe(1);
    effect.setMix(-1);
    expect(effect.mix).toBe(0);
  });

  it("getConfigSchema returns a default schema with mix", () => {
    effect = new TrivialEffect(ctx, dom);
    const schema = effect.getConfigSchema();
    expect(schema.mix).toMatchObject({
      type: "range",
      min: 0,
      max: 1,
      step: 0.01,
    });
  });

  it("updateConfig applies a mix", () => {
    effect = new TrivialEffect(ctx, dom);
    effect.updateConfig({ mix: 0.3 });
    expect(effect.mix).toBe(0.3);
  });

  describe("hard bypass (Phase 1.5)", () => {
    it("disconnects the wet path from effectOutput when bypassed", () => {
      effect = new TrivialEffect(ctx, dom);
      // Before toggling, the wet path is connected (effectOutput -> wetGain).
      expect(effect.effectOutput.connections).toContain(effect.wetGain);

      effect.setBypassed(true);
      // After bypass, the wet path is disconnected so the effect's DSP
      // stops processing samples.
      expect(effect.effectOutput.connections).not.toContain(effect.wetGain);
    });

    it("reconnects the wet path when bypass is cleared", () => {
      effect = new TrivialEffect(ctx, dom);
      effect.setBypassed(true);
      expect(effect.effectOutput.connections).not.toContain(effect.wetGain);

      effect.setBypassed(false);
      expect(effect.effectOutput.connections).toContain(effect.wetGain);
    });

    it("rapid toggling is safe (no throws on duplicate connect/disconnect)", () => {
      effect = new TrivialEffect(ctx, dom);
      expect(() => {
        effect.setBypassed(true);
        effect.setBypassed(false);
        effect.setBypassed(true);
        effect.setBypassed(false);
      }).not.toThrow();
    });
  });
});
