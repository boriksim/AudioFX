import AbstractAudioNode from "../core/AbstractAudioNode.js";

export class InputMic extends AbstractAudioNode {
    constructor(audioContext, stream) {
        super(audioContext);

        const micSource = audioContext.createMediaStreamSource(stream);

        this.input = null;

        const monoSource = this.createMonoInput(audioContext, micSource, "left")

        this.output = monoSource;
    }

    getInputNode() {
        return null;
    }

    getOutputNode() {
        return this.output;
    }

    connect(destination) {
        this.output.connect(destination.getInputNode?.() ?? destination);
    }

    disconnect() {
        this.output.disconnect();
    }

    destroy() {
        this.disconnect();
    }

    createMonoInput(audioContext, sourceNode, channel = "average") {
        const splitter = audioContext.createChannelSplitter(2);
        const merger = audioContext.createChannelMerger(1);

        sourceNode.connect(splitter);

        if (channel === "left") {
            splitter.connect(merger, 0, 0);
        } else if (channel === "right") {
            splitter.connect(merger, 1, 0);
        } else {
            const gainL = audioContext.createGain();
            const gainR = audioContext.createGain();
            gainL.gain.value = 0.5;
            gainR.gain.value = 0.5;

            splitter.connect(gainL, 0);
            splitter.connect(gainR, 1);
            gainL.connect(merger, 0, 0);
            gainR.connect(merger, 0, 0);
        }

        return merger;
    }
}