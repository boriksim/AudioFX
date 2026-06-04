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
      <span class="pb-hint">drag a card to move · drag a port to wire · click any wire to disconnect</span>
    `;
    this.container.appendChild(header);
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
      dot.dataset.portRole = isInput ? "input" : "output";
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
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      this.ecm.onChange?.();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
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
        try {
          this.ecm.connect(fromId, drop.dataset.effectId, {
            fromPort,
            toPort: drop.dataset.portId,
          });
        } catch (err) {
          console.error("connect failed:", err);
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
   * `ecm.connections`. Chain-order connections are also drawn
   * (they're the default wiring). Wires are layered behind cards
   * (z-index 0 on the SVG).
   */
  _redrawWires() {
    if (!this._svg) return;
    // Remove old wires but keep the <defs> (arrowhead marker).
    for (const child of [...this._svg.childNodes]) {
      if (child.nodeName.toLowerCase() === "path") child.remove();
    }
    const nodeById = new Map();
    for (const e of this.ecm.effectChain) nodeById.set(e.id, e);

    // Build the effective connection set (chain order + explicit),
    // EXCLUDING chain-order connections the user has explicitly
    // broken via `ecm.breakChain()`. Broken chain-order pairs are
    // not wired in audio AND not drawn in the UI. Explicit
    // connections are never affected by chain breaks.
    const effective = [];
    for (let i = 0; i < this.ecm.effectChain.length - 1; i++) {
      const c = this.ecm._chainOrderConnection(i);
      if (c && !this.ecm.isChainBroken(c.from, c.to)) {
        effective.push(c);
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
