import { describe, it, expect, beforeEach, vi } from "vitest";
import { PresetManagerUI } from "../../ui/PresetManager.js";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { savePreset, listPresets } from "../../persistence/presets.js";

function setupDom() {
  document.body.innerHTML = `
    <div id="presets-list"></div>
    <input id="preset-name" type="text" />
    <button id="save-preset" type="button"></button>
    <button id="export-project" type="button"></button>
    <input id="import-project" type="file" />
  `;
  return {
    list: document.getElementById("presets-list"),
    nameInput: document.getElementById("preset-name"),
    saveButton: document.getElementById("save-preset"),
    exportButton: document.getElementById("export-project"),
    importInput: document.getElementById("import-project"),
  };
}

function makeManager() {
  document.body.innerHTML = '<div id="effects-container"></div>' + document.body.innerHTML;
  const ctx = new AudioContext();
  globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
  const registry = new PluginRegistry().register(DistortionEffect);
  return new EffectChainManager(ctx, "#effects-container", registry);
}

describe("PresetManagerUI", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders a list item for every stored preset", async () => {
    savePreset("A", {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "A",
      graph: { nodes: [], connections: [] },
    });
    savePreset("B", {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "B",
      graph: { nodes: [], connections: [] },
    });
    const ecm = makeManager();
    await ecm.addEffect("distortion");
    const dom = setupDom();
    new PresetManagerUI(ecm, dom);
    expect(dom.list.querySelectorAll("li").length).toBe(2);
    expect(dom.list.textContent).toContain("A");
    expect(dom.list.textContent).toContain("B");
  });

  it("save button serializes the current chain into a named preset", async () => {
    const ecm = makeManager();
    await ecm.addEffect("distortion");
    const dom = setupDom();
    dom.nameInput.value = "My Preset";
    const ui = new PresetManagerUI(ecm, dom);
    const status = vi.fn();
    ui.onStatus(status);
    dom.saveButton.click();
    expect(listPresets().map((p) => p.name)).toEqual(["My Preset"]);
    expect(status).toHaveBeenCalledWith("Saved preset 'My Preset'", "info");
  });

  it("save button reports an error if the name is empty", async () => {
    const ecm = makeManager();
    await ecm.addEffect("distortion");
    const dom = setupDom();
    const ui = new PresetManagerUI(ecm, dom);
    const status = vi.fn();
    ui.onStatus(status);
    dom.saveButton.click();
    expect(status).toHaveBeenCalledWith("Preset name is required", "error");
  });

  it("delete button removes the preset after confirmation", async () => {
    savePreset("Doomed", {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "Doomed",
      graph: { nodes: [], connections: [] },
    });
    const ecm = makeManager();
    const dom = setupDom();
    const ui = new PresetManagerUI(ecm, dom);
    globalThis.confirm = () => true;
    // Click the only delete button.
    const deleteBtn = dom.list.querySelectorAll("button")[2];
    expect(deleteBtn.textContent).toBe("Delete");
    deleteBtn.click();
    expect(listPresets()).toEqual([]);
  });

  it("rename button rewrites the preset name", async () => {
    savePreset("Old", {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "Old",
      graph: { nodes: [], connections: [] },
    });
    const ecm = makeManager();
    const dom = setupDom();
    const ui = new PresetManagerUI(ecm, dom);
    globalThis.prompt = () => "New";
    const renameBtn = [...dom.list.querySelectorAll("button")].find((b) => b.textContent === "Rename");
    renameBtn.click();
    expect(listPresets().map((p) => p.name)).toEqual(["New"]);
  });

  it("load button clears the chain and restores the preset", async () => {
    savePreset("A", {
      format: "audiofx.project",
      formatVersion: 1,
      schema: 1,
      name: "A",
      graph: { nodes: [], connections: [] },
    });
    const ecm = makeManager();
    await ecm.addEffect("distortion");
    const dom = setupDom();
    const ui = new PresetManagerUI(ecm, dom);
    const loadBtn = [...dom.list.querySelectorAll("button")].find((b) => b.textContent === "Load");
    loadBtn.click();
    return new Promise((resolve) => {
      setTimeout(() => {
        // The preset has no nodes, so after loading, the chain is empty.
        expect(ecm.effectChain.length).toBe(0);
        resolve();
      }, 20);
    });
  });
});
