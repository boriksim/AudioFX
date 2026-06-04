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
   * The dry path (`input → dryGain → output`) and the wet path
   * (`input → [DSP] → effectOutput → wetGain → output`) are BOTH
   * kept wired at all times. Bypass just controls the gains:
   *   - bypassed: dryGain=1, wetGain=0  → audio passes through
   *     untouched, the DSP runs but its output is muted.
   *   - active:   dryGain=1-mix, wetGain=mix  → dry and wet are
   *     summed at the output by the current mix.
   *
   * This is a small CPU trade-off (the DSP runs even in bypass)
   * but it's a HUGE reliability win: no `node.disconnect(specific
   * destination)` calls, which are not perfectly consistent across
   * browsers and have been the cause of "I can hear the source
   * alone but not through any effect" reports. The earlier version
   * disconnected `effectOutput → wetGain` in bypass mode and
   * reconnected it on un-bypass. That code path was correct on
   * paper but turned out to be the failure mode in at least one
   * real-world browser.
   */
  setBypassed(bypassed) {
    this.bypass = bypassed;
    if (bypassed) {
      this.dryGain.gain.value = 1.0;
      this.wetGain.gain.value = 0.0;
    } else {
      this.dryGain.gain.value = 1 - this.mix;
      this.wetGain.gain.value = this.mix;
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