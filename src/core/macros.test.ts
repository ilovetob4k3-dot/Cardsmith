import { describe, expect, it } from "vitest";
import { macroReferenceRows } from "./macros";

describe("macro reference", () => {
  it("documents exactly the two supported families and marks unsupported roles", () => {
    expect(macroReferenceRows).toHaveLength(6);
    expect(macroReferenceRows.find((row) => row.role === "subject")).toMatchObject({ janitor: "{{sub}}", wyvern: "{{pronounSubjective}}" });
    expect(macroReferenceRows.find((row) => row.role === "verbBe")).toMatchObject({ janitor: null, wyvern: "{{pronounVerbBe}}" });
  });
});
