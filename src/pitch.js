// YIN on a downsampled window. Averaging before decimation limits high-frequency noise.
export function detectPitch(samples, rate) {
  const stride = Math.max(1, Math.floor(rate / 11000));
  const size = Math.floor(samples.length / stride);
  const data = new Float32Array(size);
  let energy = 0;
  for (let i = 0; i < size; i++) {
    let sum = 0;
    for (let j = 0; j < stride; j++) sum += samples[i * stride + j];
    data[i] = sum / stride;
    energy += data[i] ** 2;
  }
  const rms = Math.sqrt(energy / size);
  const quiet = { freq: 0, confidence: 0, rms };
  if (rms < 0.00316) return quiet;
  const sampleRate = rate / stride;
  const end = Math.min(size >> 1, Math.ceil(sampleRate / 60) + 2);
  const scores = new Float32Array(end + 1);
  let total = 0;
  let best = 0;
  for (let lag = 1; lag <= end; lag++) {
    let difference = 0;
    for (let i = 0; i < size - end; i++)
      difference += (data[i] - data[i + lag]) ** 2;
    total += difference;
    scores[lag] = total ? (difference * lag) / total : 1;
    const previous = lag - 1;
    if (
      previous >= Math.floor(sampleRate / 1000) &&
      scores[previous] < 0.14 &&
      scores[lag] > scores[previous]
    ) {
      best = previous;
      break;
    }
  }
  if (!best) return quiet;
  // Refine the period on the original waveform for sub-cent interpolation.
  const coarse = best * stride;
  function error(lag) {
    let sum = 0;
    const count = samples.length - coarse - stride - 2;
    for (let i = 0; i < count; i += stride)
      sum += (samples[i] - samples[i + lag]) ** 2;
    return sum;
  }
  let center = coarse;
  let min = Infinity;
  for (let lag = coarse - stride; lag <= coarse + stride; lag++) {
    const value = error(lag);
    if (value < min) {
      center = lag;
      min = value;
    }
  }
  const left = error(center - 1),
    right = error(center + 1);
  const offset = (left - right) / (2 * (left + right - 2 * min)) || 0;
  return {
    freq: (sampleRate * stride) / (center + offset),
    confidence: 1 - scores[best],
    rms,
  };
}
