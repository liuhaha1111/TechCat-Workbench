import { describe, expect, it, vi } from "vitest";
import { UpdateService } from "../../electron/services/updateService";

describe("UpdateService", () => {
  it("delegates manual checks to the updater adapter", async () => {
    const updater = {
      autoDownload: false,
      on: vi.fn(),
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn(),
    };
    const service = new UpdateService(updater as never, {
      currentVersion: "0.2.0",
      checkOnStartup: false,
    });

    await service.checkForAppUpdate();

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
