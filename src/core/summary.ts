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

function indented(value: string): string {
  return value.split("\n").map((line) => `    ${line}`).join("\n");
}

function findingMarkdown(entry: LoggedFinding): string {
  const proposal = entry.proposal;
  const replacement = proposal.actionable ? `\n  - After:\n${indented(proposal.after || "(formatting removed)")}` : "\n  - Result: Preserved exactly";
  return `- ${entry.fieldLabel}\n  - Rule: ${proposal.ruleId}\n  - Category: ${proposal.category}\n  - Confidence: ${proposal.confidence}\n  - Before:\n${indented(proposal.before)}${replacement}`;
}

export function summaryToMarkdown(summary: CardChangeSummary, fileName: string): string {
  const changed = summary.changedFields.length > 0 ? summary.changedFields.map((field) => `- ${field.label}`).join("\n") : "- None";
  const accepted = summary.acceptedByRule.length > 0
    ? summary.acceptedByRule.map((rule) => `- ${rule.category} / ${rule.ruleId}: ${rule.count}`).join("\n")
    : "- None";
  const manual = summary.manualFields.length > 0 ? summary.manualFields.map((field) => `- ${field.label}`).join("\n") : "- None";
  const ignored = summary.ignored.length > 0 ? summary.ignored.map(findingMarkdown).join("\n") : "- None";
  const unresolved = summary.unresolved.length > 0 ? summary.unresolved.map(findingMarkdown).join("\n") : "- None";

  return `# Cardsmith change ledger

- File: ${fileName}
- Format: ${summary.source.toUpperCase()}
- Card version: ${summary.version.toUpperCase()}
- Conversion: ${summary.fromProfile} → ${summary.toProfile}
- Conversion status: ${summary.unresolved.length > 0 ? "Incomplete — one or more recognized macros have no target equivalent" : "No unresolved recognized macros"}

## Changed fields

${changed}

## Accepted proposals by category and rule

${accepted}

## Manual edits

${manual}

## Ignored findings

${ignored}

## Macros without target equivalents

${unresolved}
`;
}

export function summaryToJson(summary: CardChangeSummary, fileName: string): string {
  return `${JSON.stringify({
    schema: "cardsmith-change-ledger-v1",
    fileName,
    ...summary
  }, null, 2)}\n`;
}
