import { macroConversionProposals, type PlatformId } from "./macros";
import type { EditProposal } from "./types";

function makeProposal(
  ruleId: string,
  category: EditProposal["category"],
  start: number,
  before: string,
  after: string,
  confidence: EditProposal["confidence"],
  explanation: string
): EditProposal {
  return { id: `${ruleId}:${start}:${before}`, ruleId, category, start, end: start + before.length, before, after, confidence, actionable: true, explanation };
}

function collectRegex(text: string, regex: RegExp, create: (match: RegExpExecArray) => EditProposal): EditProposal[] {
  const results: EditProposal[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    results.push(create(match));
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return results;
}

export function structureProposals(text: string): EditProposal[] {
  const proposals: EditProposal[] = [];
  proposals.push(...collectRegex(text, /\{\{\{\s*(user|char)\s*\}\}\}/gi, (match) =>
    makeProposal("structure.triple-braces", "structure", match.index, match[0], `{{${match[1].toLowerCase()}}}`, "high", "Remove the accidental third brace and normalize the built-in macro.")
  ));
  proposals.push(...collectRegex(text, /(?<!\{)\{\s*(user|char)\s*\}(?!\})/gi, (match) =>
    makeProposal("structure.single-braces", "structure", match.index, match[0], `{{${match[1].toLowerCase()}}}`, "high", "Convert the single-brace placeholder to the standard double-brace form.")
  ));
  proposals.push(...collectRegex(text, /(?<!\{)\{\{\s*(USER|User|CHAR|Char)\s*\}\}(?!\})/g, (match) =>
    makeProposal("structure.macro-case", "structure", match.index, match[0], `{{${match[1].toLowerCase()}}}`, "high", "Normalize the built-in macro to lowercase.")
  ));
  return proposals;
}

export function formattingProposals(text: string): EditProposal[] {
  const proposals: EditProposal[] = [];
  proposals.push(...collectRegex(text, /\*\*([^*\n]+)\*\*/g, (match) =>
    makeProposal("formatting.bold-asterisk", "formatting", match.index, match[0], match[1], "medium", "Remove bold formatting while preserving its text. Review whether the passage should instead be narration or displayed text.")
  ));
  proposals.push(...collectRegex(text, /__([^_\n]+)__/g, (match) =>
    makeProposal("formatting.bold-underscore", "formatting", match.index, match[0], match[1], "medium", "Remove underscore-based bold formatting while preserving its text.")
  ));
  proposals.push(...collectRegex(text, /"([^"\n]*\*[^"\n]+\*[^"\n]*)"/g, (match) =>
    makeProposal("formatting.emphasis-in-dialogue", "formatting", match.index, match[0], match[0].replace(/\*/g, ""), "medium", "Remove emphasis markers from quoted dialogue.")
  ));
  proposals.push(...collectRegex(text, /[ \t]*—[ \t]*/g, (match) =>
    makeProposal(
      "punctuation.em-dash",
      "punctuation",
      match.index,
      match[0],
      match.index + match[0].length < text.length && !/[\r\n]/.test(text[match.index + match[0].length]) ? ", " : ",",
      "low",
      "Replace the em dash and normalize its surrounding horizontal whitespace. A comma is only a suggestion because the best alternative depends on the sentence."
    )
  ));
  return proposals;
}

export function analyzeText(text: string, from: PlatformId, to: PlatformId): EditProposal[] {
  return [...structureProposals(text), ...macroConversionProposals(text, from, to), ...formattingProposals(text)]
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

export function applyProposal(text: string, proposal: EditProposal): string {
  if (!proposal.actionable) {
    throw new Error("This finding has no target equivalent and cannot be applied.");
  }
  if (text.slice(proposal.start, proposal.end) !== proposal.before) {
    throw new Error("The text changed after this suggestion was generated. Run the checks again.");
  }
  return text.slice(0, proposal.start) + proposal.after + text.slice(proposal.end);
}

export function applyHighConfidenceWithDetails(text: string, proposals: EditProposal[]): { text: string; applied: EditProposal[] } {
  const selected = proposals.filter((proposal) => proposal.actionable && proposal.confidence === "high").sort((left, right) => right.start - left.start);
  let result = text;
  let earliestApplied = Number.POSITIVE_INFINITY;
  const applied: EditProposal[] = [];
  for (const proposal of selected) {
    if (proposal.end > earliestApplied) continue;
    if (result.slice(proposal.start, proposal.end) !== proposal.before) continue;
    result = applyProposal(result, proposal);
    earliestApplied = proposal.start;
    applied.push(proposal);
  }
  return { text: result, applied: applied.reverse() };
}

export function applyHighConfidence(text: string, proposals: EditProposal[]): string {
  return applyHighConfidenceWithDetails(text, proposals).text;
}
