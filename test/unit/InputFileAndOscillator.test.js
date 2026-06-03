import { describe, it, expect, beforeEach, vi } from "vitest";
import { InputFile } from "../../effects/InputFile.js";
import { InputOscillator } from "../../effects/InputOscillator.js";

/**
 * Helper: build a context whose `decodeAudioData` returns a fake
 * AudioBuffer. The polyfill in test/setup.js doesn't implement
 * decodeAudioData, so we tack one on per-test.
 */
function makeDecodingContext() {
  const ctx = new AudioContext();
  ctx.decodeAudioData = vi.fn(async () => ({
    duration: 1.5,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: 66150,
    getChannelData: () => new Float32Array(66150),
  }));
  return ctx;
}

describe("InputFile", () => {
  it("declares a manifest with id 'input-file' and category 'source'", () => {
    expect(InputFile.manifest.id).toBe("input-file");
    expect(InputFile.manifest.category).toBe("source");
    expect(InputFile.manifest.outputChannels).toBe(2);
  });

  it("starts empty (no buffer, not playing)", () => {
    const ctx = new AudioContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    expect(fx.buffer).toBeNull();
    expect(fx.playing).toBe(false);
    expect(fx.getOutputNode()).toBe(fx.gainNode);
  });

  it("getInputNode returns null (sources are leaves)", () => {
    const fx = new InputFile(new AudioContext(), document.createElement("div"));
    expect(fx.getInputNode()).toBeNull();
  });

  it("loadFile decodes an ArrayBuffer and stores the buffer", async () => {
    const ctx = makeDecodingContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    const buf = new ArrayBuffer(8);
    const result = await fx.loadFile(buf);
    expect(result.duration).toBe(1.5);
    expect(fx.buffer).toBeTruthy();
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
  });

  it("loadFile accepts a File-shaped object with arrayBuffer()", async () => {
    const ctx = makeDecodingContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    const fakeFile = { arrayBuffer: async () => new ArrayBuffer(4) };
    await fx.loadFile(fakeFile);
    expect(fx.buffer).toBeTruthy();
  });

  it("play() with no buffer is a no-op", () => {
    const fx = new InputFile(makeDecodingContext(), document.createElement("div"));
    expect(fx.play()).toBe(false);
  });

  it("play() after loadFile starts a BufferSource", async () => {
    const ctx = makeDecodingContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    await fx.loadFile(new ArrayBuffer(8));
    // Track start() calls by patching the prototype so we see the call
    // regardless of which source instance play() builds.
    const starts = [];
    const proto = Object.getPrototypeOf(fx.source);
    const origStart = proto.start;
    proto.start = function (...args) { starts.push(args); return origStart.apply(this, args); };
    try {
      expect(fx.play()).toBe(true);
      expect(starts).toContainEqual([0]);
      expect(fx.playing).toBe(true);
    } finally {
      proto.start = origStart;
    }
  });

  it("stop() halts playback and disconnects the source", async () => {
    const ctx = makeDecodingContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    await fx.loadFile(new ArrayBuffer(8));
    fx.play();
    const src = fx.source;
    const stop = vi.spyOn(src, "stop");
    const disconnect = vi.spyOn(src, "disconnect");
    fx.stop();
    expect(stop).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(fx.playing).toBe(false);
    expect(fx.source).toBeNull();
  });

  it("applyConfig sets gain and loop; loop propagates to live source", async () => {
    const ctx = makeDecodingContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    await fx.loadFile(new ArrayBuffer(8));
    fx.play();
    fx.applyConfig({ gain: 0.42, loop: true });
    expect(fx.gainNode.gain.value).toBeCloseTo(0.42);
    expect(fx.loop).toBe(true);
    expect(fx.source.loop).toBe(true);
  });

  it("getConfig returns gain/loop/hasBuffer/duration", async () => {
    const fx = new InputFile(makeDecodingContext(), document.createElement("div"));
    expect(fx.getConfig().hasBuffer).toBe(false);
    expect(fx.getConfig().duration).toBe(0);
    await fx.loadFile(new ArrayBuffer(8));
    const c = fx.getConfig();
    expect(c.hasBuffer).toBe(true);
    expect(c.duration).toBe(1.5);
  });

  it("getConfigSchema exposes gain + loop", () => {
    const fx = new InputFile(new AudioContext(), document.createElement("div"));
    const schema = fx.getConfigSchema();
    expect(schema.gain.type).toBe("range");
    expect(schema.gain.min).toBe(0);
    expect(schema.gain.max).toBe(2);
    expect(schema.loop.type).toBe("toggle");
  });

  it("destroy stops the source and disconnects output", async () => {
    const ctx = makeDecodingContext();
    const fx = new InputFile(ctx, document.createElement("div"));
    await fx.loadFile(new ArrayBuffer(8));
    fx.play();
    fx.destroy();
    expect(fx.playing).toBe(false);
  });
});

