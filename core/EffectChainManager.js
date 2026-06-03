// EffectChainManager: manages a linear chain of audio effects.
// Supports adding, removing, moving, and rebuilding the audio chain.
// Each effect ships its own HTML template and JS module; the manager
// orchestrates loading, DOM mounting, and graph wiring.
//
// As of Phase 2a, the manager optionally accepts a PluginRegistry. When
// a registry is provided, `addEffect(id)` resolves the effect by its
// manifest id (the canonical identifier used in serialization), and the
// HTML template path is read from `manifest.assets.html`. Without a
// registry the manager falls back to the legacy "id is the class name
// and the file basename" behavior.
//
// As of Phase 2b, the manager can also render effect UI from the
// effect's own `getConfigSchema()` instead of an HTML template. Pass
// `useSchemaUI: true` to the constructor to switch the whole chain to
// schema-driven rendering. This coexists with the HTML path; effects
// without a schema simply render an empty body.

export class EffectChainManager {
  /**
   * @param {AudioContext} audioContext
   * @param {string} containerSelector - CSS selector for the DOM container
   *   that holds effect UI cards.
   * @param {object} [registry] - optional PluginRegistry. When provided,
   *   `addEffect(id)` resolves effects through the registry by manifest id.
   * @param {object} [options]
   * @param {boolean} [options.useSchemaUI=false] - render effect UI from
   *   `getConfigSchema()` instead of fetching an HTML template.
   * @param {(domElement: HTMLElement, effect: object) => void} [options.uiRenderer]
   *   - custom renderer when `useSchemaUI` is true. Defaults to
   *   `renderSchemaForm` from `ui/SchemaForm.js`.
   * @param {() => void} [options.onChange] - fired after any structural
   *   mutation (add/remove/move/clear) and after per-effect config
   *   changes routed through the schema UI. Useful for wiring up
   *   undo/redo.
   */
  constructor(audioContext, containerSelector = '#effects-container', registry = null, options = {}) {
    this.audioContext = audioContext;
    this.container = document.querySelector(containerSelector);
    this.effectChain = [];
    this.idCounter = 1;
    this.registry = registry;
    this.useSchemaUI = options.useSchemaUI === true;
    this.uiRenderer = options.uiRenderer ?? null;
    this.onChange = typeof options.onChange === "function" ? options.onChange : null;
  }

