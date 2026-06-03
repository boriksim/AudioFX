import AbstractEffectNode from "./AbstractEffectNode.js";

/**
 * Plugin-system base class for effects.
 *
 * Layered on top of `AbstractEffectNode` (which owns the audio graph and
 * dry/wet + bypass routing) to add the metadata and serialization contract
 * that the `PluginRegistry` and any future persistence layer need.
 *
 * Subclasses MUST:
 *   - override the `static manifest` field with at least `{ id, version }`
 *   - override `getConfig()` to return a serializable snapshot of their
 *     effect-specific parameters
 *   - override `applyConfig(config)` to apply such a snapshot
 *
 * The class name is no longer the canonical identity. The manifest's `id`
 * is. That decouples file paths, class names, and the serialized form
 * from one another, and it lets two effects share a base class without
 * colliding.
 *
 * @typedef {object} EffectManifest
 * @property {string} id          Stable identifier used in serialization.
 * @property {string} name        Human-readable display name.
 * @property {string} version     Semver; required for any future migration.
 * @property {string} [category]  Grouping label (e.g. 'dynamics', 'time').
 * @property {string} [description]
 * @property {string} [author]
 * @property {string[]} [tags]
 * @property {number} [inputChannels]
 * @property {number} [outputChannels]
 */
export default class BaseEffect extends AbstractEffectNode {
  /** @type {EffectManifest} */
  static manifest = {
    id: "base",
    name: "Base Effect",
    version: "0.0.0",
    category: "misc",
  };

  /**
   * Return a serializable snapshot of the effect's state.
   * Subclasses override to add effect-specific fields. The base contract
   * guarantees `mix` and `bypass` are always present.
   * @returns {object}
   */
  getConfig() {
    return { mix: this.mix, bypass: this.bypass };
  }

  /**
   * Apply a previously-serialized config back onto the effect.
   * Unknown keys are ignored; missing keys fall back to current state.
   * @param {object} config
   */
  applyConfig(config = {}) {
    if (typeof config.mix === "number") this.setMix(config.mix);
    if (typeof config.bypass === "boolean") this.setBypassed(config.bypass);
  }
}
