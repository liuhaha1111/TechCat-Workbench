import { readdir } from "node:fs/promises";
import path from "node:path";
import type { PackageManager, PreviewMode, ProjectType } from "../types";

export interface ProjectInspectionReport {
  valid: boolean;
  rootPath: string;
  packageManager: PackageManager | null;
  projectType: ProjectType | null;
  frameworkId: string | null;
  frameworkLabel: string | null;
  previewMode: PreviewMode | null;
  errors: string[];
  warnings: string[];
}

type AdapterMetadata = {
  projectType: ProjectType;
  frameworkId: string;
  frameworkLabel: string;
  previewMode: PreviewMode;
};

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

function normalizeFiles(files: string[]): string[] {
  return files.map(normalizePath).filter((entry) => entry.length > 0);
}

function dirname(input: string): string {
  const normalized = normalizePath(input);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}

function toScopedFiles(files: string[], rootPath: string): string[] {
  if (!rootPath) {
    return files;
  }

  const prefix = `${rootPath}/`;
  return files
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length));
}

function collectCandidateRoots(files: string[]): string[] {
  const candidates = new Set<string>([""]);

  for (const entry of normalizeFiles(files)) {
    let current = dirname(entry);
    while (true) {
      candidates.add(current);
      if (!current) {
        break;
      }
      current = dirname(current);
    }
  }

  return Array.from(candidates);
}

function hasViteEntry(files: string[]): boolean {
  return files.some((entry) =>
    /^(src\/main|src\/index|main)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(entry)
  );
}

function hasReactSignal(files: string[]): boolean {
  return files.some((entry) =>
    /^(src\/App|App|src\/main)\.(tsx|jsx)$/.test(entry)
  );
}

function hasSolidSignal(files: string[]): boolean {
  return files.some((entry) => /^(src\/index|index)\.(tsx|jsx)$/.test(entry));
}

function hasVueSignal(files: string[]): boolean {
  return files.some((entry) => entry.endsWith(".vue"));
}

function hasSvelteSignal(files: string[]): boolean {
  return files.some((entry) => entry.endsWith(".svelte"));
}

function hasAstroSignal(files: string[]): boolean {
  return files.some(
    (entry) => /^astro\.config\./.test(entry) || entry.endsWith(".astro")
  );
}

function hasNextSignal(files: string[]): boolean {
  return files.some((entry) => {
    return (
      /^next\.config\./.test(entry) ||
      entry === "next-env.d.ts" ||
      /^app\/.+\/page\./.test(entry) ||
      /^app\/page\./.test(entry) ||
      /^pages\/.+\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(entry)
    );
  });
}

function hasJavaScriptSource(files: string[]): boolean {
  return files.some((entry) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(entry)
  );
}

function detectAdapter(files: string[]): AdapterMetadata | null {
  const normalized = new Set(files);
  const hasPackageJson = normalized.has("package.json");
  const hasIndexHtml = normalized.has("index.html");
  const viteBaseline = hasPackageJson && hasIndexHtml && hasViteEntry(files);

  if (hasPackageJson && hasNextSignal(files)) {
    return {
      projectType: "next",
      frameworkId: "next",
      frameworkLabel: "Next.js",
      previewMode: "external",
    };
  }

  if (hasPackageJson && hasAstroSignal(files)) {
    return {
      projectType: "astro",
      frameworkId: "astro",
      frameworkLabel: "Astro",
      previewMode: "embedded",
    };
  }

  if (viteBaseline && hasVueSignal(files)) {
    return {
      projectType: "vite",
      frameworkId: "vue-vite",
      frameworkLabel: "Vue + Vite",
      previewMode: "embedded",
    };
  }

  if (viteBaseline && hasSvelteSignal(files)) {
    return {
      projectType: "vite",
      frameworkId: "svelte-vite",
      frameworkLabel: "Svelte + Vite",
      previewMode: "embedded",
    };
  }

  if (viteBaseline && !hasReactSignal(files) && hasSolidSignal(files)) {
    return {
      projectType: "vite",
      frameworkId: "solid-vite",
      frameworkLabel: "Solid + Vite",
      previewMode: "embedded",
    };
  }

  if (viteBaseline && hasReactSignal(files)) {
    return {
      projectType: "vite",
      frameworkId: "react-vite",
      frameworkLabel: "React + Vite",
      previewMode: "embedded",
    };
  }

  if (hasPackageJson && hasIndexHtml && !hasViteEntry(files) && !hasAstroSignal(files) && !hasNextSignal(files) && !hasJavaScriptSource(files)) {
    return {
      projectType: "static",
      frameworkId: "static-html",
      frameworkLabel: "Static HTML",
      previewMode: "embedded",
    };
  }

  if (!hasPackageJson && hasIndexHtml && !hasViteEntry(files) && !hasAstroSignal(files) && !hasNextSignal(files)) {
    return {
      projectType: "static",
      frameworkId: "static-html",
      frameworkLabel: "Static HTML",
      previewMode: "embedded",
    };
  }

  return null;
}

