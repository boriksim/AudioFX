import { describe, it, expect, beforeEach } from "vitest";
import { RangeWidget } from "../../ui/widgets/Range.js";
import { SelectWidget } from "../../ui/widgets/Select.js";
import { ToggleWidget } from "../../ui/widgets/Toggle.js";

/** Minimal binding the widgets can use. */
function makeBinding(initial) {
  let value = initial;
  const listeners = [];
  return {
    getValue: () => value,
    setValue: (v) => {
      value = v;
      for (const fn of listeners) fn(v);
    },
    onChange: (fn) => listeners.push(fn),
    get value() { return value; },
  };
}

describe("RangeWidget", () => {
  it("renders an input[type=range] with the spec's min/max/step", () => {
    const b = makeBinding(0.5);
    const el = RangeWidget({ type: "range", min: 0, max: 1, step: 0.01, name: "mix", label: "Mix" }, b);
    const input = el.querySelector("input");
    expect(input.type).toBe("range");
    expect(input.min).toBe("0");
    expect(input.max).toBe("1");
    expect(input.step).toBe("0.01");
    expect(input.name).toBe("mix");
  });

  it("supports a negative min (e.g. pan from -1 to +1)", () => {
    const b = makeBinding(0);
    const el = RangeWidget({ type: "range", min: -1, max: 1, step: 0.01, name: "pan", label: "Pan" }, b);
    const input = el.querySelector("input");
    expect(input.min).toBe("-1");
    expect(input.max).toBe("1");
    expect(input.value).toBe("0");
    // The thumb should be in the MIDDLE of the slider, not at the
    // left edge (0 must be the center of a -1..+1 slider).
    expect(Number(input.value)).toBeGreaterThan(Number(input.min));
    expect(Number(input.value)).toBeLessThan(Number(input.max));
  });

  it("initial value reflects the binding", () => {
    const b = makeBinding(0.42);
    const el = RangeWidget({ type: "range", min: 0, max: 1, step: 0.01 }, b);
    const input = el.querySelector("input");
    expect(input.value).toBe("0.42");
  });

  it("input event calls setValue and updates the display", () => {
    const b = makeBinding(0);
    const el = RangeWidget({ type: "range", min: 0, max: 1, step: 0.01 }, b);
    const input = el.querySelector("input");
    input.value = "0.75";
    input.dispatchEvent(new Event("input"));
    expect(b.value).toBe(0.75);
    const valueSpan = el.querySelector("[data-sf-value]");
    expect(valueSpan.textContent).toMatch(/0\.75/);
  });

  it("appends the spec's unit to the value text", () => {
    const b = makeBinding(440);
    const el = RangeWidget({ type: "range", min: 100, max: 16000, step: 10, unit: "Hz" }, b);
    const valueSpan = el.querySelector("[data-sf-value]");
    expect(valueSpan.textContent).toMatch(/Hz/);
  });
});

describe("SelectWidget", () => {
  it("renders an option per spec entry", () => {
    const b = makeBinding("soft");
    const el = SelectWidget({ type: "select", options: ["soft", "hard", "tanh"], name: "type", label: "Curve" }, b);
    const select = el.querySelector("select");
    expect([...select.options].map((o) => o.value)).toEqual(["soft", "hard", "tanh"]);
  });

  it("initial selection matches the binding", () => {
    const b = makeBinding("tanh");
    const el = SelectWidget({ type: "select", options: ["soft", "hard", "tanh"] }, b);
    const select = el.querySelector("select");
    expect(select.value).toBe("tanh");
  });

  it("change event calls setValue with the new selection", () => {
    const b = makeBinding("soft");
    const el = SelectWidget({ type: "select", options: ["soft", "hard"] }, b);
    const select = el.querySelector("select");
    select.value = "hard";
    select.dispatchEvent(new Event("change"));
    expect(b.value).toBe("hard");
  });
});

describe("ToggleWidget", () => {
  it("renders a checkbox reflecting the initial value", () => {
    const b = makeBinding(true);
    const el = ToggleWidget({ type: "toggle", name: "bypass", label: "Bypass" }, b);
    const input = el.querySelector("input");
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(true);
  });

  it("change event calls setValue", () => {
    const b = makeBinding(false);
    const el = ToggleWidget({ type: "toggle", name: "bypass" }, b);
    const input = el.querySelector("input");
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(b.value).toBe(true);
  });
});
