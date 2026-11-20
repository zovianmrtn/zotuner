import presets from "./tunings.json";
import { Input, type Reading } from "./audio";
type Preset = keyof typeof presets;
type Mode = "auto" | "manual";
type Prefs = {
  preset: Preset;
  mode: Mode;
  a4: number;
  device: string;
  volume: number;
};
const prefs: Prefs = {
  preset: "standard",
  mode: "auto",
  a4: 440,
  device: "",
  volume: 0.12,
};
try {
  const saved = JSON.parse(localStorage.getItem("zotuner") || "{}");
  if (Object.hasOwn(presets, saved.preset)) prefs.preset = saved.preset;
  if (saved.mode === "manual") prefs.mode = "manual";
  if (saved.a4 >= 410 && saved.a4 <= 480 && typeof saved.a4 === "number")
    prefs.a4 = saved.a4;
  if (
    saved.volume >= 0 &&
    saved.volume <= 0.4 &&
    typeof saved.volume === "number"
  )
    prefs.volume = saved.volume;
  if (typeof saved.device === "string") prefs.device = saved.device;
} catch {
  /* Private storage is optional. */
}
function save() {
  try {
    localStorage.setItem("zotuner", JSON.stringify(prefs));
  } catch {}
}
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const all = <T extends Element = HTMLElement>(s: string) =>
  Array.from(document.querySelectorAll<T>(s));
function put(id: string, value: string) {
  const node = el(id);
  if (node.textContent !== value) node.textContent = value;
}
const pressed = (node: Element, value: boolean) =>
  node.setAttribute("aria-pressed", String(value));
const strings = () => presets[prefs.preset];
const hz = (index: number) =>
  prefs.a4 * 2 ** ((strings()[index].midi - 69) / 12);
const label = (i: number) => strings()[i].note + strings()[i].octave;
const input = new Input();
const locked = new Set<number>();
let target = 5,
  stable = 0,
  drifting = 0,
  candidate = -1,
  count = 0;
let state: "idle" | "request" | "live" | "paused" | "error" = "idle";
let message = "Allow microphone access to tune. Audio stays on your device.";
let sampleRate = 0,
  epoch = 0,
  referenceUntil = 0;
let recent: number[] = [],
  lastReading = 0,
  noisySince = 0;
