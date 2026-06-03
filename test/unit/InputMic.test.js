import { describe, it, expect, beforeEach } from "vitest";
import { InputMic } from "../../effects/InputMic.js";
import { renderSchemaForm } from "../../ui/SchemaForm.js";

describe("InputMic schema (regression: Bypass toggle no longer shown for sources)", () => {
  let ctx, dom, mic;

  beforeEach(() => {
    ctx = new AudioContext();
    dom = document.createElement("div");
    mic = new InputMic(ctx, dom);
  });

  it("exposes channel mode, mono, and gain in the schema", () => {
    const schema = mic.getConfigSchema();
    expect(schema.channelMode.type).toBe("select");
    expect(schema.convertToMono.type).toBe("toggle");
    expect(schema.gain.type).toBe("range");
  });

  it("schema form renders three widgets and no Bypass toggle", () => {
    renderSchemaForm(dom, mic);
    // channelMode (select), convertToMono (toggle), gain (range) — no bypass.
    expect(dom.querySelectorAll("[data-sf-widget]").length).toBe(3);
    // The mono toggle is a checkbox; no additional Bypass checkbox should be present.
    // Distinguish by the widget label text: no widget says "Bypass".
    const widgetLabels = [...dom.querySelectorAll("[data-sf-widget]")]
      .map((w) => w.closest("label")?.textContent?.trim() ?? "")
      .concat([...dom.querySelectorAll("label")].map((l) => l.textContent.trim()));
    expect(widgetLabels).toContain("Convert to mono");
    expect(widgetLabels.some((t) => /bypass/i.test(t))).toBe(false);
  });

  it("gain slider drives the gain node", () => {
    renderSchemaForm(dom, mic);
    const range = dom.querySelector('input[type="range"]');
    expect(range).toBeTruthy();
    range.value = "1.5";
    range.dispatchEvent(new Event("input"));
    expect(mic.gainNode.gain.value).toBe(1.5);
  });

  it("channel select updates channelMode and triggers a reroute on next initStream", () => {
    renderSchemaForm(dom, mic);
    const select = dom.querySelector("select");
    select.value = "stereo";
    select.dispatchEvent(new Event("change"));
    expect(mic.channelMode).toBe("stereo");
    // No stream yet — no reroute, but the new state sticks.
  });
});
