import { platformProfiles, type MacroRole, type PlatformId, type PreviewPronouns } from "./macros";
import type { EditProposal } from "./types";

export type PronounOutputTarget = "off" | PlatformId | PreviewPronouns;
export type ReferentScope = "user" | "char" | "named" | "any-singular";
export type GenderShift = "off" | "feminine" | "masculine" | "neutral";

export interface PronounAnalysisOptions {
  target?: PronounOutputTarget;
  referent?: ReferentScope;
  name?: string;
  genderShift?: GenderShift;
  reviewBodyDescriptors?: boolean;
}

type ReferentKind = "user" | "char" | "named" | "group" | "unknown";
type NumberKind = "singular" | "plural" | "unknown";

interface CandidateContext {
  referent: ReferentKind;
  number: NumberKind;
}

const fixedPronouns: Record<PreviewPronouns, Record<Exclude<MacroRole, "verbBe">, string>> = {
  she: { subject: "she", object: "her", possessiveDeterminer: "her", possessivePronoun: "hers", reflexive: "herself" },
  he: { subject: "he", object: "him", possessiveDeterminer: "his", possessivePronoun: "his", reflexive: "himself" },
  they: { subject: "they", object: "them", possessiveDeterminer: "their", possessivePronoun: "theirs", reflexive: "themself" }
};

const genderTerms = [
  { feminine: "woman", masculine: "man", neutral: "person" },
  { feminine: "girl", masculine: "boy", neutral: "child" },
  { feminine: "wife", masculine: "husband", neutral: "spouse" },
  { feminine: "girlfriend", masculine: "boyfriend", neutral: "partner" },
  { feminine: "mother", masculine: "father", neutral: "parent" },
  { feminine: "sister", masculine: "brother", neutral: "sibling" },
  { feminine: "daughter", masculine: "son", neutral: "child" },
  { feminine: "queen", masculine: "king", neutral: "monarch" },
  { feminine: "princess", masculine: "prince", neutral: "royal" },
  { feminine: "lady", masculine: "lord", neutral: "noble" },
  { feminine: "actress", masculine: "actor", neutral: "performer" },
  { feminine: "waitress", masculine: "waiter", neutral: "server" },
  { feminine: "ma'am", masculine: "sir", neutral: "friend" },
  { feminine: "ms.", masculine: "mr.", neutral: "mx." }
] as const;

const bodyDescriptors = [
  "breasts",
  "bust",
  "penis",
  "vagina",
  "pregnant",
  "broad-shouldered",
  "hourglass",
  "muscular build",
  "feminine figure",
  "masculine frame"
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isProtected(text: string, index: number): boolean {
  const patterns = [/<!--[^]*?(?:-->|$)/g, /`+[^\n]*?`+/g, /<%[^]*?(?:%>|$)/g, /\$\{[^\n}]*\}/g];
  return patterns.some((pattern) => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (index >= match.index && index < match.index + match[0].length) return true;
    }
    return false;
  });
}

function latestMatchIndex(value: string, expression: RegExp): number {
  let latest = -1;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value))) {
    latest = match.index;
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return latest;
}

function candidateContext(text: string, start: number, token: string, name: string): CandidateContext {
  const lookbackStart = Math.max(0, start - 180);
  const lookback = text.slice(lookbackStart, start);
  const userIndex = latestMatchIndex(lookback, /\{+\s*user\s*\}+/gi);
  const charIndex = latestMatchIndex(lookback, /\{+\s*char\s*\}+/gi);
  const namedIndex = name.trim() ? latestMatchIndex(lookback, new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "gi")) : -1;
  const groupIndex = latestMatchIndex(lookback, /\b(?:group|people|crowd|team|friends|guards|parents|siblings|twins|couple|others|both|several|many)\b/gi);
  const candidates: Array<{ kind: ReferentKind; index: number }> = [
    { kind: "user", index: userIndex },
    { kind: "char", index: charIndex },
    { kind: "named", index: namedIndex },
    { kind: "group", index: groupIndex }
  ];
  const nearest = candidates.sort((left, right) => right.index - left.index)[0];
  const referent = nearest.index >= 0 ? nearest.kind : "unknown";
  const normalized = token.toLowerCase();
  if (normalized === "themselves" || referent === "group") return { referent, number: "plural" };
  if (normalized === "themself" || !["they", "them", "their", "theirs"].includes(normalized)) return { referent, number: "singular" };
  if (referent === "user" || referent === "char" || referent === "named") return { referent, number: "singular" };
  return { referent, number: "unknown" };
}

function pronounRole(text: string, token: string, end: number): Exclude<MacroRole, "verbBe"> {
  const normalized = token.toLowerCase();
  if (["she", "he", "they"].includes(normalized)) return "subject";
  if (["him", "them"].includes(normalized)) return "object";
  if (["hers", "theirs"].includes(normalized)) return "possessivePronoun";
  if (["herself", "himself", "themself", "themselves"].includes(normalized)) return "reflexive";
  if (normalized === "her" || normalized === "his" || normalized === "their") {
    return /^\s+[\p{L}\p{N}]/u.test(text.slice(end)) ? "possessiveDeterminer" : normalized === "her" ? "object" : "possessivePronoun";
  }
  return "object";
}

