# Latency — design notes and budget

The chain runs in real time from microphone to speakers. Every Web Audio graph has a floor of "one render quantum" of latency (the time it takes to fill the output buffer the browser hands to the audio device). On top of that floor, the effect chain adds work that, if it overruns the quantum, causes glitches.

This document explains the latency budget, what we've tuned, and what to do if you still hear lag.

---

## Where the latency comes from

| Source | Typical | Tunable? | What we do |
|---|---|---|---|
| OS audio input buffer | 5-20 ms | No (driver-level) | Disabling echoCancellation / noiseSuppression / autoGainControl on the mic constraint avoids extra resampling/buffering in the browser's media pipeline. |
| `AudioContext.baseLatency` (render quantum × sample time) | 3-12 ms | **Yes** | Construct with `{ latencyHint: 'interactive' }` to bias toward the smallest quantum (often 128 samples / ~2.9 ms at 44.1 kHz). |
| `AudioContext.outputLatency` (browser → audio device) | 5-30 ms | No | Set by the browser. Best you can do is use the right `latencyHint`. |
| Per-effect processing (WaveShaper oversample, Biquad math, etc.) | <1 ms each | **Partial** | Keep WaveShaper oversample at `2x` instead of `4x` so we don't blow the render quantum. |
| Effect chain length (count of nodes) | ~0 ms (same quantum) | Yes structurally | Each node is a `GainNode` / `BiquadFilterNode` / etc.; the graph is pulled in one quantum, so the chain length itself does **not** add latency — but it adds CPU, which can cause glitches. |

**Realistic budget for the current 4-node chain (mic → distortion → lowpass → delay → destination)**:

- `latencyHint: 'interactive'` render quantum: ~3 ms
- Browser output latency: ~10-20 ms (system-dependent)
- Per-effect processing inside the quantum: <0.5 ms each
- **Total: ~13-23 ms** (the lower end on Linux/Windows, the higher end on macOS)

For a real-time instrument effect chain, 10-25 ms round-trip is acceptable. Above ~30 ms, performers start to feel the lag.

---

## What we changed in Phase 1.5

1. **`AudioContext({ latencyHint: 'interactive' })`** in `script.js`. Without this, the default `'balanced'` hint lets the browser pick a larger quantum.
2. **`channelCount: 1` on the mic constraint.** Prevents the browser from upmixing stereo internally before the stream reaches Web Audio.
3. **WaveShaper oversample: `4x` → `2x`** in `DistortionEffect.generateCurve()`. The difference is inaudible for most distortion types; the CPU savings mean the audio thread is much less likely to overrun its quantum.
4. **Hard bypass** in `AbstractEffectNode.setBypassed(b)`. When `b === true`, we `disconnect()` the wet path (`effectOutput → wetGain`) so the effect's DSP stops processing. The dry path still flows through `dryGain` with `value = 1.0`. On `b === false` the wet path is reconnected. This:
   - Frees CPU when many effects are bypassed.
   - Eliminates bypassed effects as a glitch source.
   - Adds no latency (the dry path was already there).
5. **`EffectChainManager.getLatency()`** returns `{ baseLatency, outputLatency, total }` so the bootstrap can log the actual numbers. Open the console after `Start Audio` to see them.

---

## Verifying the change

1. `npm test` — the new tests in `AbstractEffectNode.test.js` and `EffectChainManager.test.js` pin the bypass and latency behaviors so a future refactor can't regress them silently.
2. `npm start` (or serve the directory), open DevTools console, click **Start Audio**. You'll see lines like:
   ```
   Audio context state: running
   Sample rate: 48000 Hz
   Latency — base: 2.67 ms, output: 12.34 ms, total: 15.01 ms
   Effect chain: [ 'InputMic', 'DistortionEffect', 'LowpassEffect', 'DelayEffect' ]
   ```
3. Toggle an effect's **Bypass** checkbox and watch the CPU usage (in Chrome DevTools' Performance panel) drop. The drop is small per effect but adds up in long chains.

---

## If you still feel lag

These are levers in rough order of "tries before going further":

- **Use headphones.** Speakers feeding back into the mic is the most common perceived-latency artifact. Even with `echoCancellation: false`, you are hearing two paths: air-conducted and the digital chain.
- **Drop the chain length.** Each effect's DSP costs work that has to fit in the render quantum. If you overrun, you get clicks, not extra latency — but the *compensation* is to raise the quantum, which raises latency.
- **Switch to a different audio device.** USB interfaces often have lower `outputLatency` than built-in laptop sound.
- **Pre-process the input.** Some browsers let you set `MediaStreamTrackGenerator` constraints, but support is patchy.
- **Use `AudioWorkletNode` for custom DSP in Phase 4+** — runs on the audio thread, bypasses main-thread jitter.

---

## What this means for Phase 2+

The graph is already as tight as a stock-node Web Audio chain can be. Going lower than ~3 ms requires:

- **Smaller render quantums** — browser-controlled. Some platforms expose `AudioContext.outputLatency` lower bounds via `MediaDevices`, but it's not standardized.
- **AudioWorklet-based effects** — same per-node latency but no main-thread scheduling jitter.
- **Dedicated audio I/O** — outside the browser.

So the right Phase-2 work is structural (manifests, registry, serialization) that lets us build and ship more effects cheaply. The latency work was the right Phase-1.5 priority precisely because everything downstream benefits from a tight graph.
