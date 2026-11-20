const { chromium, firefox, webkit } = require("playwright");
const Axe = require("@axe-core/playwright").default;
const assert = require("node:assert/strict");
async function run(name, engine, options) {
  const b = await engine.launch(options);
  const failures = [];
  try {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    p.setDefaultTimeout(6000);
    p.on("pageerror", (e) => failures.push(e.message));
    await p.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.getUserMedia = async () => {
        if (window.inputError)
          throw new DOMException("test", window.inputError);
        window.audio = new AudioContext();
        await audio.resume();
        const dest = audio.createMediaStreamDestination();
        window.osc = audio.createOscillator();
        window.gain = audio.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(dest);
        osc.start();
        window.stream = dest.stream;
        return stream;
      };
    });
    await p.goto(process.env.ZOTUNER_TEST_URL || "http://localhost:4188");
    await p.locator(".string-row").first().waitFor();
    for (const button of await p.locator("[data-preset]").all()) {
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(await p.locator(".string-row").count(), 6);
    }
    await p.locator("[data-preset=standard]").click();
    for (const w of [360, 390, 768, 1024, 1280]) {
      await p.setViewportSize({ width: w, height: 820 });
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    const axe = await new Axe({ page: p }).analyze();
    console.log(
      name,
      "AXE",
      JSON.stringify(
        axe.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]),
      ),
    );
    assert.equal(axe.violations.length, 0);
    if (
      !(await p.evaluate(
        () => !!window.AudioContext && !!navigator.mediaDevices,
      ))
    ) {
      await p.locator("#startBtn").click();
      assert.match(
        await p.locator("#hint").textContent(),
        /browser with microphone/,
      );
      console.log(name, b.version(), "UI + unsupported audio state only");
      return;
    }
    for (const [error, msg] of [
      ["NotAllowedError", "blocked"],
      ["NotFoundError", "No microphone"],
      ["NotReadableError", "busy"],
    ]) {
      await p.evaluate((e) => (window.inputError = e), error);
      await p.locator("#startBtn").click();
      await p.waitForFunction(
        (s) => document.querySelector("#hint").textContent.includes(s),
        msg,
      );
    }
    await p.evaluate(() => (window.inputError = ""));
    await p.locator("#startBtn").click();
    await p.waitForFunction(() =>
      document.querySelector("#footerMic").textContent.includes("live"),
    );
    for (const [i, f] of [
      82.4069, 110, 146.8324, 195.9977, 246.9417, 329.6276,
    ].entries()) {
      await p.evaluate((f) => {
        osc.frequency.value = f;
        gain.gain.value = 0.3;
      }, f);
      await p.waitForFunction(
        (n) =>
          document.querySelector("#progressCount").textContent ===
          n + "/6 Tuned",
        i + 1,
      );
    }
    await p.locator("#playRefToneBtn").click();
    await p.waitForFunction(
      () => document.querySelector("#detectedFreqDisplay").textContent === "—",
    );
    await p.evaluate(() => (gain.gain.value = 0));
    await p.waitForFunction(() =>
      document.querySelector("#verdictPill").textContent.includes("Pluck"),
    );
    await p.locator("#resetTunerState").click();
    assert.equal(await p.locator("#progressCount").textContent(), "0/6 Tuned");
    await p.locator("#liveMicToggle").click();
    assert.equal(
      await p.evaluate(() => stream.getTracks()[0].readyState),
      "ended",
    );
    await p.locator("#settingsBtn").click();
    await p.locator("#a4").fill("432");
    await p.locator("#a4").press("Tab");
    await p.getByLabel("Close settings").click();
    await p.reload();
    assert.equal(await p.locator("#footerA4").textContent(), "432");
    assert.deepEqual(failures, []);
    console.log(name, b.version(), "PASS");
  } catch (e) {
    const p = b.contexts()[0].pages()[0];
    console.log(
      name,
      "STATE",
      await p.locator("#hint").textContent(),
      await p.locator("#footerMic").textContent(),
      await p.locator("#verdictPill").textContent(),
      await p.evaluate(() => window.audio?.state),
    );
    throw e;
  } finally {
    await b.close();
  }
}
(async () => {
  const results = await Promise.allSettled(
    [
      ["Chrome", chromium, { channel: "chrome" }],
      ["Edge", chromium, { channel: "msedge" }],
      ["Firefox", firefox, {}],
      ["WebKit", webkit, {}],
    ].map(async (args) => {
      try {
        await run(...args);
      } catch (e) {
        console.error(args[0], e.stack);
        throw e;
      }
    }),
  );
  if (results.some((r) => r.status === "rejected")) process.exitCode = 1;
})();
