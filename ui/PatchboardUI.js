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

    // Make the container a positioning context for the absolute cards.
    if (getComputedStyle(this.container).position === "static") {
      this.container.style.position = "relative";
    }
    this.container.classList.add("patchboard");
    this.container.style.minHeight = "480px";

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

  _installSvgOverlay() {
    if (this.container.querySelector(".pb-svg")) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("pb-svg");
    svg.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;";
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

    // Position absolutely on the patchboard.
    card.style.position = "absolute";
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

    // Port dots. Each card has an output port on the right and an
    // input port on the left. Sources have no input port; sinks
    // have no output port. The manager's addEffect adds nodes in
    // the right order, but for the patchboard we use the effect's
    // manifest to decide.
    const effectObj = this.ecm.effectChain.find((e) => e.dom === card);
    if (effectObj && !card.querySelector(".pb-port-out")) {
      const out = document.createElement("div");
      out.className = "pb-port pb-port-out";
      out.dataset.portRole = "output";
      out.dataset.effectId = effectObj.id;
      out.dataset.portId = "out";
      out.title = "Output";
      card.appendChild(out);
    }
    if (effectObj && !card.querySelector(".pb-port-in") && !this._isSource(effectObj)) {
      const inp = document.createElement("div");
      inp.className = "pb-port pb-port-in";
      inp.dataset.portRole = "input";
      inp.dataset.effectId = effectObj.id;
      inp.dataset.portId = "in";
      inp.title = "Input";
      card.appendChild(inp);
    }
  }

  _isSource(effectObj) {
    const id = effectObj.manifestId;
    return id === "input-mic" || id === "input-file" || id === "input-oscillator";
  }

  _applyPositions() {
    for (const e of this.ecm.effectChain) {
      if (!e.position) e.position = this._defaultPosition();
      e.dom.style.transform = `translate(${e.position.x}px, ${e.position.y}px)`;
    }
  }

  _defaultPosition() {
    // Stack new cards vertically with a 24px gutter; first one at
    // the patchboard origin. The runtime can pass `position` to
    // override (PatchboardUI itself sets it via drag).
    const idx = this.ecm.effectChain.length;
    return { x: 40, y: 40 + idx * 160 };
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
   * Find the input port element under the pointer (or null).
   * @returns {HTMLElement|null}
   */
  _portAt(clientX, clientY, role) {
    const els = document.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      if (el.classList?.contains("pb-port") && el.dataset.portRole === role) {
        return el;
      }
    }
    return null;
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

    // Build the effective connection set (chain order + explicit).
    const effective = [];
    for (let i = 0; i < this.ecm.effectChain.length - 1; i++) {
      effective.push({
        from: this.ecm.effectChain[i].id,
        fromPort: "out",
        to: this.ecm.effectChain[i + 1].id,
        toPort: "in",
      });
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
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "pb-wire");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#6cf");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("marker-end", "url(#pb-arrow)");
      path.setAttribute("d", this._wirePath(a, b));
      // Click on a wire disconnects it (only for explicit connections).
      const isExplicit = this.ecm.connections.some(
        (x) => x.from === c.from && x.to === c.to && x.fromPort === c.fromPort && x.toPort === c.toPort
      );
      if (isExplicit) {
        path.style.pointerEvents = "stroke";
        path.style.cursor = "pointer";
        path.addEventListener("click", (ev) => {
          ev.stopPropagation();
          try {
            this.ecm.disconnect(c.from, c.to, { fromPort: c.fromPort, toPort: c.toPort });
          } catch (err) {
            console.error("disconnect failed:", err);
          }
        });
      }
      this._svg.appendChild(path);
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
