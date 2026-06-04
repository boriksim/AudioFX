# AudioFX — Autonomous Continuation State

This file is the anchor for reinitialization. **If you (a fresh agent
instance) are reading this, you have just been reinitialized. Read this
file in full, then read `docs/ARCHITECTURE.md`, then `git log -20`, and
then resume the next-steps section below.**

---

## Current state at a glance

- **Branch:** `dev` (orphan from clean local state). `main` and `tmp`
  must remain bit-identical to remote — do not touch them.
- **Remote:** `https://github.com/boriksim/AudioFX.git`
- **Test framework:** Vitest 2.1.9 + jsdom + Web Audio polyfill in
  `test/setup.js`.
- **Stack:** native ESM, no build step.
- **Last known good test count:** 253 passing across 23 test files.
  (Updated at the top of every commit.)
- **Latest commit on `dev`:** `420fe0f` — `fix(channel-splitter): use
  named export to match script.js import` (root cause of the empty
  patchboard). Prior: `48b668b` `docs(status)`, `33f7a9b`
  `fix(init): mic-optional`, `8074723` `fix(patchboard): hard-set
  container position`, `0caf4c8` `fix(patchboard): distinct
  default positions`, `61eaa57` `feat(phase-5)`,
  `c330e7c` `feat(phase-4c)`, `c9de37b` `feat(phase-4b)`,
  `2cdc142` `feat(phase-4a)`.

---

## Completed phases

- **Phase 1 — Stabilization:** LowpassEffect fixes, "rebult" typo,
  container selector, unified bypass, initUI guards, README rewrite.
- **Phase 1.5 — Latency:** `latencyHint: 'interactive'`,
  `channelCount: 1`, WaveShaper `oversample: "2x"`, hard-bypass
  disconnects `effectOutput → wetGain`, `getLatency()` returns
  `{baseLatency, outputLatency, total}`.
- **Phase 2a — Plugin system:** `core/BaseEffect.js`,
  `core/PluginRegistry.js` (loadFromModule + instantiate + URL
  memoization), all 4 base effects declare `static manifest`, manager
  accepts optional registry, runtime uses registry + manifest ids.
- **Phase 2b — Schema UI:** `ui/widgets/{Range,Select,Toggle}.js` with
  binding contract, `ui/SchemaForm.js` reads `getConfigSchema()` and
  prepends a Bypass toggle, manager has `useSchemaUI` + custom
  `uiRenderer` options.
- **Phase 2c — Persistence:** `persistence/project.js` (format v1).
- **Phase 2d — Visualization subsystem:** `engine/AnalyserBus.js`
  (per-tap pool, single rAF loop, auto-pause on `document.hidden`,
  per-renderer error isolation), `visualization/renderers/{SpectrumBars,
  Waveform}.js`, per-effect viz `{DistortionCurve, BiquadResponse,
  DelayImpulse}`. Runtime migration to schema UI; legacy `effects/*.html`
  deleted.
- **Phase 3a — Preset manager + project file I/O:** `persistence/presets.js`
  (localStorage CRUD with validation), `persistence/importExport.js`,
  `ui/PresetManager.js` (PresetManagerUI with status callback), index
  panel + status bar.
- **Phase 3b — Undo/redo:** `persistence/history.js` HistoryController
  (debounced 250ms, maxSize 50, symmetric undo/redo, `subscribe`,
  `flush`, `clear`, `applyExternal`).
- **Phase 3c — Pedalboard UI:** `ui/PedalboardUI.js` (drag-to-reorder,
  add picker, remove button, grip, bypass class).
- **Phase 3d — Per-effect live viz:** `visualization/perEffect/
  {DistortionCurve, BiquadResponse, DelayImpulse}.js` + `.pe-viz`
  canvas per card.
- **Phase 3e — More sources:** `effects/InputFile.js`,
  `effects/InputOscillator.js`, registered in runtime, file picker +
  play button in `InputFile.renderSourceActions()`.
- **Hotfix — phase-3 post-feedback:** grip-only drag, bus re-attach
  on chain rebuild, mic re-attach on add, per-effect level meter for
  mic, `docs/STATUS.md` created.
- **Phase 4a — Graph model:** `EffectChainManager` rewritten with
  `connections[]` array, `connect()`/`disconnect()` methods,
  `rebuildAudioGraph()` (chain-order + explicit, deduped, multi-input
  summing via per-port GainNode, sinks → destination), port-aware
  `getInputNode(portId)`/`getOutputNode(portId)` in
  `AbstractAudioNode`. Project format bumped to v2 with v1→v2
  migration (default vertical-column positions, default ports).
  Chain-order connections are derived; only explicit connections are
  serialized.
