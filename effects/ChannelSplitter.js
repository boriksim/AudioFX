/**
 * ChannelSplitter: 1 stereo input -> 2 separate L and R output ports.
 *
 * Audio path:
 *
 *   input -> ChannelMerger(2) -> ChannelSplitter(2)
 *                                |-- L -> gainL  (output port "L")
 *                                |-- R -> gainR  (output port "R")
 *
 * The merger re-broadcasts the mono input to both channels of the
 * splitter, so downstream effects can be wired to the L and R
 * outputs independently. The two `GainNode` per-channel volumes
 * are user-configurable (default 1.0 each).
 *
 * Multi-port design:
 *   getInputPorts()  -> [{ id: "in" }]
 *   getOutputPorts() -> [{ id: "L" }, { id: "R" }]
 *   getInputNode(id) -> the merger
 *   getOutputNode("L") -> gainL
 *   getOutputNode("R") -> gainR
 *
 * The PatchboardUI renders one port dot per declared port; the
 * EffectChainManager.connect() validates that the (fromPort,
 * toPort) pair matches the endpoints' declared ports.
 */
import AbstractAudioNode from "../core/AbstractAudioNode.js";

export default class ChannelSplitter extends AbstractAudioNode {
  static manifest = {
    id: "channel-splitter",
    name: "Channel Splitter",
    version: "1.0.0",
    category: "router",
    description: "Splits a mono/stereo source into L and R output channels.",
    tags: ["router", "splitter", "channels"],
    inputChannels: 2,
    outputChannels: 2,
  };

  constructor(audioContext) {
    super(audioContext);
    // Stereo splitter/merger. We use a 2-channel merger to broadcast
    // the mono input to both channels of a 2-channel splitter.
    this.merger = audioContext.createChannelMerger(2);
    this.splitter = audioContext.createChannelSplitter(2);
    // Re-broadcast the merged (mono) input to both splitter channels.
    // The real Web Audio will downmix a stereo source to mono at the
    // merger; under the polyfill, the merger just passes through.
    this.merger.connect(this.splitter, 0, 0);
    this.merger.connect(this.splitter, 0, 1);
    // Per-channel gain so the user can balance L vs R.
    this.gainL = audioContext.createGain();
    this.gainR = audioContext.createGain();
    this.gainL.gain.value = 1;
    this.gainR.gain.value = 1;
    this.splitter.connect(this.gainL, 0);
    this.splitter.connect(this.gainR, 1);
    // The default input/output the chain code reads (no port id).
    this.input = this.merger;
    this.output = this.gainL;
  }

  getInputPorts() {
    return [{ id: "in" }];
  }

  getOutputPorts() {
    return [{ id: "L" }, { id: "R" }];
  }

  getInputNode(_portId = "in") {
    return this.merger;
  }

  getOutputNode(portId = "L") {
    if (portId === "R") return this.gainR;
    return this.gainL;
  }

  getConfig() {
    return {
      gainL: this.gainL.gain.value,
      gainR: this.gainR.gain.value,
    };
  }

  getConfigSchema() {
    return [
      { type: "range", id: "gainL", label: "L gain", min: 0, max: 2, step: 0.01, value: this.gainL.gain.value },
      { type: "range", id: "gainR", label: "R gain", min: 0, max: 2, step: 0.01, value: this.gainR.gain.value },
    ];
  }

  applyConfig(params) {
    if (params && typeof params.gainL === "number") {
      this.gainL.gain.value = params.gainL;
    }
    if (params && typeof params.gainR === "number") {
      this.gainR.gain.value = params.gainR;
    }
  }
}
