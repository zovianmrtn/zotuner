import presets from "./tunings.json";

export type Preset = keyof typeof presets;
export type Mode = "auto" | "manual";
type Prefs = {
  preset: Preset;
  mode: Mode;
  a4: number;
  device: string;
  volume: number;
};
export const prefs: Prefs = {
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
export function save() {
  try {
    localStorage.setItem("zotuner", JSON.stringify(prefs));
  } catch {}
}
