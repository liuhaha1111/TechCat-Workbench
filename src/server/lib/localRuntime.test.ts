import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LOCAL_RUNTIME_METADATA_FILENAME,
  buildWorkspaceDirectoryName,
  getDevArgs,
  getDevCommand,
  getExecutableForPackageManager,
  getInstallCommand,
  getProjectDevCommand,
  getProjectInstallCommand,
  getMetadataMarkerPath,
  isPathInside,
  shouldInstallDependencies,
} from "../../../server/lib/localRuntime";
import type { Project } from "../../../server/types";

function createRuntimeProject(
  overrides: Partial<
    Pick<
      Project,
      "packageManager" | "projectType" | "frameworkId" | "frameworkLabel" | "previewMode"
    >
  >
): Pick<
  Project,
  "packageManager" | "projectType" | "frameworkId" | "frameworkLabel" | "previewMode"
> {
  return {
    packageManager: "npm",
    projectType: "vite",
    frameworkId: "react-vite",
    frameworkLabel: "React + Vite",
    previewMode: "embedded",
    ...overrides,
  };
}

describe("localRuntime", () => {
  it("creates a stable managed workspace name", () => {
    expect(buildWorkspaceDirectoryName("My Demo App", "12345678-aaaa-bbbb")).toBe(
      "my-demo-app-12345678"
    );
  });

  it("falls back to default workspace slug when project name is empty", () => {
    expect(buildWorkspaceDirectoryName("   ", "12345678-aaaa-bbbb")).toBe(
      "project-12345678"
    );
  });

  it("falls back to an ascii-safe managed workspace name for non-latin project names", () => {
    expect(
      buildWorkspaceDirectoryName(
        "吉林省科技计划项目管理信息系统",
        "12345678-aaaa-bbbb"
      )
    ).toBe("project-12345678");
  });

  it("uses .cmd executables on Windows", () => {
    expect(getExecutableForPackageManager("npm", "win32")).toBe("npm.cmd");
  });

  it("keeps package manager executable names on non-Windows platforms", () => {
    expect(getExecutableForPackageManager("pnpm", "linux")).toBe("pnpm");
  });

  it("builds pnpm install arguments", () => {
    expect(getInstallCommand("pnpm", "win32")).toEqual({
      command: "pnpm.cmd",
      args: ["install", "--frozen-lockfile"],
    });
  });

  it("builds npm install arguments", () => {
    expect(getInstallCommand("npm", "linux")).toEqual({
      command: "npm",
      args: ["install"],
    });
  });

  it("adds --legacy-peer-deps for npm when relaxing peer conflicts", () => {
    expect(getInstallCommand("npm", "linux", { legacyPeerDeps: true })).toEqual({
      command: "npm",
      args: ["install", "--legacy-peer-deps"],
    });
  });

  it("adds --no-strict-peer-dependencies for pnpm when relaxing peer conflicts", () => {
    expect(getInstallCommand("pnpm", "linux", { legacyPeerDeps: true })).toEqual({
      command: "pnpm",
      args: ["install", "--frozen-lockfile", "--no-strict-peer-dependencies"],
    });
  });

  it("forwards the legacy-peer-deps option through getProjectInstallCommand", () => {
    const project = createRuntimeProject({ packageManager: "npm" });
    expect(getProjectInstallCommand(project, "linux", { legacyPeerDeps: true })).toEqual({
      command: "npm",
      args: ["install", "--legacy-peer-deps"],
    });
  });

  it("builds npm dev args with explicit host and port", () => {
    expect(getDevArgs("npm", 43210)).toEqual([
      "run",
      "dev",
      "--",
      "--host",
      "0.0.0.0",
      "--port",
      "43210",
      "--strictPort",
    ]);
  });

  it("builds yarn dev command with windows executable", () => {
    expect(getDevCommand("yarn", 5173, "win32")).toEqual({
      command: "yarn.cmd",
      args: ["dev", "--host", "0.0.0.0", "--port", "5173", "--strictPort"],
    });
  });

  it("uses one dev strategy for all vite-family adapters", () => {
    const frameworks = [
      createRuntimeProject({
        frameworkId: "react-vite",
        frameworkLabel: "React + Vite",
      }),
      createRuntimeProject({
        frameworkId: "vue-vite",
        frameworkLabel: "Vue + Vite",
      }),
      createRuntimeProject({
        frameworkId: "svelte-vite",
        frameworkLabel: "Svelte + Vite",
      }),
      createRuntimeProject({
        frameworkId: "solid-vite",
        frameworkLabel: "Solid + Vite",
      }),
    ];

    for (const project of frameworks) {
      expect(getProjectDevCommand(project, 43210, "linux")).toEqual({
        command: "npm",
        args: [
          "run",
          "dev",
          "--",
          "--host",
          "0.0.0.0",
          "--port",
          "43210",
          "--strictPort",
        ],
      });
    }
  });

  it("builds Astro install and dev commands", () => {
    const project = createRuntimeProject({
      projectType: "astro",
      frameworkId: "astro",
      frameworkLabel: "Astro",
    });

    expect(getProjectInstallCommand(project, "linux")).toEqual({
      command: "npm",
      args: ["install"],
    });
    expect(getProjectDevCommand(project, 43210, "linux")).toEqual({
      command: "npm",
      args: ["run", "dev", "--", "--host", "0.0.0.0", "--port", "43210"],
    });
  });

  it("builds the Next.js dev command with hostname flags", () => {
    const project = createRuntimeProject({
      projectType: "next",
      frameworkId: "next",
      frameworkLabel: "Next.js",
      previewMode: "external",
    });

    expect(getProjectDevCommand(project, 5173, "linux")).toEqual({
      command: "npm",
      args: ["run", "dev", "--", "--hostname", "0.0.0.0", "--port", "5173"],
    });
  });

  it("skips install and uses the bundled preview server for static projects", () => {
    const project = createRuntimeProject({
      packageManager: null,
      projectType: "static",
      frameworkId: "static-html",
      frameworkLabel: "Static HTML",
    });

    expect(shouldInstallDependencies(project)).toBe(false);
    expect(getProjectInstallCommand(project, "linux")).toBeNull();

    const command = getProjectDevCommand(project, 43210, "linux");
    expect(command.command).toBe(process.execPath);
    expect(command.args[0]).toBe("-e");
    expect(command.args.at(-1)).toBe("43210");
  });

  it("provides metadata marker filename and path helper", () => {
    const workspacePath = path.join("D:\\", "deploy", "my-app-12345678");
    expect(LOCAL_RUNTIME_METADATA_FILENAME).toBe(".ai-workbench.json");
    expect(getMetadataMarkerPath(workspacePath)).toBe(
      path.join(workspacePath, ".ai-workbench.json")
    );
  });

  it("detects when path is inside deployment root", () => {
    const deploymentRoot = path.resolve("D:\\deploy-root");
    const workspacePath = path.join(deploymentRoot, "my-app-12345678");
    expect(isPathInside(deploymentRoot, workspacePath)).toBe(true);
  });

  it("rejects equal or parent-escaping paths", () => {
    const deploymentRoot = path.resolve("D:\\deploy-root");
    expect(isPathInside(deploymentRoot, deploymentRoot)).toBe(false);
    expect(isPathInside(deploymentRoot, path.resolve("D:\\other-root"))).toBe(
      false
    );
  });
});
