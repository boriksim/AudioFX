import {
  listPresets,
  getPreset,
  savePreset,
  deletePreset,
  renamePreset,
} from "../persistence/presets.js";
import { exportProject, importProjectFile } from "../persistence/importExport.js";
import { serializeProject, deserializeProject } from "../persistence/project.js";

/**
 * Preset + import/export UI controller.
 *
 * Owns the preset list, the "save / export / import" controls, and
 * the glue between the EffectChainManager and localStorage. The
 * runtime is responsible for:
 *   1. constructing one of these after the chain is built
 *   2. telling it to refresh() whenever the chain changes
 *      (so the saved state of the "current" patch stays honest)
 *
 * Why a separate module? The button DOM and event wiring are noise
 * that distract from the persistence logic — keeping the persistence
 * layer in `persistence/presets.js` and the DOM glue here lets each
 * piece be tested on its own.
 */
export class PresetManagerUI {
  /**
   * @param {object} ecm - the EffectChainManager (must have a registry
   *   and useSchemaUI: true so it can round-trip via serialize/deserialize).
   * @param {object} [dom] - DOM hooks; defaults to document-scoped lookups.
   * @param {HTMLElement} [dom.list]
   * @param {HTMLInputElement} [dom.nameInput]
   * @param {HTMLButtonElement} [dom.saveButton]
   * @param {HTMLButtonElement} [dom.exportButton]
   * @param {HTMLInputElement} [dom.importInput]
   */
  constructor(ecm, dom = {}) {
    this.ecm = ecm;
    this.list = dom.list ?? document.getElementById("presets-list");
    this.nameInput = dom.nameInput ?? document.getElementById("preset-name");
    this.saveButton = dom.saveButton ?? document.getElementById("save-preset");
    this.exportButton = dom.exportButton ?? document.getElementById("export-project");
    this.importInput = dom.importInput ?? document.getElementById("import-project");
    this._onStatus = () => {};
    this._onLoad = null;

    this._wire();
    this.refresh();
  }

  /** @param {(msg: string, kind: "info" | "error") => void} fn */
  onStatus(fn) {
    this._onStatus = fn;
  }

  /**
   * Subscribe to preset loads. The runtime can hook this to route
   * loads through its own re-attach + history path so the chain
   * rebuild doesn't strand the live mic stream.
   * @param {(project: object) => void} fn
   */
  onLoad(fn) {
    this._onLoad = fn;
  }

  _wire() {
    if (this.saveButton) {
      this.saveButton.addEventListener("click", () => this._handleSave());
    }
    if (this.exportButton) {
      this.exportButton.addEventListener("click", () => this._handleExport());
    }
    if (this.importInput) {
      this.importInput.addEventListener("change", (e) => this._handleImport(e));
    }
  }

  _handleSave() {
    const name = this.nameInput?.value?.trim();
    if (!name) {
      this._onStatus("Preset name is required", "error");
      return;
    }
    if (this.ecm.effectChain.length === 0) {
      this._onStatus("Add at least one effect before saving a preset", "error");
      return;
    }
    try {
      const project = serializeProject(this.ecm, { name });
      savePreset(name, project);
      if (this.nameInput) this.nameInput.value = "";
      this.refresh();
      this._onStatus(`Saved preset '${name}'`, "info");
    } catch (err) {
      this._onStatus(`Save failed: ${err.message}`, "error");
    }
  }

  _handleExport() {
    if (this.ecm.effectChain.length === 0) {
      this._onStatus("Nothing to export yet", "error");
      return;
    }
    try {
      const project = serializeProject(this.ecm, { name: this.nameInput?.value?.trim() || "project" });
      exportProject(project);
      this._onStatus("Project exported", "info");
    } catch (err) {
      this._onStatus(`Export failed: ${err.message}`, "error");
    }
  }

  async _handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const project = await importProjectFile(file);
      if (this._onLoad) {
        this._onLoad(project);
        this._onStatus(`Imported '${project.name}'`, "info");
      } else {
        this.ecm.clear();
        await deserializeProject(project, this.ecm);
        this._onStatus(`Imported '${project.name}'`, "info");
      }
    } catch (err) {
      this._onStatus(`Import failed: ${err.message}`, "error");
    } finally {
      // Reset the input so picking the same file twice still triggers 'change'.
      event.target.value = "";
    }
  }

  _handleLoad(name) {
    const project = getPreset(name);
    if (!project) return;
    if (this._onLoad) {
      // Let the runtime rebuild the chain (it can re-attach sources
      // and record the change in history). The status message is the
      // runtime's responsibility.
      try {
        this._onLoad(project);
      } catch (err) {
        this._onStatus(`Load failed: ${err.message}`, "error");
      }
      return;
    }
    this.ecm.clear();
    deserializeProject(project, this.ecm)
      .then(() => this._onStatus(`Loaded '${name}'`, "info"))
      .catch((err) => this._onStatus(`Load failed: ${err.message}`, "error"));
  }

  _handleDelete(name) {
    if (!confirm(`Delete preset '${name}'?`)) return;
    deletePreset(name);
    this.refresh();
  }

  _handleRename(oldName) {
    const newName = prompt(`Rename '${oldName}' to:`, oldName)?.trim();
    if (!newName || newName === oldName) return;
    if (!renamePreset(oldName, newName)) {
      this._onStatus(`Could not rename to '${newName}' (taken?)`, "error");
      return;
    }
    this.refresh();
  }

  /** Re-render the preset list from localStorage. */
  refresh() {
    if (!this.list) return;
    this.list.innerHTML = "";
    for (const preset of listPresets()) {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "preset-name";
      name.textContent = preset.name;

      const savedAt = document.createElement("span");
      savedAt.className = "preset-saved";
      savedAt.textContent = new Date(preset.savedAt).toLocaleString();

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", () => this._handleLoad(preset.name));

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", () => this._handleRename(preset.name));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => this._handleDelete(preset.name));

      li.append(name, savedAt, loadBtn, renameBtn, deleteBtn);
      this.list.appendChild(li);
    }
  }
}
