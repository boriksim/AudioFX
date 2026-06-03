/**
 * PedalboardUI: drag-to-reorder, add-effect picker, remove buttons,
 * visual bypass indicator.
 *
 * This module is responsible for everything that turns the bare DOM
 * list of effect cards (mounted by the EffectChainManager) into a
 * usable pedalboard. It listens to the manager's `onChange` to keep
 * itself in sync after every mutation — including mutations it
 * didn't make itself (preset load, undo/redo).
 *
 * Why HTML5 drag-and-drop and not a custom pointer-events system?
 * Because nothing about this interaction benefits from custom
 * handling. The browser's native DnD is accessible, ships with a
 * touch-action story, and is well-understood by users.
 */
export class PedalboardUI {
  /**
   * @param {object} ecm - the EffectChainManager.
   * @param {object} [dom] - DOM hooks.
   * @param {HTMLElement} [dom.container] - element holding the cards.
   * @param {HTMLElement} [dom.addPicker] - element to render the picker into.
   *   If absent, a new `<div>` is appended before the container.
   */
  constructor(ecm, dom = {}) {
    this.ecm = ecm;
    this.container = dom.container ?? ecm.container;
    if (!this.container) {
      throw new Error("PedalboardUI requires a container element");
    }
    this.registry = ecm.registry;
    this._installPicker(dom.addPicker);
    this._resolveSourceActions = dom.resolveSourceActions ?? null;
    this._unsubscribe = ecm.onChange
      ? null // we wrap this below
      : null;
    // The manager's onChange is a single function. We don't want to
    // overwrite any user-provided hook (e.g. the history controller),
    // so we save-and-restore it across our own calls.
    this._originalOnChange = ecm.onChange;
    ecm.onChange = () => {
      if (this._originalOnChange) this._originalOnChange();
      this._sync();
    };
    this._sync();
  }

  _installPicker(existing) {
    const picker = existing ?? document.createElement("div");
    picker.classList.add("add-effect-picker");
    picker.innerHTML = `
      <label>
        <span>Add effect:</span>
        <select class="add-effect-select"></select>
      </label>
    `;
    if (!existing && this.container.parentNode) {
      this.container.parentNode.insertBefore(picker, this.container);
    }
    const select = picker.querySelector("select");
    if (this.registry) {
      for (const manifest of this.registry.list()) {
        const opt = document.createElement("option");
        opt.value = manifest.id;
        opt.textContent = manifest.name ?? manifest.id;
        select.appendChild(opt);
      }
    } else {
      // No registry: fall back to the legacy class-name picker so the
      // tool still works with old code paths.
      ["distortion", "lowpass", "delay", "input-mic"].forEach((id) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = id;
        select.appendChild(opt);
      });
    }
    select.addEventListener("change", () => {
      const id = select.value;
      if (id) this.ecm.addEffect(id).catch((err) => console.error("addEffect failed:", err));
      select.value = ""; // reset so picking the same effect again still fires
    });
  }

  _sync() {
    // Wire drag/remove/bypass on every card.
    for (const card of this.container.querySelectorAll(".effect-instance")) {
      if (!card.dataset.pbWired) {
        this._wireCard(card);
        card.dataset.pbWired = "1";
      }
      this._refreshCardState(card);
    }
  }

  _wireCard(card) {
    // The card body is a DROP target only. The grip element is the
    // sole DRAG source. This is the only way to fully decouple card
    // reorder from control interaction: the browser never starts a
    // drag on the card's sliders/selects/buttons because none of
    // them are draggable, and the grip is the only thing that is.
    card.setAttribute("draggable", "false");
    card.addEventListener("dragstart", (e) => {
      // Should never fire (the card isn't draggable), but guard
      // against future code that flips the attribute.
      e.preventDefault();
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = card.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      card.classList.toggle("drop-before", before);
      card.classList.toggle("drop-after", !before);
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drop-before", "drop-after");
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drop-before", "drop-after");
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === card.dataset.effectId) return;
      const targetIdx = [...this.container.children].indexOf(card);
      const rect = card.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      const newIdx = before ? targetIdx : targetIdx + 1;
      this.ecm.moveEffect(draggedId, newIdx);
    });

    // Remove button — appended once.
    if (!card.querySelector(".pb-remove")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pb-remove";
      btn.textContent = "✕";
      btn.title = "Remove effect";
      btn.setAttribute("aria-label", "Remove effect");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.ecm.removeEffect(card.dataset.effectId);
      });
      card.appendChild(btn);
    }

    // Drag handle indicator — a small grippy top-left affordance.
    // This is the ONLY draggable area on the card. The card itself
    // has draggable="false" so sliders, selects, and buttons never
    // trigger a card drag.
    if (!card.querySelector(".pb-grip")) {
      const grip = document.createElement("div");
      grip.className = "pb-grip";
      grip.textContent = "⋮⋮";
      grip.title = "Drag to reorder";
      grip.setAttribute("draggable", "true");
      grip.setAttribute("aria-hidden", "true");
      grip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", card.dataset.effectId);
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
      });
      grip.addEventListener("dragend", () => {
        card.classList.remove("dragging");
      });
      card.prepend(grip);
    }

    // Per-effect live viz canvas. The runtime's visualization layer
    // looks for `.pe-viz canvas` inside the card and wires it to the
    // appropriate renderer; we just make sure the canvas exists.
    if (!card.querySelector(".pe-viz")) {
      const wrap = document.createElement("div");
      wrap.className = "pe-viz";
      const c = document.createElement("canvas");
      c.width = 220;
      c.height = 80;
      wrap.appendChild(c);
      // Insert above the schema form so the viz is visible at the top.
      const form = card.querySelector("form.schema-form");
      if (form) card.insertBefore(wrap, form);
      else card.appendChild(wrap);
    }

    // Source-specific action bar (file picker for InputFile, etc.).
    if (typeof this._resolveSourceActions === "function") {
      const actions = this._resolveSourceActions(card);
      if (actions && !card.querySelector(".source-actions")) {
        card.appendChild(actions);
      }
    }
  }

  _refreshCardState(card) {
    const effectObj = this.ecm.effectChain.find((e) => e.dom === card);
    if (!effectObj) return;
    const bypassed = !!effectObj.audioNode?.bypass;
    card.classList.toggle("bypassed", bypassed);
  }

  /**
   * Detach all event listeners and revert the manager's onChange hook.
   */
  destroy() {
    this.ecm.onChange = this._originalOnChange;
    this.container.querySelectorAll(".effect-instance").forEach((card) => {
      delete card.dataset.pbWired;
    });
  }
}
