/**
 * PatchboardUI: free-grid, drag-to-wire UI for the audio graph.
 *
 * Replaces PedalboardUI. Each effect is a card positioned by absolute
 * `transform: translate(x, y)` so the user can place it anywhere on
 * the grid. Each card has an output port and an input port rendered
 * as small dots on its edges. A single SVG overlay holds the wires
 * (`<path>` cubic Beziers) that connect outputs to inputs.
 *
 * Interactions:
 *   - Drag a card body to move it. The wires re-route live.
 *   - Drag from an output port to an input port to create a connection.
 *   - Click a card's body to select it (Delete or Backspace removes).
 *   - Click the "+ Add" button to open the manifest picker.
 *   - Click the remove (x) button to remove a card.
 *
 * Why SVG and not Canvas for wires? At <100 wires SVG is faster to
 * author, looks crisp at any device pixel ratio, and the browser
 * does the rendering. Canvas would only win with hundreds of wires.
 *
 * This module is the runtime glue; the EffectChainManager still owns
 * the data (nodes, connections). PatchboardUI just renders it and
 * translates user gestures into `ecm.addEffect` / `ecm.removeEffect`
 * / `ecm.connect` / `ecm.disconnect` / `ecm.moveEffect` calls.
 */
export class PatchboardUI {
  /**
   * @param {object} ecm
   * @param {object} [dom]
   * @param {HTMLElement} [dom.container] - the patchboard area.
   *   Defaults to `ecm.container`. Must have `position: relative`.
   * @param {(card: HTMLElement) => HTMLElement|null} [dom.resolveSourceActions]
   *   - same as PedalboardUI: returns a per-source action bar to
   *   inject into the card (e.g. file picker for InputFile).
   * @param {(manifestId: string) => void} [dom.onAdd] - called when
   *   the user picks an effect from the manifest list. Defaults to
   *   `ecm.addEffect(manifestId)`.
   * @param {(card: HTMLElement) => void} [dom.onContextMenu] - hook
   *   for right-click menus (Phase 4c).
   */
  constructor(ecm, dom = {}) {
    this.ecm = ecm;
    this.container = dom.container ?? ecm.container;
    if (!this.container) {
      throw new Error("PatchboardUI requires a container element");
    }
    this.registry = ecm.registry;
    this._resolveSourceActions = dom.resolveSourceActions ?? null;
    this._onAdd = dom.onAdd ?? ((id) => this.ecm.addEffect(id));

    // The patchboard is the source of truth for the "master
    // output" concept: a single port on the right edge that
    // effects wire to in order to reach the audio destination.
    // If nothing is connected there, no audio reaches the
    // destination. We enable the manager's `useMasterOutput`
    // mode so it requires an explicit master and stops the
    // legacy auto-connect-sinks-to-destination behavior.
    ecm.useMasterOutput = true;

    // The patchboard is also a "patch cables" UI: no chain-order
    // connections are derived. Adding an effect creates an
    // unconnected card; the user wires it to others and to the
    // master port manually. We disable `useChainOrder` so the
    // manager only respects explicit `connect()` calls.
    ecm.useChainOrder = false;

    // Make the container a positioning context for the absolute
    // cards. Set position: relative unconditionally — the CSS
    // already does the same via `.effects-container.patchboard`,
    // but the inline style is the most reliable signal that the
    // patchboard layout is active. (Some environments return
    // empty/unknown from getComputedStyle; trusting that check
    // caused a "cards positioned off-screen" bug in one case.)
    this.container.style.position = "relative";
    this.container.classList.add("patchboard");
    this.container.style.minHeight = "480px";
    this._installHeader();

    this._installSvgOverlay();
    this._installMasterPort();
    this._installPicker();

    // Selection state.
    this.selectedCard = null;
    this._selectionListeners = new Set();

    // Wire save-and-restore: we wrap ecm.onChange so the patchboard
    // re-syncs after every mutation (add/remove/move/clear/connect/
    // disconnect), but we never overwrite a pre-existing onChange
    // (e.g. the history controller's).
    this._originalOnChange = ecm.onChange;
    ecm.onChange = () => {
      if (this._originalOnChange) this._originalOnChange();
      this._sync();
    };

    this._installGlobalKeyHandlers();

    this._sync();
  }

