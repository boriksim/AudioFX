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
- **Last known good test count:** 322 passing across 24 test files.
  (Updated at the top of every commit.)
- **Latest commit on `dev`:** `b61fa26` — `feat(patchboard):
  multi-master output, live wire highlight, cache-bust`. Prior:
  `f57af1d` `docs(status)`, `b3103be` `fix(patchboard):
  explicit-only patch-cable model; no auto-wiring`,
  `a84b843` `fix(patchboard): master port visible on container
  right edge`, `e56688b` `docs(status)`, `b3d5556` `feat(patchboard):
  master output port, utility node, drag-on-wire-to-insert, larger
  port hit area, remove ChannelSplitter from default`,
  `294bfde` `docs(status)`, `c98051a` `feat(patchboard):
  gain-based bypass, chain-order breaks, horizontal row layout`,
  `be40b4e` `fix(patchboard): grow container`, `25f17d2`
  `fix(patchboard): bigger wire hit area`, `a30f3b6` `docs(status)`,
  `420fe0f` `fix(channel-splitter): use named export` (root cause
  of the empty patchboard), `48b668b` `docs(status)`,
  `33f7a9b` `fix(init): mic-optional`, `8074723`
  `fix(patchboard): hard-set container position`, `0caf4c8`
  `fix(patchboard): distinct default positions`,
  `61eaa57` `feat(phase-5)`, `c330e7c` `feat(phase-4c)`,
  `c9de37b` `feat(phase-4b)`, `2cdc142` `feat(phase-4a)`.

---

## Completed phases

- **Phase 1 — Stabilization:** LowpassEffect fixes, "rebult" typo,
  container selector, unified bypass, initUI guards, README rewrite.
- **Phase 1.5 — Latency:** `latencyHint: 'interactive'`,
  `channelCount: 1`, WaveShaper `oversample: "2x"`, `getLatency()`
  returns `{baseLatency, outputLatency, total}`.
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
on `dev`, plus the patchboard audio + chain-break + horizontal
layout fixes. Future work beyond the original plan can be
proposed by the user.)

---

## Post-Phase-5 patchboard features (commits `b3d5556`, `a84b843`, `b3103be`, `b61fa26`)

The 11-section plan is complete; the user asked for these
ergonomic improvements on top of the patchboard:

- **Master output port.** A single static `.pb-master-port`
  sits on the right edge of the patchboard container. Effects
  wire to it to reach the audio destination; if nothing is
  connected, no audio reaches destination (silence). Manager
  API: new option `useMasterOutput` (default false, preserves
  legacy auto-connect-sinks-to-destination behavior for tests);
  new properties `useMasterOutput` and `masterOutputId`; new
  methods `setMasterOutput(effectId)`, `clearMasterOutput()`,
  `getMasterOutput()`. `PatchboardUI` sets
  `ecm.useMasterOutput = true` in its constructor, so the
  manager requires an explicit master. Drag a wire from any
  effect's output to the master port → `setMasterOutput(fromId)`
  and an orange master wire is drawn. Click the master wire →
  `clearMasterOutput()`. `removeEffect(id)` clears
  `masterOutputId` if the removed node was the master.
- **Drag-on-wire-to-insert.** Drop a card on top of an
  existing wire and it splices itself in between, deleting
  the original wire. `_findWireNear(x, y)` samples 16 points
  along each wire's cubic Bezier and returns the closest
  within 30px; `_insertIntoWire(effectObj, wire)` calls
  `ecm.moveEffect(cardId, fromIdx+1)` (chain becomes
  `from → NEW → to`); for explicit wires, also `disconnect`
  to remove the duplicate path.
- **Larger port hit area.** `.pb-port` is a 30x30 transparent
  element; the visible 14x14 dot is a `::after` pseudo
  centered inside. The 30x30 area is the click target for
  both mousedown (start wire) and mouseup (drop wire). Port
  positions are at `left: -15px` (in) and `right: -15px`
  (out) so the click area extends beyond the card edge.
- **Utility node.** `effects/UtilityEffect.js`, id `utility`,
  1 in / 1 out. Four parameters: gain (0..2, default 1),
  pan (-1..+1, default 0), invertPhase (boolean, default
  false), mono (boolean, default false). True mono downmix
  via a 2x2 gain matrix: identity in stereo (`[1,0,0,1]`),
  uniform 0.5 in mono (`[0.5,0.5,0.5,0.5]` → (L+R)/2 on
  BOTH output channels). Audio path: input → splitter(2) →
  2x2 gain matrix → merger(2) → phaseInvert → panner
  (StereoPannerNode) → outputGain → output. All matrix
  gains always wired; no `disconnect` calls.
- **ChannelSplitter removed from default picker.** The user
  didn't ask for it and the broken `getConfigSchema()` (was
  array, now fixed to object) made it render as an empty
  black box. Removed from `buildRegistry()` in `script.js`;
  the class is still in the code and importable for
  explicit use. Picker test updated to match.
- **Test polyfill extended.** `test/setup.js` adds
  `createStereoPanner()` and a `pan` audio param so
  `UtilityEffect` can be instantiated in tests.
