import AbstractAudioNode from "../core/AbstractAudioNode.js";

/**
 * InputOscillator: a synthesized test tone.
 *
 * Wraps a Web Audio OscillatorNode behind a gain stage. Useful for
 * calibrating levels, testing the chain end-to-end without a mic,
 * and as a sandbox while building effects (sweep a slider, hear
 * the response).
 *
 * The OscillatorNode is created in the constructor and started
 * immediately at frequency 0; the user can then sweep frequency,
 * waveform, and gain. `start()` / `stop()` are idempotent.
 */
export class InputOscillator extends AbstractAudioNode {
  static manifest = {
    id: "input-oscillator",
    name: "Test Oscillator",
    version: "1.0.0",
    category: "source",
    description: "Synthesized test tone (sine, square, saw, triangle)",
    tags: ["input", "source", "oscillator", "test"],
    inputChannels: 0,
    outputChannels: 1,
  };

  constructor(audioContext, domElement) {
    super(audioContext);
    this.audioContext = audioContext;
    this.domElement = domElement;

    this.osc = audioContext.createOscillator();
    this.osc.type = "sine";
    this.osc.frequency.value = 440;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 0.2;
    this.osc.connect(this.gainNode);
    this.started = false;
    this.output = this.gainNode;
    this._start();
  }

  getInputNode() {
    return null;
  }

  getOutputNode() {
    return this.output;
  }

  connect(destination) {
    this.output.connect(destination.getInputNode?.() ?? destination);
  }

  disconnect() {
    this.output.disconnect();
  }

  destroy() {
    this.disconnect();
  }

  _start() {
    if (this.started) return;
    try {
      this.osc.start();
    } catch (_) {
      // Already started (e.g., after a project restore).
    }
    this.started = true;
  }

  setFrequency(hz) {
    hz = Math.max(20, Math.min(20000, hz));
    this.osc.frequency.value = hz;
  }

  setType(type) {
    if (["sine", "square", "sawtooth", "triangle"].includes(type)) {
      this.osc.type = type;
    }
  }

  getConfig() {
    return {
      frequency: this.osc.frequency.value,
      type: this.osc.type,
      gain: this.gainNode.gain.value,
    };
  }

  applyConfig(config = {}) {
    if (typeof config.frequency === "number") this.setFrequency(config.frequency);
    if (typeof config.type === "string") this.setType(config.type);
    if (typeof config.gain === "number") {
      this.gainNode.gain.value = Math.max(0, Math.min(1, config.gain));
    }
  }

  getConfigSchema() {
    return {
      type: {
        type: "select",
        options: ["sine", "square", "sawtooth", "triangle"],
        value: this.osc.type,
        label: "Waveform",
      },
      frequency: {
        type: "range",
        min: 20,
        max: 20000,
        step: 1,
        value: this.osc.frequency.value,
        label: "Frequency",
        unit: "Hz",
      },
      gain: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: this.gainNode.gain.value,
        label: "Gain",
      },
    };
  }
}
