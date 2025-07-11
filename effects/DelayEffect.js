import AbstractEffectNode from "../core/AbstractEffectNode.js"

export class DelayEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext);

        this.delayNode = audioContext.createDelay();
        this.feedbackGain = audioContext.createGain();

        // Значения по умолчанию
        this.delayNode.delayTime.value = 0.3;
        this.feedbackGain.gain.value = 0.4;

        // Соединение внутренней схемы
        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);

        this.input.connect(this.delayNode);

        this.delayNode.connect(this.effectOutput);
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