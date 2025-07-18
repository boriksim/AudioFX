import AbstractEffectNode from "../core/AbstractEffectNode.js";

export class FlangerEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext);

        this.delayNode = audioContext.createDelay();
        this.delayNode.delayTime.value = 0.005;

        this.depth = audioContext.createGain();
        this.depth.gain.value = 0.002;

        this.lfo = audioContext.createOscillator();
        this.lfo.frequency.value = 0.25;

        this.feedbackGain = audioContext.createGain();
        this.feedbackGain.gain.value = 0.5;

        this.lfo.connect(this.depth);
        this.depth.connect(this.delayNode.delayTime);

        this.input.connect(this.delayNode);

        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);

        this.delayNode.connect(this.effectOutput);

        this.lfo.start();
    }

    setRate(value) {
        value = Math.max(0.01, Math.min(5, value));
        this.lfo.frequency.value = value;
    }

    setDepth(value) {
        value = Math.max(0, Math.min(1, value));
        this.depth.gain.value = value * 0.005;
    }

    setFeedback(value) {
        value = Math.max(0, Math.min(1, value));
        this.feedbackGain.gain.value = value;
    }

    getConfigSchema() {
        return {
            rate: {
                type: "range",
                min: 0.01,
                max: 5,
                step: 0.01,
                value: this.lfo.frequency.value,
            },
            depth: {
                type: "range",
                min: 0,
                max: 1,
                step: 0.01,
                value: this.depth.gain.value / 0.005,
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

    updateConfig({ rate, depth, feedback, mix }) {
        super.updateConfig({ mix });
        if (typeof rate === "number") this.setRate(rate);
        if (typeof depth === "number") this.setDepth(depth);
        if (typeof feedback === "number") this.setFeedback(feedback);
    }
}
