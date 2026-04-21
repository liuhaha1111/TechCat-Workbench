const DEFAULT_IGNORED_IMPORT_SEGMENTS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  ".turbo",
  "coverage",
  ".cache",
] as const;

const ignoredImportSegments = new Set<string>(DEFAULT_IGNORED_IMPORT_SEGMENTS);

function normalizeImportPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
}

export function getIgnoredImportPath(relativePath: string): string | null {
  const normalized = normalizeImportPath(relativePath);
  if (!normalized) {
    return null;
  }

  const segments = normalized.split("/").filter(Boolean);
  const ignoredIndex = segments.findIndex((segment) =>
    ignoredImportSegments.has(segment)
  );

  if (ignoredIndex === -1) {
    return null;
  }

  return segments.slice(0, ignoredIndex + 1).join("/");
}

export function shouldIgnoreImportPath(relativePath: string): boolean {
  return getIgnoredImportPath(relativePath) !== null;
}
