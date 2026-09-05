import { describe, expect, it } from "vitest";
import { exportCardBytes, importCardBytes, updateCardField } from "./card";

describe("JSON card workspace", () => {
  it("preserves unknown and extension fields", () => {
    const source = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Rhea",
        description: "Original",
        extensions: { private_plugin: { enabled: true } },
        unknown_future_field: [1, 2, 3]
      }
    };
    const workspace = importCardBytes("rhea.json", new TextEncoder().encode(JSON.stringify(source)));
    const description = workspace.fields.find((field) => field.label === "Description")!;
    const edited = updateCardField(workspace, description.path, "Edited");
    const reparsed = JSON.parse(new TextDecoder().decode(exportCardBytes(edited)));
    expect(reparsed.data.description).toBe("Edited");
    expect(reparsed.data.extensions).toEqual(source.data.extensions);
    expect(reparsed.data.unknown_future_field).toEqual([1, 2, 3]);
  });

  it("discovers alternate greetings and lorebook content", () => {
    const source = {
      spec: "chara_card_v2",
      data: {
        name: "Rhea",
        alternate_greetings: ["One", "Two"],
        character_book: { entries: [{ keys: ["city"], content: "Lore" }] }
      }
    };
    const workspace = importCardBytes("rhea.json", new TextEncoder().encode(JSON.stringify(source)));
    expect(workspace.fields.map((field) => field.label)).toEqual([
      "Name",
      "Alternate Greeting 1",
      "Alternate Greeting 2",
      "Lorebook Entry 1"
    ]);
  });
});
