import { describe, it, expect, beforeEach } from "vitest";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import {
  serializeProject,
  deserializeProject,
  validateProject,
  PROJECT_FORMAT,
  PROJECT_SCHEMA,
} from "../../persistence/project.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { LowpassEffect } from "../../effects/LowpassEffect.js";
import { DelayEffect } from "../../effects/DelayEffect.js";

function makeRegistry() {
  return new PluginRegistry()
    .register(DistortionEffect)
    .register(LowpassEffect)
    .register(DelayEffect);
}

function makeManager(registry) {
  document.body.innerHTML = '<div id="effects-container"></div>';
  const ctx = new AudioContext();
  // Stub fetch so addEffect's HTML-fallback path doesn't 404.
  globalThis.fetch = () => Promise.resolve({
    text: () => Promise.resolve("<div>stub</div>"),
  });
  return new EffectChainManager(ctx, "#effects-container", registry);
}

describe("validateProject", () => {
  it("accepts a well-formed project", () => {
    const doc = {
      format: PROJECT_FORMAT,
      formatVersion: 1,
      schema: PROJECT_SCHEMA,
      graph: { nodes: [], connections: [] },
    };
    expect(() => validateProject(doc)).not.toThrow();
  });

  it("rejects an unknown format", () => {
    expect(() =>
      validateProject({ format: "nope", formatVersion: 1, graph: { nodes: [], connections: [] } })
    ).toThrow(/Unknown project format/);
  });

  it("rejects a too-new formatVersion", () => {
    expect(() =>
      validateProject({
        format: PROJECT_FORMAT,
        formatVersion: 99,
        graph: { nodes: [], connections: [] },
      })
    ).toThrow(/only understands up to 1/);
  });

  it("rejects when nodes is not an array", () => {
    expect(() =>
      validateProject({
        format: PROJECT_FORMAT,
        formatVersion: 1,
        graph: { nodes: "not-an-array", connections: [] },
      })
    ).toThrow(/nodes must be an array/);
  });
});

describe("serializeProject", () => {
  it("produces a valid project document for an empty chain", () => {
    const m = makeManager(makeRegistry());
    const doc = serializeProject(m);
    expect(doc.format).toBe(PROJECT_FORMAT);
    expect(doc.graph.nodes).toEqual([]);
    expect(doc.graph.connections).toEqual([]);
    expect(() => validateProject(doc)).not.toThrow();
  });

  it("captures each effect's type as <id>@<version>", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    await m.addEffect("lowpass");
    await m.addEffect("delay");
    const doc = serializeProject(m);
    expect(doc.graph.nodes.map((n) => n.type)).toEqual([
      "distortion@1.0.0",
      "lowpass@1.0.0",
      "delay@1.0.0",
    ]);
  });

  it("captures per-effect params via getConfig()", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    const fx = m.effectChain[0].audioNode;
    fx.setStrength(7);
    fx.setType("hard");
    const doc = serializeProject(m);
    expect(doc.graph.nodes[0].params.strength).toBe(7);
    expect(doc.graph.nodes[0].params.type).toBe("hard");
  });

  it("emits one connection per adjacent pair in chain order", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    await m.addEffect("lowpass");
    await m.addEffect("delay");
    const doc = serializeProject(m);
    const ids = doc.graph.nodes.map((n) => n.id);
    expect(doc.graph.connections).toEqual([
      { from: ids[0], to: ids[1] },
      { from: ids[1], to: ids[2] },
    ]);
  });
});

describe("deserializeProject", () => {
  it("rebuilds a chain from a serialized project", async () => {
    const source = makeManager(makeRegistry());
    await source.addEffect("distortion");
    await source.addEffect("lowpass");
    await source.addEffect("delay");
    const doc = serializeProject(source);

    const target = makeManager(makeRegistry());
    const { skipped } = await deserializeProject(doc, target);
    expect(skipped).toEqual([]);
    expect(target.effectChain.map((e) => e.manifestId)).toEqual([
      "distortion",
      "lowpass",
      "delay",
    ]);
  });

  it("restores per-effect params (round-trip)", async () => {
    const source = makeManager(makeRegistry());
    await source.addEffect("distortion");
    const srcFx = source.effectChain[0].audioNode;
    srcFx.setStrength(3.5);
    srcFx.setType("tanh");
    srcFx.setMix(0.4);
    const doc = serializeProject(source);

    const target = makeManager(makeRegistry());
    await deserializeProject(doc, target);
    const tgtFx = target.effectChain[0].audioNode;
    expect(tgtFx.strength).toBe(3.5);
    expect(tgtFx.type).toBe("tanh");
    expect(tgtFx.mix).toBeCloseTo(0.4);
  });

  it("skips unknown effect types without throwing", async () => {
    const target = makeManager(makeRegistry());
    const doc = {
      format: PROJECT_FORMAT,
      formatVersion: 1,
      schema: PROJECT_SCHEMA,
      graph: {
        nodes: [
          { id: "fx-1", type: "nonexistent@1.0.0", params: {} },
          { id: "fx-2", type: "distortion@1.0.0", params: { strength: 1 } },
        ],
        connections: [{ from: "fx-1", to: "fx-2" }],
      },
    };
    const { skipped } = await deserializeProject(doc, target);
    expect(skipped).toEqual(["fx-1"]);
    expect(target.effectChain).toHaveLength(1);
    expect(target.effectChain[0].manifestId).toBe("distortion");
  });
});
