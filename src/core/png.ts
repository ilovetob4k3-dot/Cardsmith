import { base64ToText, textToBase64 } from "./base64";
import { crc32 } from "./crc32";
import type { JsonObject, PngChunk, PngDocument } from "./types";

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value >>> 0);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && equalBytes(bytes.slice(0, 8), PNG_SIGNATURE);
}

export function parsePng(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error("This file does not have a valid PNG signature.");
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("The PNG contains a truncated chunk.");
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = new TextDecoder("ascii").decode(typeBytes);
    const data = bytes.slice(offset + 8, offset + 8 + length);
    const expected = readU32(bytes, offset + 8 + length);
    const actual = crc32([typeBytes, data]);
    if (expected !== actual) throw new Error(`PNG chunk ${type} failed its CRC check.`);
    chunks.push({ type, data });
    offset = end;
    if (type === "IEND") break;
  }
  if (chunks.at(-1)?.type !== "IEND") throw new Error("The PNG is missing its IEND chunk.");
  return chunks;
}

function readTextChunk(chunk: PngChunk): { keyword: string; value: string } | null {
  if (chunk.type !== "tEXt") return null;
  const separator = chunk.data.indexOf(0);
  if (separator < 1) return null;
  return {
    keyword: new TextDecoder("latin1").decode(chunk.data.slice(0, separator)),
    value: new TextDecoder("latin1").decode(chunk.data.slice(separator + 1))
  };
}

function makeTextChunk(keyword: string, value: string): PngChunk {
  const key = new TextEncoder().encode(keyword);
  const encoded = new TextEncoder().encode(value);
  const data = new Uint8Array(key.length + 1 + encoded.length);
  data.set(key);
  data.set(encoded, key.length + 1);
  return { type: "tEXt", data };
}

export function readCharacterMetadata(bytes: Uint8Array): { card: JsonObject; png: PngDocument } {
  const chunks = parsePng(bytes);
  const candidates = chunks
    .map(readTextChunk)
    .filter((entry): entry is { keyword: string; value: string } => Boolean(entry))
    .filter((entry) => entry.keyword === "ccv3" || entry.keyword === "chara");
  const selected = candidates.find((entry) => entry.keyword === "ccv3") ?? candidates.find((entry) => entry.keyword === "chara");
  if (!selected) throw new Error("No character-card metadata was found in this PNG.");
  const parsed: unknown = JSON.parse(base64ToText(selected.value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The embedded character-card JSON is not an object.");
  }
  return {
    card: parsed as JsonObject,
    png: { chunks, metadataKeyword: selected.keyword as "chara" | "ccv3" }
  };
}

export function encodePng(chunks: PngChunk[]): Uint8Array {
  const total = 8 + chunks.reduce((sum, chunk) => sum + 12 + chunk.data.length, 0);
  const result = new Uint8Array(total);
  result.set(PNG_SIGNATURE);
  let offset = 8;
  for (const chunk of chunks) {
    const type = new TextEncoder().encode(chunk.type);
    writeU32(result, offset, chunk.data.length);
    result.set(type, offset + 4);
    result.set(chunk.data, offset + 8);
    writeU32(result, offset + 8 + chunk.data.length, crc32([type, chunk.data]));
    offset += 12 + chunk.data.length;
  }
  return result;
}

export function writeCharacterMetadata(document: PngDocument, card: JsonObject): Uint8Array {
  const encoded = textToBase64(JSON.stringify(card));
  let replaced = false;
  const chunks = document.chunks.map((chunk) => {
    const text = readTextChunk(chunk);
    if (!replaced && text?.keyword === document.metadataKeyword) {
      replaced = true;
      return makeTextChunk(document.metadataKeyword, encoded);
    }
    return chunk;
  });
  if (!replaced) throw new Error("The original metadata chunk can no longer be located.");
  return encodePng(chunks);
}