let smoothedHz = 0;
let lastSmoothTime = 0;
let candidateSince = 0;
function resetTracking() {
  stable = 0;
  drifting = 0;
  smoothedHz = 0;
  lastSmoothTime = 0;
  recent = [];
  candidate = -1;
  count = 0;
  lastReading = 0;
  noisySince = 0;
}
const pegs = all<SVGGElement>("#headstock g.cursor-pointer");
const pegLabels = all<SVGTextElement>("#headstock g[font-family] text");
const stringPaths = all<SVGPathElement>(
  "#headstock svg > path[stroke-linecap]",
);
stringPaths.at(-1)?.remove();
const rows = strings().map((_, i) => {
  const button = document.createElement("button");
  button.className = "string-row";
  button.innerHTML =
    "<b></b><span><strong></strong><small></small></span><em></em>";
  button.onclick = () => selectString(i);
  el("stringsContainer").append(button);
  const peg = pegs[i];
  peg.setAttribute("tabindex", "0");
  peg.setAttribute("role", "button");
  peg.onclick = () => selectString(i);
  peg.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectString(i);
    }
  };
  return button;
});
function controls() {
  strings().forEach((s, i) => {
    const row = rows[i],
      chosen = i === target;
    row.querySelector("b")!.textContent = String(6 - i);
    row.querySelector("strong")!.textContent = label(i);
    row.querySelector("small")!.textContent = hz(i).toFixed(2) + " Hz";
    row.querySelector("em")!.textContent = locked.has(i)
      ? "✓"
      : chosen
        ? "◎"
        : "○";
    const name =
      "String " + (6 - i) + ", " + label(i) + (locked.has(i) ? ", tuned" : "");
    row.setAttribute("aria-label", name);
    pegs[i].setAttribute("aria-label", name);
    pressed(row, chosen);
    pressed(pegs[i], chosen);
    pegs[i].classList.toggle("done", locked.has(i));
    pegLabels[i].textContent = s.note + ["₀", "₁", "₂", "₃", "₄"][s.octave];
    pegLabels[i].setAttribute("fill", chosen ? "#10b981" : "#b9bdc7");
    stringPaths[i].removeAttribute("filter");
    stringPaths[i].setAttribute("stroke", chosen ? "#10b981" : "#9699a4");
  });
  put("progressCount", locked.size + "/6 Tuned");
  put("targetStringBadge", "String " + (6 - target) + " • " + label(target));
  put("centerNoteLetter", strings()[target].note);
  put("centerNoteOctave", String(strings()[target].octave));
  put("targetFreqDisplay", hz(target).toFixed(2) + " Hz");
  put("playToneBtnLabel", "Play Reference Pitch (" + label(target) + ")");
  const pill = all("[data-preset]").find(
    (b) => b.dataset.preset === prefs.preset,
  )!;
  put(
    "tuningPresetTitle",
    pill.firstChild?.textContent?.trim() || prefs.preset,
  );
  put(
    "currentTuningNotesDisplay",
    strings()
      .map((_, i) => label(i))
      .join(" • "),
  );
  all("[data-preset]").forEach((b) => pressed(b, b === pill));
  all("[data-mode]").forEach((b) => pressed(b, b.dataset.mode === prefs.mode));
  pressed(el("cal440"), prefs.a4 === 440);
  pressed(el("cal432"), prefs.a4 === 432);
  put("footerA4", String(prefs.a4));
  el<HTMLInputElement>("a4").value = String(prefs.a4);
  el<HTMLInputElement>("volume").value = String(prefs.volume);
}
function readout(freq = 0) {
  const cents = freq ? 1200 * Math.log2(freq / hz(target)) : 0;
  const verdict = !freq ? "idle" : Math.abs(cents) <= 2 ? "tuned" : "off";
  const status = !freq
    ? {
        idle: "Ready",
        request: "Awaiting mic",
        live:
          performance.now() < referenceUntil
            ? "Reference tone"
            : "Pluck a string",
        paused: "Paused",
        error: "Mic unavailable",
      }[state]
    : verdict === "tuned"
      ? "✓ In tune"
      : cents < 0
        ? "↑ Tune up · Flat"
        : "↓ Tune down · Sharp";
  put("verdictPill", status);
  el("verdictPill").dataset.verdict = verdict;
  const needle = el("centNeedle");
  needle.dataset.verdict = verdict;
  needle.style.left =
    50 + Math.min(50, Math.max(-50, Math.abs(cents) <= 1 ? 0 : cents)) + "%";
  el("tuneGlow").style.opacity = verdict === "tuned" ? "1" : "0";
  const signed = (v: number, digits: number) =>
    (v >= 0 ? "+" : "") + v.toFixed(digits);
  put("centerCentDeviation", freq ? signed(cents, 1) + " cents" : "— cents");
  put("detectedFreqDisplay", freq ? freq.toFixed(2) + " Hz" : "—");
  put("diffFreqDisplay", freq ? signed(freq - hz(target), 2) + " Hz" : "—");
}
function micUI() {
  const live = state === "live",
    pending = state === "request";
  const action = live
    ? "Listening"
    : pending
      ? "Cancel"
      : state === "error"
        ? "Try again"
        : state === "paused"
          ? "Resume"
          : "Start tuning";
  el("liveMicToggle").lastElementChild!.textContent = action;
  el("liveMicToggle").title = live ? "Pause microphone" : action;
  el("startBtn").hidden = live || pending;
  put("startBtn", action);
  put("hint", message);
  el("intro").hidden = live && !message;
  put(
    "footerMic",
    live
      ? "Mic live (" + sampleRate / 1000 + " kHz)"
      : "Mic " + (pending ? "requested" : "off"),
  );
  readout();
}
function receive({ freq, rms }: Reading) {
  if (state !== "live") return;
  const now = performance.now();
  if (now < referenceUntil) {
    resetTracking();
    readout();
    return;
  }
  if (!freq) {
    stable = drifting = count = 0;
    recent = [];
    if (rms > 0.00316) {
      noisySince ||= now;
    } else noisySince = 0;
    if (noisySince && now - noisySince > 5000) {
      put("hint", "Move the microphone closer to your guitar.");
      el("intro").hidden = false;
    }
    if (now - lastReading > 1000) { smoothedHz = 0; readout(); }
    return;
  }
  el("intro").hidden = true;
  noisySince = 0;
  lastReading = now;
  recent.push(freq);
  if (recent.length > 5) recent.shift();
  const sorted = [...recent].sort((a, b) => a - b);
  freq = sorted[Math.floor(sorted.length / 2)];
  const delta = (i: number) => 1200 * Math.log2(freq / hz(i));
  if (prefs.mode === "auto") {
    let nearest = 0;
    for (let i = 1; i < 6; i++)
      if (Math.abs(delta(i)) < Math.abs(delta(nearest))) nearest = i;
    // A different string must win by a meaningful margin across a sustained pluck.
    if (nearest !== target && Math.abs(delta(nearest)) + 25 < Math.abs(delta(target))) {
      stable = drifting = 0;
      if (candidate !== nearest || count === 0) {
        candidate = nearest;
        candidateSince = now;
      }
      count++;
      if (now - candidateSince < 140) return;
      target = nearest;
      smoothedHz = 0;
      controls();
      put("announcement", "Target " + label(target));
    }
    count = 0;
  }
  const elapsed = Math.min(100, now - lastSmoothTime);
  const weight = 1 - Math.exp(-elapsed / 120);
  smoothedHz = smoothedHz ? smoothedHz * (freq / smoothedHz) ** weight : freq;
  lastSmoothTime = now;
  if (Math.abs(delta(target)) <= 2) {
    drifting = 0;
    stable ||= now;
    if (now - stable >= 500 && !locked.has(target)) {
      locked.add(target);
      controls();
      put(
        "announcement",
        locked.size === 6
          ? "All six strings tuned. Ready to play."
          : label(target) + " tuned",
      );
    }
  } else {
    stable = 0;
    if (Math.abs(delta(target)) > 10) {
      drifting ||= now;
      if (now - drifting >= 2000 && locked.delete(target)) controls();
    } else drifting = 0;
  }
  readout(smoothedHz);
}
async function devices() {
  const list = (await navigator.mediaDevices?.enumerateDevices?.()) || [];
  for (const id of ["deviceSelector", "deviceAlt"]) {
    const select = el<HTMLSelectElement>(id);
    select.replaceChildren(new Option("Default microphone", ""));
    list
      .filter(
        (d) =>
          d.kind === "audioinput" && d.deviceId && d.deviceId !== "default",
      )
      .forEach((d, i) =>
        select.add(new Option(d.label || "Input " + (i + 1), d.deviceId)),
      );
    select.value = prefs.device;
  }
  return list;
}
function pause() {
  epoch++;
  input.stop();
  resetTracking();
  state = "paused";
  message = "Microphone paused.";
  micUI();
}
async function start() {
  const ticket = ++epoch;
  resetTracking();
  state = "request";
  message = "Allow microphone access in your browser.";
  micUI();
  try {
    if (!isSecureContext)
      throw Error(
        "Open ZoTuner over HTTPS or localhost to use the microphone.",
      );
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
      throw Error("Use a browser with microphone and Web Audio support.");
    let rate;
    try {
      rate = await input.start(prefs.device, receive);
    } catch (e) {
      if (ticket !== epoch) return;
      if (
        !prefs.device ||
        !(e instanceof DOMException) ||
        !["OverconstrainedError", "NotFoundError"].includes(e.name)
      )
        throw e;
      prefs.device = "";
      save();
      rate = await input.start("", receive);
    }
    if (ticket !== epoch || !rate) return;
    state = "live";
    sampleRate = rate;
    message = "";
    micUI();
    void devices().catch(() => {});
  } catch (err) {
    if (ticket !== epoch) return;
    input.stop();
    const errors: Record<string, string> = {
      NotAllowedError:
        "Microphone access is blocked. Allow it in your browser’s site settings, then try again.",
      NotFoundError: "No microphone found. Connect an input and try again.",
      NotReadableError:
        "Microphone is busy. Close other audio apps or choose another input in Settings.",
    };
    message =
      err instanceof Error
        ? errors[err.name] || err.message
        : "Could not open the microphone.";
    state = "error";
    micUI();
    put("announcement", message);
  }
}
el("startBtn").onclick = () => void start();
el("liveMicToggle").onclick = () =>
  state === "live" || state === "request" ? pause() : void start();
