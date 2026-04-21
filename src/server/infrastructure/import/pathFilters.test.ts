import { describe, expect, it } from "vitest";
import { shouldIgnoreImportPath } from "../../../../server/infrastructure/import/pathFilters";

describe("shouldIgnoreImportPath", () => {
  it("ignores node_modules and dist folders", () => {
    expect(shouldIgnoreImportPath("node_modules/react/index.js")).toBe(true);
    expect(shouldIgnoreImportPath("dist/index.js")).toBe(true);
    expect(shouldIgnoreImportPath("src/main.ts")).toBe(false);
  });
});
