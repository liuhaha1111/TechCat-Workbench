import { describe, expect, it } from "vitest";
import { sanitizeImportPath } from "../../../server/lib/importer";

describe("importer", () => {
  it("rejects path traversal", () => {
    expect(() => sanitizeImportPath("../evil/file.ts")).toThrow(
      "path traversal"
    );
  });
});
