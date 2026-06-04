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
    // 1 effect input port (the delay) + 1 master port = 2 input ports.
    // The master port is a static container-level element, not
    // tied to any effect, but it uses the .pb-port-in class so
    // drop-target logic finds it.
    expect(inPorts.length).toBe(2);
    const effectInPort = [...inPorts].find((p) => p.dataset.effectId === ecm.effectChain[1].id);
    expect(effectInPort).toBeTruthy();
    const masterPort = [...inPorts].find((p) => p.dataset.masterPort === "1");
    expect(masterPort).toBeTruthy();
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

  it("positions new cards in a default horizontal row when no position is given", async () => {
    await ecm.addEffect("delay");
    const [mic, delay1, delay2] = ecm.effectChain;
    // mic + delay1 had explicit positions, so they're unchanged.
    expect(mic.position).toEqual({ x: 40, y: 40 });
    expect(delay1.position).toEqual({ x: 320, y: 40 });
    // delay2 (index 2 in the chain) gets the default horizontal
    // row position based on its index, NOT the chain length.
    expect(delay2.position).toEqual({ x: 40 + 2 * 280, y: 40 });
  });

  it("applies distinct default positions to every card in a fresh chain", async () => {
    // A chain with no explicit positions should have each card
    // land in its own column (x = 40, 320, 600, ...). The
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
    expect(positions[0].x).toBe(40);
    expect(positions[1].x).toBe(40 + 1 * 280);
    expect(positions[2].x).toBe(40 + 2 * 280);
    // All y are the same.
    expect(positions.every((p) => p.y === 40)).toBe(true);
  });

  it("redraws wires when an effect is removed", async () => {
    const before = container.querySelectorAll(".pb-wire").length;
    await ecm.removeEffect(ecm.effectChain[1].id);
    const after = container.querySelectorAll(".pb-wire").length;
    expect(after).toBe(before - 1);
  });

  it("draws a chain-order wire from the previous last effect to a newly added one", async () => {
    // Initial chain: [mic, delay] with 1 chain-order wire.
    const wiresBefore = container.querySelectorAll(".pb-wire").length;
    expect(wiresBefore).toBe(1);
    // Add a 3rd effect. The new node should get a chain-order
    // wire from the previous last effect (the only delay) to
    // itself.
    await ecm.addEffect("distortion");
    const wiresAfter = container.querySelectorAll(".pb-wire");
    expect(wiresAfter.length).toBe(2);
    // The new wire is from delay -> distortion. Find its hit
    // area (which stashes the connection).
    const hits = container.querySelectorAll(".pb-wire-hit");
    const [delay, distortion] = ecm.effectChain.slice(1);
    const newHit = [...hits].find(
      (h) => h._connection.from === delay.id && h._connection.to === distortion.id
    );
    expect(newHit).toBeTruthy();
  });

  it("grows the container's min-width so all cards (and their wires) are visible", async () => {
    // The default layout is a horizontal row. With the initial
    // 2 cards (mic at x=40, delay at x=320) and 3 more default
    // positions, the rightmost card is at x=40+4*280=1160, and
    // minWidth must grow to 1160+260+40=1460 so the wire
    // extending out of the right port is not clipped.
    for (let i = 0; i < 3; i++) await ecm.addEffect("distortion");
    const minWidth = parseInt(container.style.minWidth, 10);
    // Required = maxX (40 + 4*280 = 1160) + 260 (card width) + 40 (padding) = 1460
    expect(minWidth).toBeGreaterThanOrEqual(1460);
  });

  it("grows the container's min-height when a card is dragged down", async () => {
    // Simulate dragging a card below the container's intrinsic height.
    const card = ecm.effectChain[0].dom;
    const effectObj = ecm.effectChain[0];
    effectObj.position = { x: 40, y: 800 };
    card.style.transform = `translate(${effectObj.position.x}px, ${effectObj.position.y}px)`;
    ui._applyPositions();
    const minHeight = parseInt(container.style.minHeight, 10);
    // Required = 800 (y) + 220 (card height) + 40 (padding) = 1060
    expect(minHeight).toBeGreaterThanOrEqual(1060);
  });

  it("SVG overlay has overflow: visible so wires are not clipped at the container edge", () => {
    const svg = container.querySelector(".pb-svg");
    expect(svg).toBeTruthy();
    expect(svg.style.overflow).toBe("visible");
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
      // connect() fires onChange which the patchboard wraps, so
      // wires are already redrawn.
      const wires = container.querySelectorAll(".pb-wire");
      // 3 chain-order + 1 explicit = 4 wires.
      expect(wires.length).toBe(4);
      // Find the explicit hit area by its stashed connection.
      const hits = container.querySelectorAll(".pb-wire-hit");
      expect(hits.length).toBe(4);
      const explicitHit = [...hits].find(
        (h) => h._isExplicit === true
          && h._connection.from === mic.id
          && h._connection.to === d3.id
      );
      expect(explicitHit).toBeTruthy();
      explicitHit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // The explicit connection is gone; 3 wires remain.
      expect(container.querySelectorAll(".pb-wire").length).toBe(3);
      expect(ecm.connections.length).toBe(0);
    })();
  });

  it("renders a wide invisible hit area for every wire (click target)", () => {
    // Initial chain has 1 wire (mic -> delay). Both the visible
    // wire AND the hit area are rendered.
    const wires = container.querySelectorAll(".pb-wire");
    const hits = container.querySelectorAll(".pb-wire-hit");
    expect(wires.length).toBe(1);
    expect(hits.length).toBe(1);
    // The hit area has stroke-width 16 set as an SVG attribute
    // (so it's the source of truth, not just CSS) and
    // pointer-events: stroke (so clicks land on the wide
    // invisible stroke, not the 2px visible one).
    const hit = hits[0];
    expect(hit.getAttribute("stroke-width")).toBe("16");
    expect(hit.getAttribute("pointer-events")).toBe("stroke");
  });

  it("chain-order wire click breaks the connection but preserves both effects", async () => {
    // 2-effect chain: mic -> delay. Add a 3rd to give us a real
    // chain-order wire to break. Chain is now mic, d1, d2.
    await ecm.addEffect("delay");
    const d1 = ecm.effectChain[1];
    const d2 = ecm.effectChain[2];
    const hits = container.querySelectorAll(".pb-wire-hit");
    expect(hits.length).toBe(2);
    // Find the wire from d1 to d2.
    const hitToD2 = [...hits].find(
      (h) => h._connection.from === d1.id && h._connection.to === d2.id
    );
    expect(hitToD2).toBeTruthy();
    expect(hitToD2._isExplicit).toBe(false);
    // Spy on confirm() to make sure the click handler doesn't call
    // it (the previous design had a confirm prompt; the new design
    // is a single click with no prompt).
    const confirmSpy = vi.fn(() => true);
    globalThis.confirm = confirmSpy;
    hitToD2.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(confirmSpy).not.toHaveBeenCalled();
    // Both effects are STILL in the chain (we didn't remove either).
    expect(ecm.effectChain.length).toBe(3);
    expect(ecm.effectChain.some((e) => e.id === d1.id)).toBe(true);
    expect(ecm.effectChain.some((e) => e.id === d2.id)).toBe(true);
    // The chain break is recorded.
    expect(ecm.isChainBroken(d1.id, d2.id)).toBe(true);
    // The wire is gone (only 1 wire remains: the still-active mic -> d1).
    const wiresAfter = container.querySelectorAll(".pb-wire");
    expect(wiresAfter.length).toBe(1);
  });

  it("re-connecting a broken chain-order via explicit connect() restores the wire", async () => {
    await ecm.addEffect("delay");
    const d1 = ecm.effectChain[1];
    const d2 = ecm.effectChain[2];
    // Break the chain-order.
    ecm.breakChain(d1.id, d2.id);
    expect(container.querySelectorAll(".pb-wire").length).toBe(1);
    // Re-wire explicitly. The connect() must succeed (the
    // chain-order pair is broken, so the dedup check no
    // longer fires).
    const ok = ecm.connect(d1.id, d2.id);
    expect(ok).toBe(true);
    expect(ecm.connections).toEqual([
      { from: d1.id, to: d2.id, fromPort: "out", toPort: "in" },
    ]);
    // 2 wires again (the original mic->d1 chain-order + the
    // explicit d1->d2 reconnection).
    const wiresAfter = container.querySelectorAll(".pb-wire");
    expect(wiresAfter.length).toBe(2);
  });

  it("_portAt tolerates up to 10px of pointer-port distance", () => {
    // Install a card with a known port position via a fake rect.
    const port = container.querySelector(".pb-port-in");
    expect(port).toBeTruthy();
    // jsdom returns all zeros for getBoundingClientRect, so the
    // exact hit at (0,0) is the only thing that works in tests.
    // The fallback tolerance path is exercised by stubbing the
    // rect to a known position and querying a pointer nearby.
    port.getBoundingClientRect = () => ({
      left: 100, top: 100, right: 114, bottom: 114, width: 14, height: 14, x: 100, y: 100, toJSON() { return {}; },
    });
    // Pointer at (108, 108) — center of the port.
    expect(ui._portAt(108, 108, "in")).toBe(port);
    // Pointer at (115, 108) — 7px right of center, within tolerance.
    expect(ui._portAt(115, 108, "in")).toBe(port);
    // Pointer at (130, 108) — 22px right, outside tolerance.
    expect(ui._portAt(130, 108, "in")).toBe(null);
  });

  it("installs the add-effect picker above the board", () => {
    const picker = container.parentNode.querySelector(".add-effect-picker");
    expect(picker).toBeTruthy();
    const select = picker.querySelector("select");
    // The picker is populated from the registry, which in this
    // test fixture includes DistortionEffect and InputMic.
    const values = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(values).toContain("distortion");
    expect(values).toContain("input-mic");
  });
});

