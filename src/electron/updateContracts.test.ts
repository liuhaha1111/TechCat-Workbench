import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isContentManifestCompatible,
  type ContentManifest,
} from "../../electron/services/updateContracts";

describe("updateContracts", () => {
  const manifest: ContentManifest = {
    version: "2026.04.04.1",
    publishedAt: "2026-04-04T00:00:00.000Z",
    minAppVersion: "0.2.0",
    maxAppVersion: "0.2.9",
    packageUrl: "https://updates.example.com/ai-workbench/content.zip",
    sha256: "abc123",
    notes: "content refresh",
  };

  it("compares semver-like app versions", () => {
    expect(compareVersions("0.2.1", "0.2.0")).toBeGreaterThan(0);
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
  });

  it("rejects content outside the supported app window", () => {
    expect(isContentManifestCompatible(manifest, "0.3.0")).toBe(false);
    expect(isContentManifestCompatible(manifest, "0.2.5")).toBe(true);
  });
});
