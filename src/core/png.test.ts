import { describe, expect, it } from "vitest";
import { textToBase64 } from "./base64";
import { encodePng, parsePng, readCharacterMetadata, writeCharacterMetadata } from "./png";
import type { JsonObject, PngChunk } from "./types";

function textChunk(keyword: string, value: string): PngChunk {
  const key = new TextEncoder().encode(keyword);
  const body = new TextEncoder().encode(value);
  const data = new Uint8Array(key.length + body.length + 1);
  data.set(key);
  data.set(body, key.length + 1);
  return { type: "tEXt", data };
}

function samplePng(card: JsonObject): Uint8Array {
  return encodePng([
    { type: "IHDR", data: new Uint8Array(13) },
    textChunk("unrelated", "keep me"),
    textChunk("ccv3", textToBase64(JSON.stringify(card))),
    { type: "IEND", data: new Uint8Array() }
  ]);
}

describe("character-card PNG metadata", () => {
  it("reads ccv3 metadata and validates chunk CRC values", () => {
    const card = { spec: "chara_card_v3", spec_version: "3.0", data: { name: "Iris" } };
    const parsed = readCharacterMetadata(samplePng(card));
    expect(parsed.card).toEqual(card);
    expect(parsed.png.metadataKeyword).toBe("ccv3");
  });

  it("changes only the selected card text chunk", () => {
    const original = { spec: "chara_card_v3", data: { name: "Iris", extension: { unknown: true } } };
    const bytes = samplePng(original);
    const imported = readCharacterMetadata(bytes);
    const edited = { ...original, data: { ...original.data, name: "Mara" } };
    const exported = writeCharacterMetadata(imported.png, edited);
    const beforeChunks = parsePng(bytes);
    const afterChunks = parsePng(exported);
    expect(readCharacterMetadata(exported).card).toEqual(edited);
    expect(afterChunks[1]).toEqual(beforeChunks[1]);
    expect(afterChunks[0]).toEqual(beforeChunks[0]);
    expect(afterChunks.at(-1)).toEqual(beforeChunks.at(-1));
  });
});
