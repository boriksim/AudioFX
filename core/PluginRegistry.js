/**
 * PluginRegistry: the runtime catalog of available effects.
 *
 * The registry holds a mapping from effect `id` (declared in each class's
 * static `manifest`) to the class itself. Consumers can:
 *
 *   - `register(EffectClass)` — add a class whose static `manifest` is
 *     already populated.
 *   - `get(id)` — look up a registered effect by id.
 *   - `list()` — enumerate available effects (manifests only).
 *   - `loadFromModule(id, moduleUrl)` — dynamic-import a module, find the
 *     exported class whose `manifest.id` matches, and register it.
 *   - `instantiate(id, audioContext, domElement)` — convenience that
 *     resolves and constructs in one call.
 *
 * The registry is intentionally agnostic about base classes: anything
 * with a valid `manifest` static qualifies. That lets sources (which
 * extend `AbstractAudioNode` directly) live alongside effects (which
 * extend `BaseEffect`) without a parallel type hierarchy.
 *
 * Dynamic imports are memoized per module URL so the same module is
 * fetched at most once even when looked up by multiple ids.
 */
export class PluginRegistry {
  constructor() {
    /** @type {Map<string, {manifest: object, EffectClass: Function}>} */
    this._byId = new Map();
    /** @type {Map<string, Promise<any>>} */
    this._loadCache = new Map();
  }

  /**
   * @param {Function} EffectClass — a class with a static `manifest` field.
   * @returns {PluginRegistry} this, for chaining.
   */
  register(EffectClass) {
    if (typeof EffectClass !== "function") {
      throw new TypeError("PluginRegistry.register() expects a class (constructor function)");
    }
    const manifest = EffectClass.manifest;
    if (!manifest || typeof manifest !== "object") {
      throw new Error(`${EffectClass.name ?? "<anonymous>"} has no static manifest`);
    }
    if (!manifest.id || typeof manifest.id !== "string") {
      throw new Error(`${EffectClass.name ?? "<anonymous>"} manifest.id is required`);
    }
    if (!manifest.version || typeof manifest.version !== "string") {
      throw new Error(`${EffectClass.name ?? "<anonymous>"} manifest.version is required`);
    }
    this._byId.set(manifest.id, { manifest, EffectClass });
    return this;
  }

  /** @returns {boolean} */
  has(id) {
    return this._byId.has(id);
  }

  /**
   * @param {string} id
   * @returns {{manifest: object, EffectClass: Function} | undefined}
   */
  get(id) {
    return this._byId.get(id);
  }

  /** @returns {object[]} array of registered manifests */
  list() {
    return [...this._byId.values()].map(({ manifest }) => manifest);
  }

  /**
   * Dynamic-import a module and register the class with the matching
   * `manifest.id`. Subsequent calls with the same `moduleUrl` reuse the
   * cached module promise.
   *
   * @param {string} id
   * @param {string} moduleUrl
   * @returns {Promise<{manifest: object, EffectClass: Function}>}
   */
  async loadFromModule(id, moduleUrl) {
    if (this._byId.has(id)) {
      return this._byId.get(id);
    }
    if (!this._loadCache.has(moduleUrl)) {
      this._loadCache.set(moduleUrl, import(moduleUrl));
    }
    const mod = await this._loadCache.get(moduleUrl);

    const EffectClass = Object.values(mod).find(
      (exp) => typeof exp === "function" && exp.manifest?.id === id
    );
    if (!EffectClass) {
      throw new Error(
        `No class with manifest.id === '${id}' found in ${moduleUrl}. ` +
          `Available exports: ${Object.keys(mod).join(", ")}`
      );
    }
    return this.register(EffectClass).get(id);
  }

  /**
   * Construct a fresh instance of a registered effect.
   * @param {string} id
   * @param {AudioContext} audioContext
   * @param {HTMLElement} [domElement]
   * @returns {object}
   */
  instantiate(id, audioContext, domElement) {
    const entry = this._byId.get(id);
    if (!entry) {
      throw new Error(`Unknown effect: '${id}'. Known ids: ${[...this._byId.keys()].join(", ")}`);
    }
    return new entry.EffectClass(audioContext, domElement);
  }
}

/**
 * The default registry, pre-populated with the built-in effects. This is
 * the registry the runtime uses unless the host wires up its own.
 */
export function createDefaultRegistry() {
  const r = new PluginRegistry();
  // The built-ins are registered explicitly by the bootstrap (script.js)
  // so we do not import them here — that would create a circular
  // dependency between core/ and effects/. The bootstrap is the right
  // place to enumerate and register.
  return r;
}
