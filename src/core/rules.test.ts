import { describe, expect, it } from "vitest";
import { analyzeText, applyHighConfidence, applyProposal } from "./rules";

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
});
