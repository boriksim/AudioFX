import { describe, it, expect, beforeEach, vi } from "vitest";
import { PedalboardUI } from "../../ui/PedalboardUI.js";
import { EffectChainManager } from "../../core/EffectChainManager.js";
import { PluginRegistry } from "../../core/PluginRegistry.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { LowpassEffect } from "../../effects/LowpassEffect.js";

function makeManager() {
  document.body.innerHTML = '<div id="effects-container"></div>';
  const ctx = new AudioContext();
  globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve("<div>x</div>") });
  const registry = new PluginRegistry()
    .register(DistortionEffect)
    .register(LowpassEffect);
  return new EffectChainManager(ctx, "#effects-container", registry, { useSchemaUI: true });
}

/** A minimal stub of DataTransfer that meets the API we use. */
function makeDataTransfer(payload) {
  const data = {};
  return {
    getData: (type) => (type === "text/plain" ? payload : ""),
    setData: (type, value) => { data[type] = value; },
    effectAllowed: "move",
    dropEffect: "move",
    types: ["text/plain"],
  };
}

/** Dispatch a drag event with a stub DataTransfer. */
function drag(target, type, payload = "", clientY = 0) {
  const dt = makeDataTransfer(payload);
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dt });
  Object.defineProperty(event, "clientY", { value: clientY });
  target.dispatchEvent(event);
  return { event, dt };
}

describe("PedalboardUI", () => {
  let ecm, pedalboard;

  beforeEach(async () => {
    ecm = makeManager();
    await ecm.addEffect("distortion");
    await ecm.addEffect("lowpass");
    pedalboard = new PedalboardUI(ecm);
  });

  it("renders an add-effect picker populated from the registry", () => {
    const select = document.querySelector(".add-effect-picker select");
    expect(select).toBeTruthy();
    const options = [...select.options].map((o) => o.value);
    expect(options).toContain("distortion");
    expect(options).toContain("lowpass");
  });

  it("selecting an option adds that effect to the chain", async () => {
    const select = document.querySelector(".add-effect-picker select");
    select.value = "lowpass";
    await select.dispatchEvent(new Event("change"));
    // Existing lowpass + the new one.
    await new Promise((r) => setTimeout(r, 0));
    expect(ecm.effectChain.length).toBe(3);
    expect(ecm.effectChain[2].manifestId).toBe("lowpass");
  });

  it("each card has a remove button that calls removeEffect", () => {
    const card = ecm.effectChain[0].dom;
    const removeBtn = card.querySelector(".pb-remove");
    expect(removeBtn).toBeTruthy();
    removeBtn.click();
    expect(ecm.effectChain.length).toBe(1);
    expect(ecm.effectChain[0].manifestId).toBe("lowpass");
  });

  it("dragover/drop on a card triggers moveEffect with the correct index", () => {
    const cards = ecm.effectChain.map((e) => e.dom);
    const sourceId = cards[0].dataset.effectId; // distortion
    const targetCard = cards[1]; // lowpass
    // Mock getBoundingClientRect so dragover decides "before" or "after".
    targetCard.getBoundingClientRect = () => ({
      top: 0,
      bottom: 100,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
    });
    // clientY=80 -> bottom half -> drop-after -> newIdx = 1+1 = 2
    drag(targetCard, "dragover", "", 80);
    drag(targetCard, "drop", sourceId, 80);
    // Originally [d, l], after moving d to index 2 -> [l, d]
    expect(ecm.effectChain[0].manifestId).toBe("lowpass");
    expect(ecm.effectChain[1].manifestId).toBe("distortion");
  });

  it("drop on the top half of a card inserts before it", () => {
    const cards = ecm.effectChain.map((e) => e.dom);
    // Source is the second card (lowpass), target is the first (distortion).
    // Dropping lowpass on the top half of distortion moves lowpass to
    // index 0 -> [lowpass, distortion].
    const sourceId = cards[1].dataset.effectId;
    const targetCard = cards[0];
    targetCard.getBoundingClientRect = () => ({
      top: 0,
      bottom: 100,
      left: 0,
      right: 0,
      width: 0,
      height: 100,
    });
    // clientY=10 -> top half -> drop-before -> newIdx = 0
    drag(targetCard, "dragover", "", 10);
    drag(targetCard, "drop", sourceId, 10);
    expect(ecm.effectChain[0].manifestId).toBe("lowpass");
    expect(ecm.effectChain[1].manifestId).toBe("distortion");
  });

  it("dropping a card on itself is a no-op", () => {
    const cards = ecm.effectChain.map((e) => e.dom);
    const id = cards[0].dataset.effectId;
    const moveSpy = vi.spyOn(ecm, "moveEffect");
    cards[0].getBoundingClientRect = () => ({
      top: 0, bottom: 100, left: 0, right: 0, width: 0, height: 100,
    });
    drag(cards[0], "drop", id, 50);
    expect(moveSpy).not.toHaveBeenCalled();
  });

  it("cards get the bypassed class when their effect is bypassed", () => {
    // The first effect is Distortion, which is created with setBypassed(true).
    // The second is Lowpass, created un-bypassed. Use the Lowpass card.
    const card = ecm.effectChain[1].dom;
    expect(card.classList.contains("bypassed")).toBe(false);
    // Toggle bypass via the schema form's checkbox — that's the path
    // the real UI takes, and it routes through manager.onChange.
    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(card.classList.contains("bypassed")).toBe(true);
  });

  it("destroy() restores the manager's onChange hook", () => {
    // Set onChange BEFORE constructing PedalboardUI so it captures it.
    const ecm2 = makeManager();
    const original = () => {};
    ecm2.onChange = original;
    const pb = new PedalboardUI(ecm2);
    pb.destroy();
    expect(ecm2.onChange).toBe(original);
  });
});