describe("InputOscillator", () => {
  it("declares a manifest with id 'input-oscillator' and category 'source'", () => {
    expect(InputOscillator.manifest.id).toBe("input-oscillator");
    expect(InputOscillator.manifest.category).toBe("source");
  });

  it("constructor starts the oscillator (with gain 0)", () => {
    const ctx = new AudioContext();
    const fx = new InputOscillator(ctx, document.createElement("div"));
    expect(fx.osc).toBeTruthy();
    expect(fx.gainNode.gain.value).toBe(0);
    expect(fx.started).toBe(true);
    expect(typeof fx.osc.start).toBe("function");
  });

  it("getInputNode returns null (sources are leaves)", () => {
    const fx = new InputOscillator(new AudioContext(), document.createElement("div"));
    expect(fx.getInputNode()).toBeNull();
  });

  it("setFrequency clamps to [20, 20000]", () => {
    const fx = new InputOscillator(new AudioContext(), document.createElement("div"));
    fx.setFrequency(5);
    expect(fx.osc.frequency.value).toBe(20);
    fx.setFrequency(50000);
    expect(fx.osc.frequency.value).toBe(20000);
    fx.setFrequency(880);
    expect(fx.osc.frequency.value).toBe(880);
  });

  it("setType accepts only the four valid waveforms", () => {
    const fx = new InputOscillator(new AudioContext(), document.createElement("div"));
    fx.setType("sawtooth");
    expect(fx.osc.type).toBe("sawtooth");
    fx.setType("not-a-wave");
    expect(fx.osc.type).toBe("sawtooth");
  });

  it("applyConfig clamps gain to [0, 1] and updates freq/type", () => {
    const fx = new InputOscillator(new AudioContext(), document.createElement("div"));
    fx.applyConfig({ frequency: 220, type: "square", gain: 0.7 });
    expect(fx.osc.frequency.value).toBe(220);
    expect(fx.osc.type).toBe("square");
    expect(fx.gainNode.gain.value).toBe(0.7);
    fx.applyConfig({ gain: 5 });
    expect(fx.gainNode.gain.value).toBe(1);
    fx.applyConfig({ gain: -1 });
    expect(fx.gainNode.gain.value).toBe(0);
  });

  it("getConfig reflects current oscillator state", () => {
    const fx = new InputOscillator(new AudioContext(), document.createElement("div"));
    const c = fx.getConfig();
    expect(c.frequency).toBe(440);
    expect(c.type).toBe("sine");
    expect(c.gain).toBe(0);
  });

  it("getConfigSchema exposes type/frequency/gain", () => {
    const fx = new InputOscillator(new AudioContext(), document.createElement("div"));
    const s = fx.getConfigSchema();
    expect(s.type.type).toBe("select");
    expect(s.type.options).toContain("sawtooth");
    expect(s.frequency.min).toBe(20);
    expect(s.frequency.max).toBe(20000);
    expect(s.gain.max).toBe(1);
  });
});
