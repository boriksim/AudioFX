import AbstractAudioNode from "../core/AbstractAudioNode.js";

export class InputMic extends AbstractAudioNode {
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

        this.initUI();
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

    initUI() {
        this.channelRadios = this.domElement.querySelectorAll('[data-channel-mic]');
        this.channelRadios.forEach((radio) => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.channelMode = e.target.value;
                    this.setupRouting();
                }
            });
        });

        this.monoCheckbox = this.domElement.querySelector('[data-mono-mic]');
        this.monoCheckbox.addEventListener('change', (e) => {
            this.convertToMono = e.target.checked;
            this.setupRouting();
        });

        this.gainSlider = this.domElement.querySelector('[data-gain-mic]');
        this.gainValueDisplay = this.domElement.querySelector('[data-gain-mic-value]');
        this.gainSlider.addEventListener('input', (e) => {
            const gain = parseFloat(e.target.value);
            this.gainNode.gain.value = gain;
            if (this.gainValueDisplay) {
                this.gainValueDisplay.textContent = (gain - 1).toFixed(2);
            }
        });
    }
}