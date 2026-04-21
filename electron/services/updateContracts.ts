export type AppUpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes?: string }
  | { kind: "downloading"; version: string }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

export type ContentUpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes?: string }
  | { kind: "downloading"; version: string }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

export interface VersionSnapshot {
  appVersion: string;
  contentVersion: string | null;
  appUpdate: AppUpdateState;
  contentUpdate: ContentUpdateState;
}

export interface ContentManifest {
  version: string;
  publishedAt: string;
  minAppVersion: string;
  maxAppVersion: string;
  packageUrl: string;
  sha256: string;
  notes?: string;
}

export interface ContentActivationState {
  activeVersion: string | null;
  previousVersion: string | null;
  checksum: string | null;
  activatedAt: string | null;
}

function parseVersion(version: string): number[] {
  return version.split(".").map((segment) => {
    const value = Number.parseInt(segment, 10);
    return Number.isNaN(value) ? 0 : value;
  });
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function isContentManifestCompatible(
  manifest: ContentManifest,
  appVersion: string
): boolean {
  return (
    compareVersions(appVersion, manifest.minAppVersion) >= 0 &&
    compareVersions(appVersion, manifest.maxAppVersion) <= 0
  );
}