- **Phase 4b — Patchboard UI:** `ui/PatchboardUI.js` replaces
  `ui/PedalboardUI.js` (deleted). Free-grid card layout via
  `transform: translate(x, y)`, SVG `<path>` wires between port
  dots, drag-to-wire from output to input port, click wire to
  disconnect, `Delete`/`Backspace` to remove selected card. Per-card
  data: `e.position = {x, y}` (persisted). Manager API: `addEffect(id,
  {position})`. PatchboardUI wraps `ecm.onChange` (save-and-restore
  on destroy) so it never overwrites upstream hooks.
- **Phase 4c — Multi-port effects:** `effects/ChannelSplitter.js`
  (1 input, 2 output ports `L` and `R`). `AbstractAudioNode` port
  API is the contract: `getInputPorts()`, `getOutputPorts()`,
  `getInputNode(portId)`, `getOutputNode(portId)`. Default
  implementation returns `[{id: "in"}]` and `[{id: "out"}]`. The
  manager's `_chainOrderConnection(i)` uses the first declared
  port of multi-port nodes (so a ChannelSplitter's L port is the
  chain-order source for the next effect). `connect()` /
  `_isChainConnection` use the same logic. `PatchboardUI._renderPorts`
  renders one port dot per declared port, stacked vertically when
  more than one.
- **Phase 5 — Profiling & docs:** `engine/Profiler.js` tracks
  per-frame render time, audio context state transitions,
  `outputLatency`, and main-thread long tasks via
  `PerformanceObserver`. `AnalyserBus` accepts an `onFrame`
  option so the runtime can pipe frame timings to the Profiler.
  `script.js` creates a Profiler and exposes it as
  `window.__profiler` for debugging. `docs/PERFORMANCE.md`
  documents the latency budget, throughput, the Profiler's
  stats, and a field checklist for "audio is glitchy" reports.
  Test polyfill extended: `MockAudioContext` now has
  `addEventListener`/`removeEventListener`/`dispatchEvent` so
  the Profiler can subscribe to `statechange` in tests.

---

## Open / upcoming work

(none — all phases 1-5 of `docs/ARCHITECTURE.md` are complete
on `dev`. Future work beyond the original plan can be
proposed by the user.)

---

## Key architectural decisions (do not reverse without user input)

- **Latency first.** Keep `latencyHint: 'interactive'`,
  `channelCount: 1`, hard-bypass disconnects the wet path. No
  filter nodes in the default chain (Biquad is added by user, not
  always-on).
- **Native ESM, no build step.** All imports are explicit paths;
  `script.js` is loaded via `<script type="module">`. Do not
  introduce a bundler.
- **Schema UI over HTML templates.** Legacy `effects/*.html` is
  gone; new effects only need to ship `getConfigSchema()`. Bypass
  toggle is prepended by the form (skipped if no `setBypassed`).
- **Plugin identity = `manifest.id`.** Not the filename, not the
  class name. Version is semver. `loadFromModule` finds the class
  whose `manifest.id` matches.
- **`updateConfig` is a deprecated alias for `applyConfig`.** Keep
  it for back-compat in each effect.
- **`EffectChainManager.addEffect(id, {index, params})` — object
  options, not positional.**
- **`PedalboardUI` wraps `ecm.onChange` (save-and-restore on
  destroy)** so it never overwrites the history controller's hook.
- **`HistoryController.applyExternal(snapshot)`** — push as new
  current state, clears redo, undoable.
- **Bus re-attaches on every chain rebuild** (added in hotfix).
  Subscribed via `EffectChainManager.onChainRebuilt` hook.
- **Mic re-attach on add** (added in hotfix). Any time the chain
  contains a new `InputMic` and a live stream is available, call
  `initStream(stream)`.
- **Grip is the only draggable area on a card** (added in hotfix).
  Card has `draggable="false"`, grip has `draggable="true"`.
- **`AnalyserBus.attach` is a pure tap** (does not pass through
  to destination). The destination connection is the manager's
  responsibility. The analyser reads from its source via
  `getByteFrequencyData` / `getFloatTimeDomainData`.
- **Graph model (Phase 4a):** `EffectChainManager.connections[]`
  holds ONLY explicit connections. Chain-order connections are
  derived from the `effectChain` array order and deduped against
  the explicit list at `rebuildAudioGraph()` time. Multi-input
  summing inserts a fresh per-port `GainNode` summer when a port
  has >1 source. Sinks (no outgoing connection) connect to
  `audioContext.destination`.
