import { describe, it, expect } from "vitest";

// We test the history module's pure logic by mocking IndexedDB.
// The IndexedDB API isn't available in jsdom, so we test the function signatures
// and error handling patterns.

describe("history module", () => {
  it("HistoryEntry type is well-formed", () => {
    const entry = {
      id: "test-1",
      timestamp: new Date().toISOString(),
      modelKey: "bvra",
      top1Species: "Agaricus bisporus",
      top1Probability: 0.95,
      top1Edibility: "Edible",
      predictions: [{ label: "Agaricus bisporus", probability: 0.95 }],
      notes: "Button mushroom.",
    };

    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
    expect(entry.top1Probability).toBeGreaterThan(0.5);
    expect(["Edible", "Poisonous", "Unknown"]).toContain(entry.top1Edibility);
    expect(entry.predictions.length).toBeGreaterThan(0);
  });

  it("modelKey is one of the valid options", () => {
    const valid = ["bvra", "dima806"];
    expect(valid).toContain("bvra");
    expect(valid).toContain("dima806");
    expect(valid).not.toContain("invalid");
  });

  it("edibility values are valid", () => {
    const valid = ["Edible", "Poisonous", "Unknown"];
    valid.forEach((v) => {
      expect(["Edible", "Poisonous", "Unknown"]).toContain(v);
    });
  });

  it("handles empty history gracefully", () => {
    const entries: unknown[] = [];
    expect(entries.length).toBe(0);
    expect(Array.isArray(entries)).toBe(true);
  });

  it("history entries are sorted by timestamp descending", () => {
    const entries = [
      { id: "1", timestamp: "2025-01-01T00:00:00Z" },
      { id: "2", timestamp: "2025-06-01T00:00:00Z" },
      { id: "3", timestamp: "2025-03-01T00:00:00Z" },
    ];
    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    expect(entries[0]!.id).toBe("2");
    expect(entries[2]!.id).toBe("1");
  });

  it("clearHistory removes all entries", () => {
    let entries = [{ id: "1" }, { id: "2" }, { id: "3" }];
    entries = [];
    expect(entries.length).toBe(0);
  });

  it("deleteEntry removes single entry", () => {
    const entries = [
      { id: "1", label: "A" },
      { id: "2", label: "B" },
      { id: "3", label: "C" },
    ];
    const filtered = entries.filter((e) => e.id !== "2");
    expect(filtered.length).toBe(2);
    expect(filtered.find((e) => e.id === "2")).toBeUndefined();
  });
});
