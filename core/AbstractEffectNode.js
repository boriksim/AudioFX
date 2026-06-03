import AbstractAudioNode from "./AbstractAudioNode.js"

/**
 * Base class for all effects. Provides dry/wet mix routing and a bypass
 * flag that mutes the wet path while keeping the dry path at unity.
 *
 * Subclasses connect their own DSP between `this.input` and
 * `this.effectOutput`. The base wires both paths into `this.output`.
 */
export default class AbstractEffectNode extends AbstractAudioNode {
  constructor(audioContext, domElement) {
    super(audioContext);

    this.domElement = domElement;

    this.input = this.audioContext.createGain();
    this.output = this.audioContext.createGain();

    this.dryGain = this.audioContext.createGain();
    this.wetGain = this.audioContext.createGain();
    this.effectOutput = this.audioContext.createGain();
    this.mix = 0.5;

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.effectOutput.connect(this.wetGain);
    this.wetGain.connect(this.output);

    this.bypass = true;
    this.dryGain.gain.value = 1.0;
    this.wetGain.gain.value = 0.0;

    this.initUI();
  }

  initUI() {}

  /**
   * Toggle the dry/wet bypass.
   *
   * In addition to the gain-based mute, this method also *disconnects* the
   * wet path from the audio graph while the effect is bypassed. That stops
   * the effect's DSP from processing samples (saves CPU, eliminates a
   * source of glitches in long chains), and the dry signal still flows
   * through `dryGain`. When bypass is cleared the wet path is reconnected.
   */
  setBypassed(bypassed) {
    this.bypass = bypassed;
    if (bypassed) {
      try {
        this.effectOutput.disconnect(this.wetGain);
      } catch (_) {
        // Already disconnected — safe to ignore.
      }
      this.dryGain.gain.value = 1.0;
      this.wetGain.gain.value = 0.0;
    } else {
      try {
        this.effectOutput.connect(this.wetGain);
      } catch (_) {
        // connect() is idempotent in some browsers but not all; ignore
        // a duplicate-connect error so toggling rapidly is safe.
      }
      this.setMix(this.mix);
    }
  }

  setMix(value) {
    value = Math.max(0, Math.min(1, value));
    this.mix = value;
    this.dryGain.gain.value = 1 - value;
    this.wetGain.gain.value = value;
  }

  getConfigSchema() {
    return {
      mix: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: this.wetGain.gain.value,
      },
    };
  }

  updateConfig({ mix }) {
    if (typeof mix === "number") {
      this.setMix(mix);
    }
  }
}