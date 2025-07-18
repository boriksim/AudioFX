import AbstractEffectNode from "../core/AbstractEffectNode.js"

export class DelayEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext);

        this.delayNode = audioContext.createDelay(2.5);
        this.feedbackGain = audioContext.createGain();

        this.delayNode.delayTime.value = 0.25;
        this.feedbackGain.gain.value = 0.2;

        this.feedbackGainValue = 0.2;

        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);

        this.input.connect(this.delayNode);

        this.delayNode.connect(this.effectOutput);
    }

    setTime(value) {
        value = Math.max(0.016, Math.min(2.5, value));
        
        console.log(value);
        const delayTime = this.delayNode.delayTime;

        const now = this.audioContext.currentTime;

        delayTime.cancelScheduledValues(now);

        delayTime.linearRampToValueAtTime(value, now + 0.2);
    }

    setFeedback(value) {
        console.log(value);
        value = Math.max(0, Math.min(1, value));
        this.feedbackGain.gain.value = value;
        this.feedbackGainValue = value;
    }

    setBypassed(bypassed) {
        super.setBypassed(bypassed);

        if (bypassed) {
            this.delayNode.disconnect(this.feedbackGain);
            this.feedbackGainValue = this.feedbackGain.gain.value;
            this.feedbackGain.gain.value = 0.0;
        } else {
            this.delayNode.connect(this.feedbackGain);
            this.feedbackGain.gain.value = this.feedbackGainValue;
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