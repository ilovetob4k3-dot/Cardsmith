import { isPng, readCharacterMetadata, writeCharacterMetadata } from "./png";
import type { CardVersion, EditableField, FieldPath, ImportedCard, JsonObject } from "./types";

const directTextKeys = [
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions"
] as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function detectVersion(card: JsonObject): CardVersion {
  const spec = typeof card.spec === "string" ? card.spec.toLowerCase() : "";
  const version = String(card.spec_version ?? "").toLowerCase();
  if (spec.includes("v3") || version.startsWith("3")) return "v3";
  if (spec.includes("v2") || version.startsWith("2") || card.data) return "v2";
  if (typeof card.name === "string" && typeof card.description === "string") return "v1";
  return "unknown";
}

function getAtPath(root: unknown, path: FieldPath): unknown {
  let current = root;
  for (const part of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

export function setAtPath(root: JsonObject, path: FieldPath, value: string): JsonObject {
  const result = clone(root);
  let current: unknown = result;
  path.forEach((part, index) => {
    if (index === path.length - 1) {
      (current as Record<string | number, unknown>)[part] = value;
    } else {
      current = (current as Record<string | number, unknown>)[part];
    }
  });
  return result;
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function extractEditableFields(card: JsonObject, originalCard: JsonObject = card): EditableField[] {
  const fields: EditableField[] = [];
  const basePath: FieldPath = card.data && typeof card.data === "object" ? ["data"] : [];
  const add = (path: FieldPath, label: string) => {
    const value = getAtPath(card, path);
    if (typeof value !== "string") return;
    const original = getAtPath(originalCard, path);
    fields.push({
      id: path.join("."),
      path,
      label,
      value,
      originalValue: typeof original === "string" ? original : value
    });
  };

  for (const key of directTextKeys) add([...basePath, key], titleCase(key));
  const greetingsPath = [...basePath, "alternate_greetings"];
  const greetings = getAtPath(card, greetingsPath);
  if (Array.isArray(greetings)) {
    greetings.forEach((value, index) => {
      if (typeof value === "string") add([...greetingsPath, index], `Alternate Greeting ${index + 1}`);
    });
  }

  const possibleBooks = [
    [...basePath, "character_book"],
    [...basePath, "lorebook"],
    ["character_book"],
    ["lorebook"]
  ];
  const seen = new Set<string>();
  for (const bookPath of possibleBooks) {
    const book = getAtPath(card, bookPath);
    if (!book || typeof book !== "object") continue;
    const entries = (book as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || typeof (entry as { content?: unknown }).content !== "string") return;
      const path = [...bookPath, "entries", index, "content"];
      const id = path.join(".");
      if (!seen.has(id)) {
        seen.add(id);
        add(path, `Lorebook Entry ${index + 1}`);
      }
    });
  }
  return fields;
}

function parseJson(bytes: Uint8Array): JsonObject {
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The JSON root must be an object.");
  return parsed as JsonObject;
}

export function importCardBytes(fileName: string, bytes: Uint8Array): ImportedCard {
  const warnings: string[] = [];
  let card: JsonObject;
  let png: ImportedCard["png"];
  const source = isPng(bytes) ? "png" : "json";
  if (source === "png") {
    const parsed = readCharacterMetadata(bytes);
    card = parsed.card;
    png = parsed.png;
    if (png.metadataKeyword === "chara" && detectVersion(card) === "v3") warnings.push("V3-shaped data was stored in a legacy chara chunk.");
  } else {
    card = parseJson(bytes);
  }
  const originalCard = clone(card);
  const version = detectVersion(card);
  const fields = extractEditableFields(card, originalCard);
  const lowerFileName = fileName.toLowerCase();
  if (version === "unknown") warnings.push("The character-card schema was not recognized. Unknown data will be preserved, but compatibility is not guaranteed.");
  if (fields.length === 0) warnings.push("No recognized editable text fields were found in this card.");
  if (source === "png" && !lowerFileName.endsWith(".png")) warnings.push("The file contains PNG data but does not use a .png filename extension.");
  if (source === "json" && !lowerFileName.endsWith(".json")) warnings.push("The file contains JSON data but does not use a .json filename extension.");
  return {
    fileName,
    source,
    version,
    originalBytes: bytes.slice(),
    card,
    originalCard,
    png,
    fields,
    warnings
  };
}

export function updateCardField(workspace: ImportedCard, path: FieldPath, value: string): ImportedCard {
  const card = setAtPath(workspace.card, path, value);
  return { ...workspace, card, fields: extractEditableFields(card, workspace.originalCard) };
}

export function exportCardBytes(workspace: ImportedCard): Uint8Array {
  if (workspace.source === "png") {
    if (!workspace.png) throw new Error("PNG source metadata is missing.");
    return writeCharacterMetadata(workspace.png, workspace.card);
  }
  return new TextEncoder().encode(`${JSON.stringify(workspace.card, null, 2)}\n`);
}
