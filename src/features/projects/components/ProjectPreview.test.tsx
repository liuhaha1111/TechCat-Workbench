import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Project } from "../../../types/project";
import { ProjectPreview } from "./ProjectPreview";

function createProject(overrides: Partial<Project>): Project {
  return {
    id: "project-1",
    name: "Preview Demo",
    sourceType: "folder",
    workspacePath: "D:/projects/demo",
    deploymentRootPath: "D:/projects",
    status: "ready",
    packageManager: "npm",
    framework: "React + Vite",
    projectType: "vite",
    frameworkId: "react-vite",
    frameworkLabel: "React + Vite",
    previewMode: "embedded",
    containerName: null,
    containerPort: null,
    runtimePort: 43000,
    previewUrl: "http://127.0.0.1:43000",
    warnings: [],
    lastError: null,
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("ProjectPreview", () => {
  it("embeds previews for embedded preview projects", () => {
    const html = renderToStaticMarkup(
      <ProjectPreview
        project={createProject({
          framework: "Astro",
          projectType: "astro",
          frameworkId: "astro",
          frameworkLabel: "Astro",
        })}
        theme="dark"
      />
    );

    expect(html).toContain("iframe");
    expect(html).toContain("Open in Browser");
  });

  it("shows a browser-only message for external preview projects", () => {
    const html = renderToStaticMarkup(
      <ProjectPreview
        project={createProject({
          framework: "Next.js",
          projectType: "next",
          frameworkId: "next",
          frameworkLabel: "Next.js",
          previewMode: "external",
        })}
        theme="dark"
      />
    );

    expect(html).toContain("Open in Browser");
    expect(html).toContain("Preview opens in your browser for this project.");
    expect(html).not.toContain("<iframe");
  });
});
