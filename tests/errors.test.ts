import { describe, it, expect } from "vitest";
import {
  AppError,
  ModelLoadError,
  InferenceError,
  CameraError,
  LabelMismatchError,
} from "@/core/errors";

describe("error classes", () => {
  it("constructs an AppError with code and recoverable flag", () => {
    const err = new AppError("boom", "CODE", true);
    expect(err.message).toBe("boom");
    expect(err.code).toBe("CODE");
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe("AppError");
  });

  it("constructs a ModelLoadError", () => {
    const err = new ModelLoadError("failed", "bvra");
    expect(err.name).toBe("ModelLoadError");
    expect(err.code).toBe("MODEL_LOAD_FAILED");
    expect(err.modelKey).toBe("bvra");
    expect(err.recoverable).toBe(true);
  });

  it("constructs an InferenceError", () => {
    const err = new InferenceError("inference failed");
    expect(err.name).toBe("InferenceError");
    expect(err.code).toBe("INFERENCE_FAILED");
    expect(err.recoverable).toBe(true);
  });

  it("constructs a CameraError", () => {
    const err = new CameraError("no camera");
    expect(err.name).toBe("CameraError");
    expect(err.code).toBe("CAMERA_UNAVAILABLE");
    expect(err.recoverable).toBe(true);
  });

  it("constructs a LabelMismatchError", () => {
    const err = new LabelMismatchError(10, 12);
    expect(err.name).toBe("LabelMismatchError");
    expect(err.code).toBe("LABEL_LOGIT_MISMATCH");
    expect(err.recoverable).toBe(false);
    expect(err.message).toContain("10 labels vs 12 logits");
  });
});
