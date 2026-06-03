export default class AbstractAudioNode {
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
    const output = this.getOutputNode();

    if (typeof destination.getInputNode === "function") {
      output.connect(destination.getInputNode());
    } else {
      output.connect(destination);
    }
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