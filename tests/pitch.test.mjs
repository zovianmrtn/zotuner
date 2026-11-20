import test from "node:test";
import assert from "node:assert/strict";
import { detectPitch } from "../src/pitch.js";
for (const rate of [44100, 48000])
  for (const frequency of [
    60, 65.406, 82.407, 98, 110, 146.832, 196, 246.942, 329.628, 400, 1000,
  ]) {
    test(rate + " Hz sample rate, " + frequency + " Hz string", () => {
      const samples = Float32Array.from({ length: 2048 }, (_, i) => {
        const phase = (2 * Math.PI * frequency * i) / rate;
        return (
          0.15 * Math.sin(phase) +
          0.35 * Math.sin(2 * phase) +
          0.1 * Math.sin(3 * phase)
        );
      });
      const { freq } = detectPitch(samples, rate);
      assert.ok(
        Math.abs(1200 * Math.log2(freq / frequency)) <= 1,
        "Detected " + freq,
      );
    });
  }
test("silence", () =>
  assert.equal(detectPitch(new Float32Array(2048), 48000).freq, 0));