  _installHeader() {
    if (this.container.querySelector(".pb-header")) return;
    const header = document.createElement("div");
    header.className = "pb-header";
    header.innerHTML = `
      <span class="pb-title">Patchboard</span>
      <span class="pb-hint">drag a card to move · drag a port to wire · click any wire to disconnect · drop a card on a wire to insert it · wire an effect to the master port to hear it</span>
    `;
    this.container.appendChild(header);
  }

  _installMasterPort() {
    if (this.container.querySelector(".pb-master-port")) return;
    const port = document.createElement("div");
    port.className = "pb-port pb-port-in pb-master-port";
    port.dataset.effectId = "__master__";
    port.dataset.portId = "in";
    port.dataset.portRole = "in";
    port.dataset.masterPort = "1";
    port.title = "Master Output — wire any effect here to hear it";
    // Position on the right edge of the container, vertically
    // aligned with the cards' port-out dots. The cards are at
    // y=40 with a ~220px height, so the center is y=150. Using
    // a fixed top value keeps the master port stable as cards
    // are added/removed. The port element is 30x30 with
    // `right: 0` so it sits fully inside the container (the
    // container has `overflow: auto` for scrollbars, so
    // negative `right` would clip the port out of view).
    port.style.top = "150px";
    port.style.right = "0px";
    port.style.transform = "translateY(-50%)";
    this.container.appendChild(port);
  }

  _installSvgOverlay() {
    if (this.container.querySelector(".pb-svg")) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("pb-svg");
    svg.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; overflow: visible;";
    // An arrowhead marker for wire direction.
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "pb-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrowPath.setAttribute("fill", "#6cf");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);
    this.container.prepend(svg);
    this._svg = svg;
  }

