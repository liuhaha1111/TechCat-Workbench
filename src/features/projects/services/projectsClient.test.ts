import { afterEach, describe, expect, it, vi } from "vitest";
import { projectsClient } from "./projectsClient";

describe("projectsClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the preload bridge instead of fetch and normalizes adapter metadata", async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: "project-1",
        name: "Astro Demo",
        framework: "Legacy Label",
        frameworkLabel: "Astro",
        previewMode: "external",
      },
    ]);
    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch should not be used"));

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      workbench: {
        projects: {
          list,
          get: vi.fn(),
          getLogs: vi.fn(),
          subscribeLogs: vi.fn(),
          selectZipFile: vi.fn(),
          selectSourceFolder: vi.fn(),
          selectDeploymentRoot: vi.fn(),
          importZipFromPath: vi.fn(),
          importFolderFromPath: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          delete: vi.fn(),
          getPreviewInfo: vi.fn(),
        },
        ai: {
          generateText: vi.fn(),
        },
      },
    });

    await expect(projectsClient.listProjects()).resolves.toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Astro Demo",
        framework: "Legacy Label",
        frameworkLabel: "Astro",
        previewMode: "external",
      }),
    ]);
    expect(list).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the browser api when the preload bridge is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projects: [{ id: "p1", name: "demo" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {});

    await expect(projectsClient.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: "p1", name: "demo" }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
