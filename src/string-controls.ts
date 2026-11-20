import { all, el, pressed } from "./dom";

export function createStringControls(selectString: (index: number) => void) {
  const pegs = all<SVGGElement>("#headstock g.cursor-pointer");
  const pegLabels = all<SVGTextElement>("#headstock g[font-family] text");
  const stringPaths = all<SVGPathElement>(
    "#headstock svg > path[stroke-linecap]",
  );
  stringPaths.at(-1)?.remove();
  const rows = pegs.map((peg, i) => {
    const button = document.createElement("button");
    button.className = "string-row";
    button.innerHTML =
      "<b></b><span><strong></strong><small></small></span><em></em>";
    button.onclick = () => selectString(i);
    el("stringsContainer").append(button);
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

  return function renderStrings(
    strings: readonly { note: string; octave: number }[],
    frequency: (index: number) => number,
    target: number,
    locked: ReadonlySet<number>,
  ) {
    strings.forEach((s, i) => {
      const row = rows[i],
        chosen = i === target;
      row.querySelector("b")!.textContent = String(6 - i);
      row.querySelector("strong")!.textContent = s.note + s.octave;
      row.querySelector("small")!.textContent = frequency(i).toFixed(2) + " Hz";
      row.querySelector("em")!.textContent = locked.has(i)
        ? "✓"
        : chosen
          ? "◎"
          : "○";
      const name =
        "String " +
        (6 - i) +
        ", " +
        s.note +
        s.octave +
        (locked.has(i) ? ", tuned" : "");
      row
        .querySelector("em")!
        .setAttribute(
          "aria-label",
          locked.has(i) ? "Tuned" : chosen ? "Selected" : "Untuned",
        );
      pegs[i].setAttribute("aria-label", name);
      pressed(row, chosen);
      pressed(pegs[i], chosen);
      pegs[i].classList.toggle("done", locked.has(i));
      pegLabels[i].textContent = s.note + ["₀", "₁", "₂", "₃", "₄"][s.octave];
      pegLabels[i].setAttribute("fill", chosen ? "#10b981" : "#b9bdc7");
      stringPaths[i].removeAttribute("filter");
      stringPaths[i].setAttribute("stroke", chosen ? "#10b981" : "#9699a4");
    });
  };
}
