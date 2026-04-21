import type { PackageManager } from "../types";

export interface ViteInspectionReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function normalizeFiles(files: string[]): string[] {
  return files.map(normalizePath).filter((entry) => entry.length > 0);
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

function toScopedFiles(files: string[], rootPrefix: string): string[] {
  if (!rootPrefix) {
    return files;
  }
  const prefixWithSlash = `${rootPrefix}/`;
  return files
    .filter((entry) => entry.startsWith(prefixWithSlash))
    .map((entry) => entry.slice(prefixWithSlash.length));
}

function scoreViteSignals(files: string[]): number {
  const hasPackageJson = files.includes("package.json");
  const hasIndexHtml = files.includes("index.html");
  const hasMainEntry = hasViteEntry(files);
  const hasViteConfig = files.some((entry) => /^vite\.config\./.test(entry));

  return (
    (hasPackageJson ? 2 : 0) +
    (hasIndexHtml ? 3 : 0) +
    (hasMainEntry ? 4 : 0) +
    (hasViteConfig ? 2 : 0)
  );
}

function resolveProjectRoot(files: string[]): string[] {
  const normalized = normalizeFiles(files);
  const candidates = new Set<string>();

  for (const entry of normalized) {
    if (entry === "package.json") {
      candidates.add("");
    } else if (entry.endsWith("/package.json")) {
      candidates.add(entry.slice(0, -"/package.json".length));
    }
  }

  if (candidates.size === 0) {
    return normalized;
  }

  let bestRoot = "";
  let bestScore = -1;

  for (const candidate of candidates) {
    const scoped = toScopedFiles(normalized, candidate);
    const score = scoreViteSignals(scoped);
    if (score > bestScore) {
      bestScore = score;
      bestRoot = candidate;
      continue;
    }
    if (score === bestScore) {
      const currentDepth = candidate ? candidate.split("/").length : 0;
      const bestDepth = bestRoot ? bestRoot.split("/").length : 0;
      if (currentDepth > bestDepth) {
        bestRoot = candidate;
      }
    }
  }

  if (bestScore <= 0) {
    return normalized;
  }

  const bestScoped = toScopedFiles(normalized, bestRoot);
  if (bestScoped.includes("package.json")) {
    return bestScoped;
  }
  return normalized;
}

function hasViteEntry(files: string[]): boolean {
  return files.some((entry) =>
    /^(src\/main|src\/index|main)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(entry)
  );
}

export function detectPackageManager(files: string[]): PackageManager {
  const scoped = new Set(resolveProjectRoot(files));
  if (scoped.has("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (scoped.has("yarn.lock")) {
    return "yarn";
  }

  const allFiles = new Set(normalizeFiles(files));
  if (allFiles.has("pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (allFiles.has("yarn.lock")) {
    return "yarn";
  }

  return "npm";
}

export function inspectViteProjectFiles(files: string[]): ViteInspectionReport {
  const scopedFiles = resolveProjectRoot(files);
  const normalized = new Set(scopedFiles);
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasPackageJson = normalized.has("package.json");
  const hasIndexHtml = normalized.has("index.html");
  const hasViteConfig = scopedFiles.some((entry) => /^vite\.config\./.test(entry));
  const hasMainEntry = hasViteEntry(scopedFiles);

  if (!hasViteConfig) {
    warnings.push("vite.config file is missing");
  }
  if (!hasPackageJson) {
    errors.push("package.json is missing");
  }
  if (!hasIndexHtml) {
    errors.push("index.html is missing");
  }
  if (!hasMainEntry) {
    errors.push("src/main entry file is missing");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

