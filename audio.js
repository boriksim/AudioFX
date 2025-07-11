class AbstractAudioNode {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = null;   // AudioNode: куда подключать сигнал
    this.output = null;  // AudioNode: откуда забирать сигнал
  }

  getInputNode() {
    return this.input;
  }

  getOutputNode() {
    return this.output;
  }

  connect(destination) {
    this.getOutputNode().connect(destination.getInputNode());
  }

  disconnect() {
    this.getOutputNode().disconnect();
  }

  getConfigSchema() {
    return {}; // Переопределяется
  }

  updateConfig(params) {
    // Переопределяется
  }
}

// ----------------------------------------------------------------------

class AbstractEffectNode extends AbstractAudioNode {
  constructor(audioContext) {
    super(audioContext);

    // Общие input/output
    this.input = this.audioContext.createGain();
    this.output = this.audioContext.createGain();

    // Может использоваться для байпаса
    this.bypassed = false;
  }

  setBypassed(value) {
    this.bypassed = value;
    // Реализация в подклассе
  }
}

// ----------------------------------------------------------------------

class DelayEffect extends AbstractEffectNode {
  constructor(audioContext) {
    super(audioContext);

    this.delayNode = audioContext.createDelay();
    this.feedbackGain = audioContext.createGain();

    // Значения по умолчанию
    this.delayNode.delayTime.value = 0.3;
    this.feedbackGain.gain.value = 0.4;

    // Соединение внутренней схемы
    this.input.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode); // Петля
    this.delayNode.connect(this.output);
  }

  getConfigSchema() {
    return {
      delayTime: {
        type: "range",
        min: 0,
        max: 1.5,
        step: 0.01,
        value: this.delayNode.delayTime.value,
      },
      feedback: {
        type: "range",
        min: 0,
        max: 0.95,
        step: 0.01,
        value: this.feedbackGain.gain.value,
      },
    };
  }

  updateConfig({ delayTime, feedback }) {
    if (typeof delayTime === "number") {
      this.delayNode.delayTime.value = delayTime;
    }
    if (typeof feedback === "number") {
      this.feedbackGain.gain.value = feedback;
    }
  }

  setBypassed(bypassed) {
    super.setBypassed(bypassed);
    if (bypassed) {
      this.input.disconnect();
      this.input.connect(this.output); // Прямое соединение
    } else {
      this.input.disconnect();
      this.input.connect(this.delayNode);
    }
  }
}


// ----------------------------------------------------------------------


const audioContext = new AudioContext();
const delay = new DelayEffect(audioContext);

// Пример: подключаем аудиофайл
const audioElement = document.querySelector("#audio");
const sourceNode = audioContext.createMediaElementSource(audioElement);

sourceNode.connect(delay.getInputNode());
delay.getOutputNode().connect(audioContext.destination);

// Изменить параметры:
delay.updateConfig({ delayTime: 0.5, feedback: 0.6 });
