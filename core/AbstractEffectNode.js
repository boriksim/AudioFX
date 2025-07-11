import AbstractAudioNode from "./AbstractAudioNode.js"

export default class AbstractEffectNode extends AbstractAudioNode {
  constructor(audioContext) {
    super(audioContext);

    // Общие input/output
    this.input = this.audioContext.createGain();
    this.output = this.audioContext.createGain();

    this.dryGain = this.audioContext.createGain();
    this.wetGain = this.audioContext.createGain();
    this.effectOutput = this.audioContext.createGain();

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    this.effectOutput.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Может использоваться для байпаса
    this.bypassed = true;
    // this.setBypassed(this.bypassed);
  }
  
  setBypassed(bypassed) {
    this.bypassed = bypassed;
    if (bypassed) {
      console.log("bypassed");
      this.dryGain.gain.value = 1.0;
      this.wetGain.gain.value = 0.0;
    } else {
      console.log("not bypassed");
      const mix = this.wetGain.gain.value;
      this.setMix(mix);
    }
  }

  setMix(value) {
    value = Math.max(0, Math.min(1, value));
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