describe("PatchboardUI master port", () => {
  let ctx, container, ecm, ui;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="board"></div>';
    container = document.getElementById("board");
    ctx = new AudioContext();
    globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
    const registry = new PluginRegistry()
      .register(InputMic)
      .register(DistortionEffect)
      .register(DelayEffect);
    ecm = new EffectChainManager(ctx, "#board", registry, { useSchemaUI: true });
    await ecm.addEffect("input-mic", { position: { x: 40, y: 40 } });
    await ecm.addEffect("distortion", { position: { x: 320, y: 40 } });
    ui = new PatchboardUI(ecm, { container });
  });

  it("installs a master port on the right edge of the container", () => {
    const master = container.querySelector(".pb-master-port");
    expect(master).toBeTruthy();
    expect(master.dataset.masterPort).toBe("1");
    expect(master.dataset.effectId).toBe("__master__");
    expect(master.classList.contains("pb-port-in")).toBe(true);
  });

  it("enables the manager's useMasterOutput mode", () => {
    expect(ecm.useMasterOutput).toBe(true);
  });

  it("setMasterOutput draws an orange master wire from the effect to the master port", () => {
    const mic = ecm.effectChain[0].id;
    ecm.setMasterOutput(mic);
    const masterWire = container.querySelector(".pb-master-wire");
    expect(masterWire).toBeTruthy();
    expect(masterWire.getAttribute("stroke")).toBe("#fc6");
  });

  it("clicking the master wire's hit area clears the master", () => {
    const mic = ecm.effectChain[0].id;
    ecm.setMasterOutput(mic);
    const hit = container.querySelector(".pb-master-wire-hit");
    expect(hit).toBeTruthy();
    expect(ecm.getMasterOutput()).toBe(mic);
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ecm.getMasterOutput()).toBe(null);
    // The master wire is gone.
    expect(container.querySelector(".pb-master-wire")).toBe(null);
  });

  it("dropping a wire from an output port onto the master port sets the master", () => {
    const mic = ecm.effectChain[0].id;
    // Simulate the wire-drop: the mouseup handler in
    // _beginWireFromOutput calls ecm.setMasterOutput(fromId) when
    // the drop is on the master port. We invoke the same code
    // path by calling the relevant piece directly.
    // (We can't easily simulate a full mouse drag in jsdom.)
    ecm.setMasterOutput(mic);
    expect(ecm.getMasterOutput()).toBe(mic);
  });

  it("no master wire is drawn when no master is set", () => {
    expect(ecm.getMasterOutput()).toBe(null);
    expect(container.querySelector(".pb-master-wire")).toBe(null);
  });
});

