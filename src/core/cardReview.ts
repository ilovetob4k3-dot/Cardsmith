import { updateCardField } from "./card";
import type { PlatformId } from "./macros";
import { analyzeText, applyHighConfidenceWithDetails } from "./rules";
import { findingKey, type LoggedFinding } from "./summary";
import type { EditProposal, ImportedCard } from "./types";

export interface CardFieldReview {
  fieldId: string;
  fieldLabel: string;
  value: string;
  dirty: boolean;
  findings: EditProposal[];
}

export interface FindingCategoryCount {
  category: EditProposal["category"];
  count: number;
}

export interface CardWideApplyResult {
  before: ImportedCard;
  workspace: ImportedCard;
  applied: LoggedFinding[];
}

export function analyzeCard(workspace: ImportedCard, from: PlatformId, to: PlatformId): CardFieldReview[] {
  return workspace.fields.map((field) => ({
    fieldId: field.id,
    fieldLabel: field.label,
    value: field.value,
    dirty: field.value !== field.originalValue,
    findings: analyzeText(field.value, from, to)
  }));
}

export function openCardFindings(reviews: CardFieldReview[], ignored: LoggedFinding[]): LoggedFinding[] {
  const ignoredKeys = new Set(ignored.map((entry) => findingKey(entry.fieldId, entry.proposal)));
  return reviews.flatMap((review) => review.findings
    .filter((proposal) => !ignoredKeys.has(findingKey(review.fieldId, proposal)))
    .map((proposal) => ({ fieldId: review.fieldId, fieldLabel: review.fieldLabel, proposal }))
  );
}

export function safeCardFindings(reviews: CardFieldReview[], ignored: LoggedFinding[]): LoggedFinding[] {
  const ignoredKeys = new Set(ignored.map((entry) => findingKey(entry.fieldId, entry.proposal)));
  return reviews.flatMap((review) => {
    const proposals = review.findings.filter((proposal) => !ignoredKeys.has(findingKey(review.fieldId, proposal)));
    return applyHighConfidenceWithDetails(review.value, proposals).applied
      .map((proposal) => ({ fieldId: review.fieldId, fieldLabel: review.fieldLabel, proposal }));
  });
}

export function countFindingCategories(findings: LoggedFinding[]): FindingCategoryCount[] {
  const counts = new Map<EditProposal["category"], number>();
  for (const entry of findings) counts.set(entry.proposal.category, (counts.get(entry.proposal.category) ?? 0) + 1);
  return [...counts].map(([category, count]) => ({ category, count }));
}

export function applyHighConfidenceToCard(
  workspace: ImportedCard,
  from: PlatformId,
  to: PlatformId,
  ignored: LoggedFinding[] = []
): CardWideApplyResult {
  const ignoredKeys = new Set(ignored.map((entry) => findingKey(entry.fieldId, entry.proposal)));
  let next = workspace;
  const applied: LoggedFinding[] = [];

  for (const field of workspace.fields) {
    const proposals = analyzeText(field.value, from, to).filter((proposal) => !ignoredKeys.has(findingKey(field.id, proposal)));
    const result = applyHighConfidenceWithDetails(field.value, proposals);
    if (result.applied.length === 0) continue;
    next = updateCardField(next, field.path, result.text);
    applied.push(...result.applied.map((proposal) => ({ fieldId: field.id, fieldLabel: field.label, proposal })));
  }

  return { before: workspace, workspace: next, applied };
}
