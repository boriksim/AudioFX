import { describe, it, expect, beforeEach } from "vitest";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import {
  serializeProject,
  deserializeProject,
  validateProject,
  migrateProject,
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
    ).toThrow(/only understands up to 2/);
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

  it("does not emit chain-order connections (they're derived at load time)", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    await m.addEffect("lowpass");
    await m.addEffect("delay");
    const doc = serializeProject(m);
    // Only explicit (non-chain-order) connections are stored.
    expect(doc.graph.connections).toEqual([]);
  });

  it("emits explicit non-chain-order connections", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    await m.addEffect("lowpass");
    await m.addEffect("delay");
    // Add an explicit sidechain connection.
    m.connect(m.effectChain[0].id, m.effectChain[2].id, {
      fromPort: "out",
      toPort: "sidechain",
    });
    const doc = serializeProject(m);
    expect(doc.graph.connections).toEqual([
      { from: m.effectChain[0].id, to: m.effectChain[2].id, fromPort: "out", toPort: "sidechain" },
    ]);
  });

  it("v1 -> v2 migration: nodes get default positions, connections get default ports", () => {
    const v1 = {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "old",
      graph: {
        nodes: [
          { id: "n1", type: "distortion@1.0.0", params: {} },
          { id: "n2", type: "lowpass@1.0.0", params: {} },
        ],
        connections: [
          { from: "n1", to: "n2" },
        ],
      },
    };
    const migrated = migrateProject(v1);
    expect(migrated.formatVersion).toBe(2);
    expect(migrated.schema).toBe(2);
    expect(migrated.graph.nodes[0].position).toEqual({ x: 0, y: 0 });
    expect(migrated.graph.nodes[1].position).toEqual({ x: 0, y: 120 });
    expect(migrated.graph.connections[0]).toEqual({
      from: "n1", to: "n2", fromPort: "out", toPort: "in",
    });
  });

  it("deserializeProject auto-migrates a v1 project into a v2 manager", async () => {
    const v1 = {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "old",
      graph: {
        nodes: [
          { id: "n1", type: "distortion@1.0.0", params: { mix: 0.5 } },
          { id: "n2", type: "lowpass@1.0.0", params: { frequency: 800 } },
        ],
        connections: [{ from: "n1", to: "n2" }],
      },
    };
    const target = makeManager(makeRegistry());
    const { skipped } = await deserializeProject(v1, target);
    expect(skipped).toEqual([]);
    expect(target.effectChain).toHaveLength(2);
    // The position from the v1->v2 migration should be applied.
    expect(target.effectChain[0].position).toEqual({ x: 0, y: 0 });
    expect(target.effectChain[1].position).toEqual({ x: 0, y: 120 });
    // Params are restored.
    expect(target.effectChain[0].audioNode.getConfig().mix).toBe(0.5);
  });

  it("serializeProject persists chain-order breaks in the breaks array", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    await m.addEffect("lowpass");
    await m.addEffect("delay");
    const [d, l, dl] = m.effectChain;
    m.breakChain(d.id, l.id);
    m.breakChain(l.id, dl.id);
    const doc = serializeProject(m);
    expect(doc.breaks).toEqual([
      `${d.id}|${l.id}`,
      `${l.id}|${dl.id}`,
    ]);
  });

  it("deserializeProject restores chain-order breaks", async () => {
    const m = makeManager(makeRegistry());
    await m.addEffect("distortion");
    await m.addEffect("lowpass");
    const [d, l] = m.effectChain;
    m.breakChain(d.id, l.id);
    const doc = serializeProject(m);

    const target = makeManager(makeRegistry());
    await deserializeProject(doc, target);
    const [td, tl] = target.effectChain;
    // The break is restored. The break is identified by id pair
    // and the deserialized manager is a NEW manager (with new
    // ids), so the restored break references the new ids.
    expect(target.isChainBroken(td.id, tl.id)).toBe(true);
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
