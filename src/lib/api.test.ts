import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFolderImportFormData,
  buildZipImportFormData,
  deleteProject,
  fetchProjects,
  isLikelyAbsoluteDeploymentRootPath,
  parseProjectsResponse,
} from "./api";

describe("api parser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes projects payload", () => {
    const projects = parseProjectsResponse({
      projects: [{ id: "1", name: "demo" }],
    });
    expect(projects[0]?.id).toBe("1");
  });

  it("loads projects from API json payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ projects: [{ id: "1", name: "demo" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const projects = await fetchProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe("1");
  });

  it("throws request status when API responds with empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 502,
          statusText: "Bad Gateway",
        })
      )
    );

    await expect(fetchProjects()).rejects.toThrow("Request failed: 502");
  });

  it("deletes project by id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "p1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(deleteProject("p1")).resolves.toEqual({ id: "p1" });
  });

  it("throws API error when delete fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Project not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(deleteProject("missing")).rejects.toThrow("Project not found");
  });
});

describe("import form data builders", () => {
  it("adds deploymentRootPath to folder upload payload", () => {
    const file = new File(["console.log('ok')"], "main.ts", {
      type: "text/plain",
    });
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: "src/main.ts",
    });

    const formData = buildFolderImportFormData(
      [file],
      "Demo App",
      "D:\\deploy-root"
    );

    expect(formData.get("deploymentRootPath")).toBe("D:\\deploy-root");
    expect(formData.get("name")).toBe("Demo App");

    const uploadedFiles = formData.getAll("files") as File[];
    expect(uploadedFiles).toHaveLength(1);
    expect(uploadedFiles[0]?.name).toBe("src/main.ts");
  });

  it("adds deploymentRootPath to zip upload payload", () => {
    const file = new File(["zip-content"], "demo.zip", {
      type: "application/zip",
    });

    const formData = buildZipImportFormData(
      file,
      "Demo Zip",
      "D:\\deploy-root"
    );

    expect(formData.get("deploymentRootPath")).toBe("D:\\deploy-root");
    expect(formData.get("name")).toBe("Demo Zip");

    const uploaded = formData.get("file") as File | null;
    expect(uploaded?.name).toBe("demo.zip");
  });

  it("trims deployment root path and omits blank project names", () => {
    const file = new File(["zip-content"], "demo.zip", {
      type: "application/zip",
    });

    const formData = buildZipImportFormData(
      file,
      "   ",
      "  D:\\deploy-root  "
    );

    expect(formData.get("deploymentRootPath")).toBe("D:\\deploy-root");
    expect(formData.get("name")).toBeNull();
  });
});

describe("deployment root validation", () => {
  it("accepts rooted absolute deployment paths", () => {
    expect(isLikelyAbsoluteDeploymentRootPath("D:\\deploy-root")).toBe(true);
    expect(isLikelyAbsoluteDeploymentRootPath("\\\\server\\share")).toBe(true);
    expect(isLikelyAbsoluteDeploymentRootPath("/deploy-root")).toBe(true);
    expect(isLikelyAbsoluteDeploymentRootPath("\\deploy-root")).toBe(true);
  });

  it("rejects relative deployment root paths", () => {
    expect(isLikelyAbsoluteDeploymentRootPath("deploy-root")).toBe(false);
    expect(isLikelyAbsoluteDeploymentRootPath(".\\deploy-root")).toBe(false);
  });
});

