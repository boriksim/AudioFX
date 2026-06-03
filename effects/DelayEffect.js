import AbstractEffectNode from '../core/AbstractEffectNode.js';

export class DelayEffect extends AbstractEffectNode {
  constructor(audioContext, domElement) {
    super(audioContext, domElement);


    this.delayNode = audioContext.createDelay(2.5);
    this.feedbackGain = audioContext.createGain();

    this.delayNode.delayTime.value = 0.3;
    this.feedbackGain.gain.value = 0.2;
    this.feedbackGainValue = 0.2;

    this.input.connect(this.delayNode);

    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    this.delayNode.connect(this.effectOutput);

    this.setMix(0.5);
    this.bypass = true;
    this.setBypassed(this.bypass);
  }

  initUI() {
    this.delayTimeSlider = this.domElement.querySelector('[data-fx-delay_time]');
    this.delayTimeValue = this.domElement.querySelector('[data-fx-delay_time-value]');
    this.delayFeedbackSlider = this.domElement.querySelector('[data-fx-delay_feedback]');
    this.delayFeedbackValue = this.domElement.querySelector('[data-fx-delay_feedback-value]');
    this.mixSlider = this.domElement.querySelector('[data-fx-mix]');
    this.mixValue = this.domElement.querySelector('[data-fx-mix-value]');
    this.bypassCheckbox = this.domElement.querySelector('[data-fx-bypass]');

    this.delayTimeSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.setParam('delayTime', value);
      if (this.delayTimeValue) this.delayTimeValue.textContent = value;
    });

    this.delayFeedbackSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.setParam('delayFeedback', value);
      if (this.delayFeedbackValue) this.delayFeedbackValue.textContent = value;
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
      case 'delayTime':
        this.delayNode.delayTime.cancelScheduledValues(this.audioContext.currentTime);
        this.delayNode.delayTime.linearRampToValueAtTime(
          Math.max(0.016, Math.min(2.5, value)),
          this.audioContext.currentTime + 0.2
        );
        break;

      case 'delayFeedback':
        value = Math.max(0, Math.min(1, value));
        this.feedbackGain.gain.value = value;
        this.feedbackGainValue = value;
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
      case 'delayTime': return this.delayNode.delayTime.value;
      case 'delayFeedback': return this.feedbackGain.gain.value;
      case 'mix': return this.mix;
      case 'bypass': return this.bypass;
      default: return undefined;
    }
  }

  // Delay specific bypass
  setBypassed(bypassed) {
    super.setBypassed(bypassed);
    this.bypass = bypassed;

    if (bypassed) {
      try {
        this.delayNode.disconnect(this.feedbackGain);
      } catch (_) { }
      this.feedbackGainValue = this.feedbackGain.gain.value;
      this.feedbackGain.gain.value = 0.0;
    } else {
      this.delayNode.connect(this.feedbackGain);
      this.feedbackGain.gain.value = this.feedbackGainValue;
    }
  }

  destroy() {
    if (this.delayTimeSlider) {
      this.delayTimeSlider.replaceWith(this.delayTimeSlider.cloneNode(true));
    }
    if (this.delayFeedbackSlider) {
      this.delayFeedbackSlider.replaceWith(this.delayFeedbackSlider.cloneNode(true));
    }
    if (this.mixSlider){
      this.mixSlider.replaceWith(this.mixSlider.cloneNode(true));
    }
    if (this.bypassCheckbox) {
      this.bypassCheckbox.replaceWith(this.bypassCheckbox.cloneNode(true));
    }
    if (this.delayNode) {
      this.delayNode.disconnect();
    }
    if (this.feedbackGain) {
      this.feedbackGain.disconnect();
    }
  }

  getConfigSchema() {
    return {
      delayTime: {
        type: "range",
        min: 0.016,
        max: 2.5,
        step: 0.01,
        value: this.delayNode.delayTime.value,
      },
      feedback: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: this.feedbackGain.gain.value,
      },
    };
  }

  updateConfig({ delayTime, feedback, mix }) {
    super.updateConfig({ mix })
    if (typeof delayTime === "number") {
      this.delayNode.delayTime.value = delayTime;
    }
    if (typeof feedback === "number") {
      this.feedbackGain.gain.value = feedback;
    }
  }
}