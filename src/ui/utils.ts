export function getEdibilityClass(ed: string): string {
  if (ed === "Poisonous") return "edibility-poisonous";
  if (ed === "Edible") return "edibility-edible";
  return "edibility-unknown";
}

export function show(el: HTMLElement): void {
  el.classList.remove("hidden");
}

export function hide(el: HTMLElement): void {
  el.classList.add("hidden");
}

export function isHidden(el: HTMLElement): boolean {
  return el.classList.contains("hidden");
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

export function createElWithChildren(
  tag: string,
  className?: string,
  children?: (Node | string)[],
): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (children) {
    for (const child of children) {
      el.appendChild(
        typeof child === "string" ? document.createTextNode(child) : child,
      );
    }
  }
  return el;
}
