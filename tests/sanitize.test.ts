import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeText } from "@/core/sanitize";

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("'test'")).toBe("&#x27;test&#x27;");
  });

  it("leaves safe strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("escapes complex XSS payload", () => {
    const payload = '<img src=x onerror="alert(1)">';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
  });
});

describe("sanitizeText", () => {
  it("strips control characters", () => {
    expect(sanitizeText("hello\x00world")).toBe("helloworld");
  });

  it("strips DEL character", () => {
    expect(sanitizeText("hello\x7F")).toBe("hello");
  });

  it("escapes HTML after stripping", () => {
    expect(sanitizeText("<script>")).toBe("&lt;script&gt;");
  });

  it("preserves normal text", () => {
    expect(sanitizeText("Agaricus bisporus")).toBe("Agaricus bisporus");
  });
});