- **Master port is visible on the container right edge.**
  Commit `a84b843` fixed three bugs that prevented the master
  port from showing up: (1) the `.pb-port` CSS was scoped to
  `.effect-instance .pb-port`, so the container-level master
  port got no width/height/positioning; (2) the container has
  `overflow: auto`, so a port at `right: -15px` was clipped;
  (3) the master port had no `position: absolute`. Now pinned
  to `right: 0` (fully inside) with the orange dot on the right
  edge.
- **Patch-cable (explicit-only) wiring model.** Commit
  `b3103be` makes the patchboard match the patch-cable mental
  model: a new effect starts UNCONNECTED, the user wires it
  manually. The manager has a new `useChainOrder` option
  (default true for legacy / tests). When false,
  `rebuildAudioGraph` skips chain-order derivation entirely —
  only explicit `connect()` calls create audio paths. The
  PatchboardUI sets `useChainOrder: false` in its constructor
  so the production app runs in patch-cable mode. The
  manager's `connect()` no longer short-circuits when an
  adjacent chain-order pair would cover the explicit call
  (in patch-cable mode there are no chain connections, so
  every `connect()` is a real new connection).
- **Drag-on-wire-to-insert uses explicit connections in
  patch-cable mode.** In `useChainOrder: false` mode, dropping
  a card on a wire: (a) disconnects the original wire, (b)
  adds two new explicit connections (source → new, new →
  destination), (c) moves the new card to the position right
  after the source in the chain array. In `useChainOrder: true`
  mode (legacy), the original chain-order splice mechanic still
  works (chain array rearranged, explicit disconnect skipped).
  The self-loop bug is also fixed: the explicit `connect()`
  calls skip the case where source == new or destination ==
  new.
- **No auto-wiring means no sound until the user wires to
  master.** With `useMasterOutput: true` (the patchboard's
  default), the effects whose ids are in `masterOutputIds`
  are summed into `audioContext.destination` (via a per-rebuild
  GainNode summer). No master wire = silence. This is
  intentional in the patch-cable model: a new effect is silent
  until the user wires it. The visualizer still moves because
  the analyser is attached to a different point in the graph
  than destination.
- **Multiple master outputs are supported.** The manager's
  `masterOutputId` (single id) is replaced by `masterOutputIds`
  (a `Set<string>`). Multiple effects can be masters; they are
  all summed into destination via the same per-rebuild summer
  (so multi-master patches don't create parallel paths that
  don't sum). New API:
  `setMasterOutput(id)` / `unsetMasterOutput(id)` /
  `clearMasterOutput()` / `getMasterOutput()` (returns a Set
  COPY) / `isMasterOutput(id)`. The PatchboardUI draws one
  orange master wire per master effect; clicking a wire's hit
  area removes only THAT effect from the set (so a multi-master
  patch can have just one wire removed without dropping the
  others). Persistence: `serializeProject` writes
  `masterOutputIds: string[]`; `deserializeProject` re-applies
  them after the explicit connections.
- **Live wire highlight during card drag.** As the user drags
  a card over the patchboard, the wire under the pointer (if
  any, within 30px) is highlighted with a bright white + glow
  effect. This gives the user visual feedback that they're
  about to drop on a specific wire. The highlight is
  added/removed by toggling a CSS class (`pb-wire-hit-target`)
  on the wire's hit area — no SVG re-rendering per mousemove.
  New method: `_highlightWireForInsert(connection)`.
- **Cache-busting headers in `index.html`.** ESM modules in
  the browser are cached aggressively. The user was seeing
  the OLD pan range (0..1, where 0.5 is center) after the
  fix to -1..1 (where 0 is center) because the browser
  served the cached old code. Added `Cache-Control: no-store,
  no-cache, must-revalidate` + `Pragma: no-cache` +
  `Expires: 0` to the HTML head. The user needs a hard
  refresh once (Ctrl+Shift+R / Cmd+Shift+R) to pick up the
  new code; after that, the headers keep things fresh.
- **Test count:** 322 passing across 24 files (was 314).
  8 new tests cover the patch-cable model (no auto-wire,
  useChainOrder disabled, explicit connect() draws a wire,
  master wire, master reaches destination, no master = no
  destination, splice creates 2 new explicit connections,
  RangeWidget with negative min). Plus multi-master (3
  tests), wire highlight (2 tests), and the updated master
  tests for the Set model (5 tests).

---

## Key architectural decisions (do not reverse without user input)

- **Latency first.** Keep `latencyHint: 'interactive'`,
  `channelCount: 1`. No filter nodes in the default chain
  (Biquad is added by user, not always-on). Bypass is
  gain-based (see the **Bypass** decision below) — the wet
  path is always wired, and bypass just sets the dry/wet
  gain values.
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
- **Bypass is gain-based, not disconnect-based.** The dry path
  (`input → dryGain → output`) and the wet path
  (`input → [DSP] → effectOutput → wetGain → output`) are
  BOTH wired at all times. Bypass just sets the gains:
  bypassed → `dryGain=1, wetGain=0`; active → `dryGain=1-mix,
  wetGain=mix`. This trades a small CPU cost (the DSP runs
  even in bypass) for a huge reliability win — the previous
  design called `effectOutput.disconnect(specificDest)` on
  bypass, which is not perfectly consistent across browsers
  and was the cause of "I can hear the source alone but not
  through any effect" reports. All effects (Distortion,
  Lowpass, Delay) now default to ACTIVE (`bypass=false`).
