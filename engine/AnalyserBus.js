/**
 * AnalyserBus: shared visualization infrastructure.
 *
 * The bus owns one `AnalyserNode` per "tap key" (typically a node id
 * in the effect chain) and runs a single `requestAnimationFrame` loop
 * that drives any number of `Renderer` instances. Each renderer reads
 * from one of the analysers and paints to a canvas.
 *
 * Why one rAF loop and not one per renderer? Because a frame budget
 * is a single resource; coordinating the renderers inside one loop
 * keeps everything in lockstep with the browser's vsync and makes it
 * trivial to pause the whole visualization when the tab is hidden.
 *
 * Why one AnalyserNode per tap and not a global one? Because
 * `AnalyserNode` is a `Web Audio` node, and like any other node it
 * sees only what is upstream of it. Attaching it to a specific
 * effect's output gives per-effect visualizations without changing
 * the audio graph's flow.
 */
export class AnalyserBus {
  /**
   * @param {AudioContext} audioContext
   * @param {object} [options]
   * @param {(stats: {durationMs: number, frame: number}) => void} [options.onFrame]
   *   optional callback fired at the end of every rAF tick. The
   *   Profiler subscribes via this hook to record per-frame render
   *   times.
   */
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;
    /** @type {Map<string, AnalyserNode>} */
    this.taps = new Map();
    /** @type {Set<Renderer>} */
    this.renderers = new Set();
    this._running = false;
    this._rafId = 0;
    this._frameCounter = 0;
    this._onFrame = typeof options.onFrame === "function" ? options.onFrame : null;
    this._onVisibility = () => {
      if (document.hidden) this._stopLoop();
      else this._startLoop();
    };
    document.addEventListener("visibilitychange", this._onVisibility);
  }

  /**
   * Attach an AnalyserNode to a node's output. If a tap with the same
   * key already exists, it is returned (idempotent).
   *
   * @param {string} key - A unique identifier, e.g. the effect's chain id.
   * @param {AudioNode} sourceNode - the node whose output to tap.
   * @param {object} [options]
   * @param {number} [options.fftSize=2048]
   * @returns {AnalyserNode}
   */
  attach(key, sourceNode, options = {}) {
    if (this.taps.has(key)) return this.taps.get(key);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = options.fftSize ?? 2048;
    sourceNode.connect(analyser);
    this.taps.set(key, analyser);
    return analyser;
  }

  /**
   * Remove a tap and disconnect its AnalyserNode.
   * @param {string} key
   */
  detach(key) {
    const analyser = this.taps.get(key);
    if (!analyser) return;
    try {
      analyser.disconnect();
    } catch (_) {
      // Already disconnected; ignore.
    }
    this.taps.delete(key);
  }

  /**
   * Get a previously-attached analyser. Returns undefined if no tap
   * with that key exists.
   * @param {string} key
   * @returns {AnalyserNode | undefined}
   */
  get(key) {
    return this.taps.get(key);
  }

  /**
   * Add a renderer to the rAF loop.
   * @param {{render(): void}} renderer
   */
  addRenderer(renderer) {
    this.renderers.add(renderer);
    this._startLoop();
  }

  /**
   * Remove a renderer from the loop. The loop is stopped if no
   * renderers remain.
   * @param {{render(): void}} renderer
   */
  removeRenderer(renderer) {
    this.renderers.delete(renderer);
    if (this.renderers.size === 0) this._stopLoop();
  }

  _startLoop() {
    if (this._running) return;
    if (this.renderers.size === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      const start = (typeof performance !== "undefined" ? performance.now() : Date.now());
      for (const r of this.renderers) {
        try {
          r.render();
        } catch (err) {
          console.error("AnalyserBus renderer threw:", err);
        }
      }
      const end = (typeof performance !== "undefined" ? performance.now() : Date.now());
      this._frameCounter++;
      if (this._onFrame) {
        try {
          this._onFrame({ durationMs: end - start, frame: this._frameCounter });
        } catch (_) { /* isolate */ }
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  /**
   * Tear down the bus. Disconnects all taps and stops the loop.
   */
  destroy() {
    this._stopLoop();
    for (const key of [...this.taps.keys()]) this.detach(key);
    this.renderers.clear();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this._onVisibility);
    }
  }
}
