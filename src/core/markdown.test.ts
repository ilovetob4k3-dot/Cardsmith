import { describe, expect, it } from "vitest";
import { formattingProfileProposals, scanMarkdown } from "./markdown";
import { applyProposal } from "./rules";

describe("tolerant Markdown scanner", () => {
  it.each([
    "*Narration and actions. This is *emphasis**",
    "*Narration. This is *emphasis* *v2**"
  ])("flags and flattens malformed nested emphasis: %s", (text) => {
    const scan = scanMarkdown(text);
    expect(scan.some((issue) => issue.kind === "nested-malformed")).toBe(true);
    const proposal = formattingProfileProposals(text).find((item) => item.ruleId === "formatting.nested-malformed")!;
    expect(proposal.confidence).toBe("low");
    expect(applyProposal(text, proposal)).not.toMatch(/\*[^*]+\*[^*]+\*\*/);
  });

  it("preserves escaped literal markers while recognizing valid surrounding italics", () => {
    const text = "*\\* Narration and actions.* \\* *This is for \\*emphasis\\* v2\\**";
    const scan = scanMarkdown(text);
    expect(scan.filter((issue) => issue.kind === "escaped-literal")).toHaveLength(5);
    expect(formattingProfileProposals(text).some((proposal) => proposal.ruleId === "formatting.nested-malformed")).toBe(false);
    expect(formattingProfileProposals(text).some((proposal) => proposal.before.includes("\\*"))).toBe(false);
  });

  it("distinguishes valid narration, dialogue emphasis, swallowed dialogue, and underscores", () => {
    expect(scanMarkdown("*She crossed the room.*").some((issue) => issue.kind === "action-italics")).toBe(true);
    expect(formattingProfileProposals('"That is *not* funny."').map((proposal) => proposal.ruleId)).toContain("formatting.emphasis-in-dialogue");
    expect(formattingProfileProposals('*She paused. "Leave now." Then she turned.*').map((proposal) => proposal.ruleId)).toContain("formatting.swallowed-dialogue");
    expect(formattingProfileProposals("__loud__ and _quiet_").map((proposal) => proposal.ruleId)).toEqual([
      "formatting.bold-underscore",
      "formatting.underscore-italics"
    ]);
  });

  it("preserves malformed delimiters as non-actionable manual findings", () => {
    const proposals = formattingProfileProposals("*Unclosed narration\n`Unclosed display");
    expect(proposals).toHaveLength(2);
    expect(proposals.every((proposal) => !proposal.actionable && proposal.findingLabel === "Manual repair")).toBe(true);
  });

  it("protects macros, comments, template code, and backtick content", () => {
    const text = "{{*macro*}} <!-- *comment* --> <% *code* %> `${*literal*}`";
    expect(formattingProfileProposals(text)).toEqual([]);
  });

  it("does not mistake Markdown lists, thematic breaks, or intraword underscores for unmatched emphasis", () => {
    const text = "* first item\n* second **bold** item\n***\nfield_name\nfoo_bar_baz\n2*3";
    expect(scanMarkdown(text).filter((issue) => issue.kind === "unmatched-marker")).toEqual([]);
    expect(formattingProfileProposals(text, { fieldLabel: "Description" }).map((proposal) => proposal.ruleId)).toEqual(["formatting.bold-asterisk"]);
  });

  it("offers field-aware displayed-text and explicitly selected thought conventions", () => {
    const text = 'The phone screen read "CASE 041". She thought: *Do not answer.*';
    const proposals = formattingProfileProposals(text, { fieldLabel: "Description", thoughtConvention: "backticks" });
    expect(proposals.map((proposal) => proposal.ruleId)).toEqual([
      "formatting.displayed-text",
      "formatting.likely-thought"
    ]);
    expect(proposals.map((proposal) => proposal.after)).toEqual(["`CASE 041`", "`Do not answer.`"]);
    expect(formattingProfileProposals(text, { fieldLabel: "Name", thoughtConvention: "backticks" })).toEqual([]);
  });

  it("offers conservative, review-required normalization for narration-only prose lines", () => {
    const narration = formattingProfileProposals("She crossed the room.", { fieldLabel: "Description" });
    expect(narration).toHaveLength(1);
    expect(narration[0]).toMatchObject({
      ruleId: "formatting.plain-narration",
      after: "*She crossed the room.*",
      confidence: "low",
      actionable: true
    });
    expect(formattingProfileProposals('"Hello."', { fieldLabel: "Description" })).toEqual([]);
    expect(formattingProfileProposals("She crossed the room.", { fieldLabel: "Name" })).toEqual([]);
  });
});
