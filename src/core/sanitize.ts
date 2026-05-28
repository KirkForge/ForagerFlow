const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(str: string): string {
  return str.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch] ?? ch);
}

export function sanitizeText(str: string): string {
  // eslint-disable-next-line no-control-regex
  return escapeHtml(str.replace(/[\x00-\x1F\x7F]/g, ""));
}
