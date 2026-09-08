import { resolvePronounMacros, type PreviewPronouns } from "./macros";

export type PreviewMode = "raw" | "janitor" | "sillytavern";

export interface PreviewResult {
  mode: PreviewMode;
  text: string;
  hiddenSegments: number;
  macrosResolved: boolean;
}

function blankVisibleCharacters(value: string): string {
  return value.replace(/[^\r\n]/g, "");
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function tildeRunLength(text: string, index: number): number {
  let end = index;
  while (text[end] === "~") end += 1;
  return end - index;
}

function findClosingTildes(text: string, start: number, length: number): number {
  for (let cursor = start; cursor < text.length;) {
    if (length < 3 && (text[cursor] === "\n" || text[cursor] === "\r")) return -1;
    if (text[cursor] !== "~") {
      cursor += 1;
      continue;
    }
    const runLength = tildeRunLength(text, cursor);
    if (!isEscaped(text, cursor) && runLength === length) return cursor;
    cursor += runLength;
  }
  return -1;
}

function hideJanitorSegments(text: string): { text: string; hiddenSegments: number } {
  let result = "";
  let hiddenSegments = 0;
  let cursor = 0;
  while (cursor < text.length) {
    if (text[cursor] !== "~" || isEscaped(text, cursor)) {
      result += text[cursor];
      cursor += 1;
      continue;
    }
    const runLength = tildeRunLength(text, cursor);
    if (runLength < 1 || runLength > 3) {
      result += text.slice(cursor, cursor + runLength);
      cursor += runLength;
      continue;
    }
    const close = findClosingTildes(text, cursor + runLength, runLength);
    if (close < 0) {
      result += text.slice(cursor, cursor + runLength);
      cursor += runLength;
      continue;
    }
    const end = close + runLength;
    result += blankVisibleCharacters(text.slice(cursor, end));
    hiddenSegments += 1;
    cursor = end;
  }
  return { text: result, hiddenSegments };
}

function hideMatches(text: string, expressions: RegExp[]): { text: string; hiddenSegments: number } {
  let result = text;
  let hiddenSegments = 0;
  for (const expression of expressions) {
    result = result.replace(expression, (match) => {
      hiddenSegments += 1;
      return blankVisibleCharacters(match);
    });
  }
  return { text: result, hiddenSegments };
}

export function renderPreview(text: string, mode: PreviewMode, pronouns: PreviewPronouns): PreviewResult {
  if (mode === "raw") return { mode, text, hiddenSegments: 0, macrosResolved: false };

  const visible = mode === "janitor"
    ? hideJanitorSegments(text)
    : hideMatches(text, [/<!--[\s\S]*?-->/g]);

  return {
    mode,
    text: resolvePronounMacros(visible.text, pronouns),
    hiddenSegments: visible.hiddenSegments,
    macrosResolved: true
  };
}
