export default class AbstractAudioNode {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.input = null;
    this.output = null;
  }

  /**
   * The input AudioNode for a given port. Default port is "in";
   * multi-port effects override this.
   * @param {string} [_portId="in"]
   * @returns {AudioNode|null}
   */
  getInputNode(_portId = "in") {
    return this.input;
  }

  /**
   * The output AudioNode for a given port. Default port is "out".
   * @param {string} [_portId="out"]
   * @returns {AudioNode|null}
   */
  getOutputNode(_portId = "out") {
    return this.output;
  }

  /**
   * Manifest-declared input ports. Override to declare multi-port
   * effects; default is a single "in" port.
   * @returns {{id: string}[]}
   */
  getInputPorts() {
    return [{ id: "in" }];
  }

  /**
   * Manifest-declared output ports. Override to declare multi-port
   * effects; default is a single "out" port.
   * @returns {{id: string}[]}
   */
  getOutputPorts() {
    return [{ id: "out" }];
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
    return {};
  }

  updateConfig(params) {}
}