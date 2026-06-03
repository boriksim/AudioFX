// EffectChainManager: a graph-based audio-graph manager.
//
// As of Phase 4a, the manager is no longer a strictly linear chain.
// It now supports arbitrary connections between any two nodes (any
// output port to any input port), with automatic multi-input summing
// via per-port GainNodes. The original chain-order API (addEffect,
// removeEffect, moveEffect, clear) is preserved as a convenience: it
// auto-maintains the head-to-tail connection list and the DOM order.
//
// Connections are explicit: `connect(from, to, opts)` and
// `disconnect(from, to, opts)`. The chain-order connections are
// always added on top of any explicit connections, so the simplest
// case ("just a linear chain") still works without ever calling
// `connect()` explicitly.
//
// As of Phase 2a, the manager optionally accepts a PluginRegistry.
// As of Phase 2b, it can render effect UI from `getConfigSchema()`.

export class EffectChainManager {
  /**
   * @param {AudioContext} audioContext
   * @param {string} containerSelector
   * @param {object} [registry]
   * @param {object} [options]
   * @param {boolean} [options.useSchemaUI=false]
   * @param {(domElement: HTMLElement, effect: object) => void} [options.uiRenderer]
   * @param {() => void} [options.onChange] - fired after any structural
   *   mutation (add/remove/move/clear/connect/disconnect).
   */
  constructor(audioContext, containerSelector = '#effects-container', registry = null, options = {}) {
    this.audioContext = audioContext;
    this.container = document.querySelector(containerSelector);
    this.effectChain = [];
    /** @type {{from: string, to: string, fromPort: string, toPort: string}[]} */
    this.connections = [];
    this.idCounter = 1;
    this.registry = registry;
    this.useSchemaUI = options.useSchemaUI === true;
    this.uiRenderer = options.uiRenderer ?? null;
    this.onChange = typeof options.onChange === "function" ? options.onChange : null;
    // Subscribers are notified after every successful
    // rebuildAudioGraph() (add/remove/move/clear/connect/disconnect).
    this.onChainRebuilt = null;
  }

  /**
   * Add a new effect to the chain.
   *
   * In linear-chain mode (the default, no explicit `connect()` calls
   * yet) the new effect is auto-connected to the previous effect's
   * output. The "linear" view stays consistent: `effectChain[i].output`
   * feeds `effectChain[i+1].input`. Explicit `connect()` calls layer
   * extra connections on top.
   *
   * @param {string} effectId
   * @param {object} [options]
   * @param {number} [options.index] - insertion position (default: end)
   * @param {object} [options.params] - initial config to apply
   * @param {{x: number, y: number}} [options.position] - for the
   *   PatchboardUI; ignored by the linear chain
   * @returns {Promise<{id, name, manifestId, dom, audioNode, position?}>}
   */
  async addEffect(effectId, options = {}) {
    const { index = this.effectChain.length, params = null, position = null } = options;
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
      position,
    };
    this.effectChain.splice(index, 0, effectObj);

    // Auto-maintain linear chain connections. The connections list is
    // managed by rebuildAudioGraph(), which uses BOTH the chain order
    // AND any explicit `connections` to compute the effective graph.
    // For addEffect, we just need to clean up any explicit connections
    // that referenced an old chain position (none, since we just
    // inserted) and let the rebuild compute the new chain order.

