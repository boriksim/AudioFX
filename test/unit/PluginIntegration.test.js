import { describe, it, expect, beforeEach } from "vitest";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";

/**
 * Round-trip a config through getConfig / applyConfig on each effect.
 * This is the contract serialization (Phase 2c) and the pedalboard UI
 * (Phase 3) will both rely on.
 */
describe("Effect getConfig / applyConfig round-trips", () => {
  let ctx, dom;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
  });

  it("DistortionEffect", () => {
    const fx = new DistortionEffect(ctx, dom);
    fx.applyConfig({ strength: 4.2, type: "hard", mix: 0.6, bypass: false });
    const cfg = fx.getConfig();
    expect(cfg.strength).toBe(4.2);
    expect(cfg.type).toBe("hard");
    expect(cfg.mix).toBeCloseTo(0.6);
    expect(cfg.bypass).toBe(false);
  });

  it("DistortionEffect applies a partial config without clobbering other fields", () => {
    const fx = new DistortionEffect(ctx, dom);
    fx.setStrength(7);
    fx.setType("tanh");
    fx.applyConfig({ strength: 2 });
    expect(fx.strength).toBe(2);
    expect(fx.type).toBe("tanh");
  });
});

describe("EffectChainManager with a registry", () => {
  let ctx, registry, manager;

  beforeEach(() => {
    document.body.innerHTML = '<div id="effects-container"></div>';
    ctx = new AudioContext();
    registry = new PluginRegistry().register(DistortionEffect);
    manager = new EffectChainManager(ctx, "#effects-container", registry);

    // Stub fetch for the HTML template load.
    globalThis.fetch = () => Promise.resolve({
      text: () => Promise.resolve("<div>stub html</div>"),
    });
  });

  it("addEffect() resolves the class through the registry by manifest id", async () => {
    const entry = await manager.addEffect("distortion");
    expect(entry.manifestId).toBe("distortion");
    expect(entry.audioNode).toBeInstanceOf(DistortionEffect);
  });

  it("addEffect() reads the HTML path from manifest.assets.html", async () => {
    let fetchedPath = null;
    globalThis.fetch = (path) => {
      fetchedPath = path;
      return Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
    };
    await manager.addEffect("distortion");
    expect(fetchedPath).toBe("effects/DistortionEffect.html");
  });

  it("addEffect() throws with a helpful message for unknown ids", async () => {
    await expect(manager.addEffect("nonexistent")).rejects.toThrow(
      /not registered/
    );
  });

  it("addEffect() throws if the manifest is missing assets.html", async () => {
    class NoAssets {
      static manifest = { id: "noassets", name: "NoAssets", version: "1.0.0" };
    }
    registry.register(NoAssets);
    await expect(manager.addEffect("noassets")).rejects.toThrow(
      /missing assets.html/
    );
  });
});
