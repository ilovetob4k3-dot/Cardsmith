import { describe, expect, it } from "vitest";
import { analyzeText, applyHighConfidence, applyHighConfidenceWithDetails, applyProposal } from "./rules";

describe("review rules", () => {
  it("normalizes malformed braces and macro casing", () => {
    const text = "{{{User}}} meets {char}. {{User}} smiles.";
    const proposals = analyzeText(text, "janitor", "janitor");
    expect(applyHighConfidence(text, proposals)).toBe("{{user}} meets {{char}}. {{user}} smiles.");
  });

  it("converts macros by grammatical role", () => {
    const text = "{{sub}} takes {{poss}} bag and keeps it for {{ref}}.";
    const proposals = analyzeText(text, "janitor", "wyvern");
    expect(applyHighConfidence(text, proposals)).toBe(
      "{{pronounSubjective}} takes {{pronounPosDet}} bag and keeps it for {{pronounReflexive}}."
    );
  });

  it("does not silently treat em-dash suggestions as safe", () => {
    const text = "She stopped—then listened.";
    const proposal = analyzeText(text, "janitor", "janitor")[0];
    expect(proposal.confidence).toBe("low");
    expect(applyHighConfidence(text, [proposal])).toBe(text);
    expect(applyProposal(text, proposal)).toBe("She stopped, then listened.");
  });

  it.each([
    ["word—word", "word, word"],
    ["word — word", "word, word"],
    ["word— word", "word, word"],
    ["word —word", "word, word"],
    ["one—two—three", "one, two, three"],
    ["déjà vu — 你好 — 🌙", "déjà vu, 你好, 🌙"],
    ["`LEDGER: CASE 041 — OPEN`", "`LEDGER: CASE 041, OPEN`"]
  ])("normalizes em-dash spacing without changing adjacent text: %s", (text, expected) => {
    const proposals = analyzeText(text, "janitor", "janitor").filter((proposal) => proposal.ruleId === "punctuation.em-dash");
    const result = [...proposals].sort((left, right) => right.start - left.start).reduce((current, proposal) => applyProposal(current, proposal), text);

    expect(result).toBe(expected);
    expect(result).not.toMatch(/ ,|, {2}/);
    expect(analyzeText(result, "janitor", "janitor").filter((proposal) => proposal.ruleId === "punctuation.em-dash")).toHaveLength(0);
  });

  it("keeps em-dash proposals within one line and avoids trailing replacement spaces", () => {
    const text = "first —\nsecond —";
    const proposals = analyzeText(text, "janitor", "janitor").filter((proposal) => proposal.ruleId === "punctuation.em-dash");
    const result = [...proposals].sort((left, right) => right.start - left.start).reduce((current, proposal) => applyProposal(current, proposal), text);

    expect(proposals.map((proposal) => proposal.before)).toEqual([" —", " —"]);
    expect(result).toBe("first,\nsecond,");
  });

  it("reports source macros that have no target equivalent without changing them", () => {
    const text = "{{pronounSubjective}} {{pronounVerbBe}} ready; {{pronounVerbBe}} calm.";
    const proposals = analyzeText(text, "wyvern", "janitor");
    const unresolved = proposals.filter((proposal) => !proposal.actionable);

    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((proposal) => proposal.before === "{{pronounVerbBe}}" && proposal.after === proposal.before)).toBe(true);
    expect(unresolved.every((proposal) => proposal.explanation.includes("No target equivalent"))).toBe(true);
    const safeResult = applyHighConfidenceWithDetails(text, proposals);
    expect(safeResult.text).toBe("{{sub}} {{pronounVerbBe}} ready; {{pronounVerbBe}} calm.");
    expect(safeResult.applied.map((proposal) => proposal.before)).toEqual(["{{pronounSubjective}}"]);
    expect(() => applyProposal(text, unresolved[0])).toThrow("no target equivalent");
  });
});
