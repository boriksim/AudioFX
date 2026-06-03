// Lightweight Web Audio API polyfill for tests.
// We don't run real audio in tests; we just need the graph-construction calls
// to succeed and nodes to be inspectable. Methods are no-ops unless overridden.

class MockAudioParam {
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  cancelScheduledValues() {}
}

class MockAudioNode {
  constructor(context, type) {
    this.context = context;
    this.type = type;
    this.connections = [];
  }
  connect(destination) {
    this.connections.push(destination);
    return destination;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockAnalyserNode extends MockAudioNode {
  constructor(context) {
    super(context, "AnalyserNode");
    this._fftSize = 2048;
  }
  get fftSize() { return this._fftSize; }
  set fftSize(v) { this._fftSize = v; }
  get frequencyBinCount() { return this._fftSize / 2; }
  getByteFrequencyData(array) {
    for (let i = 0; i < array.length; i++) {
      // A simple deterministic test pattern: sine wave in bin space.
      array[i] = Math.floor(128 + 80 * Math.sin(i * 0.07));
    }
  }
  getFloatTimeDomainData(array) {
    for (let i = 0; i < array.length; i++) {
      // A simple deterministic time-domain signal in [-1, 1].
      array[i] = 0.7 * Math.sin(i * 0.05);
    }
  }
  getByteTimeDomainData(array) {
    for (let i = 0; i < array.length; i++) {
      const v = 0.7 * Math.sin(i * 0.05);
      array[i] = Math.max(0, Math.min(255, Math.floor((v + 1) * 127.5)));
    }
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor(context) {
    super(context, "OscillatorNode");
    this.type = "sine";
    this.frequency = new MockAudioParam(440);
    this._started = false;
  }
  start() { this._started = true; }
  stop() { this._started = false; }
  setType(t) { this.type = t; }
}

class MockBufferSourceNode extends MockAudioNode {
  constructor(context) {
    super(context, "BufferSourceNode");
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.playbackRate = new MockAudioParam(1);
    this.onended = null;
    this._started = false;
  }
  start() { this._started = true; }
  stop() { this._started = false; }
}

function makeNodeFactory(type) {
  return class extends MockAudioNode {
    constructor(context, ...args) {
      super(context, type);
      // Store constructor args so tests can assert on configuration
      this._ctorArgs = args;
      // Generic AudioParam holders; effects that need specific params override
      this.gain = new MockAudioParam(1);
      this.frequency = new MockAudioParam(350);
      this.Q = new MockAudioParam(1);
      this.delayTime = new MockAudioParam(0);
    }
  };
}

class MockAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = new MockAudioNode(this, "destination");
    this.sampleRate = 44100;
    this.baseLatency = 0.005;
    this.outputLatency = 0.020;
    this._nodeRegistry = [];
  }

  _create(type, ...args) {
    const NodeClass = makeNodeFactory(type);
    const node = new NodeClass(this, ...args);
    this._nodeRegistry.push(node);
    return node;
  }

  createGain() { return this._create("GainNode"); }
  createBiquadFilter() { return this._create("BiquadFilterNode"); }
  createDelay(max = 1) { return this._create("DelayNode", max); }
  createWaveShaper() { return this._create("WaveShaperNode"); }
  createConvolver() { return this._create("ConvolverNode"); }
  createChannelSplitter(n) { return this._create("ChannelSplitterNode", n); }
  createChannelMerger(n) { return this._create("ChannelMergerNode", n); }
  createDynamicsCompressor() { return this._create("DynamicsCompressorNode"); }
  createAnalyser() { return new MockAnalyserNode(this); }
  createOscillator() { return new MockOscillatorNode(this); }
  createBufferSource() { return new MockBufferSourceNode(this); }
  createMediaStreamSource(stream) {
    const node = this._create("MediaStreamSourceNode", stream);
    node.stream = stream;
    return node;
  }
  async resume() { this.state = "running"; return this; }
  async suspend() { this.state = "suspended"; return this; }
  async close() { this.state = "closed"; return this; }
}

globalThis.AudioContext = MockAudioContext;
globalThis.webkitAudioContext = MockAudioContext;

globalThis.fetch = globalThis.fetch || (() => Promise.resolve({ text: () => Promise.resolve("") }));
