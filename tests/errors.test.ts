import { describe, it, expect } from "vitest";
import {
  AppError,
  ModelLoadError,
  InferenceError,
  CameraError,
  LabelMismatchError,
} from "@/core/errors";

describe("AppError", () => {
  it("creates error with code", () => {
    const err = new AppError("test", "TEST_CODE");
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe("AppError");
  });

  it("creates recoverable error", () => {
    const err = new AppError("test", "TEST_CODE", true);
    expect(err.recoverable).toBe(true);
  });
});

describe("ModelLoadError", () => {
  it("sets correct code and recoverable flag", () => {
    const err = new ModelLoadError("failed", "bvra");
    expect(err.code).toBe("MODEL_LOAD_FAILED");
    expect(err.modelKey).toBe("bvra");
    expect(err.recoverable).toBe(true);
  });
});

describe("InferenceError", () => {
  it("sets correct code", () => {
    const err = new InferenceError("inference failed");
    expect(err.code).toBe("INFERENCE_FAILED");
    expect(err.recoverable).toBe(true);
  });
});

describe("CameraError", () => {
  it("sets correct code", () => {
    const err = new CameraError("no camera");
    expect(err.code).toBe("CAMERA_UNAVAILABLE");
    expect(err.recoverable).toBe(true);
  });
});

describe("LabelMismatchError", () => {
  it("contains mismatch details", () => {
    const err = new LabelMismatchError(100, 200);
    expect(err.code).toBe("LABEL_LOGIT_MISMATCH");
    expect(err.message).toContain("100");
    expect(err.message).toContain("200");
    expect(err.recoverable).toBe(false);
  });
});
