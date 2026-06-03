import { describe, it, expect, beforeEach } from "vitest";
import BaseEffect from "../../core/BaseEffect.js";

class TrivialEffect extends BaseEffect {
  static manifest = {
    id: "trivial",
    name: "Trivial",
    version: "1.0.0",
    category: "test",
  };

  initUI() {}
}

describe("BaseEffect", () => {
  let ctx, dom, effect;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
    effect = new TrivialEffect(ctx, dom);
  });

  it("exposes the static manifest on the class", () => {
    expect(TrivialEffect.manifest.id).toBe("trivial");
    expect(TrivialEffect.manifest.version).toBe("1.0.0");
    expect(TrivialEffect.manifest.name).toBe("Trivial");
  });

  it("default getConfig returns { mix, bypass }", () => {
    expect(effect.getConfig()).toEqual({ mix: 0.5, bypass: true });
  });

  it("default applyConfig updates mix and bypass", () => {
    effect.applyConfig({ mix: 0.7, bypass: false });
    expect(effect.mix).toBe(0.7);
    expect(effect.bypass).toBe(false);
  });

  it("applyConfig ignores unknown keys without throwing", () => {
    expect(() => effect.applyConfig({ unknown: "ignored" })).not.toThrow();
  });

  it("applyConfig with no argument is a no-op", () => {
    expect(() => effect.applyConfig()).not.toThrow();
  });

  it("subclasses can extend getConfig with effect-specific fields", () => {
    class WithExtra extends BaseEffect {
      static manifest = { id: "extra", name: "Extra", version: "1.0.0" };
      initUI() {}
      getConfig() {
        return { ...super.getConfig(), custom: 42 };
      }
    }
    const e = new WithExtra(ctx, dom);
    expect(e.getConfig()).toEqual({ mix: 0.5, bypass: true, custom: 42 });
  });
});
