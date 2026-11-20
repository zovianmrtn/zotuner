const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const fallback of [false, true]) {
      const p = await browser.newPage();
      await p.addInitScript((fallback) => {
        if (fallback)
          Object.defineProperty(AudioContext.prototype, "audioWorklet", {
            get: () => undefined,
          });
        navigator.mediaDevices.getUserMedia = async () => {
          const ctx = new AudioContext();
          window.ctx = ctx;
          await ctx.resume();
          const out = ctx.createMediaStreamDestination();
          window.osc = ctx.createOscillator();
          osc.frequency.value = 110;
          osc.connect(out);
          osc.start();
          return out.stream;
        };
      }, fallback);
      await p.goto(process.env.ZOTUNER_TEST_URL || "http://localhost:4188");
      await p.click("#startBtn");
      await p.waitForFunction(
        () =>
          document.querySelector("#progressCount").textContent === "1/6 Tuned",
      );
      const result = await p.evaluate(async () => {
        const times = [];
        for (let i = 0; i < 24; i++) {
          const positive = i % 2 === 0;
          osc.frequency.value = 110 * 2 ** ((positive ? 20 : -20) / 1200);
          const start = performance.now();
          await new Promise((resolve, reject) => {
            function step() {
              const cents = parseFloat(
                document.querySelector("#centerCentDeviation").textContent,
              );
              if ((positive ? cents : -cents) >= 2) {
                times.push(performance.now() - start);
                resolve();
              } else if (performance.now() - start > 2000)
                reject(Error("No meter update"));
              else requestAnimationFrame(step);
            }
            step();
          });
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        return times.sort((a, b) => a - b);
      });
      console.log(
        fallback ? "AnalyserNode" : "AudioWorklet",
        "injected ±20 cents to signed display >2 cents (ms)",
        "p50",
        result[11],
        "p95",
        result[22],
        "max",
        result[23],
      );
      await p.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
