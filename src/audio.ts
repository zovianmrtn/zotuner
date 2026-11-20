import { windowSize, hopSize } from "./analysis-window.js";
import processorUrl from "./pitch-worklet.js?worker&url";
import { detectPitch } from "./pitch.js";
export type Reading = ReturnType<typeof detectPitch>;
export class Input {
  private context?: AudioContext;
  private stream?: MediaStream;
  private frame = 0;
  private generation = 0;
  stop() {
    this.generation++;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
  }
  resume() {
    return this.context?.resume();
  }
  async start(device: string, receive: (reading: Reading) => void) {
    this.stop();
    const generation = this.generation;
    const context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;
    await context.resume();
    if (generation !== this.generation) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: device ? { exact: device } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    const source = context.createMediaStreamSource(stream);
    if (context.audioWorklet) {
      try {
        await context.audioWorklet.addModule(processorUrl);
        if (generation !== this.generation) return;
        const worklet = new AudioWorkletNode(context, "guitar-pitch", {
          processorOptions: {
            windowSize: windowSize(context.sampleRate),
            hop: hopSize(context.sampleRate),
          },
        });
        worklet.port.onmessage = (event) => {
          if (generation === this.generation) receive(event.data);
        };
        source.connect(worklet);
        worklet.connect(context.destination); // Processor emits silence.
        return context.sampleRate;
      } catch {
        if (generation !== this.generation) return;
      }
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = Math.min(
      32768,
      2 ** Math.ceil(Math.log2(windowSize(context.sampleRate))),
    );
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const analysisFrame = samples.subarray(
      samples.length - windowSize(context.sampleRate),
    );
    const poll = () => {
      if (generation !== this.generation) return;
      analyser.getFloatTimeDomainData(samples);
      receive(detectPitch(analysisFrame, context.sampleRate));
      this.frame = requestAnimationFrame(poll);
    };
    poll();
    return context.sampleRate;
  }
}
