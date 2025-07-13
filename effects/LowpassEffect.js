import AbstractEffectNode from "../core/AbstractEffectNode.js"

export class LowpassEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext);

        this.setMix(1.0);

        this.lowpassNode = audioContext.createBiquadFilter();
        this.lowpassNode.type = "lowpass";
        this.lowpassNode.frequency.value = 3000;

        this.input.connect(this.lowpassNode);

        this.lowpassNode.connect(this.effectOutput);
    }

    setFrequency(value) {
        value = Math.max(100, Math.min(16000, value));
        this.lowpassNode.frequency.value = value;
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