function scopeMatches(context: CandidateContext, scope: ReferentScope): boolean {
  if (scope === "any-singular") return context.number === "singular";
  return context.number === "singular" && context.referent === scope;
}

function preserveCapitalization(source: string, replacement: string): string {
  return /^[A-Z]/.test(source) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

function replacementFor(role: Exclude<MacroRole, "verbBe">, target: Exclude<PronounOutputTarget, "off">): string {
  if (target === "janitor" || target === "wyvern") return platformProfiles[target].macros[role] ?? "";
  return fixedPronouns[target][role];
}

function proposal(
  ruleId: string,
  category: "pronoun" | "gender",
  start: number,
  before: string,
  after: string,
  explanation: string,
  actionable: boolean,
  confidence: "medium" | "low",
  findingLabel?: string
): EditProposal {
  return {
    id: `${ruleId}:${start}:${before}`,
    ruleId,
    category,
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

function nonActionableReason(context: CandidateContext): { label: string; explanation: string } {
  if (context.number === "plural") return { label: "Plural reference", explanation: "This pronoun appears to refer to a group. It is preserved because the selected conversion is scoped to one person." };
  return { label: "Unknown referent", explanation: "Cardsmith could not connect this pronoun to the selected user, character, or named person. Relabel it manually before replacing it." };
}

export function referentAwareProposals(text: string, options: PronounAnalysisOptions = {}): EditProposal[] {
  const target = options.target ?? "off";
  const genderShift = options.genderShift ?? "off";
  if (target === "off" && genderShift === "off" && !options.reviewBodyDescriptors) return [];
  const scope = options.referent ?? "user";
  const name = options.name ?? "";
  const proposals: EditProposal[] = [];

  if (target !== "off") {
    const expression = /\b(?:she|her|hers|herself|he|him|his|himself|they|them|their|theirs|themself|themselves)\b/gi;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text))) {
      if (isProtected(text, match.index)) continue;
      const before = match[0];
      const context = candidateContext(text, match.index, before, name);
      if (context.referent !== "unknown" && context.referent !== "group" && scope !== "any-singular" && context.referent !== scope) continue;
      const role = pronounRole(text, before, match.index + before.length);
      if (!scopeMatches(context, scope)) {
        const reason = nonActionableReason(context);
        proposals.push(proposal("pronoun.referent-review", "pronoun", match.index, before, before, reason.explanation, false, "low", reason.label));
        continue;
      }
      const replacement = preserveCapitalization(before, replacementFor(role, target));
      if (replacement.toLowerCase() === before.toLowerCase()) continue;
      proposals.push(proposal(
        `pronoun.replace.${scope}.${target}.${role}`,
        "pronoun",
        match.index,
        before,
        replacement,
        `Replace this ${role.replace(/([A-Z])/g, " $1").toLowerCase()} reference classified as ${context.referent}. Context-dependent pronoun changes always require individual approval.`,
        true,
        scope === "any-singular" ? "low" : "medium"
      ));
    }
  }

  if (genderShift !== "off") {
    for (const terms of genderTerms) {
      const sources = Array.from(new Set([terms.feminine, terms.masculine, terms.neutral]));
      for (const source of sources) {
        const expression = new RegExp(`\\b${escapeRegExp(source)}\\b`, "gi");
        let match: RegExpExecArray | null;
        while ((match = expression.exec(text))) {
          if (isProtected(text, match.index)) continue;
          const context = candidateContext(text, match.index, match[0], name);
          if (!scopeMatches({ ...context, number: context.referent === "group" ? "plural" : "singular" }, scope)) continue;
          const replacement = preserveCapitalization(match[0], terms[genderShift]);
          if (replacement.toLowerCase() === match[0].toLowerCase()) continue;
          proposals.push(proposal(
            `gender.term.${scope}.${genderShift}`,
            "gender",
            match.index,
            match[0],
            replacement,
            `This gendered noun appears connected to the selected ${scope} referent. Review the relationship and tone before changing it.`,
            true,
            "low"
          ));
        }
      }
    }
  }

  if (options.reviewBodyDescriptors) {
    for (const descriptor of bodyDescriptors) {
      const expression = new RegExp(`\\b${escapeRegExp(descriptor)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text))) {
        if (isProtected(text, match.index)) continue;
        const context = candidateContext(text, match.index, match[0], name);
        if (!scopeMatches({ ...context, number: context.referent === "group" ? "plural" : "singular" }, scope)) continue;
        proposals.push(proposal(
          `gender.body-review.${scope}`,
          "gender",
          match.index,
          match[0],
          match[0],
          "This may be a gendered body or appearance descriptor. Cardsmith flags it for review but will not invent a replacement.",
          false,
          "low",
          "Body descriptor review"
        ));
      }
    }
  }

  return proposals.sort((left, right) => left.start - right.start || left.end - right.end);
}
