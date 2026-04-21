import { describe, expect, it, vi } from "vitest";
import { ProjectApplicationService } from "../../../server/application/projectApplicationService";

describe("ProjectApplicationService", () => {
  it("imports a folder from a native source path", async () => {
    const result = {
      project: { id: "project-1" },
      skippedPaths: ["node_modules"],
    };
    const projectService = {
      importFolderProjectFromPath: vi.fn().mockResolvedValue(result),
    } as unknown as ConstructorParameters<typeof ProjectApplicationService>[0];

    const service = new ProjectApplicationService(projectService);

    await expect(
      service.importFolderFromPath({
        name: "demo-app",
        sourcePath: "D:\\source-app",
        deploymentRootPath: "D:\\deploy-root",
      })
    ).resolves.toEqual(result);

    expect(projectService.importFolderProjectFromPath).toHaveBeenCalledWith(
      "demo-app",
      "D:\\source-app",
      "D:\\deploy-root"
    );
  });
});
