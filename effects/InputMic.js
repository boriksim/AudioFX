import AbstractAudioNode from "../core/AbstractAudioNode.js";

export class InputMic extends AbstractAudioNode {
  static manifest = {
    id: "input-mic",
    name: "Microphone Input",
    version: "1.0.0",
    category: "source",
    description: "Live microphone input via getUserMedia",
    tags: ["input", "source", "microphone"],
    inputChannels: 0,
    outputChannels: 2,
  };

    constructor(audioContext, domElement) {
        super(audioContext);
        this.audioContext = audioContext;
        this.domElement = domElement;

        this.stream = null;
        this.source = null;

        this.splitter = audioContext.createChannelSplitter(2);
        this.mergerMono = audioContext.createChannelMerger(1);
        this.mergerStereo = audioContext.createChannelMerger(2);

        this.channelMode = "left";
        this.convertToMono = true;
        this.gainNode = audioContext.createGain();
        this.gainNode.gain.value = 1.0;

        this.output = this.gainNode;
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

    setupRouting() {
        const context = this.audioContext;

        try { this.source.disconnect(); } catch (_) { }
        try { this.splitter.disconnect(); } catch (_) { }
        try { this.mergerMono.disconnect(); } catch (_) { }
        try { this.mergerStereo.disconnect(); } catch (_) { }

        this.source.connect(this.splitter);

        let splitted;

        if (this.channelMode === "left") {
            const left = context.createGain();
            left.gain.value = 1.0;
            this.splitter.connect(left, 0);
            splitted = left;

        } else if (this.channelMode === "right") {
            const right = context.createGain();
            right.gain.value = 1.0;
            this.splitter.connect(right, 1);
            splitted = right;

        } else {
            const stereoMerger = this.mergerStereo;
            this.splitter.connect(stereoMerger, 0, 0); // L → L
            this.splitter.connect(stereoMerger, 1, 1); // R → R
            splitted = stereoMerger;
        }

        if (this.convertToMono) {
            const mergerMono = this.mergerMono;
            if (this.channelMode === "stereo") {
                const gainL = context.createGain();
                const gainR = context.createGain();
                gainL.gain.value = 0.5;
                gainR.gain.value = 0.5;

                this.splitter.connect(gainL, 0);
                this.splitter.connect(gainR, 1);
                gainL.connect(mergerMono, 0, 0);
                gainR.connect(mergerMono, 0, 0);
                splitted = mergerMono;
            } else {
                splitted.connect(mergerMono, 0, 0);
                splitted = mergerMono;
            }
        }

        splitted.connect(this.gainNode);
    }

    initStream(stream) {
        this.stream = stream;
        this.source = this.audioContext.createMediaStreamSource(stream);
        this.setupRouting();
    }

    getConfig() {
        return {
            channelMode: this.channelMode,
            convertToMono: this.convertToMono,
            gain: this.gainNode.gain.value,
        };
    }

    applyConfig(config = {}) {
        if (typeof config.gain === "number") {
            this.gainNode.gain.value = config.gain;
        }
        let needsReroute = false;
        if (typeof config.channelMode === "string" && config.channelMode !== this.channelMode) {
            this.channelMode = config.channelMode;
            needsReroute = true;
        }
        if (typeof config.convertToMono === "boolean" && config.convertToMono !== this.convertToMono) {
            this.convertToMono = config.convertToMono;
            needsReroute = true;
        }
        if (needsReroute && this.stream) this.setupRouting();
    }

    getConfigSchema() {
        return {
            channelMode: {
                type: "select",
                options: ["left", "right", "stereo"],
                value: this.channelMode,
                label: "Channel",
            },
            convertToMono: {
                type: "toggle",
                value: this.convertToMono,
                label: "Convert to mono",
            },
            gain: {
                type: "range",
                min: 0,
                max: 2,
                step: 0.01,
                value: this.gainNode.gain.value,
                label: "Gain",
            },
        };
    }
}
