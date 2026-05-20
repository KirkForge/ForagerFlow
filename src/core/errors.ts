export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ModelLoadError extends AppError {
  constructor(message: string, public readonly modelKey: string) {
    super(message, "MODEL_LOAD_FAILED", true);
    this.name = "ModelLoadError";
  }
}

export class InferenceError extends AppError {
  constructor(message: string) {
    super(message, "INFERENCE_FAILED", true);
    this.name = "InferenceError";
  }
}

export class CameraError extends AppError {
  constructor(message: string) {
    super(message, "CAMERA_UNAVAILABLE", true);
    this.name = "CameraError";
  }
}

export class LabelMismatchError extends AppError {
  constructor(labelsLen: number, logitsLen: number) {
    super(
      `Label/logit mismatch: ${String(labelsLen)} labels vs ${String(logitsLen)} logits`,
      "LABEL_LOGIT_MISMATCH",
      false,
    );
    this.name = "LabelMismatchError";
  }
}
