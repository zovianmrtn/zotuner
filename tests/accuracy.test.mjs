import { windowSize } from "../src/analysis-window.js";
import test from "node:test";
import assert from "node:assert/strict";
import { detectPitch } from "../src/pitch.js";

function random(seed) {
  return () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32;
}
function fixture(f, rate, kind, seed, snr) {
  const rand = random(seed);
  const phase = rand() * 2 * Math.PI;
  const size = windowSize(rate);
  const samples = Float32Array.from({ length: size }, (_, i) => {
    const t = (2 * Math.PI * f * i) / rate + phase;
    if (kind === "sine") return 0.5 * Math.sin(t);
    if (kind === "pluck")
      return (
        Math.exp((-2 * i) / rate) *
        (0.1 * Math.sin(t) +
          0.5 * Math.sin(2 * t + 0.4) +
          0.2 * Math.sin(3 * t))
      );
    let sum = 0;
    for (let h = 1; h <= Math.min(18, Math.floor(rate / (2 * f))); h++)
      sum += (0.4 * Math.sin(h * t)) / h;
    return sum;
  });
  const power = samples.reduce((a, b) => a + b * b, 0) / size;
  const amplitude = Math.sqrt(12 * power * 10 ** (-snr / 10));
  return samples.map((x) => x + amplitude * (rand() - 0.5));
}
for (const snr of [80, 20])
  test("Pitch accuracy at " + snr + " dB SNR", (t) => {
    const errors = [];
    for (const rate of [44100, 48000, 96000])
      for (const hz of [
        60, 65.406, 73.416, 82.407, 98, 110, 146.832, 196, 246.942, 329.628,
        400, 775, 1000,
      ])
        for (const offset of [-17, 0, 13])
          for (const kind of ["sine", "pluck", "saw"]) {
            const f = hz * 2 ** (offset / 1200);
            if (f < 60 || f > 1000) continue;
            const { freq } = detectPitch(
              fixture(f, rate, kind, Math.round(f * rate), snr),
              rate,
            );
            errors.push({
              error: Math.abs(1200 * Math.log2(freq / f)),
              f,
              rate,
              kind,
            });
          }
    errors.sort((a, b) => a.error - b.error);
    const failures = errors.filter((r) => r.error > 1);
    t.diagnostic(
      JSON.stringify({
        cases: errors.length,
        overOneCent: failures.length,
        p95: errors[Math.floor(0.95 * errors.length)].error,
        worst: errors.at(-1),
      }),
    );
    assert.equal(failures.length, 0);
  });

test("Dominant second and third harmonics preserve the string octave", () => {
  for (const rate of [44100, 48000, 96000])
    for (const f of [65.406, 82.407, 110, 196, 329.628])
      for (const h of [2, 3]) {
        const samples = Float32Array.from(
          { length: windowSize(rate) },
          (_, i) => {
            const t = (2 * Math.PI * f * i) / rate;
            return 0.08 * Math.sin(t) + 0.65 * Math.sin(h * t + 0.2);
          },
        );
        const measured = detectPitch(samples, rate).freq;
        assert.ok(
          Math.abs(1200 * Math.log2(measured / f)) <= 1,
          JSON.stringify({ rate, f, h, measured }),
        );
      }
});
test("Broadband noise, DC and a sub-gate tone do not report a note", () => {
  const rand = random(78931);
  for (const rate of [44100, 48000, 96000])
    for (let n = 0; n < 30; n++) {
      const noise = Float32Array.from(
        { length: windowSize(rate) },
        () => 0.1 * (rand() - 0.5),
      );
      assert.equal(detectPitch(noise, rate).freq, 0);
    }
  for (const fill of [() => 0.1, (_, i) => 0.001 * Math.sin(i * 0.01)])
    assert.equal(
      detectPitch(Float32Array.from({ length: 3072 }, fill), 48000).freq,
      0,
    );
});
