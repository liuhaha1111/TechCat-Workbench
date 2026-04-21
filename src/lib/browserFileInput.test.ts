import { describe, expect, it } from "vitest";
import { clearBrowserFileInputValue } from "./browserFileInput";

describe("clearBrowserFileInputValue", () => {
  it("clears the current input value so the same file can be reselected", () => {
    const input = { value: "D:\\codex_code\\ai_workbench\\b_fX36gztdfOq.zip" };

    clearBrowserFileInputValue(input);

    expect(input.value).toBe("");
  });

  it("ignores missing inputs", () => {
    expect(() => clearBrowserFileInputValue(null)).not.toThrow();
  });
});