for (const id of ["deviceSelector", "deviceAlt"])
  el<HTMLSelectElement>(id).onchange = (e) => {
    prefs.device = (e.target as HTMLSelectElement).value;
    save();
    if (state === "live" || state === "request") void start();
    else void devices().catch(() => {});
  };
navigator.mediaDevices?.addEventListener("devicechange", async () => {
  const list = await devices().catch(() => null);
  if (list && prefs.device && !list.some((d) => d.deviceId === prefs.device)) {
    prefs.device = "";
    save();
    put("announcement", "Input disconnected. Using default microphone.");
    if (state === "live") void start();
  }
});
let player: AudioContext | undefined,
  osc: OscillatorNode | undefined,
  toneId = 0;
function cancelTone() {
  toneId++;
  if (osc) {
    try {
      osc.stop();
    } catch {}
    osc = undefined;
  }
  referenceUntil = 0;
}
async function reference() {
  cancelTone();
  const ticket = toneId;
  try {
    player ||= new AudioContext();
    await player.resume();
    if (ticket !== toneId) return;
    const oscillator = player.createOscillator(),
      gain = player.createGain(),
      now = player.currentTime;
    osc = oscillator;
    osc.type = hz(target) < 120 ? "triangle" : "sine";
    osc.frequency.value = hz(target);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      Math.max(0.0001, prefs.volume),
      now + 0.04,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    osc.connect(gain).connect(player.destination);
    referenceUntil = performance.now() + 1300;
    resetTracking();
    readout();
    osc.start();
    osc.stop(now + 1.12);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    put("announcement", "Reference audio unavailable.");
  }
}
function selectString(i: number) {
  prefs.mode = "manual";
  target = i;
  save();
  resetTracking();
  controls();
  readout();
  void reference();
}
el("playRefToneBtn").onclick = () => void reference();
el("modeAutoBtn").dataset.mode = "auto";
el("modeManualBtn").dataset.mode = "manual";
all("[data-mode]").forEach(
  (b) =>
    (b.onclick = () => {
      prefs.mode = b.dataset.mode as Mode;
      save();
      resetTracking();
      controls();
      readout();
    }),
);
all("[data-preset]").forEach(
  (b) =>
    (b.onclick = () => {
      if (prefs.preset === b.dataset.preset) return;
      cancelTone();
      prefs.preset = b.dataset.preset as Preset;
      locked.clear();
      resetTracking();
      save();
      controls();
      readout();
    }),
);
function calibrate(value: number) {
  if (!Number.isFinite(value)) value = prefs.a4;
  cancelTone();
  prefs.a4 = Math.round(Math.max(410, Math.min(480, value)) * 10) / 10;
  locked.clear();
  resetTracking();
  save();
  controls();
  readout();
}
el("cal440").onclick = el("resetA").onclick = () => calibrate(440);
el("cal432").onclick = () => calibrate(432);
el("plus").onclick = (e) => calibrate(prefs.a4 + (e.shiftKey ? 0.1 : 1));
el("minus").onclick = (e) => calibrate(prefs.a4 - (e.shiftKey ? 0.1 : 1));
el<HTMLInputElement>("a4").onchange = (e) =>
  calibrate((e.target as HTMLInputElement).valueAsNumber);
el<HTMLInputElement>("volume").oninput = (e) => {
  prefs.volume = Number((e.target as HTMLInputElement).value);
  save();
};
el("resetTunerState").onclick = () => {
  locked.clear();
  resetTracking();
  controls();
  readout();
  put("announcement", "String checks reset");
};
el("fold").onclick = () => {
  const open = el("headstock").classList.toggle("expanded");
  put("fold", open ? "Hide headstock" : "Show headstock");
  el("fold").setAttribute("aria-expanded", String(open));
};
el("settingsBtn").onclick = () => {
  el<HTMLDialogElement>("settings").showModal();
  void devices().catch(() => {});
};
el("verdictPill").setAttribute("role", "status");
window.addEventListener("pagehide", () => {
  pause();
  cancelTone();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state === "live")
    void input.resume()?.catch(() => {});
});
controls();
micUI();
