import AbstractEffectNode from "../core/AbstractEffectNode.js"

export class DistortionEffect extends AbstractEffectNode {
  constructor(audioContext, domElement) {
    super(audioContext, domElement)

    this.waveShaper = audioContext.createWaveShaper();
    this.strength = 1;
    this.type = "soft";

    this.postGain = audioContext.createGain();

    this.generateCurve();

    this.input.connect(this.waveShaper);
    this.waveShaper.connect(this.postGain);
    this.postGain.connect(this.effectOutput);

    this.setMix(1.0);
    this.bypass = true;
    this.setBypassed(this.bypass);
  }

  initUI() {
    this.distortionStrengthSlider = this.domElement.querySelector('[data-fx-distortion_strength]');
    this.distortionStrengthValue = this.domElement.querySelector('[data-fx-distortion_strength-value]');
    this.distortionTypeSelector = this.domElement.querySelector('[data-fx-distortion_type]');
    this.mixSlider = this.domElement.querySelector('[data-fx-mix]');
    this.mixValue = this.domElement.querySelector('[data-fx-mix-value]');
    this.bypassCheckbox = this.domElement.querySelector('[data-fx-bypass]');

    this.distortionStrengthSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.setParam('distortionStrength', value);
      if (this.distortionStrengthValue) this.distortionStrengthValue.textContent = value;
    });

    this.distortionTypeSelector.addEventListener('input', (e) => {
      const value = e.target.value;
      this.setParam('distortionType', value);
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

  setStrength(value) {
    value = Math.max(0, Math.min(1000, value));
    this.strength = value;
    this.generateCurve();
  }

  setParam(paramName, value) {
    switch (paramName) {
      case 'distortionStrength':
        value = Math.max(0, Math.min(10, value));
        this.strength = value;
        this.generateCurve();
        break;

      case 'distortionType':
        this.setType(value);
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
      case 'distortionStrength': return this.strength;
      case 'distortionType': return this.type;
      case 'mix': return this.mix;
      case 'bypass': return this.bypass;
      default: return undefined;
    }
  }

  destroy() {
    if (this.distortionStrengthSlider) {
      this.distortionStrengthSlider.replaceWith(this.distortionStrengthSlider.cloneNode(true));
    }
    if (this.mixSlider){
      this.mixSlider.replaceWith(this.mixSlider.cloneNode(true));
    }
    if (this.bypassCheckbox) {
      this.bypassCheckbox.replaceWith(this.bypassCheckbox.cloneNode(true));
    }
    if (this.waveShaper) {
      this.waveShaper.disconnect();
    }
    if (this.postGain) {
      this.postGain.disconnect();
    }
  }

  setType(type) {
    this.type = type;
    this.generateCurve();
  }

  generateCurve() {
    const samples = 44100;
    const curve = new Float32Array(samples);

    const k = this.strength * 100;
    const step = 2 / samples;

    for (let i = 0; i < samples; i++) {
      const x = i * step - 1;

      switch (this.type) {
        case "soft":
          curve[i] = x / (1 + Math.abs(k * x));
          this.postGain.gain.value = 1 + k * 0.1;
          // this.postGain.gain.value = 1;
          break;
        case "hard":
          curve[i] = Math.max(-0.6, Math.min(0.6, k * x));
          this.postGain.gain.value = 1;
          break;
        case "tanh":
          curve[i] = Math.tanh(k * x);
          this.postGain.gain.value = 1;
          break;
        case "exponential":
          curve[i] = (1 - Math.exp(-k * Math.abs(x))) * Math.sign(x);
          this.postGain.gain.value = 1;
          break;
        case "foldback":
          const fold = Math.abs(x + k) % 2 - 1;
          this.postGain.gain.value = 1;
          curve[i] = fold;
          break;
        case "bitcrusher":
          const steps = Math.max(2, Math.round(2 + (k / 100) * 8));
          curve[i] = Math.round(x * steps) / steps;
          this.postGain.gain.value = 1 + k * 0.1;
          // this.postGain.gain.value = 1;
          break;
        case "symmetric":
          curve[i] = x * (1 + k) / (1 + k * Math.abs(x));
          this.postGain.gain.value = 1;
          break;
        case "diode-like":
          const a = 1 + k / 10;
          curve[i] = (x < 0) ? -Math.pow(Math.abs(x), a) : Math.pow(x, 1 / a);
          this.postGain.gain.value = 1;
          break;
        default:
          curve[i] = x;
      }
    }

    this.waveShaper.curve = curve;
    this.waveShaper.oversample = "4x";

  }

  getConfigSchema() {
    return {
      strength: {
        type: "range",
        min: 0,
        max: 10,
        step: 0.1,
        value: this.strength,
      },
      type: {
        type: "select",
        options: ["soft", "hard", "tanh", "exponential", "foldback", "bitcrusher", "symmetric", "diode-like"],
        value: this.type,
      },
    };
  }

  updateConfig({ strength, type, mix }) {
    super.updateConfig({ mix });
    if (typeof strength === "number") this.setStrength(strength);
    if (typeof type === "string") this.setType(type);
  }

}

