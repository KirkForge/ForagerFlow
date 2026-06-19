export function getEdibilityClass(ed: string): string {
  if (ed === "Poisonous") return "edibility-poisonous";
  if (ed === "Edible") return "edibility-edible";
  return "edibility-unknown";
}

export function createEl(
  tag: string,
  className?: string,
  text?: string,
): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
