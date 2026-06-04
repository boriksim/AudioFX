import BaseEffect from "../core/BaseEffect.js";

/**
 * UtilityEffect: a do-everything "utility" node for quick gain
 * shaping, stereo placement, and phase work.
 *
 * Parameters:
 *   - gain:          Linear output gain (0 to 2, default 1).
 *   - pan:           Stereo pan (-1 = full L, 0 = center, +1 = full R).
 *   - invertPhase:   If true, flips the signal polarity (multiplies by -1).
 *   - mono:          If true, downmixes L+R to mono on both channels.
 *
 * Audio path:
 *
 *   input
 *     |
 *     v
 *   splitter(2) --[L,R]--> 2x2 gain matrix (gainLL/LR/RL/RR)
 *                                |
 *                                v
 *                              merger(2)
 *                                |
 *                                v
 *                            phaseInvert (gain = 1 or -1)
 *                                |
 *                                v
 *                              panner (StereoPannerNode, -1 to +1)
 *                                |
 *                                v
 *                            outputGain (GainNode, 0 to 2)
 *                                |
 *                                v
 *                              output
 *
 * The 2x2 gain matrix makes the mono toggle a real downmix:
 *   - stereo mode: gainLL=1, gainLR=0, gainRL=0, gainRR=1
 *     → L stays L, R stays R.
 *   - mono mode:   gainLL=0.5, gainLR=0.5, gainRL=0.5, gainRR=0.5
 *     → L and R are summed at the merger's two inputs, producing
 *       (L+R)/2 on both output channels. This is TRUE mono,
 *       not just "play one channel". All four gains are always
 *       wired; only their values change. No `disconnect` calls.
 */
export class UtilityEffect extends BaseEffect {
  static manifest = {
    id: "utility",
    name: "Utility",
    version: "1.0.0",
    category: "utility",
    description: "Gain, pan, phase invert, and mono downmix in one node.",
    tags: ["utility", "gain", "pan", "phase", "mono"],
    inputChannels: 2,
    outputChannels: 2,
  };

  constructor(audioContext, domElement) {
    super(audioContext, domElement);

    // Splitter (1 in, 2 out) and merger (2 in, 1 out per channel).
    this.splitter = audioContext.createChannelSplitter(2);
    this.merger = audioContext.createChannelMerger(2);

    // 2x2 gain matrix. The four gains are always wired:
    //   L -> gainLL -> merger input 0 (L out)
    //   R -> gainLR -> merger input 0 (L out, summed)
    //   L -> gainRL -> merger input 1 (R out)
    //   R -> gainRR -> merger input 1 (R out, summed)
    this.gainLL = audioContext.createGain();
    this.gainLR = audioContext.createGain();
    this.gainRL = audioContext.createGain();
    this.gainRR = audioContext.createGain();
    this.gainLL.gain.value = 1;
    this.gainLR.gain.value = 0;
    this.gainRL.gain.value = 0;
    this.gainRR.gain.value = 1;

    this.splitter.connect(this.gainLL, 0);
    this.splitter.connect(this.gainLR, 1);
    this.splitter.connect(this.gainRL, 0);
    this.splitter.connect(this.gainRR, 1);
    this.gainLL.connect(this.merger, 0, 0);
    this.gainLR.connect(this.merger, 0, 0);
    this.gainRL.connect(this.merger, 0, 1);
    this.gainRR.connect(this.merger, 0, 1);

    // Connect the default input/output (used by chain wiring
    // for single-port effects).
    this.input = this.splitter;

    this.phaseInvert = audioContext.createGain();
    this.phaseInvert.gain.value = 1;

    this.panner = audioContext.createStereoPanner();
    this.panner.pan.value = 0;

    this.outputGain = audioContext.createGain();
    this.outputGain.gain.value = 1;

    this.merger.connect(this.phaseInvert);
    this.phaseInvert.connect(this.panner);
    this.panner.connect(this.outputGain);

    // The default output the chain code reads. Connect to
    // outputGain so the wet path picks up the merged signal.
    this.output = this.outputGain;

    this.gain = 1.0;
    this.pan = 0.0;
    this.invertPhase = false;
    this.mono = false;

    this.setMix(1.0);
    this.setBypassed(false);
  }

  setGain(value) {
    value = Math.max(0, Math.min(2, value));
    this.gain = value;
    this.outputGain.gain.value = value;
  }

  setPan(value) {
    value = Math.max(-1, Math.min(1, value));
    this.pan = value;
    this.panner.pan.value = value;
  }

  setInvertPhase(value) {
    this.invertPhase = !!value;
    this.phaseInvert.gain.value = this.invertPhase ? -1 : 1;
  }

  /**
   * Toggle mono downmix. Updates the 2x2 gain matrix:
   *   - stereo: identity matrix (L -> L, R -> R)
   *   - mono:   uniform matrix (L+R summed to both outputs)
   */
  setMono(value) {
    this.mono = !!value;
    if (this.mono) {
      this.gainLL.gain.value = 0.5;
      this.gainLR.gain.value = 0.5;
      this.gainRL.gain.value = 0.5;
      this.gainRR.gain.value = 0.5;
    } else {
      this.gainLL.gain.value = 1;
      this.gainLR.gain.value = 0;
      this.gainRL.gain.value = 0;
      this.gainRR.gain.value = 1;
    }
  }

  setParam(paramName, value) {
    switch (paramName) {
      case "gain":
        this.setGain(value);
        break;
      case "pan":
        this.setPan(value);
        break;
      case "invertPhase":
        this.setInvertPhase(value);
        break;
      case "mono":
        this.setMono(value);
        break;
      case "bypass":
        this.setBypassed(value);
        break;
      case "mix":
        this.setMix(value);
        break;
    }
  }

  getParam(paramName) {
    switch (paramName) {
      case "gain": return this.gain;
      case "pan": return this.pan;
      case "invertPhase": return this.invertPhase;
      case "mono": return this.mono;
      case "bypass": return this.bypass;
      case "mix": return this.mix;
      default: return undefined;
    }
  }

  getConfig() {
    return {
      ...super.getConfig(),
      gain: this.gain,
      pan: this.pan,
      invertPhase: this.invertPhase,
      mono: this.mono,
    };
  }

  applyConfig(config) {
    super.applyConfig(config);
    if (typeof config.gain === "number") this.setGain(config.gain);
    if (typeof config.pan === "number") this.setPan(config.pan);
    if (typeof config.invertPhase === "boolean") this.setInvertPhase(config.invertPhase);
    if (typeof config.mono === "boolean") this.setMono(config.mono);
  }

  getConfigSchema() {
    return {
      gain: {
        type: "range",
        min: 0,
        max: 2,
        step: 0.01,
        value: this.gain,
        label: "Gain",
      },
      pan: {
        type: "range",
        min: -1,
        max: 1,
        step: 0.01,
        value: this.pan,
        label: "Pan",
      },
      invertPhase: {
        type: "toggle",
        value: this.invertPhase,
        label: "Invert phase",
      },
      mono: {
        type: "toggle",
        value: this.mono,
        label: "Mono",
      },
    };
  }

  destroy() {
    if (this.splitter) this.splitter.disconnect();
    if (this.merger) this.merger.disconnect();
    if (this.gainLL) this.gainLL.disconnect();
    if (this.gainLR) this.gainLR.disconnect();
    if (this.gainRL) this.gainRL.disconnect();
    if (this.gainRR) this.gainRR.disconnect();
    if (this.phaseInvert) this.phaseInvert.disconnect();
    if (this.panner) this.panner.disconnect();
    if (this.outputGain) this.outputGain.disconnect();
  }
}
