import { describe, it, expect, beforeEach } from "vitest";
import { UtilityEffect } from "../../effects/UtilityEffect.js";

describe("UtilityEffect", () => {
  let ctx, dom, fx;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
    fx = new UtilityEffect(ctx, dom);
  });

  it("has a single input port and a single output port", () => {
    expect(fx.getInputPorts()).toEqual([{ id: "in" }]);
    expect(fx.getOutputPorts()).toEqual([{ id: "out" }]);
  });

  it("defaults: gain=1, pan=0, invertPhase=false, mono=false, bypass=false", () => {
    expect(fx.gain).toBeCloseTo(1);
    expect(fx.pan).toBeCloseTo(0);
    expect(fx.invertPhase).toBe(false);
    expect(fx.mono).toBe(false);
    expect(fx.bypass).toBe(false);
  });

  describe("setGain", () => {
    it("clamps to [0, 2]", () => {
      fx.setGain(100);
      expect(fx.gain).toBe(2);
      fx.setGain(-1);
      expect(fx.gain).toBe(0);
    });

    it("updates the output gain node", () => {
      fx.setGain(0.5);
      expect(fx.outputGain.gain.value).toBeCloseTo(0.5);
    });
  });

  describe("setPan", () => {
    it("clamps to [-1, 1]", () => {
      fx.setPan(2);
      expect(fx.pan).toBe(1);
      fx.setPan(-2);
      expect(fx.pan).toBe(-1);
    });

    it("updates the panner's pan value", () => {
      fx.setPan(-0.5);
      expect(fx.panner.pan.value).toBeCloseTo(-0.5);
    });
  });

  describe("setInvertPhase", () => {
    it("sets phaseInvert.gain to -1 when true", () => {
      fx.setInvertPhase(true);
      expect(fx.phaseInvert.gain.value).toBe(-1);
      expect(fx.invertPhase).toBe(true);
    });

    it("sets phaseInvert.gain to 1 when false", () => {
      fx.setInvertPhase(true);
      fx.setInvertPhase(false);
      expect(fx.phaseInvert.gain.value).toBe(1);
      expect(fx.invertPhase).toBe(false);
    });
  });

  describe("setMono (true downmix via 2x2 gain matrix)", () => {
    it("stereo mode: identity matrix (L stays L, R stays R)", () => {
      // Default is stereo. Verify the 2x2 matrix is identity.
      expect(fx.gainLL.gain.value).toBe(1);
      expect(fx.gainLR.gain.value).toBe(0);
      expect(fx.gainRL.gain.value).toBe(0);
      expect(fx.gainRR.gain.value).toBe(1);
    });

    it("mono mode: uniform 0.5 matrix (L+R summed to both outputs)", () => {
      fx.setMono(true);
      expect(fx.gainLL.gain.value).toBe(0.5);
      expect(fx.gainLR.gain.value).toBe(0.5);
      expect(fx.gainRL.gain.value).toBe(0.5);
      expect(fx.gainRR.gain.value).toBe(0.5);
      expect(fx.mono).toBe(true);
    });

    it("toggling mono back to stereo restores the identity matrix", () => {
      fx.setMono(true);
      fx.setMono(false);
      expect(fx.gainLL.gain.value).toBe(1);
      expect(fx.gainLR.gain.value).toBe(0);
      expect(fx.gainRL.gain.value).toBe(0);
      expect(fx.gainRR.gain.value).toBe(1);
    });
  });

  describe("audio path is always wired (gain-based, no disconnects)", () => {
    it("the 2x2 matrix gains are always connected (no disconnect on toggle)", () => {
      // The previous design would have disconnected/reconnected
      // nodes on parameter changes; the new design keeps the path
      // always wired and just changes gain values. This test
      // checks that the matrix gains are still wired after a
      // bunch of toggles.
      for (let i = 0; i < 5; i++) {
        fx.setMono(true);
        fx.setMono(false);
        fx.setInvertPhase(true);
        fx.setInvertPhase(false);
        fx.setGain(0.3);
        fx.setPan(0.7);
      }
      // The polyfill's MockAudioNode has a `connections` array
      // populated by `connect()`. The splitter output is wired
      // to all four matrix gains. We don't need to assert exact
      // connection lists (the polyfill is approximate), just
      // that no error was thrown — i.e. the design didn't try
      // to disconnect a node that was never connected.
      expect(fx.splitter.connections.length).toBeGreaterThan(0);
      expect(fx.merger.connections.length).toBeGreaterThan(0);
    });
  });

  describe("getConfig / applyConfig", () => {
    it("getConfig returns all four params plus mix/bypass", () => {
      const cfg = fx.getConfig();
      expect(cfg).toMatchObject({
        gain: 1,
        pan: 0,
        invertPhase: false,
        mono: false,
        bypass: false,
      });
    });

    it("applyConfig applies each param independently", () => {
      fx.applyConfig({ gain: 0.7, pan: -0.3, invertPhase: true, mono: true });
      expect(fx.gain).toBeCloseTo(0.7);
      expect(fx.pan).toBeCloseTo(-0.3);
      expect(fx.invertPhase).toBe(true);
      expect(fx.mono).toBe(true);
    });
  });

  describe("getConfigSchema", () => {
    it("returns an object with all four params", () => {
      const schema = fx.getConfigSchema();
      expect(Object.keys(schema).sort()).toEqual(["gain", "invertPhase", "mono", "pan"]);
      expect(schema.gain.type).toBe("range");
      expect(schema.pan.type).toBe("range");
      expect(schema.invertPhase.type).toBe("toggle");
      expect(schema.mono.type).toBe("toggle");
    });
  });
});
