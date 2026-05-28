import { describe, it, expect } from "vitest";

describe("processFileInput", () => {
  it("is a function export", async () => {
    const { processFileInput } = await import("@/services/image-input");
    expect(typeof processFileInput).toBe("function");
  });
});
