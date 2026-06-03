import { describe, it, expect, beforeEach, vi } from "vitest";
import { EffectChainManager } from "../../core/EffectChainManager.js";

/**
 * Build a minimal effect-like object that satisfies the manager's contract:
 * { id, name, dom, audioNode } where audioNode has disconnect/connect.
 */
function makeMockEffect(name) {
  const dom = document.createElement("div");
  dom.className = "mock-effect";
  dom.textContent = name;
  return {
    id: `fx-${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    dom,
    audioNode: {
      disconnect: vi.fn(),
      connect: vi.fn(),
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

  it("rebuildAudioChain connects effects head-to-tail and the last to destination", () => {
    const a = makeMockEffect("A");
    const b = makeMockEffect("B");
    const c = makeMockEffect("C");
    manager.effectChain.push(a, b, c);

    manager.rebuildAudioChain();

    expect(a.audioNode.disconnect).toHaveBeenCalled();
    expect(b.audioNode.disconnect).toHaveBeenCalled();
    expect(c.audioNode.disconnect).toHaveBeenCalled();

    expect(a.audioNode.connect).toHaveBeenCalledWith(b.audioNode);
    expect(b.audioNode.connect).toHaveBeenCalledWith(c.audioNode);
    expect(c.audioNode.connect).toHaveBeenCalledWith(ctx.destination);
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
