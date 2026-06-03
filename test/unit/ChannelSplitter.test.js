/**
 * Tests for ChannelSplitter: 1 input -> 2 output ports (L, R).
 *
 * Verifies port declarations, per-port node lookup, and config
 * schema. The graph-model integration (manager.connect() routing
 * a specific port) is exercised in PatchboardUI.test.js.
 */
import { describe, it, expect, beforeEach } from "vitest";
import ChannelSplitter from "../../effects/ChannelSplitter.js";

describe("ChannelSplitter", () => {
  let ctx, splitter;

  beforeEach(() => {
    ctx = new AudioContext();
    splitter = new ChannelSplitter(ctx);
  });

  it("declares a single input port ('in')", () => {
    expect(splitter.getInputPorts()).toEqual([{ id: "in" }]);
  });

  it("declares two output ports ('L' and 'R')", () => {
    expect(splitter.getOutputPorts()).toEqual([{ id: "L" }, { id: "R" }]);
  });

  it("returns the merger for the input port", () => {
    expect(splitter.getInputNode("in")).toBe(splitter.merger);
  });

  it("returns gainL for the L output port", () => {
    expect(splitter.getOutputNode("L")).toBe(splitter.gainL);
  });

  it("returns gainR for the R output port", () => {
    expect(splitter.getOutputNode("R")).toBe(splitter.gainR);
  });

  it("falls back to gainL when no port id is given to getOutputNode", () => {
    expect(splitter.getOutputNode()).toBe(splitter.gainL);
  });

  it("exposes a config schema for both gains", () => {
    const schema = splitter.getConfigSchema();
    const ids = schema.map((s) => s.id);
    expect(ids).toContain("gainL");
    expect(ids).toContain("gainR");
  });

  it("getConfig() returns both gains at their current values", () => {
    const cfg = splitter.getConfig();
    expect(cfg.gainL).toBeCloseTo(1);
    expect(cfg.gainR).toBeCloseTo(1);
  });

  it("applyConfig() updates gains", () => {
    splitter.applyConfig({ gainL: 0.5, gainR: 0.25 });
    expect(splitter.gainL.gain.value).toBeCloseTo(0.5);
    expect(splitter.gainR.gain.value).toBeCloseTo(0.25);
  });

  it("applyConfig() with no params is a no-op", () => {
    splitter.applyConfig({});
    expect(splitter.gainL.gain.value).toBeCloseTo(1);
    expect(splitter.gainR.gain.value).toBeCloseTo(1);
  });

  it("has a valid manifest with the expected id and version", () => {
    const m = ChannelSplitter.manifest;
    expect(m.id).toBe("channel-splitter");
    expect(m.version).toBe("1.0.0");
    expect(m.name).toBeTruthy();
  });

  it("can be connected to two downstream nodes in parallel", () => {
    const lSink = ctx.createGain();
    const rSink = ctx.createGain();
    splitter.getOutputNode("L").connect(lSink);
    splitter.getOutputNode("R").connect(rSink);
    // The polyfill records connect calls on the SOURCE's
    // .connections array (a list of destinations). gainL and gainR
    // each have exactly one outgoing connection.
    expect(splitter.gainL.connections.length).toBe(1);
    expect(splitter.gainR.connections.length).toBe(1);
    expect(splitter.gainL.connections[0]).toBe(lSink);
    expect(splitter.gainR.connections[0]).toBe(rSink);
  });
});