  _installPicker() {
    const picker = document.createElement("div");
    picker.className = "add-effect-picker";
    picker.innerHTML = `
      <label>
        <span>Add effect:</span>
        <select class="add-effect-select"></select>
      </label>
    `;
    this.container.parentNode?.insertBefore(picker, this.container);
    const select = picker.querySelector("select");
    if (this.registry) {
      for (const manifest of this.registry.list()) {
        const opt = document.createElement("option");
        opt.value = manifest.id;
        opt.textContent = manifest.name ?? manifest.id;
        select.appendChild(opt);
      }
    } else {
      ["distortion", "lowpass", "delay", "input-mic"].forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
      });
    }
    // Add a blank option so the user can re-pick.
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "(choose)";
    select.prepend(blank);
    select.value = "";
    select.addEventListener("change", () => {
      const id = select.value;
      if (id) this._onAdd(id);
      select.value = "";
    });
  }

  _installGlobalKeyHandlers() {
    this._keyHandler = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!this.selectedCard) return;
      const id = this.selectedCard.dataset.effectId;
      if (id) this.ecm.removeEffect(id);
    };
    document.addEventListener("keydown", this._keyHandler);
  }

  /**
   * Subscribe to selection changes. The callback receives the
   * currently selected card element (or null). Returns an
   * unsubscribe function.
   */
  onSelectionChange(fn) {
    this._selectionListeners.add(fn);
    return () => this._selectionListeners.delete(fn);
  }

  _setSelection(card) {
    if (this.selectedCard === card) return;
    if (this.selectedCard) this.selectedCard.classList.remove("selected");
    this.selectedCard = card;
    if (this.selectedCard) this.selectedCard.classList.add("selected");
    for (const fn of this._selectionListeners) fn(this.selectedCard);
  }

  /**
   * Walk every card, ensure it has the patchboard chrome (port dots,
   * grip, remove, source actions, per-effect viz canvas), and apply
   * its position from the chain entry. Then redraw the wires.
   */
  _sync() {
    for (const card of this.container.querySelectorAll(".effect-instance")) {
      this._wireCard(card);
    }
    this._applyPositions();
    this._redrawWires();
  }

  _wireCard(card) {
    if (card.dataset.pbWired) return;
    card.dataset.pbWired = "1";

    // Position absolutely on the patchboard. Set top/left
    // explicitly to 0 so the `transform: translate(x, y)` in
    // `_applyPositions` is the SOLE positioning signal. Without
    // explicit top/left, browsers differ on where an absolute
    // element with no offsets lands (some treat it as "static
    // position in the flow", which is well-defined but easy to
    // misread; we want a single source of truth).
    card.style.position = "absolute";
    card.style.top = "0";
    card.style.left = "0";
    card.style.zIndex = "1";

    // The card body is draggable. mousedown on the body starts a
    // drag-to-move. mousedown on a port starts a drag-to-wire.
    // mousedown on a form control / button does nothing.
    card.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const port = e.target.closest?.(".pb-port");
      if (port) {
        e.preventDefault();
        if (port.classList.contains("pb-port-out")) this._beginWireFromOutput(port, e);
        else if (port.classList.contains("pb-port-in")) this._beginWireToInput(port, e);
        return;
      }
      if (e.target.closest?.("input, select, textarea, button, .pb-remove, .pe-viz, .source-actions, form.schema-form")) {
        return;
      }
      e.preventDefault();
      this._beginMoveCard(card, e);
    });

    // Click selects the card (for keyboard delete).
    card.addEventListener("click", (e) => {
      if (e.target.closest?.("input, select, textarea, button, .pb-remove, .pe-viz, .source-actions, form.schema-form")) {
        return;
      }
      this._setSelection(card);
    });

    // Grip affordance.
    if (!card.querySelector(".pb-grip")) {
      const grip = document.createElement("div");
      grip.className = "pb-grip";
      grip.textContent = "⋮⋮";
      grip.title = "Drag to move";
      grip.setAttribute("aria-hidden", "true");
      card.prepend(grip);
    }

    // Remove button.
    if (!card.querySelector(".pb-remove")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pb-remove";
      btn.textContent = "✕";
      btn.title = "Remove effect";
      btn.setAttribute("aria-label", "Remove effect");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = card.dataset.effectId;
        if (id) this.ecm.removeEffect(id);
      });
      card.appendChild(btn);
    }

    // Per-effect live viz canvas. The runtime's visualization layer
    // looks for `.pe-viz canvas` inside the card; we just make sure
    // the canvas exists.
    if (!card.querySelector(".pe-viz")) {
      const wrap = document.createElement("div");
      wrap.className = "pe-viz";
      const c = document.createElement("canvas");
      c.width = 220;
      c.height = 80;
      wrap.appendChild(c);
      const form = card.querySelector("form.schema-form");
      if (form) card.insertBefore(wrap, form);
      else card.appendChild(wrap);
    }

    // Source-specific action bar.
    if (typeof this._resolveSourceActions === "function") {
      const actions = this._resolveSourceActions(card);
      if (actions && !card.querySelector(".source-actions")) {
        card.appendChild(actions);
      }
    }

    // Port dots. Each card has one dot per declared input/output port.
    // The effect's `getInputPorts()` / `getOutputPorts()` returns the
    // port list; multi-port effects (e.g. ChannelSplitter with L/R
    // outputs) render multiple dots stacked vertically along the
    // card's edges. Sources have no input port (PatchboardUI infers
    // this from the manifest id, since mic/file/oscillator don't
    // expose an upstream feed).
    const effectObj = this.ecm.effectChain.find((e) => e.dom === card);
    if (!effectObj) return;
    const audioNode = effectObj.audioNode;
    const inputPorts = this._isSource(effectObj)
      ? []
      : (typeof audioNode?.getInputPorts === "function" ? audioNode.getInputPorts() : [{ id: "in" }]);
    const outputPorts = typeof audioNode?.getOutputPorts === "function" ? audioNode.getOutputPorts() : [{ id: "out" }];
    this._renderPorts(card, effectObj, "in", inputPorts);
    this._renderPorts(card, effectObj, "out", outputPorts);
  }

  _isSource(effectObj) {
    const id = effectObj.manifestId;
    return id === "input-mic" || id === "input-file" || id === "input-oscillator";
  }

  _renderPorts(card, effectObj, role, ports) {
    if (!ports || ports.length === 0) return;
    const existing = card.querySelectorAll(`.pb-port-${role === "in" ? "in" : "out"}`);
    // For multi-port cards, rebuild the port list each sync. For
    // single-port cards, the existing one is fine.
    if (existing.length === ports.length) return;
    for (const el of existing) el.remove();
    const isInput = role === "in";
    ports.forEach((port, i) => {
      const dot = document.createElement("div");
      dot.className = `pb-port ${isInput ? "pb-port-in" : "pb-port-out"}`;
      dot.dataset.portRole = isInput ? "in" : "out";
      dot.dataset.effectId = effectObj.id;
      dot.dataset.portId = port.id;
      dot.title = port.id;
      // Vertical position. Centered for single port; evenly spaced
      // for multiple.
      const top = ports.length === 1
        ? "50%"
        : `${20 + (i * 60) / Math.max(1, ports.length - 1)}%`;
      dot.style.top = top;
      card.appendChild(dot);
    });
  }

  _applyPositions() {
    let maxY = 0;
    let maxX = 0;
    this.ecm.effectChain.forEach((e, i) => {
      if (!e.position) e.position = this._defaultPosition(i);
      e.dom.style.transform = `translate(${e.position.x}px, ${e.position.y}px)`;
      if (e.position.y > maxY) maxY = e.position.y;
      if (e.position.x > maxX) maxX = e.position.x;
    });
    // Grow the container so every card is visible. Cards are
    // absolutely positioned and don't contribute to the
    // container's intrinsic size, so without this a card at
    // the far right (or bottom) can be clipped by the
    // SVG's viewBox. We add a footer in both dimensions:
    //   - 240px past the deepest card's y (so the last card's
    //     bottom edge + a bit of padding is always visible)
    //   - 280px past the rightmost card's x (so the last card's
    //     right edge + a bit of padding is always visible, and
    //     the wire extending out of the right port has room to
    //     render)
    const cardHeight = 220; // approximate; cards have a 12-16px form, an 80px viz, a 50px header/footer
    const cardWidth = 260;  // approximate; cards have a form with 2-3 columns
    const requiredH = maxY + cardHeight + 40;
    const requiredW = maxX + cardWidth + 40;
    const currentH = parseInt(this.container.style.minHeight || "0", 10);
    if (requiredH > currentH) this.container.style.minHeight = `${requiredH}px`;
    if (requiredW > parseInt(this.container.style.minWidth || "0", 10)) {
      this.container.style.minWidth = `${requiredW}px`;
    }
  }

  _defaultPosition(index) {
    // Place new cards in a horizontal row with a 40px gutter.
    // The runtime can pass `position` to `addEffect()` to override;
    // the PatchboardUI itself sets it via drag. The `index` is the
    // card's position in the chain so each card gets a distinct
    // default (otherwise every card in the same `_applyPositions`
    // call would land on the same spot).
    return { x: 40 + index * 280, y: 40 };
  }

  // ------- Drag-to-move -------

  _beginMoveCard(card, e) {
    const effectObj = this.ecm.effectChain.find((x) => x.dom === card);
    if (!effectObj) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = effectObj.position ?? { x: 0, y: 0 };
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      effectObj.position = {
        x: Math.max(0, startPos.x + dx),
        y: Math.max(0, startPos.y + dy),
      };
      card.style.transform = `translate(${effectObj.position.x}px, ${effectObj.position.y}px)`;
      this._redrawWires();
      // Live highlight: as the card is dragged, find the wire
      // (if any) under the pointer and mark it so the user can
      // see they're about to drop on it. The visual feedback is
      // a class change on the wire's hit area (which the CSS
      // styles with a brighter stroke and a glow).
      const targetWire = this._findWireNear(ev.clientX, ev.clientY);
      this._highlightWireForInsert(targetWire);
    };
    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      // Clear the live highlight regardless of where the drop
      // lands. _redrawWires (via the splice's onChange) will
      // rebuild the wires with the default style.
      this._highlightWireForInsert(null);
      // Drag-on-wire-to-insert: if the user released the card
      // near an existing wire, insert the card into the chain
      // between the wire's endpoints. The original wire is
      // replaced by two new wires (one on each side of the
      // inserted card). This is the "drop a node on top of the
      // wire" interaction: splice it in, delete the old wire.
      const targetWire = this._findWireNear(ev.clientX, ev.clientY);
      if (targetWire) {
        this._insertIntoWire(effectObj, targetWire);
      }
      this.ecm.onChange?.();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  /**
   * Find the wire (chain-order or explicit) closest to the
   * pointer, within a ~30px tolerance. Returns the wire's
   * connection object {from, to, fromPort, toPort} or null.
   * The wire's geometry is approximated from the port centers
   * using the same Bezier as the visual wire; we sample points
   * along the Bezier and return the closest.
   *
   * In `useChainOrder: false` mode (the patchboard's default),
   * only explicit connections are considered — there are no
   * chain-order wires to insert between.
   */
  _findWireNear(clientX, clientY) {
    const TOLERANCE = 30;
    const nodeById = new Map();
    for (const e of this.ecm.effectChain) nodeById.set(e.id, e);
    const candidates = [];
    if (this.ecm.useChainOrder) {
      for (let i = 0; i < this.ecm.effectChain.length - 1; i++) {
        const c = this.ecm._chainOrderConnection(i);
        if (c && !this.ecm.isChainBroken(c.from, c.to)) candidates.push(c);
      }
    }
    for (const c of this.ecm.connections) candidates.push(c);
    let best = null;
    let bestDist = TOLERANCE;
    const containerRect = this.container.getBoundingClientRect();
    for (const c of candidates) {
      const fromNode = nodeById.get(c.from);
      const toNode = nodeById.get(c.to);
      if (!fromNode || !toNode) continue;
      const fromEl = fromNode.dom.querySelector(`.pb-port-out[data-port-id="${c.fromPort}"]`);
      const toEl = toNode.dom.querySelector(`.pb-port-in[data-port-id="${c.toPort}"]`);
      if (!fromEl || !toEl) continue;
      const a = this._portCenter(fromEl);
      const b = this._portCenter(toEl);
      // Sample 16 points along the cubic Bezier and return the
      // closest one to the pointer.
      const d = this._distanceAlongWire(a, b, clientX - containerRect.left, clientY - containerRect.top);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Approximate the distance from a point to a cubic Bezier
   * path by sampling. Cheaper than the analytic formula and
   * accurate enough for a 30px tolerance check.
   */
  _distanceAlongWire(a, b, px, py) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    const c1x = a.x + dx, c1y = a.y;
    const c2x = b.x - dx, c2y = b.y;
    let best = Infinity;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const u = 1 - t;
      const x = u*u*u*a.x + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*b.x;
      const y = u*u*u*a.y + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*b.y;
      const d = Math.hypot(x - px, y - py);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Mark the wire for `connection` as the live insertion target
   * (during a card drag) by adding a CSS class to its hit area
   * path. Pass `null` to clear the highlight. The class is
   * `pb-wire-hit-target`; the corresponding CSS rule lights up
   * the hit area with a brighter color and a glow so the user
   * can see "you're about to drop on this wire". The hit area
   * is wider than the visible wire (16px stroke), so the
   * highlight is also wider than the wire — easier to see.
   *
   * Match is by the connection fields stashed on the hit area
   * by `_redrawWires`. If no hit area matches, the highlight
   * is cleared (e.g. when the card moves away from any wire).
   */
  _highlightWireForInsert(connection) {
    if (!this._svg) return;
    const hits = this._svg.querySelectorAll(".pb-wire-hit");
    for (const hit of hits) {
      const c = hit._connection;
      const match = connection && c
        && c.from === connection.from
        && c.to === connection.to
        && c.fromPort === connection.fromPort
        && c.toPort === connection.toPort;
      if (match) {
        hit.classList.add("pb-wire-hit-target");
      } else {
        hit.classList.remove("pb-wire-hit-target");
      }
    }
  }

  /**
   * Splice `effectObj` between the source and destination of the
   * given wire. The wire itself is removed, and two new wires
   * are created in its place: source → effectObj, effectObj →
   * destination. Both effects stay in the chain; the inserted
   * card is moved to the position right after `wire.from` so the
   * new chain order flows correctly.
   *
   * In `useChainOrder: true` mode, the chain-order derivation
   * provides the new wiring (after moveEffect) and the explicit
   * `connect()` calls are skipped. In `useChainOrder: false` mode
   * (the patchboard's default), the two `connect()` calls are
   * what create the new audio path; the chain order is purely
   * cosmetic.
   */
  _insertIntoWire(effectObj, wire) {
    const fromIdx = this.ecm.effectChain.findIndex((e) => e.id === wire.from);
    const toIdx = this.ecm.effectChain.findIndex((e) => e.id === wire.to);
    if (fromIdx < 0 || toIdx < 0) return;
    // Move the inserted card to the position right after the
    // wire's source. The chain becomes [..., from, NEW, ..., to, ...].
    // The new card is "between" from and to in the audio flow.
    const newIdx = fromIdx + 1;
    const currentIdx = this.ecm.effectChain.findIndex((e) => e.id === effectObj.id);
    if (currentIdx === -1) return;
    if (currentIdx !== newIdx) this.ecm.moveEffect(effectObj.id, newIdx);

    // Always drop the wire we just landed on (whether it was
    // chain-order or explicit). In useChainOrder: false, this
    // is the only way to remove the old audio path. In
    // useChainOrder: true, the chain array has been rearranged
    // so the chain-order derivation will now route through the
    // inserted card; the explicit disconnect prevents a
    // duplicate path.
    try {
      this.ecm.disconnect(wire.from, wire.to, { fromPort: wire.fromPort, toPort: wire.toPort });
    } catch (err) {
      // disconnect() may throw if the connection was a
      // chain-order wire that was never in the explicit list
      // (useChainOrder: true case). That's fine — the chain
      // array has been rearranged and the old chain-order
      // connection no longer exists in any form.
      if (!/not found|chain-order/i.test(String(err?.message ?? err))) {
        console.error("disconnect (insert) failed:", err);
      }
    }

    // In the patch-cable model (useChainOrder: false), the
    // chain-order derivation does NOT create any connections.
    // We must explicitly wire the inserted card into the audio
    // path: source → new, new → destination. The source port
    // and destination port are taken from the original wire.
    if (!this.ecm.useChainOrder) {
      // Don't connect a node to itself. The wire we just landed
      // on may end at the new card (e.g. the user drops a card
      // on a wire that was the only path to it).
      if (wire.from !== effectObj.id) {
        try {
          this.ecm.connect(wire.from, effectObj.id, {
            fromPort: wire.fromPort,
            toPort: wire.toPort,
          });
        } catch (err) {
          if (!/already/i.test(String(err?.message ?? err))) {
            console.error("connect (insert, source side) failed:", err);
          }
        }
      }
      if (wire.to !== effectObj.id) {
        try {
          this.ecm.connect(effectObj.id, wire.to, {
            fromPort: wire.fromPort,
            toPort: wire.toPort,
          });
        } catch (err) {
          if (!/already/i.test(String(err?.message ?? err))) {
            console.error("connect (insert, dest side) failed:", err);
          }
        }
      }
    }
  }

  // ------- Drag-to-wire -------

  _beginWireFromOutput(portEl, e) {
    const fromId = portEl.dataset.effectId;
    const fromPort = portEl.dataset.portId;
    // Ghost path that follows the mouse.
    const ghost = document.createElementNS("http://www.w3.org/2000/svg", "path");
    ghost.setAttribute("class", "pb-wire-ghost");
    ghost.setAttribute("fill", "none");
    ghost.setAttribute("stroke", "#6cf");
    ghost.setAttribute("stroke-width", "2");
    ghost.setAttribute("stroke-dasharray", "4 3");
    this._svg.appendChild(ghost);

    const fromRect = portEl.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const start = {
      x: fromRect.left + fromRect.width / 2 - containerRect.left,
      y: fromRect.top + fromRect.height / 2 - containerRect.top,
    };

    const onMove = (ev) => {
      const end = {
        x: ev.clientX - containerRect.left,
        y: ev.clientY - containerRect.top,
      };
      ghost.setAttribute("d", this._wirePath(start, end));
      // Highlight valid drop targets.
      this._highlightTargets(fromId, fromPort, ev.clientX, ev.clientY);
    };
    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      ghost.remove();
      this._clearHighlights();
      const drop = this._portAt(ev.clientX, ev.clientY, "in");
      if (drop && drop.dataset.effectId !== fromId) {
        if (drop.dataset.masterPort === "1") {
          // Drop on the master port: set the source effect as
          // the master output. The wire from the effect to the
          // master port is drawn by _redrawWires on the next
          // sync (triggered by setMasterOutput -> onChange).
          try {
            this.ecm.setMasterOutput(fromId);
          } catch (err) {
            console.error("setMasterOutput failed:", err);
          }
        } else {
          try {
            this.ecm.connect(fromId, drop.dataset.effectId, {
              fromPort,
              toPort: drop.dataset.portId,
            });
          } catch (err) {
            console.error("connect failed:", err);
          }
        }
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  _beginWireToInput(portEl, e) {
    // Same as dragging from output, just reversed. We support both
    // directions for ergonomics.
    this._beginWireFromOutput(portEl, e);
  }

  /**
   * Find the input port element under the pointer (or null). A
   * small tolerance (~10px) is applied: ports are 14x14 dots on
   * the edges of cards, and the user shouldn't have to aim
   * pixel-perfectly at a 14px target while a wire is dangling
   * from their cursor. The tolerance also helps when the ghost
   * wire visually overlaps the port and the browser hands
   * `elementsFromPoint` a hit on the SVG layer instead of the
   * port.
   * @returns {HTMLElement|null}
   */
  _portAt(clientX, clientY, role) {
    // First try an exact hit.
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      if (el.classList?.contains("pb-port") && el.dataset.portRole === role) {
        return el;
      }
    }
    // Fallback: scan every port of the requested role and find
    // the closest one within 10px of the pointer. This makes
    // drop targeting forgiving without needing a "snap to port"
    // animation.
    let best = null;
    let bestDist = 10;
    for (const port of this.container.querySelectorAll(`.pb-port-${role}`)) {
      const r = port.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - clientX;
      const dy = cy - clientY;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        best = port;
        bestDist = d;
      }
    }
    return best;
  }

  _highlightTargets(fromId, _fromPort, clientX, clientY) {
    this._clearHighlights();
    const drop = this._portAt(clientX, clientY, "in");
    if (drop && drop.dataset.effectId !== fromId) {
      drop.classList.add("pb-port-drop-target");
    }
  }

  _clearHighlights() {
    for (const el of this.container.querySelectorAll(".pb-port-drop-target")) {
      el.classList.remove("pb-port-drop-target");
    }
  }

  // ------- Wire rendering -------

  /**
   * Build a cubic Bezier path from (x1,y1) to (x2,y2). The control
   * points pull horizontally to give the wire a smooth S-curve
   * that reads well as a left-to-right signal flow.
   */
  _wirePath(a, b) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  /**
   * Get the screen-space center of a port, in container-relative
   * coordinates (matches the SVG overlay's coordinate system).
   */
  _portCenter(el) {
    const r = el.getBoundingClientRect();
    const c = this.container.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - c.left,
      y: r.top + r.height / 2 - c.top,
    };
  }

  /**
   * Wipe the SVG wires layer and redraw every connection from
   * `ecm.connections`. In `useChainOrder: true` mode, chain-order
   * connections are also drawn. In `useChainOrder: false` mode
   * (the patchboard's default), only explicit connections are
   * drawn — the user wires everything by hand. Wires are layered
   * behind cards (z-index 0 on the SVG).
   */
  _redrawWires() {
    if (!this._svg) return;
    // Remove old wires but keep the <defs> (arrowhead marker).
    for (const child of [...this._svg.childNodes]) {
      if (child.nodeName.toLowerCase() === "path") child.remove();
    }
    const nodeById = new Map();
    for (const e of this.ecm.effectChain) nodeById.set(e.id, e);

    // Build the effective connection set:
    //   - In useChainOrder: include chain-order (minus breaks)
    //   - Always include explicit connections
    const effective = [];
    if (this.ecm.useChainOrder) {
      for (let i = 0; i < this.ecm.effectChain.length - 1; i++) {
        const c = this.ecm._chainOrderConnection(i);
        if (c && !this.ecm.isChainBroken(c.from, c.to)) {
          effective.push(c);
        }
      }
    }
    for (const c of this.ecm.connections) effective.push(c);

    for (const c of effective) {
      const fromNode = nodeById.get(c.from);
      const toNode = nodeById.get(c.to);
      if (!fromNode || !toNode) continue;
      const fromEl = fromNode.dom.querySelector(`.pb-port-out[data-port-id="${c.fromPort}"]`);
      const toEl = toNode.dom.querySelector(`.pb-port-in[data-port-id="${c.toPort}"]`);
      if (!fromEl || !toEl) continue;
      const a = this._portCenter(fromEl);
      const b = this._portCenter(toEl);
      const d = this._wirePath(a, b);

      // Visible wire (thin, 2px). pointer-events: none so the
      // hit-area path below receives the click.
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "pb-wire");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#6cf");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("marker-end", "url(#pb-arrow)");
      path.setAttribute("d", d);
      this._svg.appendChild(path);

      // Wider invisible hit area on top. Users can click anywhere
      // within ~8px of the visible wire to disconnect, not just
      // exactly on the 2px stroke.
      const isExplicit = this.ecm.connections.some(
        (x) => x.from === c.from && x.to === c.to && x.fromPort === c.fromPort && x.toPort === c.toPort
      );
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "pb-wire-hit");
      hit.setAttribute("d", d);
      hit.setAttribute("stroke-width", "16");
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("fill", "none");
      hit.setAttribute("pointer-events", "stroke");
      // Stash the connection on the element itself so tests and
      // future code can identify which wire a hit area belongs
      // to without having to re-parse the SVG path geometry.
      hit._connection = c;
      hit._isExplicit = isExplicit;
      hit.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (isExplicit) {
          try {
            this.ecm.disconnect(c.from, c.to, { fromPort: c.fromPort, toPort: c.toPort });
          } catch (err) {
            console.error("disconnect failed:", err);
          }
        } else {
          // Chain-order wire: clicking breaks the chain-order
          // connection (no audio path, no wire drawn) but
          // PRESERVES both effects. The user can re-connect by
          // dragging a new wire between the two ports, which
          // re-uses the standard connect() path. The two
          // effects themselves stay where they are and the
          // chain array is unchanged.
          try {
            this.ecm.breakChain(c.from, c.to);
          } catch (err) {
            console.error("breakChain failed:", err);
          }
        }
      });
      this._svg.appendChild(hit);
    }

    // Master wires: one per master effect. Drawn from each
    // master effect's output port to the master port. Orange
    // (#fc6) to distinguish them from the cyan patch wires.
    // Clicking a master wire's hit area removes that SPECIFIC
    // effect from the master set (so a multi-master patch can
    // have just one wire removed without dropping the others).
    // To clear all masters, the user can right-click the master
    // port or use a separate UI affordance (out of scope here).
    const masterPortEl = this.container.querySelector(".pb-master-port");
    if (masterPortEl && this.ecm.masterOutputIds.size > 0) {
      for (const id of this.ecm.masterOutputIds) {
        const masterEffect = nodeById.get(id);
        if (!masterEffect) continue;
        const fromEl = masterEffect.dom.querySelector('.pb-port-out[data-port-id="out"]');
        if (!fromEl) continue;
        const a = this._portCenter(fromEl);
        const b = this._portCenter(masterPortEl);
        const d = this._wirePath(a, b);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "pb-master-wire");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#fc6");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("marker-end", "url(#pb-arrow)");
        path.setAttribute("d", d);
        this._svg.appendChild(path);
        // Clickable hit area for removing THIS effect from the
        // master set.
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hit.setAttribute("class", "pb-master-wire-hit");
        hit.setAttribute("d", d);
        hit.setAttribute("stroke-width", "16");
        hit.setAttribute("fill", "none");
        hit.setAttribute("pointer-events", "stroke");
        hit._isMasterWire = true;
        hit._masterEffectId = id;
        hit.addEventListener("click", (ev) => {
          ev.stopPropagation();
          try {
            this.ecm.unsetMasterOutput(id);
          } catch (err) {
            console.error("unsetMasterOutput failed:", err);
          }
        });
        this._svg.appendChild(hit);
      }
    }
  }

  /**
   * Detach event listeners and restore the manager's onChange hook.
   */
  destroy() {
    this.ecm.onChange = this._originalOnChange;
    document.removeEventListener("keydown", this._keyHandler);
    for (const card of this.container.querySelectorAll(".effect-instance")) {
      delete card.dataset.pbWired;
    }
  }
}
