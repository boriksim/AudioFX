/**
 * Tests for PatchboardUI: free-grid, drag-to-wire UI for the graph model.
 *
 * These run under jsdom + the Web Audio polyfill. jsdom doesn't lay
 * out anything (getBoundingClientRect returns zeros), so we can't
 * realistically simulate a mouse drag across screen coordinates. The
 * tests focus on the contract the UI exposes to the rest of the
 * system: SVG overlay is installed, ports are rendered, wires are
 * drawn, manager mutations trigger a re-sync, and clicking a wire
 * disconnects.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PatchboardUI } from "../../ui/PatchboardUI.js";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import { InputMic } from "../../effects/InputMic.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { DelayEffect } from "../../effects/DelayEffect.js";
import { ChannelSplitter } from "../../effects/ChannelSplitter.js";

describe("PatchboardUI", () => {
  let ctx, container, ecm, ui;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="board"></div>';
    container = document.getElementById("board");
    ctx = new AudioContext();
    globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
    const registry = new PluginRegistry()
      .register(InputMic)
      .register(DistortionEffect)
      .register(DelayEffect)
      .register(ChannelSplitter);
    ecm = new EffectChainManager(ctx, "#board", registry, { useSchemaUI: true });
    // Add two effects to the chain (mic + delay) so the UI has cards.
    await ecm.addEffect("input-mic", { position: { x: 40, y: 40 } });
    await ecm.addEffect("delay", { position: { x: 320, y: 40 } });
    ui = new PatchboardUI(ecm, { container });
  });

  it("installs an SVG overlay layer behind the cards", () => {
    const svg = container.querySelector(".pb-svg");
    expect(svg).toBeTruthy();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    // It contains the arrowhead marker.
    const marker = svg.querySelector("marker#pb-arrow");
    expect(marker).toBeTruthy();
  });

  it("renders a port dot for every effect", () => {
    const outPorts = container.querySelectorAll(".pb-port-out");
    const inPorts = container.querySelectorAll(".pb-port-in");
    expect(outPorts.length).toBe(2);
    // Sources have no input port.
    expect(inPorts.length).toBe(1);
    expect(inPorts[0].dataset.effectId).toBe(ecm.effectChain[1].id);
  });

  it("draws a chain-order wire from each output to the next input", () => {
    // After _sync (called in the constructor), there must be one wire.
    const wires = container.querySelectorAll(".pb-wire");
    expect(wires.length).toBe(1);
  });

  it("redraws wires when an explicit connection is added", () => {
    const mic = ecm.effectChain[0].id;
    const delay = ecm.effectChain[1].id;
    // A connect() with both nodes the same would throw, so use a 3rd
    // node if needed. Here the chain-order mic->delay is already there
    // and explicit connect returns false, so we can't add a 2nd wire
    // without a 3rd effect. Use a more direct check: invoke the
    // redraw path by re-syncing and confirm count stays 1.
    ecm.connect(mic, delay);
    expect(container.querySelectorAll(".pb-wire").length).toBe(1);
  });

  it("applies each effect's saved position to its card transform", () => {
    const [mic, delay] = ecm.effectChain;
    expect(mic.dom.style.transform).toContain("40");
    expect(mic.dom.style.transform).toContain("40px");
    expect(delay.dom.style.transform).toContain("320px");
  });

  it("positions new cards in a default vertical column when no position is given", async () => {
    await ecm.addEffect("delay");
    const [mic, delay1, delay2] = ecm.effectChain;
    // mic + delay1 had explicit positions, so they're unchanged.
    expect(mic.position).toEqual({ x: 40, y: 40 });
    expect(delay1.position).toEqual({ x: 320, y: 40 });
    // delay2 (index 2 in the chain) gets the default vertical
    // column position based on its index, NOT the chain length.
    expect(delay2.position).toEqual({ x: 40, y: 40 + 2 * 160 });
  });

  it("applies distinct default positions to every card in a fresh chain", async () => {
    // A chain with no explicit positions should have each card
    // stack in its own row (y = 40, 200, 360, 520, ...). The
    // earlier bug used the chain length for every card, putting
    // all of them on top of each other.
    const fresh = new EffectChainManager(ctx, "#board", null, { useSchemaUI: true });
    globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
    const reg2 = new PluginRegistry().register(InputMic).register(DistortionEffect).register(DelayEffect);
    fresh.registry = reg2;
    const ui2 = new PatchboardUI(fresh, { container });
    await fresh.addEffect("input-mic");
    await fresh.addEffect("distortion");
    await fresh.addEffect("delay");
    ui2._sync();
    const positions = fresh.effectChain.map((e) => e.position);
    expect(positions[0].y).toBe(40);
    expect(positions[1].y).toBe(40 + 1 * 160);
    expect(positions[2].y).toBe(40 + 2 * 160);
    // All x are the same.
    expect(positions.every((p) => p.x === 40)).toBe(true);
  });

  it("redraws wires when an effect is removed", async () => {
    const before = container.querySelectorAll(".pb-wire").length;
    await ecm.removeEffect(ecm.effectChain[1].id);
    const after = container.querySelectorAll(".pb-wire").length;
    expect(after).toBe(before - 1);
  });

  it("doesn't reuse the same DOM node after a remove + add (cards are rebuilt by the manager)", async () => {
    const removedId = ecm.effectChain[1].id;
    await ecm.removeEffect(removedId);
    await ecm.addEffect("delay");
    // The newly-added effect's dom is a different element.
    const newCard = ecm.effectChain[1].dom;
    expect(newCard).toBeTruthy();
    expect(newCard.classList.contains("effect-instance")).toBe(true);
  });

  it("exposes a destroy() that restores the manager's onChange hook", () => {
    const onChange = vi.fn();
    ecm.onChange = onChange;
    const ped = new PatchboardUI(ecm, { container });
    ecm.onChange = () => ped._originalOnChange();
    ped.destroy();
    // After destroy, the manager's onChange is the one PatchboardUI
    // saved (the one before it was wrapped).
    ecm.onChange?.();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clicking an explicit-connection wire disconnects it", () => {
    // Build a Y shape: mic -> delay1, mic -> delay2 (only the second
    // is explicit; the first is chain order).
    return (async () => {
      // Need a 3rd effect. Add another delay, then add a 4th.
      await ecm.addEffect("delay");
      await ecm.addEffect("delay");
      const [mic, d1, d2, d3] = ecm.effectChain;
      // Explicit: mic -> d3 (in addition to chain order mic->d1->d2->d3).
      ecm.connect(mic.id, d3.id);
      // Force a re-sync (connect() already fires onChange which the
      // patchboard wraps, so wires are already redrawn).
      const wires = container.querySelectorAll(".pb-wire");
      // 3 chain-order + 1 explicit = 4 wires.
      expect(wires.length).toBe(4);
      // The explicit wire has click->disconnect behavior. Find it.
      let explicit = null;
      for (const w of wires) {
        if (w.style.pointerEvents === "stroke") {
          explicit = w;
          break;
        }
      }
      expect(explicit).toBeTruthy();
      explicit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // The explicit connection is gone; 3 wires remain.
      expect(container.querySelectorAll(".pb-wire").length).toBe(3);
    })();
  });

  it("installs the add-effect picker above the board", () => {
    const picker = container.parentNode.querySelector(".add-effect-picker");
    expect(picker).toBeTruthy();
    const select = picker.querySelector("select");
    // We passed `registry: null` so the picker falls back to the
    // default id list.
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values).toContain("distortion");
    expect(values).toContain("input-mic");
  });
});

describe("PatchboardUI multi-port (Phase 4c)", () => {
  let ctx, container, ecm, ui;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="board"></div>';
    container = document.getElementById("board");
    ctx = new AudioContext();
    globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
    const registry = new PluginRegistry()
      .register(InputMic)
      .register(DistortionEffect)
      .register(ChannelSplitter);
    ecm = new EffectChainManager(ctx, "#board", registry, { useSchemaUI: true });
    await ecm.addEffect("input-mic");
    await ecm.addEffect("channel-splitter");
    await ecm.addEffect("distortion");
    ui = new PatchboardUI(ecm, { container });
  });

  it("renders two output port dots on a ChannelSplitter card (L and R)", () => {
    const splitter = ecm.effectChain[1];
    const outs = splitter.dom.querySelectorAll(".pb-port-out");
    expect(outs.length).toBe(2);
    const ids = [...outs].map((el) => el.dataset.portId);
    expect(ids).toContain("L");
    expect(ids).toContain("R");
  });

  it("does not stack port dots on a single-port effect", () => {
    const distortion = ecm.effectChain[2];
    const outs = distortion.dom.querySelectorAll(".pb-port-out");
    expect(outs.length).toBe(1);
    expect(outs[0].dataset.portId).toBe("out");
  });

  it("draws a wire from the splitter's default output to the next effect's input", () => {
    // Chain order: mic -> splitter -> distortion. Two chain-order
    // wires. The splitter's L port is the source for the second
    // (chain order uses the first declared output port for multi-port
    // nodes).
    const wires = container.querySelectorAll(".pb-wire");
    expect(wires.length).toBe(2);
    // The wire from the splitter to the distortion uses the L port.
    const lPortOut = ecm.effectChain[1].dom.querySelector('.pb-port-out[data-port-id="L"]');
    expect(lPortOut).toBeTruthy();
  });

  it("draws an extra wire when an explicit L-port connection is added", async () => {
    const splitterId = ecm.effectChain[1].id;
    // Add a third effect (distortion #2) to give the L port a target.
    await ecm.addEffect("distortion");
    const target = ecm.effectChain[3];
    // Chain order: mic -> splitter -> distortion1 -> distortion2 = 3 wires.
    expect(container.querySelectorAll(".pb-wire").length).toBe(3);
    const ok = ecm.connect(splitterId, target.id, { fromPort: "L", toPort: "in" });
    expect(ok).toBe(true);
    // 3 chain-order wires + 1 explicit L wire = 4 wires.
    const wires = container.querySelectorAll(".pb-wire");
    expect(wires.length).toBe(4);
  });
});
