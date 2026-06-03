/**
 * Profiler: rolling-window stats for the audio graph and the
 * render loop. Tracks per-frame render time, audio context state
 * transitions, output latency, and main-thread "long tasks" that
 * could starve the audio thread.
 *
 * Design:
 *  - The runtime injects frame timings via `recordFrame(durationMs)`
 *    (e.g. by wrapping the AnalyserBus rAF callback). The Profiler
 *    keeps a sliding window of the last `windowMs` milliseconds of
 *    frame timings and computes average + peak.
 *  - Long tasks are observed via `PerformanceObserver({entryTypes:
 *    ["longtask"]})` when supported. Each entry with duration
 *    > 50 ms is counted as a "drop-out" — main-thread work that
 *    almost certainly caused an audio glitch.
 *  - Audio context state changes are observed via the
 *    `statechange` event. Each transition is timestamped.
 *  - `outputLatencyMs` is read live from the AudioContext; it
 *    reflects the current end-to-end output latency (Phase 1.5
 *    budget: keep this < 50 ms).
 *
 * Why a class and not a free function? Because the Profiler is
 * stateful: it accumulates timings, subscribes to events, and
 * notifies subscribers. A class with `start`/`stop`/`recordFrame`/
 * `getStats`/`subscribe` is the natural shape.
 */
export class Profiler {
  /**
   * @param {AudioContext} audioContext
   * @param {object} [options]
   * @param {number} [options.windowMs=5000] - rolling window for
   *   frame timings in milliseconds.
   * @param {number} [options.longTaskThresholdMs=50] - durations
   *   above this count as drop-outs.
   */
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;
    this.windowMs = options.windowMs ?? 5000;
    this.longTaskThresholdMs = options.longTaskThresholdMs ?? 50;
    /** @type {{ts: number, durationMs: number}[]} */
    this._frameTimings = [];
    /** @type {{ts: number, from: string, to: string}[]} */
    this._stateTransitions = [];
    this._dropOuts = 0;
    /** @type {Set<(stats: object) => void>} */
    this._listeners = new Set();
    this._perfObserver = null;
    this._stateChangeHandler = null;
    this._running = false;
  }

  /**
   * Begin observing audio context state changes and long tasks.
   * Safe to call multiple times; only the first call has an effect.
   */
  start() {
    if (this._running) return;
    this._running = true;
    if (typeof PerformanceObserver !== "undefined") {
      try {
        this._perfObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > this.longTaskThresholdMs) {
              this._dropOuts++;
              this._notify();
            }
          }
        });
        this._perfObserver.observe({ entryTypes: ["longtask"] });
      } catch (_) {
        // longtask not supported in this environment; ignore.
        this._perfObserver = null;
      }
    }
    if (this.audioContext && typeof this.audioContext.addEventListener === "function") {
      this._stateChangeHandler = () => {
        const transition = {
          ts: this._now(),
          from: this._lastState ?? "unknown",
          to: this.audioContext.state,
        };
        this._lastState = this.audioContext.state;
        this._stateTransitions.push(transition);
        this._notify();
      };
      this._lastState = this.audioContext.state;
      this.audioContext.addEventListener("statechange", this._stateChangeHandler);
    }
  }

  /**
   * Stop observing. Detaches the longtask observer and the
   * statechange listener. Existing stats are preserved.
   */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._perfObserver) {
      try { this._perfObserver.disconnect(); } catch (_) { /* ignore */ }
      this._perfObserver = null;
    }
    if (this._stateChangeHandler && this.audioContext) {
      try { this.audioContext.removeEventListener("statechange", this._stateChangeHandler); } catch (_) { /* ignore */ }
      this._stateChangeHandler = null;
    }
  }

  /**
   * Record a single frame's render duration. Call from the rAF loop
   * (e.g. by wrapping the AnalyserBus tick callback).
   * @param {number} durationMs
   */
  recordFrame(durationMs) {
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) return;
    const now = this._now();
    this._frameTimings.push({ ts: now, durationMs });
    const cutoff = now - this.windowMs;
    while (this._frameTimings.length > 0 && this._frameTimings[0].ts < cutoff) {
      this._frameTimings.shift();
    }
    this._notify();
  }

  /**
   * Aggregate statistics. The window is the last `windowMs` of
   * recorded frames.
   * @returns {{
   *   frameCount: number,
   *   averageFrameTimeMs: number,
   *   peakFrameTimeMs: number,
   *   dropOutCount: number,
   *   audioContextState: string,
   *   outputLatencyMs: number,
   *   stateTransitions: number,
   * }}
   */
  getStats() {
    let total = 0;
    let peak = 0;
    for (const t of this._frameTimings) {
      total += t.durationMs;
      if (t.durationMs > peak) peak = t.durationMs;
    }
    const avg = this._frameTimings.length > 0 ? total / this._frameTimings.length : 0;
    return {
      frameCount: this._frameTimings.length,
      averageFrameTimeMs: avg,
      peakFrameTimeMs: peak,
      dropOutCount: this._dropOuts,
      audioContextState: this.audioContext?.state ?? "unknown",
      outputLatencyMs: (this.audioContext?.outputLatency ?? 0) * 1000,
      stateTransitions: this._stateTransitions.length,
    };
  }

  /**
   * Subscribe to stats changes. The callback is invoked on every
   * `recordFrame`, `statechange`, and longtask. Returns an
   * unsubscribe function.
   * @param {(stats: object) => void} fn
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    const stats = this.getStats();
    for (const fn of this._listeners) {
      try { fn(stats); } catch (_) { /* isolate */ }
    }
  }

  _now() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
}
