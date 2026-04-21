import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectSidebar } from "./ProjectSidebar";
import type { Project } from "../../../types/project";

const project: Project = {
  id: "project-1",
  name: "Astro Demo",
  sourceType: "folder",
  workspacePath: "D:/projects/astro-demo",
  deploymentRootPath: "D:/projects",
  status: "ready",
  packageManager: "npm",
  framework: "Legacy Label",
  projectType: "astro",
  frameworkId: "astro",
  frameworkLabel: "Astro",
  previewMode: "embedded",
  containerName: null,
  containerPort: null,
  runtimePort: 43000,
  previewUrl: "http://127.0.0.1:43000",
  warnings: [],
  lastError: null,
  createdAt: "2026-04-17T00:00:00.000Z",
  updatedAt: "2026-04-17T00:00:00.000Z",
};

describe("ProjectSidebar", () => {
  it("renders framework labels from adapter metadata", () => {
    const html = renderToStaticMarkup(
      <ProjectSidebar
        projects={[project]}
        loading={false}
        selectedId={null}
        onSelect={vi.fn()}
        onImport={vi.fn()}
      />
    );

    expect(html).toContain("Import Project");
    expect(html).toContain("Astro");
    expect(html).not.toContain("Legacy Label");
  });
});
