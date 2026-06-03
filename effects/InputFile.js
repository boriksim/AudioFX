import AbstractAudioNode from "../core/AbstractAudioNode.js";

/**
 * InputFile: play a user-supplied audio file through the chain.
 *
 * Decode a File (or ArrayBuffer) via `audioContext.decodeAudioData`,
 * build an AudioBufferSourceNode, route it through a gain stage.
 * Sources are single-use — re-decoding and re-creating the source
 * node is the only way to "restart from the beginning" once it has
 * played through. `loop` controls whether the source restarts at
 * the top of the buffer.
 *
 * Lifecycle:
 *   - constructor: builds the gain node (and chain output).
 *   - loadFile(file): decodes the file, stores the buffer, creates
 *     a fresh source. Starts paused.
 *   - play(): starts the source from the beginning (or resumes if
 *     a source is still alive).
 *   - stop(): stops the source.
 *
 * Why no separate pause/resume? Web Audio sources are one-shot.
 * "Pause" is implemented as stop + remembering the offset, but for
 * Phase 3e we just expose play/stop; pause is a Phase 4 stretch.
 */
export class InputFile extends AbstractAudioNode {
  static manifest = {
    id: "input-file",
    name: "Audio File",
    version: "1.0.0",
    category: "source",
    description: "Play a user-supplied audio file through the chain",
    tags: ["input", "source", "file"],
    inputChannels: 0,
    outputChannels: 2,
  };

  constructor(audioContext, domElement) {
    super(audioContext);
    this.audioContext = audioContext;
    this.domElement = domElement;

    this.buffer = null;
    this.source = null;
    this.playing = false;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1.0;
    this.loop = false;
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
    this._stopSource();
  }

  destroy() {
    this._stopSource();
    this.disconnect();
  }

  /**
   * Decode a File or ArrayBuffer into an AudioBuffer and create a
   * fresh source. Stops any in-flight playback.
   * @param {File|ArrayBuffer} input
   * @returns {Promise<AudioBuffer>}
   */
  async loadFile(input) {
    this._stopSource();
    const arrayBuffer = input instanceof ArrayBuffer
      ? input
      : await input.arrayBuffer();
    this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this._createSource();
    return this.buffer;
  }

  _createSource() {
    if (!this.buffer) return;
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = this.loop;
    this.source.connect(this.gainNode);
    this.source.onended = () => {
      // Only flip the flag if the source that ended is the live one.
      // (stop() creates a new source only on play() — onended fires
      // when the user lets it play through, or after stop().)
      if (this.source && !this.source.loop) {
        this.playing = false;
      }
    };
  }

  /** Start playback from the beginning of the buffer. */
  play() {
    if (!this.buffer) return false;
    if (this.source && this.playing) return true;
    this._createSource();
    this.source.start(0);
    this.playing = true;
    return true;
  }

  /** Stop playback. The source is single-use; next play() rebuilds it. */
  stop() {
    this._stopSource();
  }

  _stopSource() {
    if (this.source) {
      try { this.source.stop(); } catch (_) { /* already stopped */ }
      try { this.source.disconnect(); } catch (_) { }
      this.source = null;
    }
    this.playing = false;
  }

  getConfig() {
    return {
      loop: this.loop,
      gain: this.gainNode.gain.value,
      hasBuffer: !!this.buffer,
      duration: this.buffer?.duration ?? 0,
    };
  }

  applyConfig(config = {}) {
    if (typeof config.gain === "number") {
      this.gainNode.gain.value = config.gain;
    }
    if (typeof config.loop === "boolean" && config.loop !== this.loop) {
      this.loop = config.loop;
      if (this.source) this.source.loop = this.loop;
    }
  }

  getConfigSchema() {
    return {
      gain: {
        type: "range",
        min: 0,
        max: 2,
        step: 0.01,
        value: this.gainNode.gain.value,
        label: "Gain",
      },
      loop: {
        type: "toggle",
        value: this.loop,
        label: "Loop",
      },
    };
  }

  /**
   * Source-specific action bar (file picker + play/stop + status).
   * The PedalboardUI looks for this on source-type effects and
   * appends the result to the card.
   * @returns {HTMLElement}
   */
  renderSourceActions() {
    const wrap = document.createElement("div");
    wrap.className = "source-actions";
    wrap.innerHTML = `
      <input type="file" accept="audio/*" class="src-file" />
      <button type="button" class="src-play">▶ Play</button>
      <span class="src-status">No file loaded</span>
    `;
    const fileInput = wrap.querySelector(".src-file");
    const playBtn = wrap.querySelector(".src-play");
    const status = wrap.querySelector(".src-status");

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const buffer = await this.loadFile(file);
        status.textContent = `${file.name} (${buffer.duration.toFixed(1)}s)`;
        playBtn.textContent = "▶ Play";
        this.play();
        playBtn.textContent = "■ Stop";
      } catch (err) {
        status.textContent = `Load failed: ${err.message}`;
      }
    });

    playBtn.addEventListener("click", () => {
      if (this.playing) {
        this.stop();
        playBtn.textContent = "▶ Play";
      } else {
        if (this.play()) playBtn.textContent = "■ Stop";
      }
    });

    return wrap;
  }
}