    this.rebuildAudioGraph();
    this.onChange?.();
    return effectObj;
  }

  /**
   * Remove an effect by id or object reference. Cleans up any
   * explicit connections that referenced it.
   * @param {string|object} effectObjOrId
   */
  removeEffect(effectObjOrId) {
    const idx = typeof effectObjOrId === 'string'
      ? this.effectChain.findIndex(e => e.id === effectObjOrId)
      : this.effectChain.indexOf(effectObjOrId);
    if (idx === -1) return;
    const effectObj = this.effectChain[idx];
    const id = effectObj.id;

    if (effectObj.audioNode && typeof effectObj.audioNode.destroy === 'function') {
      effectObj.audioNode.destroy();
    }
    if (effectObj.dom && effectObj.dom.parentNode) {
      effectObj.dom.parentNode.removeChild(effectObj.dom);
    }
    this.effectChain.splice(idx, 1);
    // Drop connections that referenced the removed node.
    this.connections = this.connections.filter(
      (c) => c.from !== id && c.to !== id
    );
    this.rebuildAudioGraph();
    this.onChange?.();
  }

  /**
   * Move an existing effect to a new position. The connections are
   * recomputed by rebuildAudioGraph() based on the new chain order,
   * plus any explicit `connections` the user added.
   * @param {string|object} effectObjOrId
   * @param {number} newIndex
   */
  moveEffect(effectObjOrId, newIndex) {
    const idx = typeof effectObjOrId === 'string'
      ? this.effectChain.findIndex(e => e.id === effectObjOrId)
      : this.effectChain.indexOf(effectObjOrId);
    if (idx === -1 || newIndex < 0 || newIndex > this.effectChain.length) return;
    const [effectObj] = this.effectChain.splice(idx, 1);
    this.effectChain.splice(newIndex, 0, effectObj);

    for (const e of this.effectChain) {
      this.container.appendChild(e.dom);
    }
    this.rebuildAudioGraph();
    this.onChange?.();
  }

  /**
   * Add an explicit connection between two nodes' ports. Layers on
   * top of the chain-order connections. Validates that both nodes
   * exist; multi-port validation is left to the future per-port
   * effect classes (currently all nodes have a single in/out port).
   *
   * Returns false (no-op) if the connection is already covered by
   * the chain order or already in the explicit list.
   *
   * @param {string} fromId
   * @param {string} toId
   * @param {object} [opts]
   * @param {string} [opts.fromPort="out"]
   * @param {string} [opts.toPort="in"]
   * @returns {boolean} true if a new connection was added.
   */
  connect(fromId, toId, opts = {}) {
    const { fromPort = "out", toPort = "in" } = opts;
    if (fromId === toId) {
      throw new Error("Cannot connect a node to itself");
    }
    if (!this.effectChain.some((e) => e.id === fromId)) {
      throw new Error(`connect: unknown source node '${fromId}'`);
    }
    if (!this.effectChain.some((e) => e.id === toId)) {
      throw new Error(`connect: unknown destination node '${toId}'`);
    }
    // Already covered by chain order? No need to add an explicit entry.
    if (this._isChainConnection(fromId, toId, fromPort, toPort)) {
      return false;
    }
    if (
      this.connections.some(
        (c) =>
          c.from === fromId &&
          c.to === toId &&
          c.fromPort === fromPort &&
          c.toPort === toPort
      )
    ) {
      return false;
    }
    this.connections.push({ from: fromId, to: toId, fromPort, toPort });
    this.rebuildAudioGraph();
    this.onChange?.();
    return true;
  }

  /**
   * True if `(fromId, fromPort) -> (toId, toPort)` is the default
   * chain-order connection for the given pair of adjacent chain
   * members. Multi-port nodes use their first declared port for
   * chain-order, so the comparison uses the same logic as
   * `_chainOrderConnection`.
   */
  _isChainConnection(fromId, toId, fromPort, toPort) {
    for (let i = 0; i < this.effectChain.length - 1; i++) {
      const c = this._chainOrderConnection(i);
      if (c && c.from === fromId && c.to === toId && c.fromPort === fromPort && c.toPort === toPort) {
        return true;
      }
    }
    return false;
  }

  /**
   * Remove an explicit connection. Chain-order connections are
   * recomputed by rebuildAudioGraph and cannot be removed this way.
   * @returns {boolean} true if a connection was removed.
   */
  disconnect(fromId, toId, opts = {}) {
    const { fromPort = "out", toPort = "in" } = opts;
    const before = this.connections.length;
    this.connections = this.connections.filter(
      (c) =>
        !(
          c.from === fromId &&
          c.to === toId &&
          c.fromPort === fromPort &&
          c.toPort === toPort
        )
    );
    if (this.connections.length === before) return false;
    this.rebuildAudioGraph();
    this.onChange?.();
    return true;
  }

  /**
   * @returns {Array<{from: string, to: string, fromPort: string, toPort: string}>}
   *   a shallow copy of the explicit connections list.
   */
  getConnections() {
    return this.connections.slice();
  }

  /**
   * Return the chain-order connection at position `i` (i.e. from
   * chain[i] to chain[i+1]). The output port id is the first
   * declared output port of the source, falling back to "out" if
   * the effect doesn't expose `getOutputPorts()`. The input port id
   * is the first declared input port of the destination, with the
   * same fallback. This makes chain-order work uniformly for
   * multi-port effects (e.g. a ChannelSplitter with L/R outputs
   * routes its L port to the next effect's first input port).
   *
   * @returns {{from: string, fromPort: string, to: string, toPort: string}|null}
   */
  _chainOrderConnection(i) {
    if (i < 0 || i >= this.effectChain.length - 1) return null;
    const a = this.effectChain[i];
    const b = this.effectChain[i + 1];
    const fromPort = a.audioNode?.getOutputPorts?.()?.[0]?.id ?? "out";
    const toPort = b.audioNode?.getInputPorts?.()?.[0]?.id ?? "in";
    return { from: a.id, fromPort, to: b.id, toPort };
  }

  /**
   * Disconnect every effect, then rewire the graph from the
   * connection list. Effective connections = chain-order connections
   * (chain[i] -> chain[i+1] for all i) plus any explicit `connections`.
   * For each input port with multiple incoming connections, a
   * GainNode is inserted as a summer. Sinks (nodes with no outgoing
   * connection) are connected to `audioContext.destination`.
   *
   * Fires `onChainRebuilt` at the end so the visualizer can
   * re-attach its analyser tap.
   */
  rebuildAudioGraph() {
    // Disconnect all nodes first. Each node's disconnect() is a
    // best-effort: some browsers throw if the node was never
    // connected, so we swallow the error.
    for (const effect of this.effectChain) {
      if (effect.audioNode && typeof effect.audioNode.disconnect === "function") {
        try { effect.audioNode.disconnect(); } catch (_) { }
      }
    }

    // Build the effective connection set, dedup by (from, fromPort, to, toPort).
    const effective = new Map(); // key -> {fromId, fromPort, toId, toPort}
    const keyOf = (c) => `${c.from}|${c.fromPort}|${c.to}|${c.toPort}`;
    for (let i = 0; i < this.effectChain.length - 1; i++) {
      const c = this._chainOrderConnection(i);
      if (c) effective.set(keyOf(c), c);
    }
    for (const c of this.connections) {
      effective.set(keyOf(c), c);
    }

    // Group by destination input: "nodeId|port" -> sources[].
    const inputs = new Map();
    for (const c of effective.values()) {
      const inputKey = `${c.to}|${c.toPort}`;
      if (!inputs.has(inputKey)) inputs.set(inputKey, []);
      inputs.get(inputKey).push(c);
    }

    const nodeById = new Map();
    for (const e of this.effectChain) nodeById.set(e.id, e);

    // Track which nodes have at least one outgoing connection, so
    // we know which ones are "sinks" (-> destination).
    const hasOutgoing = new Set();
    for (const c of effective.values()) hasOutgoing.add(c.from);

    // Wire each input port. For ports with a single source, direct
    // connect. For ports with multiple sources, build a summer
    // GainNode and route all sources through it.
    for (const [inputKey, sources] of inputs) {
      const [toId, toPort] = inputKey.split("|");
      const target = nodeById.get(toId);
      if (!target) continue;
      const targetInput = target.audioNode.getInputNode?.(toPort) ?? target.audioNode.input;
      if (!targetInput) continue;

      if (sources.length === 1) {
        const src = nodeById.get(sources[0].from);
        if (!src) continue;
        const srcOutput = src.audioNode.getOutputNode?.(sources[0].fromPort) ?? src.audioNode.output;
        if (srcOutput) srcOutput.connect(targetInput);
      } else {
        const summer = this.audioContext.createGain();
        for (const s of sources) {
          const src = nodeById.get(s.from);
          if (!src) continue;
          const srcOutput = src.audioNode.getOutputNode?.(s.fromPort) ?? src.audioNode.output;
          if (srcOutput) srcOutput.connect(summer);
        }
        summer.connect(targetInput);
      }
    }

    // Sinks: nodes with no outgoing connection are connected straight
    // to the destination. (A source with no input connections still
    // counts as a sink if it has no outgoing connection.)
    for (const e of this.effectChain) {
      if (!hasOutgoing.has(e.id)) {
        const out = e.audioNode.getOutputNode?.("out") ?? e.audioNode.output;
        if (out) {
          try { out.connect(this.audioContext.destination); } catch (_) { }
        }
      }
    }

    if (typeof this.onChainRebuilt === "function") {
      this.onChainRebuilt();
    }
  }

  /**
   * @deprecated Use `rebuildAudioGraph` (alias kept for tests).
   */
  rebuildAudioChain() {
    return this.rebuildAudioGraph();
  }

  /**
   * @param {string} id
   * @returns {object|undefined}
   */
  getEffectById(id) {
    return this.effectChain.find((e) => e.id === id);
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
   * @returns {{baseLatency: number, outputLatency: number, total: number}}
   */
  getLatency() {
    const baseLatency = this.audioContext?.baseLatency ?? 0;
    const outputLatency = this.audioContext?.outputLatency ?? 0;
    return { baseLatency, outputLatency, total: baseLatency + outputLatency };
  }
}

/**
 * Lazy-load the default schema UI renderer.
 */
let cachedDefaultRenderer = null;
async function loadDefaultRenderer() {
  if (cachedDefaultRenderer) return cachedDefaultRenderer;
  const mod = await import("../ui/SchemaForm.js");
  cachedDefaultRenderer = (domElement, effect, options) =>
    mod.renderSchemaForm(domElement, effect, options);
  return cachedDefaultRenderer;
}