import AbstractEffectNode from "../core/AbstractEffectNode.js"

export class DistortionEffect extends AbstractEffectNode {
    constructor(audioContext) {
        super(audioContext)

        this.setMix(1.0);

        this.waveShaper = audioContext.createWaveShaper();

        this.amount = 500;
        this.waveShaper.curve = this.#makeDistortionCurve(this.amount);
        this.waveShaper.oversample = "4x";

        this.input.connect(this.waveShaper);
        this.waveShaper.connect(this.effectOutput);
    }

    setAmount(value) {
        value = Math.max(0, Math.min(1000, value));
        this.amount = value;
        this.waveShaper.curve = this.#makeDistortionCurve(this.amount);
    }

    #makeDistortionCurve(amount = 500) {
        const k = typeof amount === "number" ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;

        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            // curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            curve[i] = Math.tanh(k * x);
            // curve[i] = x < 0 ? -Math.pow(-x, 0.6) : Math.pow(x, 0.6);
        }
        return curve;
    }

    getConfigSchema() {
        return {
            amount: {
                type: "range",
                min: 0,
                max: 1000,
                step: 1,
                value: this.amount,
            },
        };
    }

    updateConfig({ amount, mix }) {
        super.updateConfig({ mix });
        if (typeof amount === "number") this.setAmount(amount);
    }

}

