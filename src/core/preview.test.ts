import { describe, expect, it } from "vitest";
import { renderPreview } from "./preview";

describe("platform-aware preview", () => {
  const source = "Visible ~Janitor note~ {{pronounSubjective}}. <!-- Silly note\nkept in source --> End.";

  it("returns raw source without hiding or macro substitution", () => {
    const result = renderPreview(source, "raw", "she");
    expect(result.text).toBe(source);
    expect(result.hiddenSegments).toBe(0);
    expect(result.macrosResolved).toBe(false);
  });

  it("hides paired Janitor tilde spans only in Janitor-visible mode", () => {
    const result = renderPreview(source, "janitor", "they");
    expect(result.text).not.toContain("Janitor note");
    expect(result.text).toContain("<!-- Silly note");
    expect(result.text).toContain("they");
    expect(result.hiddenSegments).toBe(1);
    expect(source).toContain("~Janitor note~");
  });

  it("hides complete HTML comments only in SillyTavern-visible mode", () => {
    const result = renderPreview(source, "sillytavern", "he");
    expect(result.text).toContain("~Janitor note~");
    expect(result.text).not.toContain("Silly note");
    expect(result.text).toContain("he");
    expect(result.hiddenSegments).toBe(1);
  });

  it("preserves escaped or unclosed hidden-text markers", () => {
    expect(renderPreview("\\~literal\\~ and ~unclosed", "janitor", "she").text).toBe("\\~literal\\~ and ~unclosed");
    expect(renderPreview("<!-- unclosed", "sillytavern", "she").text).toBe("<!-- unclosed");
  });

  it("continues resolving explicit verb macros", () => {
    expect(renderPreview("They {{pronounVerbBe}} ready.", "janitor", "they").text).toBe("They are ready.");
    expect(renderPreview("She {{pronounVerbBe}} ready.", "sillytavern", "she").text).toBe("She is ready.");
  });
});
