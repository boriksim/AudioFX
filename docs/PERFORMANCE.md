# Performance: latency budget, throughput, and the Profiler

This document describes the latency budget AudioFX targets, the
throughput limits of the runtime, and how to use the
`engine/Profiler.js` instrumentation to find regressions in the
field.

---

## Latency budget

The user-facing goal is **round-trip latency under 50 ms** on a
typical laptop with a built-in audio interface. This is the
threshold below which most listeners can't reliably distinguish
"monitored signal" from "their own voice" — above it, the dry/wet
delay becomes audible as slap-back or comb filtering when the user
sings and hears their processed signal back through headphones.

The total latency is the sum of three components:

| Component        | Source                                | Phase 1.5 setting | Typical value |
|------------------|---------------------------------------|-------------------|---------------|
| Base latency     | `AudioContext.baseLatency` (driver)   | n/a               | ~5 ms         |
| Output latency   | `AudioContext.outputLatency` (OS)     | n/a               | ~20 ms        |
| Per-node DSP     | Each effect's `getLatency()`          | hard-bypass path  | < 1 ms each   |

The Profiler reports the current `outputLatency` and the
AudioContext state. If `outputLatency` jumps above 50 ms, the
user will start to notice.

### Phase 1.5 changes that keep latency low

- `new AudioContext({ latencyHint: "interactive" })` — biases the
  browser toward the smallest render quantum (typically 128
  samples / ~2.9 ms at 44.1 kHz instead of the 256-1024 samples
  used by the default 'balanced' hint).
- `channelCount: 1` on the mic constraint — avoids internal
  upmixing the OS may otherwise apply before the stream reaches
  Web Audio.
- `echoCancellation`, `noiseSuppression`, and `autoGainControl` are
  all disabled on the mic constraint so the raw signal reaches
  the effect chain untouched.
- WaveShaper `oversample: "2x"` — keeps distortion pleasant at
  high gain without raising the per-frame DSP cost much.
- Hard-bypass: when an effect is bypassed, `effectOutput` is
  disconnected from `wetGain` (not just muted). This stops DSP
  processing on that node. The dry path is wired directly to
  the next effect's input.

---

## Throughput

The hot path on the audio thread is:

```
source -> effect1 -> effect2 -> ... -> effectN -> analyser -> destination
```

Each effect contributes:

- 1 to 2 `AudioNode.connect`/`disconnect` calls when bypassed.
- 0 to 4 connect/disconnect calls during the biquad filter sweep
  (filter changes are ramped via `linearRampToValueAtTime`, not
  re-wired).
- A small amount of JS for the per-effect visualization
  (`BiquadResponse.getFrequencyResponse()` is the most expensive
  routine; it runs once per rAF frame, not per audio frame).

At 44.1 kHz with a 128-sample quantum (~2.9 ms per audio block),
the audio thread has about 2.9 ms to process every block. Even
on a 5-year-old laptop, the chain is well under that budget with
a dozen effects. The CPU bottleneck, when it occurs, is usually
the visualization renderers running on the main thread.

### Per-frame render budget

The visualization runs on the main thread, driven by a single
`requestAnimationFrame` loop in `AnalyserBus`. The Profiler
records the time from "start of tick" to "all renderers done" as
the per-frame duration.

- 60 Hz target: 16.7 ms per frame.
- 120 Hz target: 8.3 ms per frame.

A duration above 16.7 ms at 60 Hz will cause a missed frame
(jank); above 33 ms the user sees a stutter. The Profiler reports
both `averageFrameTimeMs` and `peakFrameTimeMs` over the rolling
window so you can spot brief spikes that the average hides.

---

## The Profiler

`engine/Profiler.js` is a stateful observer. The runtime
constructs one in `setupVisualizer` and passes its
`recordFrame(durationMs)` to the AnalyserBus via the `onFrame`
option. The Profiler then accumulates:

- `frameCount` — number of frames in the rolling window.
- `averageFrameTimeMs` — mean of `durationMs` in the window.
- `peakFrameTimeMs` — worst frame in the window.
- `dropOutCount` — count of `PerformanceObserver` longtask entries
  with `duration > 50 ms`. Each one is main-thread work that
  almost certainly caused an audio glitch.
- `audioContextState` — current `AudioContext.state` ("running",
  "suspended", "closed").
- `outputLatencyMs` — current `outputLatency * 1000`.
- `stateTransitions` — total state changes seen since `start()`.

### Subscribing

```js
const profiler = new Profiler(audioContext);
profiler.start();
profiler.subscribe((stats) => {
  console.log(stats);
});
```

`stats` is the same object as `getStats()`. The callback is
invoked on every `recordFrame`, every longtask, and every
`statechange` event. Exceptions thrown from a callback are
isolated so a buggy subscriber can't break the Profiler.

### Reading the live stats

In the browser console (after pressing "Start Audio"):

```js
__profiler.getStats();
// {
//   frameCount: 540,
//   averageFrameTimeMs: 1.2,
//   peakFrameTimeMs: 3.4,
//   dropOutCount: 0,
//   audioContextState: "running",
//   outputLatencyMs: 20.0,
//   stateTransitions: 0
// }
```

### What to look for

- **`dropOutCount > 0`** — the main thread had a > 50 ms block.
  This is the only reliable signal of an audible glitch.
- **`peakFrameTimeMs > 33`** — at least one frame took more than
  two vsync intervals. The user will see a stutter; the audio
  *may* have glitched too, but `dropOutCount` is the definitive
  signal.
- **`audioContextState !== "running"`** — the browser paused
  audio. Common causes: tab hidden (expected), user gesture
  required on first play, audio device disconnected.
- **`outputLatencyMs` climbing** — usually means the OS audio
  device is in trouble (USB drop-out, Bluetooth reconnection).
  This is outside the app's control.

### Programmatic use

The Profiler is also useful in automated tests. Example: run a
synthetic chain for 100 frames, assert no drop-outs:

```js
const profiler = new Profiler(audioContext);
profiler.start();
// ... simulate 100 frames of work via `profiler.recordFrame(ms)` ...
const stats = profiler.getStats();
assert(stats.dropOutCount === 0);
profiler.stop();
```

---

## Field checklist

When investigating a "the audio is glitchy" report:

1. Open the browser console and run `__profiler.getStats()`.
2. Check `dropOutCount`. If > 0, look at the main thread for
   blocking work (heavy CSS, a runaway rAF, a memory leak, a
   long task from an extension).
3. Check `peakFrameTimeMs`. If > 33, find the heaviest
   visualization. The BiquadResponse renderer's
   `getFrequencyResponse()` is the usual suspect when there are
   many BiquadFilterNodes in the chain.
4. Check `audioContextState`. If "suspended", the user needs to
   click somewhere — browsers won't autoplay audio.
5. Check `outputLatencyMs`. If > 50, the OS audio device is in a
   bad state (USB glitch, Bluetooth buffer).
6. If the visualization is the bottleneck, switch the visualizer
   mode to "off" (the `viz-mode` select) to confirm.