- **Wire click breaks the wire, never removes the effect.**
  Every wire is rendered as a pair of SVG paths: a visible
  2px cyan stroke (`pointer-events: none`) and a wide
  invisible 16px hit area (`pointer-events: stroke`) on top.
  Clicking the hit area:
  - For an explicit connection (added via drag-to-wire):
    `ecm.disconnect(from, to, opts)` removes the entry from
    the explicit list. The wire disappears.
  - For a chain-order connection (the default wiring):
    `ecm.breakChain(c.from, c.to)` marks the pair as broken
    (`chainBreaks: Set<"fromId|toId">`). `rebuildAudioGraph`
    skips the pair (no audio path), PatchboardUI stops
    drawing the wire, and BOTH effects stay in the chain.
    The user can re-connect by dragging a new wire between
    the two ports (the `connect()` call re-wires the pair
    explicitly; the dedup against chain order is suspended
    when the pair is broken). There is NO `confirm()` prompt
    — clicking a wire is a single, immediate action.
- **Chain-order breaks are persisted.** `serializeProject`
  writes the manager's `getChainBreaks()` to a top-level
  `breaks: string[]` field. `deserializeProject` re-applies
  them after the explicit connections. No format version
  bump (the field is additive and optional; v1/v2 projects
  with no `breaks` field load fine). `removeEffect` cleans
  up any break whose key references the removed node id.
- **Drag-to-wire has a 10px tolerance.** `_portAt` first tries
  the fast `document.elementsFromPoint` path; on miss (or when
  the API is unavailable — jsdom doesn't ship it), it falls
  back to a scan of every port of the requested role and
  returns the closest one within 10px. A 14x14 port is now
  effectively a ~30x30 drop target. `test/setup.js` polyfills
  `document.elementsFromPoint` to return `[]` so the
  production code's fast path doesn't throw in tests.
- **Container grows to fit cards in BOTH dimensions.**
  `_applyPositions` computes the deepest card's y and the
  rightmost card's x, and sets the container's `min-height`
  to that + ~260px and `min-width` to that + ~300px. The
  default layout is a horizontal row (cards at y=40, x=40 +
  index*280), so overflow is normally horizontal; the height
  growth handles dragged-down cards. The SVG gets
  `overflow: visible` so wires that briefly extend past the
  container's nominal bounds are still drawn. This was the
  "i can't connect newly added nodes" bug: the new card was
  rendered but the wire to it was clipped by the SVG's
  viewBox.

- **Master output is opt-in.** `EffectChainManager` keeps
  the legacy behavior (auto-connect sinks to
  `audioContext.destination`) by default, because the
  existing tests rely on it. The new opt-in flag
  `useMasterOutput: true` switches the manager to the
  explicit-master model: ONLY the effect whose id matches
  `masterOutputId` is wired to `audioContext.destination`;
  no master → no audio. `PatchboardUI` sets this flag in
  its constructor, so the production app is in master
  mode and tests are in legacy mode. The master port is a
  static UI element on the right edge of the container,
  NOT a chain element — it is a visual proxy for the
  manager's `masterOutputId`. The master wire is drawn
  orange to distinguish it from regular effect wires.
  Clicking the master wire is the same gesture as clicking
  a regular wire: a single, immediate action with no
  confirm.

- **Drag-on-wire-to-insert never modifies explicit
  connections authoritatively.** The card is repositioned
  in the chain array (via `ecm.moveEffect(id, idx+1)`),
  which re-derives chain order. If the wire being replaced
  was an EXPLICIT connection, the `ecm.disconnect` is
  called explicitly so there's no parallel-path
  duplication. The user keeps both effects, the chain
  order, and the connection graph consistent.

- **Utility node ("Utility" in the picker) is a utility,
  not an effect.** It performs level, pan, phase-invert,
  and mono downmix on the signal but adds no character of
  its own. The 2x2 gain matrix is a deliberate design
  choice for true mono (not "play one channel"): stereo
  passes through (identity matrix), mono sums both
  channels uniformly into both outputs. The matrix is
  always wired; "mono" only changes gain values. This
  matches the spec for a real-world utility bus.

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
6. `npx vitest run` — confirm 314/314 baseline.
7. Resume work in the **Open / upcoming work** section.
8. Update this file at the top of every new commit.
9. Push to `origin/dev` with `git push origin dev`.

---

## Open questions (deferred — do not act without user)

- None currently. All phases 1-5 of `docs/ARCHITECTURE.md` are
  complete on `dev`. Future work beyond the original plan can
  be proposed by the user.
