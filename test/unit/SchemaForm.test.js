import { describe, it, expect, beforeEach } from "vitest";
import { renderSchemaForm } from "../../ui/SchemaForm.js";
import { DistortionEffect } from "../../effects/DistortionEffect.js";
import { LowpassEffect } from "../../effects/LowpassEffect.js";
import { DelayEffect } from "../../effects/DelayEffect.js";

describe("renderSchemaForm", () => {
  let ctx, dom;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
  });

  it("renders a form with one widget per schema entry", () => {
    const fx = new DistortionEffect(ctx, dom);
    renderSchemaForm(dom, fx);
    // Distortion schema: mix (range), strength (range), type (select) + bypass.
    expect(dom.querySelectorAll("[data-sf-widget]").length).toBe(4);
    expect(dom.querySelectorAll('input[type="range"]').length).toBe(2);
    expect(dom.querySelectorAll("select").length).toBe(1);
    expect(dom.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it("drives effect state through applyConfig on input events", () => {
    const fx = new DistortionEffect(ctx, dom);
    renderSchemaForm(dom, fx);

    // Find the strength slider: it has max=10, the mix slider has max=1.
    const ranges = dom.querySelectorAll('input[type="range"]');
    const strength = [...ranges].find((r) => parseFloat(r.max) === 10);
    expect(strength).toBeTruthy();
    strength.value = "5";
    strength.dispatchEvent(new Event("input"));
    expect(fx.strength).toBe(5);
  });

  it("bypass toggle flips effect.bypass", () => {
    const fx = new DistortionEffect(ctx, dom);
    renderSchemaForm(dom, fx);

    const checkbox = dom.querySelector('input[type="checkbox"]');
    checkbox.checked = false; // uncheck = unbypass
    checkbox.dispatchEvent(new Event("change"));
    expect(fx.bypass).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(fx.bypass).toBe(true);
  });

  it("select widget updates effect type", () => {
    const fx = new DistortionEffect(ctx, dom);
    renderSchemaForm(dom, fx);

    const select = dom.querySelector("select");
    select.value = "hard";
    select.dispatchEvent(new Event("change"));
    expect(fx.type).toBe("hard");
  });

  it("refresh() re-reads effect.getConfig() and updates widgets", () => {
    const fx = new DistortionEffect(ctx, dom);
    const form = renderSchemaForm(dom, fx);

    fx.setStrength(9);
    form.refresh();
    const ranges = dom.querySelectorAll('input[type="range"]');
    const strength = [...ranges].find((r) => parseFloat(r.max) === 10);
    expect(parseFloat(strength.value)).toBe(9);
  });

  it("destroy() removes the form and unbinds", () => {
    const fx = new DistortionEffect(ctx, dom);
    const form = renderSchemaForm(dom, fx);
    expect(dom.querySelector("form.schema-form")).toBeTruthy();
    form.destroy();
    expect(dom.querySelector("form.schema-form")).toBeFalsy();
  });

  it("renders a LowpassEffect with frequency range widget", () => {
    const fx = new LowpassEffect(ctx, dom);
    renderSchemaForm(dom, fx);
    // frequency range + bypass
    const ranges = dom.querySelectorAll('input[type="range"]');
    expect(ranges.length).toBeGreaterThan(0);
    const range = [...ranges].find((r) => parseFloat(r.max) === 16000);
    expect(range).toBeTruthy();
  });

  it("renders a DelayEffect with two ranges and one select-like... actually two ranges", () => {
    const fx = new DelayEffect(ctx, dom);
    renderSchemaForm(dom, fx);
    // delayTime, feedback, mix — three ranges, plus bypass checkbox
    const ranges = dom.querySelectorAll('input[type="range"]');
    expect(ranges.length).toBe(3);
  });
});
