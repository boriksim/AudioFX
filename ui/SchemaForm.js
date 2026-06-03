import { RangeWidget } from "./widgets/Range.js";
import { SelectWidget } from "./widgets/Select.js";
import { ToggleWidget } from "./widgets/Toggle.js";

/**
 * @typedef {object} WidgetSpec
 * @property {string} type  One of: 'range', 'select', 'toggle'.
 * @property {string} [name]  Parameter name (used as key in applyConfig).
 * @property {string} [label]  Display label.
 * @property {number} [min]  For range.
 * @property {number} [max]  For range.
 * @property {number} [step] For range.
 * @property {string[]} [options] For select.
 * @property {*} [default] Initial value.
 * @property {string} [unit] Display unit (e.g. 'Hz', 'ms').
 */

const WIDGETS = {
  range: RangeWidget,
  select: SelectWidget,
  toggle: ToggleWidget,
};

/**
 * Render a schema-driven form for a single effect.
 *
 * The form is appended to `domElement` (its existing children are NOT
 * cleared; the caller is responsible for that).
 *
 * The form binds to the effect through its `getConfig()` and
 * `applyConfig()` methods. After construction the form mirrors the
 * effect's current state and writes back through `applyConfig()` on
 * every user input.
 *
 * @param {HTMLElement} domElement
 * @param {object} effect - must have getConfig(), applyConfig(), and
 *   optionally getConfigSchema().
 * @param {object} [options]
 * @param {boolean} [options.includeBypass=true] - prepend a Bypass
 *   toggle bound to `effect.setBypassed()`.
 * @returns {{ destroy(): void, refresh(): void }}
 */
export function renderSchemaForm(domElement, effect, options = {}) {
  const { includeBypass = true } = options;
  const schema = effect.getConfigSchema?.() ?? {};
  const current = effect.getConfig?.() ?? {};
  const form = document.createElement("form");
  form.className = "schema-form";
  form.style.cssText = "display: flex; flex-direction: column; gap: 8px;";

  const changeListeners = new Map();

  function makeBinding(paramName) {
    return {
      getValue: () => current[paramName],
      setValue: (v) => {
        current[paramName] = v;
        const update = { [paramName]: v };
        if (includeBypass) {
          update.bypass = current.bypass;
          update.mix = current.mix;
        }
        effect.applyConfig(update);
        for (const fn of changeListeners.get(paramName) ?? []) fn(v);
      },
      onChange: (fn) => {
        if (!changeListeners.has(paramName)) changeListeners.set(paramName, []);
        changeListeners.get(paramName).push(fn);
      },
    };
  }

  if (includeBypass && typeof effect.setBypassed === "function") {
    const bypassBinding = {
      getValue: () => current.bypass,
      setValue: (v) => {
        current.bypass = v;
        effect.applyConfig({ bypass: v, mix: current.mix });
        for (const fn of changeListeners.get("bypass") ?? []) fn(v);
      },
      onChange: (fn) => {
        if (!changeListeners.has("bypass")) changeListeners.set("bypass", []);
        changeListeners.get("bypass").push(fn);
      },
    };
    const bypassSpec = { type: "toggle", name: "bypass", label: "Bypass" };
    const widget = WIDGETS.toggle(bypassSpec, bypassBinding);
    form.appendChild(widget);
  }

  for (const [paramName, spec] of Object.entries(schema)) {
    if (spec.type == null) continue;
    const factory = WIDGETS[spec.type];
    if (!factory) {
      console.warn(`SchemaForm: unknown widget type '${spec.type}' for param '${paramName}'`);
      continue;
    }
    const fullSpec = { ...spec, name: paramName };
    const widget = factory(fullSpec, makeBinding(paramName));
    form.appendChild(widget);
  }

  domElement.appendChild(form);

  return {
    destroy() {
      form.remove();
      changeListeners.clear();
    },
    refresh() {
      // Re-read the effect's config and push the new values to the widgets.
      const fresh = effect.getConfig?.() ?? {};
      for (const [k, v] of Object.entries(fresh)) {
        current[k] = v;
        for (const fn of changeListeners.get(k) ?? []) fn(v);
      }
    },
  };
}
