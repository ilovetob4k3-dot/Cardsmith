import { platformProfiles, type PlatformId } from "./macros";
import { analyzeText } from "./rules";
import type { EditProposal, ImportedCard } from "./types";

export interface LoggedFinding {
  fieldId: string;
  fieldLabel: string;
  proposal: EditProposal;
}

export interface SummaryField {
  id: string;
  label: string;
}

export interface AcceptedRuleSummary {
  ruleId: string;
  category: EditProposal["category"];
  count: number;
}

export interface CardChangeSummary {
  source: ImportedCard["source"];
  version: ImportedCard["version"];
  fromProfile: string;
  toProfile: string;
  changedFields: SummaryField[];
  accepted: LoggedFinding[];
  acceptedByRule: AcceptedRuleSummary[];
  manualFields: SummaryField[];
  ignored: LoggedFinding[];
  unresolved: LoggedFinding[];
}

export function findingKey(fieldId: string, proposal: EditProposal): string {
  return `${fieldId}::${proposal.id}`;
}

export function buildChangeSummary(
  workspace: ImportedCard,
  from: PlatformId,
  to: PlatformId,
  accepted: LoggedFinding[],
  ignored: LoggedFinding[],
  manualFieldIds: Set<string>
): CardChangeSummary {
  const changedFields = workspace.fields
    .filter((field) => field.value !== field.originalValue)
    .map((field) => ({ id: field.id, label: field.label }));
  const changedIds = new Set(changedFields.map((field) => field.id));
  const manualFields = workspace.fields
    .filter((field) => changedIds.has(field.id) && manualFieldIds.has(field.id))
    .map((field) => ({ id: field.id, label: field.label }));
  const unresolved = workspace.fields.flatMap((field) =>
    analyzeText(field.value, from, to)
      .filter((proposal) => !proposal.actionable)
      .map((proposal) => ({ fieldId: field.id, fieldLabel: field.label, proposal }))
  );
  const grouped = new Map<string, AcceptedRuleSummary>();
  for (const entry of accepted) {
    const key = `${entry.proposal.category}:${entry.proposal.ruleId}`;
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { ruleId: entry.proposal.ruleId, category: entry.proposal.category, count: 1 });
  }

  return {
    source: workspace.source,
    version: workspace.version,
    fromProfile: platformProfiles[from].name,
    toProfile: platformProfiles[to].name,
    changedFields,
    accepted,
    acceptedByRule: [...grouped.values()],
    manualFields,
    ignored,
    unresolved
  };
}
