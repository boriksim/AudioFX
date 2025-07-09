export function initFileVisualizer(input_file, audio_player, visualizer, fftSize, audio_context) {
    // const audio_context = new window.AudioContext();
    const analyzer = audio_context.createAnalyser();
    analyzer.fftSize = fftSize;
    const frequency_data = new Uint8Array(analyzer.frequencyBinCount);
    let source_node = null;

    input_file.addEventListener("change", () => {
        const file = input_file.files[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        audio_player.src = url;

        if (!source_node) {
            source_node = audio_context.createMediaElementSource(audio_player);
            source_node.connect(analyzer);
            analyzer.connect(audio_context.destination);
        }

        audio_context.resume();

        visualizer.setDataProvider(() => {
            analyzer.getByteFrequencyData(frequency_data);
            return frequency_data;
        });
    });
}