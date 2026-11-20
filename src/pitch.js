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
  // Compare windows several periods apart. Smoothing suppresses broadband
  // noise, and a longer phase baseline resolves small tuning differences.
  const initial = best * stride;
  const width = Math.max(3, Math.round(initial / 6));
  const filtered = new Float64Array(samples.length - width + 1);
  let rolling = 0;
  for (let i = 0; i < samples.length; i++) {
    rolling += samples[i];
    if (i >= width) rolling -= samples[i - width];
    if (i >= width - 1) filtered[i - width + 1] = rolling;
  }
  function refine(period, cycles) {
    let lag = period * cycles;
    for (let iteration = 0; iteration < 4; iteration++) {
      const whole = Math.floor(lag);
      const fraction = lag - whole;
      let cross = 0,
        curvature = 0;
      for (let i = 0; i + whole + 1 < filtered.length; i++) {
        const j = i + whole;
        const slope = filtered[j + 1] - filtered[j];
        cross += (filtered[i] - filtered[j] - fraction * slope) * slope;
        curvature += slope * slope;
      }
      const correction = cross / (curvature || 1);
      lag += correction;
      if (Math.abs(correction) < 0.002) break;
    }
    return lag / cycles;
  }
  let period = refine(initial, 1);
  // A strong overtone can satisfy YIN before the true fundamental. Only
  // accept a longer period if it explains substantially more signal energy.
  function mismatch(lag) {
    const n = Math.floor(lag),
      mix = lag - n;
    let residual = 0,
      energy = 0;
    for (let i = 0; i + n + 1 < filtered.length; i += stride) {
      const a = filtered[i];
      const b = filtered[i + n] + mix * (filtered[i + n + 1] - filtered[i + n]);
      residual += (a - b) ** 2;
      energy += a * a + b * b;
    }
    return residual / (energy || 1);
  }
  const firstError = mismatch(period);
  if (firstError > 0.008) {
    for (const multiple of [2, 3]) {
      const longer = period * multiple;
      if (longer > rate / 59.5) break;
      if (mismatch(longer) < firstError * 0.23) {
        period = refine(longer, 1);
        break;
      }
    }
  }
  const cycles = Math.max(1, Math.round(filtered.length / (2 * period)));
  return {
    freq: rate / refine(period, cycles),
    confidence: 1 - scores[best],
    rms,
  };
}
