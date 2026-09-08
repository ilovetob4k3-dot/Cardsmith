import type { Confidence, EditProposal } from "./types";

export type ThoughtConvention = "unchanged" | "backticks" | "italics" | "plain";
export type MarkdownIssueKind =
  | "action-italics"
  | "bold-asterisk"
  | "bold-underscore"
  | "dialogue-emphasis"
  | "escaped-literal"
  | "nested-malformed"
  | "swallowed-dialogue"
  | "underscore-italics"
  | "unmatched-backtick"
  | "unmatched-marker";

export interface MarkdownIssue {
  kind: MarkdownIssueKind;
  start: number;
  end: number;
  text: string;
}

export interface FormattingProfileOptions {
  enabled?: boolean;
  fieldLabel?: string;
  thoughtConvention?: ThoughtConvention;
}

interface Range {
  start: number;
  end: number;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function collectRanges(text: string, expression: RegExp): Range[] {
  const ranges: Range[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return ranges;
}

function protectedRanges(text: string): Range[] {
  return [
    ...collectRanges(text, /<!--[^]*?(?:-->|$)/g),
    ...collectRanges(text, /<%[^]*?(?:%>|$)/g),
    ...collectRanges(text, /\$\{[^\n}]*\}/g),
    ...collectRanges(text, /\{\{[^\n}]*\}\}/g),
    ...collectRanges(text, /`+[^\n]*?`+/g)
  ].sort((left, right) => left.start - right.start);
}

function overlaps(ranges: Range[], start: number, end: number): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

function addIssue(issues: MarkdownIssue[], protectedSpans: Range[], issue: MarkdownIssue): void {
  if (overlaps(protectedSpans, issue.start, issue.end)) return;
  if (issues.some((current) => current.kind === issue.kind && current.start === issue.start && current.end === issue.end)) return;
  issues.push(issue);
}

function scanMatches(
  text: string,
  expression: RegExp,
  kind: MarkdownIssueKind,
  issues: MarkdownIssue[],
  protectedSpans: Range[],
  rangeForMatch: (match: RegExpExecArray) => Range = (match) => ({ start: match.index, end: match.index + match[0].length })
): void {
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text))) {
    const range = rangeForMatch(match);
    if (!isEscaped(text, range.start)) addIssue(issues, protectedSpans, { kind, ...range, text: text.slice(range.start, range.end) });
    if (match[0].length === 0) expression.lastIndex += 1;
  }
}

function unescapedMarkerCount(line: string, marker: "*" | "_"): number {
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === marker && !isEscaped(line, index)) count += 1;
  }
  return count;
}