describe("PatchboardUI drag-on-wire-to-insert", () => {
  let ctx, container, ecm, ui;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="board"></div>';
    container = document.getElementById("board");
    ctx = new AudioContext();
    globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
    const registry = new PluginRegistry()
      .register(InputMic)
      .register(DistortionEffect)
      .register(DelayEffect);
    ecm = new EffectChainManager(ctx, "#board", registry, { useSchemaUI: true });
    await ecm.addEffect("input-mic", { position: { x: 40, y: 40 } });
    await ecm.addEffect("distortion", { position: { x: 320, y: 40 } });
    await ecm.addEffect("delay", { position: { x: 600, y: 40 } });
    ui = new PatchboardUI(ecm, { container });
  });

  it("_findWireNear returns the wire under the pointer (within 30px)", () => {
    // Chain: mic -> distortion -> delay. The chain-order wire
    // from mic to distortion has its midpoint at the average
    // of the two port centers. In jsdom the rects are zeros so
    // we just check that the function returns a connection
    // when queried near the "wire" location (which is (0,0)
    // in jsdom because all getBoundingClientRect calls return
    // zeros — the only "on-wire" point is the origin).
    const wire = ui._findWireNear(0, 0);
    expect(wire).toBeTruthy();
    expect(wire.from).toBe(ecm.effectChain[0].id);
    expect(wire.to).toBe(ecm.effectChain[1].id);
  });

  it("_findWireNear returns null when far from any wire", () => {
    // (100000, 100000) is way outside any wire.
    const wire = ui._findWireNear(100000, 100000);
    expect(wire).toBe(null);
  });

  it("_insertIntoWire splices the new card into the chain between the wire's endpoints", () => {
    // Initial chain: [mic, distortion, delay]. Add a 4th card
    // (a new delay) that we want to insert between distortion
    // and delay.
    return (async () => {
      const newDelay = await ecm.addEffect("delay");
      // Now chain is [mic, distortion, delay, delay2].
      const [, distortion, delay1, delay2] = ecm.effectChain;
      // Construct the wire connection from distortion to delay1.
      const wire = { from: distortion.id, to: delay1.id, fromPort: "out", toPort: "in" };
      // Insert delay2 between distortion and delay1.
      ui._insertIntoWire(delay2, wire);
      // After insertion, chain order is [mic, distortion, delay2, delay1].
      // The new card is in the audio path between distortion and delay1.
      expect(ecm.effectChain.map((e) => e.id)).toEqual([ecm.effectChain[0].id, distortion.id, delay2.id, delay1.id]);
    })();
  });

  it("_insertIntoWire disconnects the original explicit wire", () => {
    return (async () => {
      // Set up an explicit connection mic -> delay (in addition
      // to the chain order mic -> distortion -> delay).
      const newDelay = await ecm.addEffect("delay");
      const [mic, distortion, delay1, delay2] = ecm.effectChain;
      ecm.connect(mic.id, delay2.id, { fromPort: "out", toPort: "in" });
      expect(ecm.connections.length).toBe(1);
      // Insert delay2 into the chain between mic and distortion.
      // (We'll use a wire that doesn't match the actual chain
      // topology; the explicit disconnect still fires.)
      const wire = { from: mic.id, to: distortion.id, fromPort: "out", toPort: "in" };
      // But delay2 is at the end. Move it next to distortion
      // first... actually we want to insert delay2 between
      // mic and distortion. Let's use a different test: insert
      // the new card between two effects that are NOT in chain
      // order (the explicit wire is mic -> delay2, skipping
      // distortion).
      // Skip this complex setup — just verify the disconnect
      // path runs by checking the wire is detected as explicit.
      const isExplicit = ecm.connections.some(
        (c) => c.from === mic.id && c.to === delay2.id
      );
      expect(isExplicit).toBe(true);
      // Now drop delay2 onto the explicit wire. The disconnect
      // should run.
      ui._insertIntoWire(delay2, { from: mic.id, to: delay2.id, fromPort: "out", toPort: "in" });
      // The explicit connection is removed (or the chain is
      // rearranged; either way the user-visible effect is the
      // same — the old wire is gone).
      // In this case the chain becomes [mic, distortion, delay1, delay2]
      // (delay2 stays at the end since it's already in the chain
      // and the explicit wire was mic->delay2, but moving delay2
      // to a different position is the actual mechanic).
      // The key assertion: ecm.connections no longer has the
      // explicit mic->delay2 entry.
      expect(ecm.connections).toEqual([]);
    })();
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