function scoreCandidate(files: string[]): number {
  const normalized = new Set(files);
  const hasPackageJson = normalized.has("package.json");
  const hasIndexHtml = normalized.has("index.html");
  const hasViteConfig = files.some((entry) => /^vite\.config\./.test(entry));
  const adapter = detectAdapter(files);

  return (
    (hasPackageJson ? 3 : 0) +
    (hasIndexHtml ? 2 : 0) +
    (hasViteEntry(files) ? 2 : 0) +
    (hasViteConfig ? 1 : 0) +
    (adapter ? 8 : 0)
  );
}

function resolveProjectRoot(files: string[]): string {
  const normalized = normalizeFiles(files);
  let bestRoot = "";
  let bestScore = -1;

  for (const candidate of collectCandidateRoots(normalized)) {
    const scopedFiles = toScopedFiles(normalized, candidate);
    const score = scoreCandidate(scopedFiles);
    if (score > bestScore) {
      bestRoot = candidate;
      bestScore = score;
      continue;
    }

    if (score === bestScore) {
      const candidateDepth = candidate ? candidate.split("/").length : 0;
      const bestDepth = bestRoot ? bestRoot.split("/").length : 0;
      if (candidateDepth > bestDepth) {
        bestRoot = candidate;
      }
    }
  }

  return bestRoot;
}

export function detectPackageManager(files: string[]): PackageManager {
  const normalized = normalizeFiles(files);
  const rootPath = resolveProjectRoot(normalized);
  const scopedFiles = new Set(toScopedFiles(normalized, rootPath));

  if (scopedFiles.has("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (scopedFiles.has("yarn.lock")) {
    return "yarn";
  }

  const allFiles = new Set(normalized);
  if (allFiles.has("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (allFiles.has("yarn.lock")) {
    return "yarn";
  }

  return "npm";
}

export function inspectProjectFiles(files: string[]): ProjectInspectionReport {
  const normalized = normalizeFiles(files);
  const rootPath = resolveProjectRoot(normalized);
  const scopedFiles = toScopedFiles(normalized, rootPath);
  const normalizedScoped = new Set(scopedFiles);
  const adapter = detectAdapter(scopedFiles);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (adapter?.projectType === "vite") {
    const hasViteConfig = scopedFiles.some((entry) => /^vite\.config\./.test(entry));
    if (!hasViteConfig) {
      warnings.push("vite.config file is missing");
    }
  }

  if (!adapter && normalizedScoped.has("package.json")) {
    errors.push("No supported frontend app was found");
    if (hasJavaScriptSource(scopedFiles)) {
      warnings.push(
        "A JavaScript project was detected, but its framework is not supported yet"
      );
    }
  }

  if (!adapter && !normalizedScoped.has("package.json") && normalizedScoped.has("index.html")) {
    if (hasViteEntry(scopedFiles) || hasAstroSignal(scopedFiles) || hasNextSignal(scopedFiles)) {
      errors.push("No supported frontend app was found");
    }
  }

  if (!adapter && !normalizedScoped.has("package.json") && !normalizedScoped.has("index.html")) {
    errors.push("No supported frontend app was found");
  }

  return {
    valid: errors.length === 0 && adapter !== null,
    rootPath,
    packageManager: adapter && adapter.projectType !== "static"
      ? detectPackageManager(normalized)
      : null,
    projectType: adapter?.projectType ?? null,
    frameworkId: adapter?.frameworkId ?? null,
    frameworkLabel: adapter?.frameworkLabel ?? null,
    previewMode: adapter?.previewMode ?? null,
    errors,
    warnings,
  };
}

const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

function createInvalidInspection(message: string): ProjectInspectionReport {
  return {
    valid: false,
    rootPath: "",
    packageManager: null,
    projectType: null,
    frameworkId: null,
    frameworkLabel: null,
    previewMode: null,
    errors: [message],
    warnings: [],
  };
}

async function collectProjectFiles(
  workspacePath: string,
  currentPath: string,
  results: string[]
): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await collectProjectFiles(
        workspacePath,
        path.join(currentPath, entry.name),
        results
      );
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    results.push(path.relative(workspacePath, path.join(currentPath, entry.name)));
  }
}

export async function inspectProjectDirectory(
  workspacePath: string
): Promise<ProjectInspectionReport> {
  try {
    const files: string[] = [];
    await collectProjectFiles(workspacePath, workspacePath, files);
    return inspectProjectFiles(files);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return createInvalidInspection(`Failed to inspect project directory: ${detail}`);
  }
}
