import AbstractEffectNode from "../core/AbstractEffectNode.js";

export class PitchShifterEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext);

        this.bufferSize = 1024;

        this.pitch = 0;
        this.pitchRatio = 1;

        this.delayNode = audioContext.createDelay();
        this.scriptNode = audioContext.createScriptProcessor(this.bufferSize, 1, 1);

        this.buffer = new Float32Array(this.bufferSize);
        this.writeIndex = 0;

        this.scriptNode.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);

            for (let i = 0; i < input.length; i++) {
                this.buffer[this.writeIndex] = input[i];
                const readIndex = (this.writeIndex + Math.round(this.bufferSize / this.pitchRatio)) % this.bufferSize;
                output[i] = this.buffer[readIndex];
                this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
            }
        };

        this.input.connect(this.scriptNode);
        this.scriptNode.connect(this.effectOutput);
    }

    setPitch(semitones) {
        semitones = Math.max(-24, Math.min(24, semitones));
        this.pitch = semitones;
        this.pitchRatio = Math.pow(2, semitones / 12);
    }

    getConfigSchema() {
        return {
            pitch: {
                type: "range",
                min: -24,
                max: 24,
                step: 1,
                value: this.pitch
            },
        };
    }

    updateConfig({ pitch, mix }) {
        super.updateConfig({ mix });
        if (typeof pitch === "number") this.setPitch(pitch);
    }
}
