import { describe, expect, it, vi } from "vitest";
import { ContentUpdateService } from "../../electron/services/contentUpdateService";

describe("ContentUpdateService", () => {
  it("keeps the previous content active when the downloaded checksum is invalid", async () => {
    const service = new ContentUpdateService({
      appVersion: "0.2.1",
      fetchJson: vi.fn().mockResolvedValue({
        version: "2026.04.05.1",
        publishedAt: "2026-04-05T00:00:00.000Z",
        minAppVersion: "0.2.0",
        maxAppVersion: "0.2.9",
        packageUrl: "https://updates.example.com/ai-workbench/content.zip",
        sha256: "expected",
        notes: "bad checksum",
      }),
      downloadFile: vi.fn().mockResolvedValue("D:/tmp/content.zip"),
      computeSha256: vi.fn().mockResolvedValue("actual"),
    } as never);

    await expect(service.checkForContentUpdate()).resolves.toMatchObject({
      kind: "error",
    });
  });
});
