import { describe, expect, it } from "vitest";
import { importCardBytes } from "./card";
import { buildChangeSummary, type LoggedFinding } from "./summary";

describe("whole-card change summary", () => {
  it("separates changed fields, accepted changes, manual edits, ignored findings, and unresolved macros", () => {
    const source = {
      spec: "chara_card_v2",
      data: {
        name: "Rhea",
        description: "{{pronounVerbBe}} ready.",
        scenario: "Original"
      }
    };
    const workspace = importCardBytes("rhea.json", new TextEncoder().encode(JSON.stringify(source)));
    workspace.card = {
      ...workspace.card,
      data: { ...source.data, name: "Rhea Vale", scenario: "Edited manually" }
    };
    workspace.fields = workspace.fields.map((field) => {
      if (field.id === "data.name") return { ...field, value: "Rhea Vale" };
      if (field.id === "data.scenario") return { ...field, value: "Edited manually" };
      return field;
    });
    const accepted: LoggedFinding[] = [{
      fieldId: "data.name",
      fieldLabel: "Name",
      proposal: {
        id: "structure:0:Rhea",
        ruleId: "structure.example",
        category: "structure",
        start: 0,
        end: 4,
        before: "Rhea",
        after: "Rhea Vale",
        confidence: "high",
        actionable: true,
        explanation: "Example accepted proposal."
      }
    }];
    const ignored: LoggedFinding[] = [{
      fieldId: "data.scenario",
      fieldLabel: "Scenario",
      proposal: {
        id: "punctuation:0:Original",
        ruleId: "punctuation.example",
        category: "punctuation",
        start: 0,
        end: 8,
        before: "Original",
        after: "Revised",
        confidence: "low",
        actionable: true,
        explanation: "Example ignored proposal."
      }
    }];

    const summary = buildChangeSummary(workspace, "wyvern", "janitor", accepted, ignored, new Set(["data.scenario"]));

    expect(summary.changedFields.map((field) => field.label)).toEqual(["Name", "Scenario"]);
    expect(summary.acceptedByRule).toEqual([{ ruleId: "structure.example", category: "structure", count: 1 }]);
    expect(summary.manualFields.map((field) => field.label)).toEqual(["Scenario"]);
    expect(summary.ignored).toEqual(ignored);
    expect(summary.source).toBe("json");
    expect(summary.version).toBe("v2");
    expect(summary.fromProfile).toContain("WyvernChat");
    expect(summary.toProfile).toBe("JanitorAI");
    expect(summary.unresolved).toHaveLength(1);
    expect(summary.unresolved[0].fieldLabel).toBe("Description");
    expect(summary.unresolved[0].proposal.before).toBe("{{pronounVerbBe}}");
  });
});
