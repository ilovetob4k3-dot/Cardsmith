import { describe, expect, it } from "vitest";
import { DOWNLOAD_REVOKE_DELAY_MS, downloadBlockedMessage, editedFileName, ledgerFileName } from "./download";

describe("download filenames", () => {
  it("keeps edited cards and ledgers distinct from the source", () => {
    expect(editedFileName("rhea.card.json")).toBe("rhea.card-edited.json");
    expect(ledgerFileName("rhea.card.json", "md")).toBe("rhea.card-cardsmith-ledger.md");
    expect(ledgerFileName("rhea", "json")).toBe("rhea-cardsmith-ledger.json");
  });

  it("keeps object URLs alive for slow mobile handoff and gives actionable failure advice", () => {
    expect(DOWNLOAD_REVOKE_DELAY_MS).toBeGreaterThanOrEqual(30_000);
    expect(downloadBlockedMessage("rhea-edited.json")).toContain("Allow downloads");
    expect(downloadBlockedMessage("rhea-edited.json")).toContain("Downloads folder");
  });
});
