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

// Generic typed DOM query helper. The type parameter only appears in the
// return type because we cannot instantiate the concrete subclass at runtime;
// the cast is safe after the HTMLElement guard above.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function requireElement<T extends HTMLElement>(
  sel: string,
  root: HTMLElement | Document = document,
  label = "UI",
): T {
  const el = root.querySelector(sel);
  if (!el) {
    throw new Error(`${label}: required element not found: ${sel}`);
  }
  if (!(el instanceof HTMLElement)) {
    throw new Error(`${label}: required element is not an HTMLElement: ${sel}`);
  }
  return el as T;
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
