/**
 * Preset manager: named save / load / delete of projects in localStorage.
 *
 * A preset is a (name, savedAt, project) triple. The project body is
 * produced by `serializeProject` and consumed by `deserializeProject`
 * — so a preset is exactly the same thing as a project file, only
 * stored locally instead of downloaded to disk.
 *
 * Storage shape (one localStorage key, JSON-encoded):
 *
 *   {
 *     "version": 1,
 *     "presets": [
 *       { "name": "Vocal warmth", "savedAt": "...", "project": { ... } }
 *     ]
 *   }
 *
 * Why not IndexedDB? Phase 3 keeps it simple. localStorage is sync
 * (no async dance at the save/load UI), ships with every browser,
 * and is more than enough for hundreds of small JSON patches. Phase 4
 * can move to IndexedDB if a use case ever needs more.
 */

import { validateProject } from "./project.js";

export const PRESETS_KEY = "audiofx.presets";
export const PRESETS_SCHEMA = 1;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readStore() {
  const raw = localStorage.getItem(PRESETS_KEY);
  if (!raw) return { version: PRESETS_SCHEMA, presets: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return { version: PRESETS_SCHEMA, presets: [] };
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.presets)) {
    return { version: PRESETS_SCHEMA, presets: [] };
  }
  return parsed;
}

function writeStore(store) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(store));
}

/**
 * @returns {{name: string, savedAt: string, project: object}[]}
 */
export function listPresets() {
  return readStore().presets.slice();
}

/**
 * @param {string} name
 * @returns {object|null} the project document, or null if not found.
 */
export function getPreset(name) {
  const entry = readStore().presets.find((p) => p.name === name);
  return entry ? entry.project : null;
}

/**
 * Save (or overwrite) a preset. The project is validated first; an
 * invalid project throws so we never persist garbage.
 * @param {string} name
 * @param {object} project
 * @returns {{name: string, savedAt: string, project: object}}
 */
export function savePreset(name, project) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Preset name must be a non-empty string");
  }
  validateProject(project);
  const store = readStore();
  const now = new Date().toISOString();
  const idx = store.presets.findIndex((p) => p.name === name);
  const entry = { name, savedAt: now, project };
  if (idx === -1) store.presets.push(entry);
  else store.presets[idx] = entry;
  writeStore(store);
  return entry;
}

/**
 * @param {string} name
 * @returns {boolean} true if a preset with that name existed and was removed.
 */
export function deletePreset(name) {
  const store = readStore();
  const idx = store.presets.findIndex((p) => p.name === name);
  if (idx === -1) return false;
  store.presets.splice(idx, 1);
  writeStore(store);
  return true;
}

/**
 * @param {string} oldName
 * @param {string} newName
 * @returns {boolean} true on success; false if the old name doesn't exist
 *   or the new name is already taken.
 */
export function renamePreset(oldName, newName) {
  if (typeof newName !== "string" || !newName.trim()) {
    throw new Error("New preset name must be a non-empty string");
  }
  const store = readStore();
  const fromIdx = store.presets.findIndex((p) => p.name === oldName);
  if (fromIdx === -1) return false;
  if (store.presets.some((p) => p.name === newName)) return false;
  store.presets[fromIdx] = { ...store.presets[fromIdx], name: newName };
  writeStore(store);
  return true;
}
