import type { EditProposal } from "./types";

export type MacroRole = "subject" | "object" | "possessiveDeterminer" | "possessivePronoun" | "reflexive" | "verbBe";
export type PlatformId = "janitor" | "wyvern";

export interface PlatformProfile {
  id: PlatformId;
  name: string;
  macros: Partial<Record<MacroRole, string>>;
}

export const platformProfiles: Record<PlatformId, PlatformProfile> = {
  janitor: {
    id: "janitor",
    name: "JanitorAI",
    macros: {
      subject: "{{sub}}",
      object: "{{obj}}",
      possessiveDeterminer: "{{poss}}",
      possessivePronoun: "{{poss_p}}",
      reflexive: "{{ref}}"
    }
  },
  wyvern: {
    id: "wyvern",
    name: "WyvernChat macros (SillyTavern extension compatible)",
    macros: {
      subject: "{{pronounSubjective}}",
      object: "{{pronounObjective}}",
      possessiveDeterminer: "{{pronounPosDet}}",
      possessivePronoun: "{{pronounPosPro}}",
      reflexive: "{{pronounReflexive}}",
      verbBe: "{{pronounVerbBe}}"
    }
  }
};

const roleOrder: MacroRole[] = ["subject", "object", "possessiveDeterminer", "possessivePronoun", "reflexive", "verbBe"];

function proposalId(ruleId: string, start: number, before: string): string {
  return `${ruleId}:${start}:${before}`;
}

export function macroConversionProposals(text: string, from: PlatformId, to: PlatformId): EditProposal[] {
  if (from === to) return [];
  const proposals: EditProposal[] = [];
  for (const role of roleOrder) {
    const before = platformProfiles[from].macros[role];
    const after = platformProfiles[to].macros[role];
    if (!before) continue;
    let start = text.indexOf(before);
    while (start >= 0) {
      const actionable = Boolean(after);
      proposals.push({
        id: proposalId(`macro.${actionable ? "convert" : "unresolved"}.${from}.${to}.${role}`, start, before),
        ruleId: `macro.${actionable ? "convert" : "unresolved"}.${from}.${to}.${role}`,
        category: "macro",
        start,
        end: start + before.length,
        before,
        after: after ?? before,
        confidence: "high",
        actionable,
        explanation: actionable
          ? `Convert the ${role.replace(/([A-Z])/g, " $1").toLowerCase()} macro to ${platformProfiles[to].name}.`
          : `No target equivalent exists for the ${role.replace(/([A-Z])/g, " $1").toLowerCase()} macro in ${platformProfiles[to].name}. It will be preserved exactly.`
      });
      start = text.indexOf(before, start + before.length);
    }
  }
  return proposals;
}

const pronounSets = {
  she: { subject: "she", object: "her", possessiveDeterminer: "her", possessivePronoun: "hers", reflexive: "herself", verbBe: "is" },
  he: { subject: "he", object: "him", possessiveDeterminer: "his", possessivePronoun: "his", reflexive: "himself", verbBe: "is" },
  they: { subject: "they", object: "them", possessiveDeterminer: "their", possessivePronoun: "theirs", reflexive: "themself", verbBe: "are" }
} as const;

export type PreviewPronouns = keyof typeof pronounSets;

export function resolvePronounMacros(text: string, selected: PreviewPronouns): string {
  let result = text;
  const values = pronounSets[selected];
  for (const profile of Object.values(platformProfiles)) {
    for (const role of roleOrder) {
      const macro = profile.macros[role];
      if (macro) result = result.split(macro).join(values[role]);
    }
  }
  return result;
}
