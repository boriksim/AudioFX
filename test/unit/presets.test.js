import { describe, it, expect, beforeEach } from "vitest";
import {
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  renamePreset,
  PRESETS_KEY,
} from "../../persistence/presets.js";
import { serializeProject } from "../../persistence/project.js";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { LowpassEffect } from "../../effects/LowpassEffect.js";

function makeManagerWithChain() {
  document.body.innerHTML = '<div id="effects-container"></div>';
  const ctx = new AudioContext();
  globalThis.fetch = () =>
    Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
  const registry = new PluginRegistry()
    .register(DistortionEffect)
    .register(LowpassEffect);
  return new EffectChainManager(ctx, "#effects-container", registry);
}

function makeValidProject(name) {
  return {
    format: "audiofx.project",
    formatVersion: 1,
    schema: 1,
    name,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    graph: { nodes: [], connections: [] },
  };
}

describe("preset manager (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("listPresets() returns an empty array when nothing is stored", () => {
    expect(listPresets()).toEqual([]);
  });

  it("savePreset() persists a project and listPresets() returns it", () => {
    const project = makeValidProject("Vocal warmth");
    const saved = savePreset("Vocal warmth", project);
    expect(saved.name).toBe("Vocal warmth");
    expect(saved.project).toBe(project);
    expect(saved.savedAt).toBeTruthy();
    expect(listPresets().map((p) => p.name)).toEqual(["Vocal warmth"]);
  });

  it("getPreset() returns the stored project by name", () => {
    const project = makeValidProject("Lead");
    savePreset("Lead", project);
    // localStorage round-trips through JSON, so we compare values, not refs.
    expect(getPreset("Lead")).toEqual(project);
    expect(getPreset("nope")).toBeNull();
  });

  it("savePreset() overwrites a preset with the same name", () => {
    savePreset("X", makeValidProject("X v1"));
    savePreset("X", makeValidProject("X v2"));
    expect(listPresets().length).toBe(1);
    expect(getPreset("X").name).toBe("X v2");
  });

  it("savePreset() throws on empty name", () => {
    expect(() => savePreset("", makeValidProject("p"))).toThrow(/non-empty/);
    expect(() => savePreset("   ", makeValidProject("p"))).toThrow(/non-empty/);
  });

  it("savePreset() throws when the project is invalid", () => {
    expect(() => savePreset("X", { format: "wrong" })).toThrow();
  });

  it("deletePreset() removes the entry; returns false for unknown", () => {
    savePreset("A", makeValidProject("A"));
    expect(deletePreset("A")).toBe(true);
    expect(listPresets()).toEqual([]);
    expect(deletePreset("nope")).toBe(false);
  });

  it("renamePreset() renames; rejects duplicates and unknowns", () => {
    savePreset("A", makeValidProject("A"));
    savePreset("B", makeValidProject("B"));
    expect(renamePreset("A", "C")).toBe(true);
    expect(getPreset("C")).toBeTruthy();
    expect(getPreset("A")).toBeNull();
    expect(renamePreset("C", "B")).toBe(false);
    expect(renamePreset("nope", "Z")).toBe(false);
  });

  it("survives a corrupted localStorage entry", () => {
    localStorage.setItem(PRESETS_KEY, "{not valid json");
    expect(listPresets()).toEqual([]);
  });

  it("round-trip: serialize → save → load → deserialize restores the chain", async () => {
    const manager = makeManagerWithChain();
    await manager.addEffect("distortion");
    await manager.addEffect("lowpass");
    const project = serializeProject(manager, { name: "Demo" });
    savePreset("Demo", project);
    // Reload in a fresh manager.
    const manager2 = makeManagerWithChain();
    const { deserializeProject } = await import("../../persistence/project.js");
    await deserializeProject(getPreset("Demo"), manager2);
    expect(manager2.effectChain.length).toBe(2);
    expect(manager2.effectChain[0].manifestId).toBe("distortion");
    expect(manager2.effectChain[1].manifestId).toBe("lowpass");
  });
});
