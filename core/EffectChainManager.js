// EffectChainManager: manages a linear chain of audio effects.
// Supports adding, removing, moving, and rebuilding the audio chain.
// Each effect ships its own HTML template and JS module; the manager
// orchestrates loading, DOM mounting, and graph wiring.

export class EffectChainManager {
  /**
   * @param {AudioContext} audioContext
   * @param {string} containerSelector - CSS selector for the DOM container
   *   that holds effect UI cards.
   */
  constructor(audioContext, containerSelector = '#effects-container') {
    this.audioContext = audioContext;
    this.container = document.querySelector(containerSelector);
    this.effectChain = [];
    this.idCounter = 1;
  }

  /**
   * Add a new effect to the chain.
   * @param {string} effectName - Effect class name; must match
   *   `effects/${effectName}.html` and `effects/${effectName}.js`.
   * @param {number} [index] - Insertion position; defaults to end of chain.
   * @returns {Promise<{id, name, dom, audioNode}>}
   */
  async addEffect(effectName, index = this.effectChain.length) {
    const response = await fetch(`effects/${effectName}.html`);
    const html = await response.text();

    const wrapper = document.createElement('div');
    wrapper.className = 'effect-instance';
    const effectId = `fx-${effectName.toLowerCase()}-${this.idCounter++}`;
    wrapper.dataset.effectId = effectId;
    wrapper.innerHTML = html;

    if (index >= this.container.children.length) {
      this.container.appendChild(wrapper);
    } else {
      this.container.insertBefore(wrapper, this.container.children[index]);
    }

    const module = await import(`../effects/${effectName}.js`);
    const EffectClass = module[effectName];

    const effectInstance = new EffectClass(this.audioContext, wrapper);

    const effectObj = {
      id: effectId,
      name: effectName,
      dom: wrapper,
      audioNode: effectInstance,
    };
    this.effectChain.splice(index, 0, effectObj);
    this.rebuildAudioChain();
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
    if (idx === -1 || newIndex < 0 || newIndex >= this.effectChain.length) return;
    const [effectObj] = this.effectChain.splice(idx, 1);
    this.effectChain.splice(newIndex, 0, effectObj);

    // Re-append DOM in chain order. appendChild on an already-attached node
    // moves it, so this is both correct and idempotent.
    for (const e of this.effectChain) {
      this.container.appendChild(e.dom);
    }
    this.rebuildAudioChain();
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
}