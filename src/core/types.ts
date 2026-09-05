export type JsonObject = Record<string, unknown>;
export type FieldPath = Array<string | number>;
export type CardSource = "json" | "png";
export type CardVersion = "v1" | "v2" | "v3" | "unknown";
export type Confidence = "high" | "medium" | "low";

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

export interface PngDocument {
  chunks: PngChunk[];
  metadataKeyword: "chara" | "ccv3";
}

export interface EditableField {
  id: string;
  path: FieldPath;
  label: string;
  value: string;
  originalValue: string;
}

export interface ImportedCard {
  fileName: string;
  source: CardSource;
  version: CardVersion;
  originalBytes: Uint8Array;
  card: JsonObject;
  originalCard: JsonObject;
  png?: PngDocument;
  fields: EditableField[];
  warnings: string[];
}

export interface EditProposal {
  id: string;
  ruleId: string;
  category: "macro" | "formatting" | "punctuation" | "structure";
  start: number;
  end: number;
  before: string;
  after: string;
  confidence: Confidence;
  explanation: string;
}
