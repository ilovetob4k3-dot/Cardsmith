import { describe, expect, it } from "vitest";
import { importCardBytes } from "./card";
import { analyzeCard, applyHighConfidenceToCard, countFindingCategories, openCardFindings, safeCardFindings } from "./cardReview";
import { findingKey, type LoggedFinding } from "./summary";

function workspaceFor(data: Record<string, unknown>) {
  return importCardBytes("review.json", new TextEncoder().encode(JSON.stringify({
    spec: "chara_card_v2",
    data: { ...data, extensions: { preserve: true } }
  })));
}

describe("whole-card review", () => {
  it("collects findings by field and separates safe candidates", () => {
    const workspace = workspaceFor({
      name: "{{{User}}}",
      description: "{{pronounSubjective}} {{pronounVerbBe}} ready — today.",
      scenario: "Clean"
    });
    const reviews = analyzeCard(workspace, "wyvern", "janitor");
    const open = openCardFindings(reviews, []);
    const safe = safeCardFindings(reviews, []);

    expect(reviews.map((review) => review.fieldLabel)).toEqual(["Name", "Description", "Scenario"]);
    expect(open).toHaveLength(4);
    expect(safe.map((entry) => entry.proposal.before)).toEqual(["{{{User}}}", "{{pronounSubjective}}"]);
    expect(countFindingCategories(safe)).toEqual([
      { category: "structure", count: 1 },
      { category: "macro", count: 1 }
    ]);
  });

  it("applies safe, non-overlapping findings across fields as one transaction", () => {
    const workspace = workspaceFor({
      name: "{{{User}}}",
      description: "{{pronounSubjective}} {{pronounVerbBe}} ready — today."
    });
    const result = applyHighConfidenceToCard(workspace, "wyvern", "janitor");
    const name = result.workspace.fields.find((field) => field.label === "Name")!;
    const description = result.workspace.fields.find((field) => field.label === "Description")!;

    expect(name.value).toBe("{{user}}");
    expect(description.value).toBe("{{sub}} {{pronounVerbBe}} ready — today.");
    expect(result.applied).toHaveLength(2);
    expect(result.before.fields.find((field) => field.label === "Name")?.value).toBe("{{{User}}}");
    expect((result.workspace.card.data as Record<string, unknown>).extensions).toEqual({ preserve: true });
  });

  it("respects ignored findings during card-wide application", () => {
    const workspace = workspaceFor({ name: "{user}", description: "{char}" });
    const reviews = analyzeCard(workspace, "janitor", "janitor");
    const ignoredEntry: LoggedFinding = {
      fieldId: reviews[0].fieldId,
      fieldLabel: reviews[0].fieldLabel,
      proposal: reviews[0].findings[0]
    };
    const result = applyHighConfidenceToCard(workspace, "janitor", "janitor", [ignoredEntry]);

    expect(result.workspace.fields.find((field) => field.label === "Name")?.value).toBe("{user}");
    expect(result.workspace.fields.find((field) => field.label === "Description")?.value).toBe("{{char}}");
    expect(result.applied).toHaveLength(1);
    expect(findingKey(ignoredEntry.fieldId, ignoredEntry.proposal)).toContain("data.name");
  });
});
