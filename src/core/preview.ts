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
    ? hideMatches(text, [/(?<!\\)~~~[^]*?~~~/g, /(?<!\\)~~[^\n]*?~~/g, /(?<![\\~])~[^~\n]+~(?!~)/g])
    : hideMatches(text, [/<!--[\s\S]*?-->/g]);

  return {
    mode,
    text: resolvePronounMacros(visible.text, pronouns),
    hiddenSegments: visible.hiddenSegments,
    macrosResolved: true
  };
}
