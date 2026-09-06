import { describe, expect, it } from "vitest";
import { editedFileName, ledgerFileName } from "./download";

describe("download filenames", () => {
  it("keeps edited cards and ledgers distinct from the source", () => {
    expect(editedFileName("rhea.card.json")).toBe("rhea.card-edited.json");
    expect(ledgerFileName("rhea.card.json", "md")).toBe("rhea.card-cardsmith-ledger.md");
    expect(ledgerFileName("rhea", "json")).toBe("rhea-cardsmith-ledger.json");
  });
});
