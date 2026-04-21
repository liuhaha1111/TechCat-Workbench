import type { Project, ProjectStatus } from "../../../types/project";

export type WorkbenchTheme = "dark" | "light";

const statusLabel: Record<ProjectStatus, string> = {
  importing: "Importing",
  installing: "Installing",
  starting: "Starting",
  ready: "Ready",
  error: "Error",
  stopped: "Stopped",
};

const statusStyleDark: Record<ProjectStatus, string> = {
  importing: "border-sky-300/40 bg-sky-500/15 text-sky-100",
  installing: "border-sky-300/40 bg-sky-500/15 text-sky-100",
  starting: "border-sky-300/40 bg-sky-500/15 text-sky-100",
  ready: "border-emerald-300/40 bg-emerald-500/15 text-emerald-100",
  error: "border-rose-300/40 bg-rose-500/15 text-rose-100",
  stopped: "border-slate-500/40 bg-slate-700/25 text-slate-300",
};

const statusStyleLight: Record<ProjectStatus, string> = {
  importing: "border-sky-200 bg-sky-50 text-sky-700",
  installing: "border-sky-200 bg-sky-50 text-sky-700",
  starting: "border-sky-200 bg-sky-50 text-sky-700",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  stopped: "border-slate-300 bg-slate-100 text-slate-600",
};

export function isLightTheme(theme: WorkbenchTheme): boolean {
  return theme === "light";
}

export function StatusBadge({
  status,
  theme,
}: {
  status: ProjectStatus;
  theme: WorkbenchTheme;
}) {
  const statusStyle = isLightTheme(theme) ? statusStyleLight : statusStyleDark;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}

export function formatProjectDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function inferPortFromUrl(url: string | null): string {
  if (!url) {
    return "-";
  }

  try {
    return new URL(url).port || "-";
  } catch {
    return "-";
  }
}

export function getProjectPort(
  project: Pick<Project, "runtimePort" | "previewUrl">
): string {
  if (typeof project.runtimePort === "number") {
    return String(project.runtimePort);
  }

  return inferPortFromUrl(project.previewUrl);
}

export function getProjectFrameworkLabel(
  project: Pick<Project, "framework" | "frameworkLabel">
): string {
  return project.frameworkLabel ?? project.framework ?? "Unknown frontend app";
}

export function supportsEmbeddedPreview(
  project: Pick<Project, "previewMode" | "framework">
): boolean {
  if (project.previewMode) {
    return project.previewMode !== "external";
  }

  return project.framework !== "Next.js";
}
