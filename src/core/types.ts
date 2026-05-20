export enum Edibility {
  Edible = "Edible",
  Poisonous = "Poisonous",
  Unknown = "Unknown",
}

export enum ModelKey {
  BVRA = "bvra",
  Dima806 = "dima806",
}

export enum ApplicationState {
  Loading = "loading",
  CameraActive = "camera_active",
  CameraError = "camera_error",
  Processing = "processing",
  Done = "done",
}

export enum InferenceWorkerMessageType {
  Status = "status",
  Result = "result",
  Error = "error",
}

export enum WorkerCommandType {
  Switch = "switch",
  Infer = "infer",
}

export interface SpeciesKnowledge {
  edibility: Edibility;
  notes: string;
}

export interface ModelRegistryEntry extends ModelConfig {
  knowledge: Record<string, SpeciesKnowledge>;
}

export interface ModelConfig {
  key: ModelKey;
  name: string;
  size: string;
  path: string;
  labels: string[];
  mean: [number, number, number];
  std: [number, number, number];
  expectedLabelCount: number;
}

export interface Prediction {
  label: string;
  probability: number;
  index: number;
}

export interface InferenceResult {
  logits: Float32Array;
  modelKey: ModelKey;
}

export interface WorkerStatusMessage {
  type: InferenceWorkerMessageType.Status;
  text: string;
  modelKey?: ModelKey;
}

export interface WorkerResultMessage {
  type: InferenceWorkerMessageType.Result;
  logits: number[];
  modelKey: ModelKey;
}

export interface WorkerErrorMessage {
  type: InferenceWorkerMessageType.Error;
  message: string;
}

export type WorkerMessage =
  | WorkerStatusMessage
  | WorkerResultMessage
  | WorkerErrorMessage;

export interface SwitchModelCommand {
  type: WorkerCommandType.Switch;
  modelPath: string;
  modelKey: ModelKey;
  mean: [number, number, number];
  std: [number, number, number];
}

export interface InferCommand {
  type: WorkerCommandType.Infer;
  modelKey: ModelKey;
  pixels: ArrayBuffer;
  width: number;
  height: number;
}

export type WorkerCommand = SwitchModelCommand | InferCommand;