- **Project format v2:** `formatVersion: 2`, `schema: 2`. Nodes
  carry optional `position: {x, y}`. Connections carry optional
  `fromPort`/`toPort` (default `"out"`/`"in"`). `serializeProject`
  only stores EXPLICIT connections (chain-order is reconstructed
  on load). `migrateProject(doc)` runs `v1_to_v2` on legacy docs.
- **Patchboard UI is the only UI (Phase 4b):** `PedalboardUI` is
  deleted. `PatchboardUI` is the canonical renderer. It wraps
  `ecm.onChange` (save-and-restore on `destroy()`) the same way
  the old `PedalboardUI` did. Sources (`input-mic`, `input-file`,
  `input-oscillator`) render no input port; effects render an
  input port on the left and an output port on the right.
  Drag-to-wire creates explicit connections; clicking a wire
  disconnects it. `Delete`/`Backspace` removes the selected card.
- **Multi-port effects (Phase 4c):** effects override
  `getInputPorts()` / `getOutputPorts()` to declare port lists
  (default `[{id: "in"}]` / `[{id: "out"}]`). The manager's
  `_chainOrderConnection(i)` uses the FIRST declared port of
  multi-port nodes. `_isChainConnection` matches the same logic
  so explicit `connect()` calls don't duplicate chain order.
  The PatchboardUI renders one port dot per declared port,
  stacked vertically for multi-port cards.
- **Profiler (Phase 5):** `engine/Profiler.js` is a stateful
  observer. `recordFrame(durationMs)` adds to a rolling window
  (default 5s). `start()` subscribes to `statechange` and
  `PerformanceObserver({entryTypes: ["longtask"]})`. `stop()`
  detaches both. `getStats()` returns aggregate stats.
  `subscribe(fn)` notifies on every event; exceptions are
  isolated. `AnalyserBus` accepts an `onFrame` option for the
  runtime to wire the Profiler into the rAF tick.
- **Patchboard `position: relative` is unconditional.** The
  container's position is set inline and via CSS
  (`.effects-container.patchboard { position: relative }`); the
  earlier `getComputedStyle(...) === "static"` check was
  unreliable (jsdom returns `""`). Each card has explicit
  `top: 0; left: 0` so `transform: translate(x, y)` is the
  sole positioning signal. A `.pb-header` is appended to the
  container so the workspace is labeled even if card rendering
  fails. `script.js` calls `container.scrollIntoView()` ~50ms
  after init so the patchboard is on screen even when the
  visualizer is tall.
- **Mic permission is optional.** `initAudio` requests the mic
  inside a try/catch; on failure the chain and patchboard are
  still built (with `stream = null`). `wireNewMics` and
  `reattachMic` short-circuit on `!stream`. The user can
  explore the UI without mic and grant access later.

---

## Conventions

- **Tests:** Vitest, one `*.test.js` per module under `test/unit/`.
  All assertions must pass before a commit; the linter / typecheck
  is `npx vitest run`. There is no separate lint or typecheck.
- **Polyfill:** `test/setup.js` provides `MockAudioContext`,
  `MockAudioParam`, `MockOscillatorNode`, `MockBufferSourceNode`,
  `MockAnalyserNode` etc. Add new mock nodes there when a new
  Web Audio node type is needed by tests.
- **No comments in code** unless the user asks. Documentation lives
  in `docs/`. JSDoc on exported APIs is fine.
- **English only** in all new code, comments, and docs. Sweep
  Russian out of pre-existing comments when touching the file.
- **Commit messages:** imperative mood, scope prefix
  (`feat(phase-Nx):`, `fix:`, `docs:`, `chore:`), body explains
  *why* not *what*.
- **Branch policy:** commit only to `dev`; push to `origin/dev`.
  Never `git push --force`, `git rebase`, or amend prior commits
  without explicit user instruction.

---

## How to recover from a reinit (runbook)

1. `cd` to the repo (`C:\Users\borik\Desktop\AudioFX-main`).
2. `git status` — confirm on `dev` and clean.
3. `git log -20 --oneline` — see recent commits.
4. Read this file in full.
5. Read `docs/ARCHITECTURE.md` (the 11-section plan).
6. `npx vitest run` — confirm 253/253 baseline.
7. Resume work in the **Open / upcoming work** section.
8. Update this file at the top of every new commit.
9. Push to `origin/dev` with `git push origin dev`.

---

## Open questions (deferred — do not act without user)

- None currently. All phases 1-5 of `docs/ARCHITECTURE.md` are
  complete on `dev`. Future work beyond the original plan can
  be proposed by the user.
