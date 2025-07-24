import AbstractEffectNode from "../core/AbstractEffectNode.js";

export class PhaserEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext);

        this.filter1 = audioContext.createBiquadFilter();
        this.filter1.type = "allpass";
        this.filter1.frequency.value = 1100;

        this.filter2 = audioContext.createBiquadFilter();
        this.filter2.type = "allpass";
        this.filter2.frequency.value = 1100;

        this.depthRange = audioContext.createGain();
        this.depthRange.gain.value = 1000;

        this.depth = audioContext.createGain();
        this.depth.gain.value = 0.5;

        this.lfo = audioContext.createOscillator();
        this.lfo.frequency.value = 4;

        this.lfo.connect(this.depth);
        this.depth.connect(this.depthRange);
        this.depthRange.connect(this.filter1.frequency);
        this.depthRange.connect(this.filter2.frequency);

        this.lfo.start();

        this.input.connect(this.filter1);
        this.filter1.connect(this.filter2);
        this.filter2.connect(this.effectOutput);
    }

    setDepth(value) {
        value = Math.max(0, Math.min(1, value));
        this.depth.gain.value = value;
    }

    setRate(value) {
        value = Math.max(0.1, Math.min(10, value));
        this.lfo.frequency.value = value;
    }

    getConfigSchema() {
        return {
            rate: {
                type: "range",
                min: 0.1,
                max: 10,
                step: 0.1,
                value: this.lfo.frequency.value,
            },
            depth: {
                type: "range",
                min: 0,
                max: 1,
                step: 0.01,
                value: this.depth.gain.value,
            },
        };
    }

    updateConfig({ rate, depth, mix }) {
        super.updateConfig({ mix });
        if (typeof rate === "number") this.setRate(rate);
        if (typeof depth === "number") this.setDepth(depth);
    }
}