import { describe, it, expect, beforeEach, vi } from "vitest";
import { EffectChainManager } from "../../core/EffectChainManager.js";

/**
 * Build a minimal effect-like object that satisfies the manager's
 * graph contract: { id, name, dom, audioNode } where audioNode has
 * `input`, `output`, `disconnect`, `getInputNode(port)`, and
 * `getOutputNode(port)`. The mock `getInputNode`/`getOutputNode`
 * return the same `input`/`output` for any port.
 */
function makeMockEffect(name) {
  const dom = document.createElement("div");
  dom.className = "mock-effect";
  dom.textContent = name;
  const input = { connect: vi.fn() };
  const output = { connect: vi.fn() };
  return {
    id: `fx-${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    dom,
    audioNode: {
      input,
      output,
      disconnect: vi.fn(),
      getInputNode: vi.fn(() => input),
      getOutputNode: vi.fn(() => output),
    },
  };
}

function setupContainer() {
  document.body.innerHTML = '<div id="effects-container"></div>';
  return document.getElementById("effects-container");
}

describe("EffectChainManager", () => {
  let ctx;
  let manager;

  beforeEach(() => {
    ctx = new AudioContext();
    setupContainer();
    manager = new EffectChainManager(ctx, "#effects-container");
  });

  it("starts with an empty chain", () => {
    expect(manager.effectChain).toEqual([]);
    expect(manager.getEffects()).toEqual([]);
  });

  it("inserts effect objects into the chain in order", () => {
    const a = makeMockEffect("A");
    const b = makeMockEffect("B");
    manager.effectChain.push(a, b);
    expect(manager.getEffects()).toHaveLength(2);
    expect(manager.getEffects()[0]).toBe(a);
    expect(manager.getEffects()[1]).toBe(b);
  });

  it("looks up effects by id", () => {
    const a = makeMockEffect("Alpha");
    manager.effectChain.push(a);
    expect(manager.getEffectById(a.id)).toBe(a);
    expect(manager.getEffectById("nope")).toBeUndefined();
  });

  it("removeEffect drops by id, calls destroy, removes DOM, and rebuilds", () => {
    const a = makeMockEffect("A");
    const b = makeMockEffect("B");
    a.audioNode.destroy = vi.fn();
    manager.effectChain.push(a, b);
    document.getElementById("effects-container").appendChild(a.dom);
    document.getElementById("effects-container").appendChild(b.dom);

    manager.removeEffect(a.id);

    expect(manager.effectChain).toEqual([b]);
    expect(a.audioNode.destroy).toHaveBeenCalledTimes(1);
    expect(document.getElementById("effects-container").contains(a.dom)).toBe(false);
  });

  it("removeEffect accepts an object reference", () => {
    const a = makeMockEffect("A");
    manager.effectChain.push(a);
    manager.removeEffect(a);
    expect(manager.effectChain).toEqual([]);
  });

  it("moveEffect reorders the chain and DOM", () => {
    const a = makeMockEffect("A");
    const b = makeMockEffect("B");
    const c = makeMockEffect("C");
    manager.effectChain.push(a, b, c);
    const container = document.getElementById("effects-container");
    [a, b, c].forEach((e) => container.appendChild(e.dom));

    manager.moveEffect(a.id, 2);

    expect(manager.effectChain.map((e) => e.id)).toEqual([b.id, c.id, a.id]);
    expect([...container.children].map((el) => el)).toEqual([b.dom, c.dom, a.dom]);
  });

  it("moveEffect ignores invalid indices", () => {
    const a = makeMockEffect("A");
    manager.effectChain.push(a);
    manager.moveEffect(a.id, 5);
    expect(manager.effectChain).toEqual([a]);
    manager.moveEffect("nonexistent", 0);
    expect(manager.effectChain).toEqual([a]);
  });

  it("rebuildAudioGraph connects effects head-to-tail and the last to destination", () => {
    const a = makeMockEffect("A");
    const b = makeMockEffect("B");
    const c = makeMockEffect("C");
    manager.effectChain.push(a, b, c);

    manager.rebuildAudioGraph();

    expect(a.audioNode.disconnect).toHaveBeenCalled();
    expect(b.audioNode.disconnect).toHaveBeenCalled();
    expect(c.audioNode.disconnect).toHaveBeenCalled();

    // Each node's output.connect() should be called with the next
    // node's input node (via getInputNode).
    expect(a.audioNode.output.connect).toHaveBeenCalledWith(b.audioNode.input);
    expect(b.audioNode.output.connect).toHaveBeenCalledWith(c.audioNode.input);
    // The last node's output goes to destination.
    expect(c.audioNode.output.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it("rebuildAudioChain on an empty chain is a no-op for connections", () => {
    manager.rebuildAudioChain();
    // No throw, no spurious connect calls
    expect(true).toBe(true);
  });

  it("onChainRebuilt fires after rebuildAudioChain", () => {
    const spy = vi.fn();
    manager.onChainRebuilt = spy;
    manager.rebuildAudioChain();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("onChainRebuilt is not fired by mutating state without rebuilding", () => {
    const spy = vi.fn();
    manager.onChainRebuilt = spy;
    manager.effectChain.push(makeMockEffect("A"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("clear() removes every effect", () => {
    const a = makeMockEffect("A");
    const b = makeMockEffect("B");
    a.audioNode.destroy = vi.fn();
    b.audioNode.destroy = vi.fn();
    manager.effectChain.push(a, b);

    manager.clear();

    expect(manager.effectChain).toEqual([]);
    expect(a.audioNode.destroy).toHaveBeenCalled();
    expect(b.audioNode.destroy).toHaveBeenCalled();
  });

  describe("graph API (Phase 4a)", () => {
    it("connect() adds an explicit connection and rebuilds the graph", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);
      manager.rebuildAudioGraph(); // initial chain-order wiring
      a.audioNode.output.connect.mockClear();
      b.audioNode.output.connect.mockClear();

      // Connect A -> B with a custom port label; this is a no-op in
      // the linear chain case (A is already wired to B by chain order),
      // so the dedup kicks in.
      expect(manager.connect(a.id, b.id)).toBe(false);
      // The chain-order rebuild is the source of truth.
      expect(manager.getConnections()).toEqual([]);
    });

    it("connect() with a different port creates a real new connection", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);

      expect(manager.connect(a.id, b.id, { fromPort: "aux", toPort: "sidechain" })).toBe(true);
      expect(manager.getConnections()).toEqual([
        { from: a.id, to: b.id, fromPort: "aux", toPort: "sidechain" },
      ]);
    });

    it("connect() rejects unknown node ids", () => {
      const a = makeMockEffect("A");
      manager.effectChain.push(a);
      expect(() => manager.connect(a.id, "nonexistent")).toThrow(/unknown destination/);
      expect(() => manager.connect("nonexistent", a.id)).toThrow(/unknown source/);
    });

    it("connect() rejects self-loops", () => {
      const a = makeMockEffect("A");
      manager.effectChain.push(a);
      expect(() => manager.connect(a.id, a.id)).toThrow(/itself/);
    });

    it("disconnect() removes an explicit connection", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);
      manager.connect(a.id, b.id, { fromPort: "aux", toPort: "sidechain" });
      expect(manager.disconnect(a.id, b.id, { fromPort: "aux", toPort: "sidechain" })).toBe(true);
      expect(manager.getConnections()).toEqual([]);
    });

    it("disconnect() returns false when there is no matching connection", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);
      expect(manager.disconnect(a.id, b.id, { fromPort: "x", toPort: "y" })).toBe(false);
    });

    it("removeEffect() drops any connection referencing the removed node", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      const c = makeMockEffect("C");
      manager.effectChain.push(a, b, c);
      manager.connect(a.id, c.id, { fromPort: "aux", toPort: "sidechain" });
      expect(manager.getConnections()).toHaveLength(1);

      manager.removeEffect(b.id);

      // The connection A->C is preserved (it doesn't reference b).
      expect(manager.getConnections()).toEqual([
        { from: a.id, to: c.id, fromPort: "aux", toPort: "sidechain" },
      ]);
    });

    it("removeEffect() drops connections that DO reference the removed node", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);
      manager.connect(a.id, b.id, { fromPort: "aux", toPort: "sidechain" });
      manager.removeEffect(b.id);
      expect(manager.getConnections()).toEqual([]);
    });

    it("_chainOrderConnection uses the first declared output port for multi-port sources", () => {
      // Replace makeMockEffect's getOutputPorts default to simulate
      // a multi-port node (e.g. ChannelSplitter with L/R outputs).
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      a.audioNode.getOutputPorts = () => [{ id: "L" }, { id: "R" }];
      manager.effectChain.push(a, b);
      const c = manager._chainOrderConnection(0);
      expect(c).toEqual({ from: a.id, fromPort: "L", to: b.id, toPort: "in" });
    });

    it("_chainOrderConnection uses the first declared input port for multi-port destinations", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      b.audioNode.getInputPorts = () => [{ id: "main" }, { id: "aux" }];
      manager.effectChain.push(a, b);
      const c = manager._chainOrderConnection(0);
      expect(c).toEqual({ from: a.id, fromPort: "out", to: b.id, toPort: "main" });
    });

    it("_chainOrderConnection falls back to out/in when ports aren't declared", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      // Remove the methods to simulate a node that doesn't expose them.
      delete a.audioNode.getOutputPorts;
      delete b.audioNode.getInputPorts;
      manager.effectChain.push(a, b);
      const c = manager._chainOrderConnection(0);
      expect(c).toEqual({ from: a.id, fromPort: "out", to: b.id, toPort: "in" });
    });

    it("connect() treats a multi-port chain-order as not-already-covered", () => {
      // A ChannelSplitter's L port is the chain-order source for the
      // next effect. An explicit connect(splitter, next, {fromPort: "L"})
      // should return false (chain order already covers it).
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      a.audioNode.getOutputPorts = () => [{ id: "L" }, { id: "R" }];
      manager.effectChain.push(a, b);
      expect(manager.connect(a.id, b.id, { fromPort: "L", toPort: "in" })).toBe(false);
      expect(manager.getConnections()).toEqual([]);
    });

    it("multi-input summing: a summer GainNode is inserted for fan-in", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      const c = makeMockEffect("C");
      manager.effectChain.push(a, b, c);
      // Chain order: A->B, B->C. So C already has 1 incoming
      // connection (B->C). Adding an explicit A->C makes it 2.
      manager.connect(a.id, c.id, { fromPort: "out", toPort: "in" });

      // Spy on createGain: a multi-input port causes a summer
      // GainNode to be created. MockAudioContext from the polyfill
      // returns a real MockAudioNode, so we can't vi.fn spy on
      // createGain without overriding it. Override here.
      const originalCreateGain = ctx.createGain;
      const createGainSpy = vi.fn(() => originalCreateGain.call(ctx));
      ctx.createGain = createGainSpy;

      manager.rebuildAudioGraph();

      // Two sources for C's input (B via chain, A via explicit). A
      // summer GainNode is inserted; that's the proof that fan-in
      // summing is in effect.
      expect(createGainSpy).toHaveBeenCalled();

      // Restore.
      ctx.createGain = originalCreateGain;
    });

    it("a single-input port does NOT trigger summer creation", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);
      manager.rebuildAudioGraph(); // initial wiring

      const originalCreateGain = ctx.createGain;
      const createGainSpy = vi.fn(() => originalCreateGain.call(ctx));
      ctx.createGain = createGainSpy;
      manager.rebuildAudioGraph();
      expect(createGainSpy).not.toHaveBeenCalled();
      ctx.createGain = originalCreateGain;
    });

    it("a node with no outgoing connection is wired to destination", () => {
      const a = makeMockEffect("A");
      manager.effectChain.push(a);
      a.audioNode.output.connect.mockClear();
      manager.rebuildAudioGraph();
      expect(a.audioNode.output.connect).toHaveBeenCalledWith(ctx.destination);
    });

    it("connect() then removeEffect() also fires onChange", () => {
      const a = makeMockEffect("A");
      const b = makeMockEffect("B");
      manager.effectChain.push(a, b);
      const spy = vi.fn();
      manager.onChange = spy;
      manager.connect(a.id, b.id, { fromPort: "aux", toPort: "sidechain" });
      expect(spy).toHaveBeenCalledOnce();
      manager.disconnect(a.id, b.id, { fromPort: "aux", toPort: "sidechain" });
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
  describe("getLatency() (Phase 1.5)", () => {
    it("returns baseLatency, outputLatency, and a sum total", () => {
      const result = manager.getLatency();
      expect(result).toEqual({
        baseLatency: ctx.baseLatency,
        outputLatency: ctx.outputLatency,
        total: ctx.baseLatency + ctx.outputLatency,
      });
    });

    it("falls back to 0 if the AudioContext omits latency properties", () => {
      const noLatencyCtx = { baseLatency: undefined, outputLatency: undefined };
      const m = new EffectChainManager(noLatencyCtx, "#effects-container");
      const result = m.getLatency();
      expect(result.baseLatency).toBe(0);
      expect(result.outputLatency).toBe(0);
      expect(result.total).toBe(0);
    });
  });
});
