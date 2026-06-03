/**
 * Project file import / export.
 *
 * A "project file" is just the on-disk form of the same JSON document
 * the preset manager stores in localStorage (a serialized graph). The
 * `.audiofx.json` extension is convention only; we use the magic
 * `format` field for actual type detection so the extension is
 * incidental.
 *
 * Export: builds a Blob, creates an object URL, and triggers a
 * synthetic `<a download>` click. The anchor is removed immediately
 * after to avoid leaking the URL.
 *
 * Import: reads a `File` via `file.text()`, parses JSON, and runs
 * the document through `validateProject` before returning. Throws
 * with a descriptive message on any failure.
 */

import { validateProject } from "./project.js";

/**
 * Trigger a browser download of the project as `name.audiofx.json`.
 * @param {object} project - a project document.
 * @param {string} [filename] - suggested filename, minus extension.
 *   Defaults to the project's `name` field.
 */
export function exportProject(project, filename) {
  validateProject(project);
  let safeName = (filename ?? project.name ?? "project")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .slice(0, 64);
  // If the sanitized name has no real characters (e.g. "🎸" -> "_",
  // or all spaces -> ""), fall back to a sensible default.
  if (!/[^\s_]/.test(safeName)) safeName = "project";
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.audiofx.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revocation a tick so the click handler can still read the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * @param {File} file
 * @returns {Promise<object>} the validated project document.
 */
export function importProjectFile(file) {
  if (!file || typeof file.text !== "function") {
    return Promise.reject(new Error("importProjectFile requires a File"));
  }
  return file.text().then((text) => {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      throw new Error(`Project file is not valid JSON: ${err.message}`);
    }
    validateProject(doc);
    return doc;
  });
}
