import { describe, expect, it } from "vitest";
import { ContentResolver } from "../../electron/services/contentResolver";

describe("ContentResolver", () => {
  it("falls back to the bundled prompt when no downloaded bundle is active", async () => {
    const resolver = new ContentResolver({
      builtInRoot: new URL("../../resources/content-bundle/", import.meta.url),
      userDataRoot: null,
    });

    await expect(
      resolver.getPrompt("project-analysis/system")
    ).resolves.toContain("project");
  });
});