export function scanMarkdown(text: string): MarkdownIssue[] {
  const issues: MarkdownIssue[] = [];
  const protectedSpans = protectedRanges(text);

  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] === "\\" && (text[index + 1] === "*" || text[index + 1] === "_")) {
      addIssue(issues, [], { kind: "escaped-literal", start: index, end: index + 2, text: text.slice(index, index + 2) });
      index += 1;
    }
  }

  let lineStart = 0;
  for (const line of text.split("\n")) {
    const nestedAsterisk = /^\*(?=[^\n]*\*[^\n]*\*\*$)(?![^\n]*\\\*\*$)[^\n]+\*\*$/.exec(line);
    if (nestedAsterisk) addIssue(issues, protectedSpans, { kind: "nested-malformed", start: lineStart, end: lineStart + line.length, text: line });
    else {
      const swallowed = /^\*[^\n]*"[^"\n]+"[^\n]*\*$/.exec(line);
      if (swallowed) addIssue(issues, protectedSpans, { kind: "swallowed-dialogue", start: lineStart, end: lineStart + line.length, text: line });
    }

    for (const marker of ["*", "_"] as const) {
      const count = unescapedMarkerCount(line, marker);
      if (count % 2 === 1) addIssue(issues, protectedSpans, { kind: "unmatched-marker", start: lineStart, end: lineStart + line.length, text: line });
    }
    lineStart += line.length + 1;
  }

  scanMatches(text, /\*\*[^*\n]+\*\*/g, "bold-asterisk", issues, protectedSpans);
  scanMatches(text, /__[^_\n]+__/g, "bold-underscore", issues, protectedSpans);
  scanMatches(text, /(?<![\\_])_([^_\n]+)_(?!_)/g, "underscore-italics", issues, protectedSpans);

  let quoteMatch: RegExpExecArray | null;
  const quoted = /"[^"\n]*"/g;
  while ((quoteMatch = quoted.exec(text))) {
    const quoteStart = quoteMatch.index;
    const content = quoteMatch[0];
    const emphasis = /(?<![\\*])\*([^*\n]+)\*(?!\*)/g;
    let emphasisMatch: RegExpExecArray | null;
    while ((emphasisMatch = emphasis.exec(content))) {
      const start = quoteStart + emphasisMatch.index;
      addIssue(issues, protectedSpans, { kind: "dialogue-emphasis", start, end: start + emphasisMatch[0].length, text: emphasisMatch[0] });
    }
  }

  scanMatches(text, /(?<![\\*])\*([^*\n]+)\*(?!\*)/g, "action-italics", issues, protectedSpans);

  const backtickRuns = [...text.matchAll(/(?<!\\)`+/g)].filter((match) => !overlaps(protectedSpans, match.index ?? 0, (match.index ?? 0) + match[0].length));
  if (backtickRuns.length % 2 === 1) {
    const last = backtickRuns[backtickRuns.length - 1];
    const start = last.index ?? 0;
    addIssue(issues, [], { kind: "unmatched-backtick", start, end: start + last[0].length, text: last[0] });
  }

  return issues.sort((left, right) => left.start - right.start || left.end - right.end || left.kind.localeCompare(right.kind));
}

function makeProposal(
  ruleId: string,
  start: number,
  before: string,
  after: string,
  confidence: Confidence,
  explanation: string,
  actionable = true,
  findingLabel?: string
): EditProposal {
  return {
    id: `${ruleId}:${start}:${before}`,
    ruleId,
    category: "formatting",
    start,
    end: start + before.length,
    before,
    after,
    confidence,
    actionable,
    explanation,
    findingLabel
  };
}

function stripUnescapedAsterisks(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "*" && !isEscaped(value, index)) continue;
    result += value[index];
  }
  return result;
}

function italicSegment(value: string): string {
  if (!value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const body = value.slice(leading.length, value.length - trailing.length);
  return `${leading}*${body}*${trailing}`;
}

function separateDialogue(value: string): string {
  const inner = value.slice(1, -1);
  let result = "";
  let cursor = 0;
  const dialogue = /"[^"\n]+"/g;
  let match: RegExpExecArray | null;
  while ((match = dialogue.exec(inner))) {
    result += italicSegment(inner.slice(cursor, match.index));
    result += match[0].replace(/(?<!\\)\*/g, "");
    cursor = match.index + match[0].length;
  }
  result += italicSegment(inner.slice(cursor));
  return result;
}

function thoughtReplacement(marked: string, convention: ThoughtConvention): string {
  const body = marked.replace(/^([*`"])([^]*)\1$/, "$2");
  if (convention === "backticks") return `\`${body}\``;
  if (convention === "italics") return `*${body}*`;
  return body;
}

function insideDoubleQuotes(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return (text.slice(lineStart, index).match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1;
}

function proposalOverlaps(proposals: EditProposal[], start: number, end: number): boolean {
  return proposals.some((proposal) => start < proposal.end && end > proposal.start);
}

export function formattingProfileProposals(text: string, options: FormattingProfileOptions = {}): EditProposal[] {
  if (options.enabled === false) return [];
  const proseField = !options.fieldLabel || !/^(name|creator notes)$/i.test(options.fieldLabel);
  if (!proseField) return [];
  const issues = scanMarkdown(text);
  const proposals: EditProposal[] = [];
  const priority: MarkdownIssueKind[] = [
    "nested-malformed",
    "swallowed-dialogue",
    "dialogue-emphasis",
    "bold-asterisk",
    "bold-underscore",
    "underscore-italics",
    "unmatched-marker",
    "unmatched-backtick"
  ];

  for (const kind of priority) {
    for (const issue of issues.filter((candidate) => candidate.kind === kind)) {
      if (proposalOverlaps(proposals, issue.start, issue.end)) continue;
      if (kind === "nested-malformed") {
        const inner = issue.text.slice(1, -2);
        proposals.push(makeProposal("formatting.nested-malformed", issue.start, issue.text, `*${stripUnescapedAsterisks(inner)}*`, "low", "Flatten malformed nested emphasis into one narration span. Escaped literal markers remain untouched."));
      } else if (kind === "swallowed-dialogue") {
        proposals.push(makeProposal("formatting.swallowed-dialogue", issue.start, issue.text, separateDialogue(issue.text), "low", "Move quoted dialogue outside the surrounding narration italics. Review the speaker boundaries before accepting."));
      } else if (kind === "dialogue-emphasis") {
        proposals.push(makeProposal("formatting.emphasis-in-dialogue", issue.start, issue.text, issue.text.slice(1, -1), "medium", "Remove emphasis markers from quoted dialogue while preserving its words."));
      } else if (kind === "bold-asterisk" || kind === "bold-underscore") {
        const body = issue.text.slice(2, -2);
        const after = insideDoubleQuotes(text, issue.start) ? body : `*${body}*`;
        proposals.push(makeProposal(`formatting.${kind}`, issue.start, issue.text, after, "medium", insideDoubleQuotes(text, issue.start) ? "Remove bold markers from dialogue." : "Convert bold narration to the house profile's single-asterisk italics."));
      } else if (kind === "underscore-italics") {
        proposals.push(makeProposal("formatting.underscore-italics", issue.start, issue.text, `*${issue.text.slice(1, -1)}*`, "medium", "Normalize underscore italics to the house profile's single-asterisk form."));
      } else if (kind === "unmatched-marker") {
        proposals.push(makeProposal("formatting.unmatched-marker", issue.start, issue.text, issue.text, "low", "This line has an unmatched asterisk or underscore. The intended boundary is ambiguous, so Cardsmith will preserve it for manual repair.", false, "Manual repair"));
      } else if (kind === "unmatched-backtick") {
        proposals.push(makeProposal("formatting.unmatched-backtick", issue.start, issue.text, issue.text, "low", "This backtick has no closing delimiter. Cardsmith will preserve it for manual repair.", false, "Manual repair"));
      }
    }
  }

  const protectedSpans = protectedRanges(text);
  const displayed = /\b(?:screen|sign|message|text|phone|computer|letter|note|email|post|display)(?:[^"\n]{0,40})("[^"\n]+")/gi;
  let match: RegExpExecArray | null;
  while ((match = displayed.exec(text))) {
    const quoted = match[1];
    const start = match.index + match[0].lastIndexOf(quoted);
    const end = start + quoted.length;
    if (!overlaps(protectedSpans, start, end) && !proposalOverlaps(proposals, start, end)) {
      proposals.push(makeProposal("formatting.displayed-text", start, quoted, `\`${quoted.slice(1, -1)}\``, "low", "This looks like displayed or written text. The house profile uses backticks for messages, signs, screens, and writing."));
    }
  }

  const convention = options.thoughtConvention ?? "unchanged";
  if (convention !== "unchanged") {
    const thoughts = /\b(?:thought|wondered|realized|considered|told (?:himself|herself|themself))\s*[:,]?\s*(\*[^*\n]+\*|`[^`\n]+`|"[^"\n]+")/gi;
    while ((match = thoughts.exec(text))) {
      const marked = match[1];
      const start = match.index + match[0].lastIndexOf(marked);
      const end = start + marked.length;
      if (!proposalOverlaps(proposals, start, end)) {
        proposals.push(makeProposal("formatting.likely-thought", start, marked, thoughtReplacement(marked, convention), "low", `This passage follows a thought cue. Convert it to the selected ${convention} thought convention only after review.`));
      }
    }
  }

  return proposals.sort((left, right) => left.start - right.start || left.end - right.end);
}
