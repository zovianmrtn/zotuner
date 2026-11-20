export const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export const all = <T extends Element = HTMLElement>(s: string) =>
  Array.from(document.querySelectorAll<T>(s));
export function put(id: string, value: string) {
  const node = el(id);
  if (node.textContent !== value) node.textContent = value;
}
export const pressed = (node: Element, value: boolean) =>
  node.setAttribute("aria-pressed", String(value));
