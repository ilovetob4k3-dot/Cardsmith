import { describe, expect, it } from "vitest";
import { referentAwareProposals } from "./pronouns";

describe("referent-aware pronoun suggestions", () => {
  it("maps singular user pronouns by grammatical role to Janitor macros", () => {
    const text = "{{user}} adjusted their coat. They kept the map for themself; the map was theirs.";
    const proposals = referentAwareProposals(text, { target: "janitor", referent: "user" });
    expect(proposals.map((item) => item.after)).toEqual(["{{poss}}", "{{sub}}", "{{ref}}", "{{poss_p}}"]);
    expect(proposals.every((item) => item.actionable && item.confidence === "medium")).toBe(true);
  });

  it("separates character, named-person, group, and unknown references", () => {
    const text = "{{char}} checked his bag. Rowan lifted their cup. The guards raised their shields. They waited.";
    const char = referentAwareProposals(text, { target: "she", referent: "char", name: "Rowan" });
    expect(char.filter((item) => item.actionable).map((item) => item.before)).toEqual(["his"]);
    expect(char.find((item) => item.actionable)?.after).toBe("her");

    const named = referentAwareProposals(text, { target: "he", referent: "named", name: "Rowan" });
    expect(named.some((item) => item.before.toLowerCase() === "their" && item.after === "his")).toBe(true);
    expect(named.some((item) => item.findingLabel === "Plural reference")).toBe(true);

    const userUnknown = referentAwareProposals("They waited.", { target: "she", referent: "user" });
    expect(userUnknown).toHaveLength(1);
    expect(userUnknown[0]).toMatchObject({ actionable: false, findingLabel: "Unknown referent", after: "They" });
  });

  it("never offers plural they as a singular replacement", () => {
    const proposals = referentAwareProposals("The guards checked their packs. They both nodded.", { target: "she", referent: "any-singular" });
    expect(proposals.every((item) => !item.actionable && item.findingLabel === "Plural reference")).toBe(true);
  });

  it("supports fixed-pronoun targets and avoids no-op suggestions", () => {
    const text = "{{user}} said she kept her coat for herself.";
    expect(referentAwareProposals(text, { target: "she", referent: "user" })).toEqual([]);
    expect(referentAwareProposals(text, { target: "they", referent: "user" }).map((item) => item.after)).toEqual(["they", "their", "themself"]);
  });

  it("protects all double-brace template spans while retaining referent cues", () => {
    const proposals = referentAwareProposals("{{user}} records {{their}} value, then checks their notes.", { target: "janitor", referent: "user" });
    expect(proposals.map((item) => item.before)).toEqual(["their"]);
    expect(proposals[0].after).toBe("{{poss}}");
  });

  it("classifies object her before adverbs or determiners without guessing possessive wording", () => {
    const adverb = referentAwareProposals("Rowan spoke to her yesterday.", { target: "janitor", referent: "named", name: "Rowan" });
    const determiner = referentAwareProposals("Rowan gave her the book.", { target: "janitor", referent: "named", name: "Rowan" });
    expect(adverb).toHaveLength(1);
    expect(adverb[0]).toMatchObject({ after: "{{obj}}", ruleId: "pronoun.replace.named.janitor.object" });
    expect(determiner[0]).toMatchObject({ after: "{{obj}}", ruleId: "pronoun.replace.named.janitor.object" });
  });

  it("keeps gendered terms opt-in and body descriptors review-only", () => {
    const text = "{{char}} is a woman and queen with an hourglass figure.";
    const proposals = referentAwareProposals(text, {
      target: "off",
      referent: "char",
      genderShift: "neutral",
      reviewBodyDescriptors: true
    });
    expect(proposals.map((item) => item.after)).toEqual(["person", "monarch", "hourglass"]);
    expect(proposals[2]).toMatchObject({ actionable: false, findingLabel: "Body descriptor review" });
  });

  it("preserves ambiguous neutral gender terms for relationship-specific manual review", () => {
    const proposals = referentAwareProposals("{{char}} protects a child.", {
      target: "off",
      referent: "char",
      genderShift: "feminine"
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      before: "child",
      after: "child",
      actionable: false,
      findingLabel: "Ambiguous gender term"
    });
    expect(proposals[0].explanation).toContain("girl or daughter");
  });

  it("does not inspect macros, code, template syntax, or HTML comments", () => {
    const text = "`{{user}} told them` <!-- {{user}} told them --> <% them %> ${them} {{their}}";
    expect(referentAwareProposals(text, { target: "she", referent: "user" })).toEqual([]);
  });
});
