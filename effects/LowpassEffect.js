import AbstractEffectNode from "../core/AbstractEffectNode.js"

export class LowpassEffect extends AbstractEffectNode {
  constructor(audioContext, domElement) {
    super(audioContext, domElement);

    this.lowpassNode = audioContext.createBiquadFilter();
    this.lowpassNode.type = "lowpass";
    this.lowpassNode.frequency.value = 3000;

    this.input.connect(this.lowpassNode);

    this.lowpassNode.connect(this.effectOutput);

    this.setMix(1.0);
    this.bypass = false;
    this.setBypassed(this.bypass);
  }

  initUI() {
    this.lowpassFreqSlider = this.domElement.querySelector('[data-fx-freq]');
    this.lowpassFreqValue = this.domElement.querySelector('[data-fx-freq-value]');
    this.mixSlider = this.domElement.querySelector('[data-fx-mix]');
    this.mixValue = this.domElement.querySelector('[data-fx-mix-value]');
    this.bypassCheckbox = this.domElement.querySelector('[data-fx-bypass]');

    this.lowpassFreqSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.setParam('lowpassFreq', value);
      if (this.lowpassFreqValue) this.lowpassFreqValue.textContent = value;
    });

    this.mixSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.setParam('mix', value);
      if (this.mixValue) this.mixValue.textContent = value;
    });

    this.bypassCheckbox.addEventListener('click', () => {
      this.setParam('bypass', this.bypassCheckbox.checked);
    });
  }

  setParam(paramName, value) {
    switch (paramName) {
      case 'lowpassFreq':
        value = Math.max(100, Math.min(16000, value));
        this.lowpassNode.frequency.value = value;
        break;

      case 'mix':
        this.setMix(value);
        break;

      case 'bypass':
        this.setBypassed(value);
        break;
    }
  }

  getParam(paramName) {
    switch (paramName) {
      case 'lowpassFreq': return this.delayNode.delayTime.value;
      case 'mix': return this.mix;
      case 'bypass': return this.bypass;
      default: return undefined;
    }
  }

  destroy() {
    if (this.lowpassFreqSlider) {
      this.lowpassFreqSlider.replaceWith(this.lowpassFreqSlider.cloneNode(true));
    }
    if (this.mixSlider){
      this.mixSlider.replaceWith(this.mixSlider.cloneNode(true));
    }
    if (this.bypassCheckbox) {
      this.bypassCheckbox.replaceWith(this.bypassCheckbox.cloneNode(true));
    }
    if (this.lowpassNode) {
      this.delayNode.disconnect();
    }
  }

  getConfigSchema() {
    return {
      lowpassFrequency: {
        type: "range",
        min: 100,
        max: 16000,
        step: 10,
        value: this.lowpassNode.frequency.value,
      },
    };
  }

  updateConfig({ lowpassFrequency, mix }) {
    super.updateConfig({ mix })
    if (typeof lowpassFrequency === "number") this.setFrequency(lowpassFrequency);
  }
}