  /**
   * Add a new effect to the chain.
   * @param {string} effectId - When a registry is provided, this is the
   *   effect's manifest id (canonical, used in serialization). In legacy
   *   mode (no registry), this is also the class name and the HTML
   *   file basename.
   * @param {object} [options]
   * @param {number} [options.index] - Insertion position; defaults to
   *   end of chain.
   * @param {object} [options.params] - Initial config to apply to the
   *   effect after construction. Used by deserialization to restore
   *   a saved project's per-effect state.
   * @returns {Promise<{id, name, manifestId, dom, audioNode}>}
   */
  async addEffect(effectId, options = {}) {
    const { index = this.effectChain.length, params = null } = options;
    let EffectClass;
    let htmlPath;
    let displayName;
    let manifestId = null;

    if (this.registry) {
      const entry = this.registry.get(effectId);
      if (!entry) {
        const known = this.registry.list().map((m) => m.id).join(", ");
        throw new Error(`Effect '${effectId}' is not registered. Known: ${known || "(none)"}`);
      }
      EffectClass = entry.EffectClass;
      const { manifest } = entry;
      displayName = manifest.name ?? effectId;
      htmlPath = manifest.assets?.html;
      manifestId = manifest.id;
    } else {
      // Legacy: effectId is also the class name and the file basename.
      EffectClass = (await import(`../effects/${effectId}.js`))[effectId];
      htmlPath = `${effectId}.html`;
      displayName = effectId;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "effect-instance";
    const instanceId = `fx-${effectId.toLowerCase()}-${this.idCounter++}`;
    wrapper.dataset.effectId = instanceId;
    wrapper.dataset.manifestId = manifestId ?? "";
    wrapper.classList.add(`fx-${(manifestId ?? effectId).toLowerCase()}`);

    if (!this.useSchemaUI) {
      if (!htmlPath) {
        throw new Error(`Effect '${effectId}' manifest is missing assets.html`);
      }
      const response = await fetch(`effects/${htmlPath}`);
      const html = await response.text();
      wrapper.innerHTML = html;
    }

    if (index >= this.container.children.length) {
      this.container.appendChild(wrapper);
    } else {
      this.container.insertBefore(wrapper, this.container.children[index]);
    }

    const effectInstance = new EffectClass(this.audioContext, wrapper);

    if (this.useSchemaUI) {
      const renderer = this.uiRenderer ?? (await loadDefaultRenderer());
      const onAfterConfigChange = () => this.onChange?.();
      renderer(wrapper, effectInstance, { onAfterConfigChange });
    }

    if (params && typeof effectInstance.applyConfig === "function") {
      effectInstance.applyConfig(params);
    }

    const effectObj = {
      id: instanceId,
      name: displayName,
      manifestId,
      dom: wrapper,
      audioNode: effectInstance,
    };
    this.effectChain.splice(index, 0, effectObj);
    this.rebuildAudioChain();
    this.onChange?.();
    return effectObj;
  }

  /**
   * Remove an effect by id or object reference.
   * @param {string|object} effectObjOrId
   */
  removeEffect(effectObjOrId) {
    const idx = typeof effectObjOrId === 'string'
      ? this.effectChain.findIndex(e => e.id === effectObjOrId)
      : this.effectChain.indexOf(effectObjOrId);
    if (idx === -1) return;
    const effectObj = this.effectChain[idx];

    if (effectObj.audioNode && typeof effectObj.audioNode.destroy === 'function') {
      effectObj.audioNode.destroy();
    }
    if (effectObj.dom && effectObj.dom.parentNode) {
      effectObj.dom.parentNode.removeChild(effectObj.dom);
    }
    this.effectChain.splice(idx, 1);
    this.rebuildAudioChain();
    this.onChange?.();
  }

  /**
   * Move an existing effect to a new position in the chain.
   * @param {string|object} effectObjOrId
   * @param {number} newIndex
   */
  moveEffect(effectObjOrId, newIndex) {
    const idx = typeof effectObjOrId === 'string'
      ? this.effectChain.findIndex(e => e.id === effectObjOrId)
      : this.effectChain.indexOf(effectObjOrId);
    // Allow newIndex === chain.length (append at the end), but reject
    // any other out-of-range value to keep callers honest.
    if (idx === -1 || newIndex < 0 || newIndex > this.effectChain.length) return;
    const [effectObj] = this.effectChain.splice(idx, 1);
    this.effectChain.splice(newIndex, 0, effectObj);

    // Re-append DOM in chain order. appendChild on an already-attached node
    // moves it, so this is both correct and idempotent.
    for (const e of this.effectChain) {
      this.container.appendChild(e.dom);
    }
    this.rebuildAudioChain();
    this.onChange?.();
  }

  /**
   * Disconnect every effect and rewire them head-to-tail in chain order.
   * The last effect's output is connected to `audioContext.destination`.
   */
  rebuildAudioChain() {
    for (const effect of this.effectChain) {
      if (effect.audioNode && typeof effect.audioNode.disconnect === 'function') {
        effect.audioNode.disconnect();
      }
    }

    for (let i = 0; i < this.effectChain.length - 1; i++) {
      const currentEffect = this.effectChain[i];
      const nextEffect = this.effectChain[i + 1];

      if (currentEffect.audioNode && nextEffect.audioNode && typeof currentEffect.audioNode.connect === 'function') {
        currentEffect.audioNode.connect(nextEffect.audioNode);
      }
    }

    if (this.effectChain.length > 0) {
      const lastEffect = this.effectChain[this.effectChain.length - 1];
      if (lastEffect.audioNode && typeof lastEffect.audioNode.connect === 'function') {
        lastEffect.audioNode.connect(this.audioContext.destination);
      }
    }
  }

  /**
   * @param {string} id
   * @returns {object|undefined}
   */
  getEffectById(id) {
    return this.effectChain.find(e => e.id === id);
  }

  /**
   * @returns {object[]} a shallow copy of the effect chain
   */
  getEffects() {
    return this.effectChain.slice();
  }

  /**
   * Remove every effect from the chain.
   */
  clear() {
    while (this.effectChain.length > 0) {
      this.removeEffect(this.effectChain[0]);
    }
  }

  /**
   * Latency information for the running audio graph.
   *
   * - `baseLatency` is the latency introduced by the AudioContext itself
   *   (the render quantum * sample time). Hint the browser with
   *   `latencyHint: 'interactive'` to keep this small.
   * - `outputLatency` is the additional latency between the AudioContext
   *   and the audio output device. Set by the browser; not user-tunable.
   * - `total` is the sum, in seconds.
   *
   * @returns {{baseLatency: number, outputLatency: number, total: number}}
   */
  getLatency() {
    const baseLatency = this.audioContext?.baseLatency ?? 0;
    const outputLatency = this.audioContext?.outputLatency ?? 0;
    return { baseLatency, outputLatency, total: baseLatency + outputLatency };
  }
}

/**
 * Lazy-load the default schema UI renderer. The `ui/` layer is
 * optional — managers that don't enable `useSchemaUI` never trigger
 * this import, so the manager stays decoupled from the UI layer.
 */
let cachedDefaultRenderer = null;
async function loadDefaultRenderer() {
  if (cachedDefaultRenderer) return cachedDefaultRenderer;
  const mod = await import("../ui/SchemaForm.js");
  cachedDefaultRenderer = (domElement, effect, options) =>
    mod.renderSchemaForm(domElement, effect, options);
  return cachedDefaultRenderer;
}