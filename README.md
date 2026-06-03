# AudioFX

A browser-based modular audio effects pedalboard built with the Web Audio API.

The project is a learning-focused platform for understanding how the `<canvas>` element, real-time audio graphs, and the Web Audio API work together. It currently exposes a runtime-loaded effect chain driven by microphone input.

---

## Features

- **Modular effects**: each effect ships as a paired `.js` (logic) and `.html` (UI) module.
- **Dynamic chain manager**: add, remove, and reorder effects at runtime; the audio graph is rebuilt automatically.
- **Live mic source**: `getUserMedia` with bypassed echo cancellation, noise suppression, and auto-gain so the raw signal reaches the effect chain.
- **Dry/wet mix + bypass** on every effect, implemented once in the base class.
- **Effects included**:
  - **InputMic** — mono/stereo channel selection, optional mono fold-down, gain trim
  - **DistortionEffect** — WaveShaper with 8 curve types (soft, hard, tanh, exponential, foldback, bitcrusher, symmetric, diode-like)
  - **LowpassEffect** — BiquadFilter, 100 Hz - 16 kHz
  - **DelayEffect** — DelayNode with feedback loop; bypass silences the feedback path

---

## Project structure

```
audiofx/
  index.html             Entry HTML; hosts the effects container
  script.js              Bootstrap: requests mic, builds the default chain
  style.css              Minimal dark theme
  core/
    AbstractAudioNode.js     Base for any audio-graph node
    AbstractEffectNode.js    Base for effects; adds dry/wet mix + bypass
    EffectChainManager.js    Add/remove/move effects; rebuilds the chain
  effects/
    InputMic.js + .html
    DistortionEffect.js + .html
    LowpassEffect.js + .html
    DelayEffect.js + .html
  test/
    setup.js                  Web Audio + jsdom polyfills for Vitest
    unit/*.test.js            Unit tests
  docs/
    ARCHITECTURE.md           Long-term evolution plan
  package.json
  vitest.config.js
```

---

## Running the demo

The project uses native ES modules, so it must be served over HTTP (browsers refuse `import()` from `file://`).

```bash
npx http-server -p 8080
# or
python -m http.server 8080
```

Then open <http://localhost:8080>, click **Start Audio**, and grant microphone permission.

The default chain is `mic -> distortion -> lowpass -> delay -> destination`.

---

## Running the tests

```bash
npm install
npm test
```

Tests use Vitest with a jsdom environment and a lightweight Web Audio polyfill (`test/setup.js`). The polyfill makes graph-construction calls succeed and exposes inspectable mock nodes — no real audio is generated.

Current coverage:

- `core/EffectChainManager.test.js` — 10 tests for add / remove / move / rebuild
- `core/AbstractEffectNode.test.js` — 6 tests for the dry/wet + bypass base class
- `effects/LowpassEffect.test.js` — 9 tests, including regression tests for the Phase 1 bug fixes
- `effects/DistortionAndDelay.test.js` — 11 tests for the two most complex effects

---

## Architecture

### Effect lifecycle

1. `EffectChainManager.addEffect(name)` does:
   - `fetch('effects/${name}.html')` to load the UI template
   - `import('../effects/${name}.js')` to load the class
   - `new EffectClass(audioContext, domElement)` to instantiate
   - splice into the chain and call `rebuildAudioChain()`
2. `rebuildAudioChain()` disconnects every effect, then re-wires them head-to-tail. The last effect's output connects to `audioContext.destination`.
3. `removeEffect()` calls `effect.destroy()` (if defined) and removes the DOM node, then rebuilds.

### Dry/wet mix

`AbstractEffectNode` wires the input through both a dry path and a wet path (input → effect → wet). The base class owns the dry and wet gain nodes, and `setMix(value)` writes `dryGain = 1 - value`, `wetGain = value`. `setBypassed(true)` forces `dry = 1, wet = 0`; `setBypassed(false)` re-applies the current mix.

Effects that need custom bypass behavior (e.g. `DelayEffect`, which must also silence the feedback loop) override `setBypassed` and call `super.setBypassed()` first.

---

## Roadmap

The long-term evolution plan is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The near-term sequence is:

- **Phase 1 — Stabilization** *(in progress)*: fix concrete bugs, unify bypass semantics, add tests, write this README.
- **Phase 2 — Framework**: plugin manifest + registry, schema-driven UI, serialization, analyser bus.
- **Phase 3 — Usability**: file/oscillator sources, presets, undo/redo, pedalboard UI, project export.
- **Phase 4 — DSP**: worklet infrastructure, compressor, EQ, reverb, modulation family, pitch shifter.
- **Phase 5 — Product polish**: graph routing UI, mobile/PWA, theming, a11y, onboarding.
