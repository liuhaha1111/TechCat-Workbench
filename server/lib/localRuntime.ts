import path from "node:path";
import type { PackageManager, Project, ProjectType } from "../types";

export interface RuntimeCommand {
  command: string;
  args: string[];
}

export type RuntimeProjectAdapter = Pick<
  Project,
  "packageManager" | "projectType" | "frameworkId" | "frameworkLabel" | "previewMode"
>;

export const LOCAL_RUNTIME_METADATA_FILENAME = ".ai-workbench.json";
export const LOCAL_RUNTIME_DEFAULT_DEV_PORT = 5173;
export const LOCAL_RUNTIME_HOST = "0.0.0.0";
export const LOCAL_RUNTIME_PORT_SCAN_START = 43000;
export const LOCAL_RUNTIME_READY_TIMEOUT_MS = 120_000;

const STATIC_PREVIEW_SERVER_SCRIPT = `
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = process.cwd();
const port = Number(process.argv[1]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendFile(response, targetPath) {
  fs.readFile(targetPath, (error, contents) => {
    if (error) {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }

    response.setHeader(
      "Content-Type",
      mimeTypes[path.extname(targetPath).toLowerCase()] || "application/octet-stream"
    );
    response.end(contents);
  });
}

http
  .createServer((request, response) => {
    const requestPath = (request.url || "/").split("?")[0];
    const relativePath =
      requestPath === "/" ? "index.html" : decodeURIComponent(requestPath).replace(/^\\/+/, "");
    const resolvedRoot = path.resolve(root);
    const targetPath = path.resolve(path.join(root, relativePath));

    if (!targetPath.startsWith(resolvedRoot)) {
      response.statusCode = 403;
      response.end("Forbidden");
      return;
    }

    fs.stat(targetPath, (statError, stat) => {
      if (!statError && stat.isFile()) {
        sendFile(response, targetPath);
        return;
      }

      sendFile(response, path.join(root, "index.html"));
    });
  })
  .listen(port, "0.0.0.0");
`.trim();

export function buildWorkspaceDirectoryName(
  name: string,
  projectId: string
): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "project"}-${projectId.slice(0, 8)}`;
}

export function getExecutableForPackageManager(
  packageManager: PackageManager,
  platform: NodeJS.Platform = process.platform
): string {
  return platform === "win32" ? `${packageManager}.cmd` : packageManager;
}

export function getInstallArgs(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case "pnpm":
      return ["install", "--frozen-lockfile"];
    case "yarn":
      return ["install", "--frozen-lockfile"];
    default:
      return ["install"];
  }
}

export function getInstallCommand(
  packageManager: PackageManager,
  platform: NodeJS.Platform = process.platform
): RuntimeCommand {
  return {
    command: getExecutableForPackageManager(packageManager, platform),
    args: getInstallArgs(packageManager),
  };
}

export function getDevArgs(
  packageManager: PackageManager,
  port: number
): string[] {
  const portArg = String(port);
  switch (packageManager) {
    case "yarn":
      return ["dev", "--host", LOCAL_RUNTIME_HOST, "--port", portArg, "--strictPort"];
    case "pnpm":
    case "npm":
    default:
      return [
        "run",
        "dev",
        "--",
        "--host",
        LOCAL_RUNTIME_HOST,
        "--port",
        portArg,
        "--strictPort",
      ];
  }
}

function getAstroDevArgs(
  packageManager: PackageManager,
  port: number
): string[] {
  const portArg = String(port);
  if (packageManager === "yarn") {
    return ["dev", "--host", LOCAL_RUNTIME_HOST, "--port", portArg];
  }

  return ["run", "dev", "--", "--host", LOCAL_RUNTIME_HOST, "--port", portArg];
}

function getNextDevArgs(
  packageManager: PackageManager,
  port: number
): string[] {
  const portArg = String(port);
  if (packageManager === "yarn") {
    return ["dev", "--hostname", LOCAL_RUNTIME_HOST, "--port", portArg];
  }

  return ["run", "dev", "--", "--hostname", LOCAL_RUNTIME_HOST, "--port", portArg];
}

function getRequiredPackageManager(project: RuntimeProjectAdapter): PackageManager {
  if (!project.packageManager) {
    throw new Error("Project package manager is required for this runtime command");
  }

  return project.packageManager;
}

export function shouldInstallDependencies(project: RuntimeProjectAdapter): boolean {
  return project.projectType !== "static";
}

export function getProjectInstallCommand(
  project: RuntimeProjectAdapter,
  platform: NodeJS.Platform = process.platform
): RuntimeCommand | null {
  if (!shouldInstallDependencies(project)) {
    return null;
  }

  return getInstallCommand(getRequiredPackageManager(project), platform);
}

function getProjectType(project: RuntimeProjectAdapter): ProjectType | null {
  return project.projectType ?? null;
}

export function getProjectDevCommand(
  project: RuntimeProjectAdapter,
  port: number,
  platform: NodeJS.Platform = process.platform
): RuntimeCommand {
  const projectType = getProjectType(project);

  if (projectType === "static") {
    return {
      command: process.execPath,
      args: ["-e", STATIC_PREVIEW_SERVER_SCRIPT, String(port)],
    };
  }

  const packageManager = getRequiredPackageManager(project);
  const command = getExecutableForPackageManager(packageManager, platform);

  if (projectType === "astro") {
    return {
      command,
      args: getAstroDevArgs(packageManager, port),
    };
  }

  if (projectType === "next") {
    return {
      command,
      args: getNextDevArgs(packageManager, port),
    };
  }

  return {
    command,
    args: getDevArgs(packageManager, port),
  };
}

export function getDevCommand(
  packageManager: PackageManager,
  port: number,
  platform: NodeJS.Platform = process.platform
): RuntimeCommand {
  return {
    command: getExecutableForPackageManager(packageManager, platform),
    args: getDevArgs(packageManager, port),
  };
}

export function getMetadataMarkerPath(workspacePath: string): string {
  return path.join(workspacePath, LOCAL_RUNTIME_METADATA_FILENAME);
}

export function isPathInside(basePath: string, candidatePath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(resolvedBase, resolvedCandidate);
  if (!relative) {
    return false;
  }
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
