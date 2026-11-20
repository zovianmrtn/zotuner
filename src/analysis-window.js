// Keep enough cycles of low C in the window even on high-rate interfaces.
export function windowSize(rate) {
  return 128 * Math.ceil((rate * 0.064) / 128);
}
export function hopSize(rate) {
  return 128 * Math.ceil((rate * 0.012) / 128);
}
