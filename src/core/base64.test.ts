import { describe, expect, it } from "vitest";
import { base64ToText, textToBase64 } from "./base64";

describe("UTF-8 base64", () => {
  it("round trips Unicode card text", () => {
    const value = "She says, \"Hello.\" Café 猫";
    expect(base64ToText(textToBase64(value))).toBe(value);
  });
});
