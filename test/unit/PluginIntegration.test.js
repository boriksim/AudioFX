import { describe, it, expect, beforeEach } from "vitest";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { LowpassEffect } from "../../effects/LowpassEffect.js";
import { DelayEffect } from "../../effects/DelayEffect.js";
import { InputMic } from "../../effects/InputMic.js";
import { InputFile } from "../../effects/InputFile.js";
import { InputOscillator } from "../../effects/InputOscillator.js";
import { ChannelSplitter } from "../../effects/ChannelSplitter.js";

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

/**
 * Regression for the "patchboard blank page" bug: when an effect
 * file uses `export default class` instead of `export class`, the
 * top-level module fails to evaluate under the browser's static
 * import resolution, and the chain is never built. script.js
 * imports each effect with a named import; every effect file
 * MUST use a matching named export. This test imports all 7
 * effects with the same syntax script.js uses, and constructs
 * each one, to catch any future drift in the export style.
 */
describe("Effect modules expose named exports matching script.js imports", () => {
  it("imports and constructs all 7 effects", () => {
    expect(typeof DistortionEffect).toBe("function");
    expect(typeof LowpassEffect).toBe("function");
    expect(typeof DelayEffect).toBe("function");
    expect(typeof InputMic).toBe("function");
    expect(typeof InputFile).toBe("function");
    expect(typeof InputOscillator).toBe("function");
    expect(typeof ChannelSplitter).toBe("function");

    const ctx = new AudioContext();
    const dom = document.createElement("div");
    const ctorArgs = [ctx, dom];
    const ctorArgsAbstract = [ctx];
    for (const Ctor of [DistortionEffect, LowpassEffect, DelayEffect]) {
      const fx = new Ctor(...ctorArgs);
      expect(fx).toBeInstanceOf(Ctor);
    }
    for (const Ctor of [InputMic, InputFile, InputOscillator, ChannelSplitter]) {
      const fx = new Ctor(...ctorArgsAbstract);
      expect(fx).toBeInstanceOf(Ctor);
    }
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
