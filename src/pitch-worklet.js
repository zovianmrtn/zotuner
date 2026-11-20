import { detectPitch } from "./pitch.js";
class GuitarPitch extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { windowSize = 2048, hop = 1024 } = options.processorOptions || {};
    this.buffer = new Float32Array(windowSize);
    this.filled = 0;
    this.hop = hop;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const value of channel) {
      this.buffer[this.filled++] = value;
      if (this.filled === this.buffer.length) {
        this.port.postMessage(detectPitch(this.buffer, sampleRate));
        this.buffer.copyWithin(0, this.hop);
        this.filled -= this.hop;
      }
    }
    return true;
  }
}
registerProcessor("guitar-pitch", GuitarPitch);
