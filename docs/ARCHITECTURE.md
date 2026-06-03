# AudioFX — Architecture & Evolution Plan

A technical evolution plan that transforms the project from a microphone + effects demo into a modular browser-based audio workstation / pedalboard platform.

---

## Table of Contents

1. [Architecture Audit](#1-architecture-audit)
2. [Target Architecture (6-12 months)](#2-target-architecture-6-12-months)
3. [Plugin / Effect System](#3-plugin--effect-system)
4. [Schema-Driven UI](#4-schema-driven-ui)
5. [Project Save / Load](#5-project-save--load)
6. [Analyser / Visualization Subsystem](#6-analyser--visualization-subsystem)
7. [Routing: Linear Chain → Node Graph](#7-routing-linear-chain--node-graph)
8. [Effect Priority (Value × Complexity)](#8-effect-priority-value--complexity)
9. [AudioWorklets — Selective Adoption](#9-audioworklets--selective-adoption)
10. [Standards, Testing, Performance](#10-standards-testing-performance)
11. [Phased Roadmap](#11-phased-roadmap)

---

## 1. Architecture Audit

### Strengths

- **Clean OOP base** (`core/AbstractAudioNode.js`, `core/AbstractEffectNode.js`) — bypass and dry/wet mix are unified once and inherited.
- **Plugin-style loading** — every effect ships as a self-contained pair (`effects/*.html` + `effects/*.js`).
- **No build step** — native ESM, no bundler required for dev. Low barrier to entry.
- **Manager separation** — `core/EffectChainManager.js` owns lifecycle; effects do not know about each other.
- **Bypass abstraction** — `AbstractEffectNode.setBypassed` silently toggles wet/dry.

### Weaknesses

- **Two sources of truth per effect**: `effects/DistortionEffect.html` (DOM) and `effects/DistortionEffect.js` (binding). Adding a parameter touches both.
- **Identity = filename**: `EffectChainManager.addEffect` does `import("../effects/${effectName}.js")` and `new EffectClass(...)`. No versioning, no manifest.
- **Linear-only routing**: `rebuildAudioChain` is a linked-list rebuilder. No parallel buses, no feedback, no sidechain.
- **No persistence layer**: state lives in `AudioParam.gain.value` + DOM `<input>` values. Page reload = lost work.
- **Hardcoded mic source**: `script.js` requests `getUserMedia` and is the only audio source. No file, no synth, no test tone.
- **Orphaned visualizer**: `visualizer.js` exists and is polished, but is never imported anywhere. Dead code.
- **Inconsistent subclass contracts**: `InputMic` overrides `connect`/`disconnect` instead of using the base; `DelayEffect` overrides `setBypassed` but other effects do not. The base contract is fuzzy.
- **Error handling is exception-style**: a misbehaving effect throws and the whole chain dies.

### Scalability limits

- **N effects = N fetches + N dynamic imports on startup** — linear cold-start cost, no prefetching, no caching beyond the runtime's own module cache.
- **No incremental graph updates** — every mutation runs a full `rebuildAudioChain` (O(n) disconnects + O(n) reconnects).
- **HTML templates duplicate schema** — adding a parameter means HTML, JS binding, `setParam` case, `getConfigSchema` field, and `updateConfig` — five edits for one concept.
- **No introspection** — the manager has no way to ask "what does this effect do?" without instantiating it.
- **Mixed-language comments** (`core/EffectChainManager.js`, `core/AbstractAudioNode.js`) — hurts onboarding.

### Technical debt

| File | Line | Issue |
|---|---|---|
| `effects/LowpassEffect.js` | 63 | `getParam('lowpassFreq')` returns `this.delayNode.delayTime.value` (copy-paste bug) |
| `effects/LowpassEffect.js` | 82 | `destroy()` calls `this.delayNode.disconnect()` — `this.delayNode` is undefined |
| `effects/LowpassEffect.js` | 99 | `updateConfig` calls non-existent `setFrequency` method |
| `effects/DistortionEffect.js` | 128, 151 | `postGain.gain.value` written inside `generateCurve()` switch (side-effecty) |
| `core/EffectChainManager.js` | 116 | Typo: `"rebult"` |
| `script.js` | 37 | `insertBefore(button, document.querySelector('.container'))` — element missing in `index.html` |
| `visualizer.js` | — | Never imported; README claims it works |
| `index.html` | 12-26 | Commented-out mode UI (File/Mic/Demo) — abandoned in-flight work |
| `README.md` | — | Describes features that do not exist |

---

## 2. Target Architecture (6-12 months)

**Vision**: a browser-based *pedalboard platform* — versioned plugins, node-based routing, schema-driven UI, saveable projects, real-time visualization, and a host runtime that treats effects, sources, and visualizations as the same kind of thing.

### Layered architecture

```
┌─────────────────────────────────────────────────┐
│  UI Layer (schema form, pedalboard, graph view)  │
├─────────────────────────────────────────────────┤
│  Visualization (analyser taps + renderers)       │
├─────────────────────────────────────────────────┤
│  Persistence (project save/load, presets)        │
├─────────────────────────────────────────────────┤
│  Plugin System (manifest, registry, base class)  │
├─────────────────────────────────────────────────┤
│  Host Runtime (graph manager, sources, outputs)  │
├─────────────────────────────────────────────────┤
│  Audio Engine (Web Audio graph primitives)       │
├─────────────────────────────────────────────────┤
│  DSP Utilities (envelope, LFO, biquad math)      │
├─────────────────────────────────────────────────┤
│  AudioWorklet Processors (when stock nodes fail) │
└─────────────────────────────────────────────────┘
```

**Why this matters**: today the codebase conflates UI + plugin identity + audio graph + persistence into the effect files. The single highest-leverage move is to separate these into layers with one-way dependencies. After that, every later change is local.

**Effort**: 6-8 weeks for the refactor (Phase 2).
**Risks**: API churn — mitigate with a transitional `BaseEffect` that implements both old and new interfaces during migration.
**Payoff**: 80% of long-term value lives in this refactor.

---

## 3. Plugin / Effect System

### Manifest

```js
// effects/distortion/manifest.js
export default {
  id: 'distortion',
  name: 'Distortion',
  category: 'distortion',
  version: '1.0.0',
  author: '...',
  description: '...',
  inputChannels: 2,
  outputChannels: 2,
  tags: ['waveshaper', 'saturation'],
};
```

### Base contract

```js
// plugins/BaseEffect.js
export default class BaseEffect {
  static manifest = { /* required */ };

  // Lifecycle
  async init(audioContext, host) {}
  destroy() {}

  // Audio graph (immutable per effect)
  getInputNode()  { return this.input; }
  getOutputNode() { return this.output; }

  // UI schema — single source of truth
  getConfigSchema() { return { /* paramName: widgetSpec */ }; }

  // Param mutation (sample-accurate where possible)
  applyConfig({ params }) {}
  getConfig() { return { /* current values */ }; }

  // Serialization
  serialize()    { return { id: this.manifest.id, version: this.manifest.version, params: this.getConfig() }; }
  deserialize(state) { this.applyConfig({ params: state.params }); }

  // Events
  onBypassChange(b) {}
  onError(err) {}
}
```

### Registry

```js
// plugins/registry.js
class PluginRegistry {
  register(manifest, ctor)                  // ctor: BaseEffect subclass
  unregister(id@version)
  get(id)                                   // returns manifest + ctor
  list()                                    // all registered
  async load(id)                            // dynamic import, cached
  async instantiate(id, audioContext, host) // returns effect instance
}
```

**Why it matters**: today the class name is the identity. A rename of `DistortionEffect` breaks the loader. Versioned `id@version` IDs decouple identity from filename, from class name, and from internal structure — and they make migrations possible.

**Effort**: 2-3 weeks (manifest format + registry + migrate 3 effects).
**Dependencies**: none on the consumer side, but the schema-driven UI and serialization layers are the consumers that make this valuable.
**Risks**: registry becomes a god module — keep it dumb; push lifecycle to a `PluginHost` service.
**Payoff**: third-party effects become feasible, testing gets easier (pure classes), and we get a stable identity for serialization.

---

## 4. Schema-Driven UI

Today: every effect ships `.html` (DOM) **and** `.js` (binding). Five edits per new param.

Target: **one** `getConfigSchema()` per effect; one `SchemaForm` component renders the UI.

```js
// effects/lowpass/index.js
getConfigSchema() {
  return {
    mix:        { type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Mix' },
    frequency:  { type: 'range', min: 100, max: 16000, step: 10, default: 3000, label: 'Frequency', unit: 'Hz' },
    bypass:     { type: 'toggle', default: false, label: 'Bypass' },
  };
}
```

### Widget primitives (`ui/widgets/`)

- `Range` — slider with value display
- `Knob` — rotary control (educational / aesthetic)
- `Select` — dropdown
- `Toggle` — checkbox / switch
- `XYPad` — two coupled params (future)
- `EnvelopeEditor` — for compressors / gates (future)

`SchemaForm` walks the schema, mounts widgets, and pipes `input` events to `effect.applyConfig({ params })`. Continuous params are debounced (~16 ms); discrete ones apply immediately.

### Per-effect layout strategies

- **Pedalboard**: vertical, large knobs, big bypass switch.
- **Rack**: horizontal, narrow sliders, inline labels.
- **Custom**: opt out via `customRenderer: 'XYPad'` in the schema — escape hatch.

**Why it matters**: removing `.html` files is the single biggest maintainability win. Adding a parameter becomes one line in `getConfigSchema()`. And *every* effect gets a consistent, accessible UI for free.

**Effort**: 2 weeks for widget primitives + 3 effect migrations.
**Dependencies**: plugin refactor (Section 3).
**Risks**: visual customization is hard with a fixed widget set — but the escape hatch is enough.
**Payoff**: 10x faster plugin development, consistent UX, and ARIA / keyboard support fall out of the widget primitives.

---

## 5. Project Save / Load

### Format

```json
{
  "format": "audiofx.project",
  "formatVersion": 1,
  "schema": 1,
  "name": "Vocal warmth",
  "createdAt": "2026-06-03T...",
  "updatedAt": "2026-06-03T...",
  "graph": {
    "nodes": [
      { "id": "src1", "type": "InputMic@1.0.0",         "params": { "channelMode": "stereo", "convertToMono": true } },
      { "id": "fx1",  "type": "distortion@1.0.0",       "params": { "strength": 2.5, "type": "soft", "mix": 0.7, "bypass": false } },
      { "id": "fx2",  "type": "lowpass@1.0.0",          "params": { "frequency": 4000, "mix": 1.0, "bypass": false } },
      { "id": "out1", "type": "OutputDestination@1.0.0" }
    ],
    "connections": [
      { "from": { "node": "src1", "port": "out" }, "to": { "node": "fx1",  "port": "in" } },
      { "from": { "node": "fx1",  "port": "out" }, "to": { "node": "fx2",  "port": "in" } },
      { "from": { "node": "fx2",  "port": "out" }, "to": { "node": "out1", "port": "in" } }
    ]
  },
  "presets": {
    "Warm Vocal":   { "graph": { "...": "..." } },
    "Telephone":    { "graph": { "...": "..." } }
  }
}
```

### Rules

- `format` magic string for file-type detection.
- `formatVersion` = bump on breaking changes; `schema` = current loader's understanding.
- Reject if `formatVersion > schema` with a clear error.
- Missing optional params → defaults from manifest.
- Unknown node `type` → keep as a stub in the graph, bypass it, log a warning, never crash.
- `migrations/v1_to_v2.js` registry of transform functions.

**Why it matters**: presets, shareable patches, undo/redo, autosave — every one of those *requires* a serialization layer. Doing it after the plugin system exists is the cheapest possible moment.

**Effort**: 1.5 weeks (format + engine wiring + round-trip tests for all current effects).
**Dependencies**: plugin system (need `manifest.id@version` for `type`).
**Risks**: format lock-in — mitigated by explicit versioning + a migrations directory.
**Payoff**: presets, sharing, autosave, undo — all unlocked for free in later phases.

---

## 6. Analyser / Visualization Subsystem

### Architecture

- Each `BaseEffect` exposes an optional `getAnalyserTap(portName)` that returns a post-fader `AnalyserNode` (cached).
- A `VisualizationBus` requests taps from named nodes (default: `out1:out`).
- `Renderer` base class: `setAnalyser(analyser)`, `render(ctx, w, h)`.
- A single `requestAnimationFrame` loop iterates active renderers.

### Renderers (`visualization/renderers/`)

- **SpectrumBars** — 64 bars, HSL gradient (this is what `visualizer.js` already does — adopt it).
- **Waveform** — `getFloatTimeDomainData`, centered.
- **Lissajous** — stereo phase scope; teaches users what stereo correlation looks like.
- **Spectrogram** — scrolling FFT (scoped for Phase 4+).

### Per-effect visualizations (`visualization/perEffect/`)

- **DistortionCurve** — plots the WaveShaper curve live as `strength` / `type` change. Reads `effect.getConfigSchema()` + current params; no analyser needed.
- **DelayImpulse** — feedback decay meter.
- **BiquadResponse** — frequency response overlay (uses `BiquadFilterNode.getFrequencyResponse`).
- **CompressorTransfer** — static curve + live gain reduction meter (Phase 4).

### Performance

- One `AnalyserNode` per tap, `fftSize: 2048` default.
- `getByteFrequencyData` once per frame, shared by all spectrum renderers.
- Pause the rAF loop when `document.hidden`; suspend `AudioContext` when tab inactive.

**Why it matters**: visualization is the visible proof the engine works; it is the differentiator vs. every other "Web Audio demo"; and it is educationally invaluable. Watching a transfer curve redraw as you sweep a slider is *the* "aha" moment.

**Effort**: 2 weeks (bus + 2 generic renderers + 3 per-effect viz).
**Dependencies**: none.
**Risks**: `AnalyserNode` taps are not free in CPU — keep them opt-in per node.
**Payoff**: the demo becomes a *tool*; massive perceived-quality jump; doubles as marketing material.

---

## 7. Routing: Linear Chain → Node Graph

### Current

`effectChain` is an array; `rebuildAudioChain` does head-to-tail connections (a singly-linked list).

### Target

A directed graph of `AudioNode`-shaped wrappers. Each node has:

```js
{
  inputs:   Map<portName, GainNode>     // sum-merge for multi-input ports
  outputs:  Map<portName, GainNode>
  taps:     Map<portName, AnalyserNode> // lazy
  bypass:   Boolean
}
```

`GraphManager`:

- `addNode(type, id)` → instantiates effect, wraps in `AudioNode`, returns id.
- `removeNode(id)`, `connect(src, dst)`, `disconnect(src, dst)`.
- `rebuild()` only when topology changes; param changes do not trigger rebuilds.

### Patterns enabled

- **Parallel bus**: a `MixBus` node that sums N inputs to 1 output.
- **Send FX**: source → send gain → FX → returns to main mix (a parallel path with two joins).
- **Sidechain**: source → sidechain input of compressor; sidechain does not pass audio through.
- **Feedback loop**: requires a `DelayNode(0.001)` to break Web Audio's no-zero-delay-feedback rule. Allow with an explicit flag.

### Migration strategy

Keep `addEffect` as a thin facade: `addEffect(name)` → `addNode(...)` + `connect` along the previous tail. The chain is just a special case of a graph where every node has exactly one predecessor and one successor. This makes the refactor *additive*, not a rewrite.

**Why it matters**: linear-only is the #1 ceiling. Every DAW is graph-based. A pedalboard UI is a fixed-layout graph; a modular synth is a free-form graph. Both come free from a graph engine.

**Effort**: 4 weeks (graph core 2, parallel/send patterns 1, presets/layouts 1).
**Dependencies**: serialization (graph topology must be saveable).
**Risks**: this is a big refactor; mitigation is the facade pattern above.
**Payoff**: parallel compression, send FX, sidechain — all impossible today, all table stakes for a pedalboard.

---

## 8. Effect Priority (Value × Complexity)

| # | Effect | Impact | Complexity | Why this order |
|---|---|---|---|---|
| 1 | **Compressor** | High | Med | DynamicsCompressorNode; teaches envelopes. Every vocal patch needs it. |
| 2 | **3-band EQ** | High | Low | 3 BiquadFilters. The most-used effect in any chain. |
| 3 | **Reverb (convolution)** | High | Low-Med | ConvolverNode + IR pack. Universally loved. |
| 4 | **Chorus** | Med | Low | DelayNode + LFO. Teaches modulation. |
| 5 | **Phaser** | Med | Med | Allpass chain + LFO. |
| 6 | **Tremolo** | Med | Low | GainNode × LFO. Simplest modulation effect. |
| 7 | **Bitcrusher** | Low | Low | Extract from existing Distortion. |
| 8 | **Noise gate** | Med | Med | Dynamics extension; pairs with compressor. |
| 9 | **Parametric EQ** | High | High | Multi-bell + shelf. |
| 10 | **Pitch shifter** | High | High | First worklet effect. |
| 11 | **Tape saturation** | Med | Med | WaveShaper variant. |
| 12 | **Looper** | V.High | V.High | Architectural; needs recording + sync. |

**Ordering rationale**: each new effect should teach a new DSP concept — envelopes (1), biquads (2), convolution (3), modulation (4-6), FFT/phase (10). The user learns Web Audio, not just the product. Stock-node effects (1-9, 11) come first because they are cheap; worklet effects (10, 12) come after the worklet infrastructure exists.

**Effort**: 6-10 weeks for the full slate.
**Payoff**: feature parity with mid-tier commercial pedalboards.

---

## 9. AudioWorklets — Selective Adoption

### Where they help

- **DSP that does not fit stock nodes**: pitch shifting, vocoders, granular synthesis, lookahead limiters, custom envelopes, FFT-based processing.
- **Sample-accurate automation** of internal state (e.g., envelope retrigger on transient).
- **Heavy DSP** that overflows the main thread (limiters, oversampled effects, big reverbs).

### Where they do not

- WaveShaper, BiquadFilter, DelayNode, GainNode, ConvolverNode, DynamicsCompressor, AnalyserNode — **already in the audio thread**, fast, well-tested.
- Routing, mixing, switching — all stock nodes do this fine.

### Recommendation

Introduce `BaseWorkletEffect` and a `worklets/` directory. **Do not** wrap existing effects. Use worklets only when a requested effect literally cannot be done with stock nodes (pitch shifter is the canonical first use case). The first consumer justifies the infrastructure; subsequent consumers are free.

### Worklet message protocol

- `init` (host → worklet) with sample rate, channels, options.
- `set` (host → worklet) for param changes — float32, named.
- **Audio-thread state**: the worklet owns its own state. No shared JS objects.

### Caveats

- Cannot unload a worklet cleanly mid-graph — need a swap-in-place pattern.
- Debugging is harder — pre-build a "trial" wrapper that runs the worklet in a sandboxed graph node.
- Safari support is good now (post-2021) but verify per-target.

**Effort**: 1-2 weeks for infrastructure; then pay-per-use.
**Dependencies**: nothing immediate; pitch shifter (Phase 4f) is the first consumer.
**Risks**: silent worklet failures; mitigate with mandatory round-trip tests on every worklet.
**Payoff**: unlocks the "impossible" effects and sets a clear ceiling on platform capability.

---

## 10. Standards, Testing, Performance

### Folder structure

```
audiofx/
  index.html
  src/
    main.js                     # bootstrap
    engine/
      AudioContextManager.js
      GraphManager.js
      AudioNode.js              # graph primitive
      AnalyserBus.js
    plugins/
      registry.js
      loader.js
      BaseEffect.js
      BaseSource.js
      BaseWorkletEffect.js
    effects/
      distortion/
        manifest.js
        index.js                # default export = effect class
      lowpass/
      delay/
      compressor/               # phase 4
      ...
    sources/
      InputMic/
      InputFile/
      InputOscillator/
    ui/
      SchemaForm.js
      widgets/{Range,Knob,Select,Toggle,XYPad,EnvelopeEditor}.js
      Pedalboard.js
      NodeGraph.js
    persistence/
      project.js
      migrations/
      presets/
    visualization/
      renderers/{SpectrumBars,Waveform,Lissajous,Spectrogram}.js
      perEffect/{DistortionCurve,DelayImpulse,BiquadResponse}.js
    dsp/                        # pure math, no Web Audio
      biquad.js
      envelope.js
      lfo.js
      noise.js
  worklets/                     # AudioWorkletProcessor sources
    pitch-shift.js
  styles/
  test/
    unit/                       # vitest
    integration/                # OfflineAudioContext-based
  docs/
    ARCHITECTURE.md
  public/                       # static assets (IRs, etc.)
```

### Coding standards

- **ESM only.** No CommonJS. Vite for production; native ESM for dev.
- **ESLint + Prettier** with strict config. CI-enforced.
- **JSDoc** on every public method — no TypeScript yet, to keep the barrier low; we can add `.d.ts` later from JSDoc with `tsc --checkJs`.
- **`getConfigSchema()` is the only UI contract.** No effect has an `.html` file.
- **Errors are values** in plugin/UI code; `try/catch` boundaries at the engine seam.
- **One language for comments** — English.

### Testing

- **Unit (Vitest)**: pure DSP (`dsp/biquad.js`, `dsp/envelope.js`) — fully testable off the audio thread.
- **Integration**: `OfflineAudioContext` for deterministic graph tests. Render a chain with a known input, check output is not silent, check gain is in expected range, check parameter sweep produces monotonic behavior.
- **Plugin contract tests**: every effect must (a) round-trip through `serialize` / `deserialize`, (b) expose a valid `manifest`, (c) respond to a `paramSweep` test without throwing, (d) be constructible with a minimal stub `audioContext`.
- **E2E (Playwright)**: smoke test — load page, mocked mic, build chain, output is non-silent, screenshot of pedalboard matches baseline.
- **CI**: GitHub Actions — lint, unit, integration, build. PRs blocked on failures.

### Performance

- **One `AudioContext`** per page, ever.
- **Ramped params**: `setValueAtTime` for discrete, `linearRampToValueAtTime` (5-20 ms) for sliders — eliminates zipper noise.
- **Memoize imports** — never re-`import()` a module.
- **Throttle UI** with rAF; debounce slider `input` events to one per frame.
- **AnalyserNode budget**: 1-2 per page, not 1-per-effect.
- **`document.hidden`** to pause rAF; suspend `AudioContext` when tab inactive.
- **WorkletProcessors**: preallocate, never allocate in `process()`. Use `SharedArrayBuffer` for large constant data (impulse responses, wavetables) if cross-origin isolation is available.

**Why this matters**: standards + tests are the difference between "demo you ship once" and "product you trust". Most of it is discipline, not cost.

**Effort**: 1 week for folder/standards; 2 weeks for first test suite; ongoing.
**Payoff**: confidence to refactor, faster onboarding, fewer regressions.

---

## 11. Phased Roadmap

### Phase 1 — Stabilization (2-3 weeks)

**Goal**: ship what is there, correctly. Foundation for everything else.

- Fix `LowpassEffect` bugs (lines 63, 82, 99) and `script.js:37` container reference.
- Fix `EffectChainManager.js:116` typo.
- Unify bypass semantics; remove redundant subclass overrides.
- Add Vitest + manager tests (add/remove/move/rebuild).
- Smoke test (Playwright) for "load page, request mic (mocked), chain works".
- Update `README.md` to match reality.
- Pick English for all new comments; sweep Russian out.

**Why first**: every later phase assumes Phase 1 is solid. The bug list is small enough that no one is tempted to "fix it later".

**Effort**: 2-3 weeks. **Risks**: scope creep into Phase 2. **Payoff**: green tests, working demo, clean slate.

### Phase 2 — Framework improvements (6-8 weeks)

**Goal**: build the abstractions every later phase depends on. Do them in this order:

- **2a. Plugin manifest + registry + BaseEffect** (2-3 weeks) — migrate 3 effects.
- **2b. Schema-driven UI** (2 weeks) — widget primitives, migrate 3 effects to no-HTML.
- **2c. Serialization** (1.5 weeks) — project format v1, migrations skeleton, round-trip tests.
- **2d. Analyser bus + 2 renderers** (1.5 weeks) — adopt `visualizer.js` as `SpectrumBars`; add `Waveform`.

**Why this order**: 2a must precede 2b/2c (they consume the manifest). 2d is independent but bundles well.

**Effort**: 6-8 weeks. **Risks**: API churn — keep `AbstractEffectNode` as a transitional base. **Payoff**: 80% of long-term value.

### Phase 3 — Usability features (4-6 weeks)

**Goal**: the demo becomes a tool.

- **Sources**: `InputFile` (decodeAudioData), `InputOscillator` (test tone), `InputUrl` (streamed).
- **Preset manager**: save/load/rename/delete; localStorage; later IndexedDB.
- **Undo/redo**: snapshot-based (cheap once serialization exists).
- **Pedalboard UI**: drag-to-reorder, visual bypass, signal-flow view.
- **Per-effect live viz**: distortion curve, delay feedback meter, biquad response.
- **Project export/import** as `.audiofx.json` file.

**Why third**: presets and sources are the *minimum* to build a useful patch. After this, users can save and share.

**Effort**: 4-6 weeks. **Risks**: IndexedDB scope creep — start with localStorage. **Payoff**: shareable; audience expands.

### Phase 4 — Advanced DSP (6-10 weeks)

**Goal**: reach feature parity with mid-tier pedalboards.

- **4a. Worklet infrastructure** (1-2 weeks) — loader, lifecycle, message protocol, fallback.
- **4b. Compressor** (1 week).
- **4c. 3-band EQ** (1 week).
- **4d. Reverb (convolution)** (1 week) — ConvolverNode + IR pack.
- **4e. Modulation family** (1-2 weeks) — chorus, phaser, tremolo.
- **4f. Pitch shifter** (2 weeks) — first worklet effect; validates 4a.
- **4g. Looper** (2-3 weeks, stretch) — record + overdub + sync.

**Why this order**: stock-node effects (4b-4e) validate the plugin system under load; pitch shifter (4f) is the worklet's *real* first user.

**Effort**: 6-10 weeks. **Risks**: pitch-shifter DSP is hard — pick a known algorithm and document limitations. **Payoff**: real pedalboard, not a demo.

### Phase 5 — Product polish (4-6 weeks)

**Goal**: production-quality.

- **5a. Graph routing UI** (2-3 weeks) — canvas node graph (rete.js / litegraph.js), parallel buses, send FX, feedback loops.
- **5b. Mobile/PWA** (1-2 weeks) — touch-friendly controls, service worker, "Add to Home Screen".
- **5c. Theming & a11y** (1 week) — light/dark, high-contrast, keyboard nav, ARIA on every widget.
- **5d. Onboarding** (1 week) — first-run tour, sample projects library.
- **5e. Telemetry opt-in** (0.5 week, optional) — crash reporting, anonymous usage.

**Why last**: depends on 3 and 4.

**Effort**: 4-6 weeks. **Risks**: graph editor UX is a project of its own — budget 3 weeks and do not underestimate. **Payoff**: ready to ship.

---

## Total Estimate & Delivery

| Plan | Duration |
|---|---|
| Full plan (Phases 1-5) | **22-33 weeks** (5-8 months) |
| Realistic 12-month delivery | Phases 1-3 + 4a-4e + 5a-5b (skip 4f/4g and 5c-5e as stretch) |
| 3-month MVP | Phases 1 + 2 (a, b, d) — stable, extensible, visualized engine without presets or new effects |

**The single most valuable first step**: complete Phase 2a (plugin manifest + registry + BaseEffect). It is the prerequisite for every other Phase 2-5 deliverable, and it eliminates the most painful class of bugs (the dual-source-of-truth effect HTML+JS files).
