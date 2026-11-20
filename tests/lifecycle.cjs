const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  try {
    const p = await b.newPage();
    await p.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
      navigator.mediaDevices.getUserMedia = () =>
        new Promise((resolve) => {
          window.grant = () => {
            const a = new AudioContext(),
              d = a.createMediaStreamDestination();
            window.track = d.stream.getTracks()[0];
            resolve(d.stream);
          };
        });
    });
    await p.goto(process.env.ZOTUNER_TEST_URL || "http://localhost:4188");
    await p.click("[data-preset=opend]");
    await p.click("#startBtn");
    await p.waitForFunction(() => typeof grant === "function");
    await p.click("#liveMicToggle");
    await p.evaluate(() => grant());
    await p.waitForFunction(() => track.readyState === "ended");
    assert.match(await p.locator("#verdictPill").innerText(), /Paused/);
    await p.click("#settingsBtn");
    for (const [v, want] of [
      ["409", "410"],
      ["481", "480"],
      ["432.3", "432.3"],
    ]) {
      await p.locator("#a4").fill(v);
      await p.locator("#a4").press("Tab");
      assert.equal(await p.locator("#footerA4").innerText(), want);
    }
    await p.keyboard.press("Escape");
    assert.equal(await p.locator("#settings").isVisible(), false);
    console.log(
      "Blocked storage, cancellation with late grant, track release, calibration limits and dialog Escape passed",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
