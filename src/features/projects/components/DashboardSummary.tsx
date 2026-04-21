import type { Project } from "../../../types/project";
import {
  getProjectFrameworkLabel,
  StatusBadge,
  formatProjectDate,
  getProjectPort,
  isLightTheme,
  supportsEmbeddedPreview,
  type WorkbenchTheme,
} from "./projectUi";

interface DashboardSummaryProps {
  projects: Project[];
  readyCount: number;
  activeCount: number;
  theme: WorkbenchTheme;
  onOpenProject: (projectId: string) => void;
}

export function DashboardSummary({
  projects,
  readyCount,
  activeCount,
  theme,
  onOpenProject,
}: DashboardSummaryProps) {
  const isLight = isLightTheme(theme);

  return (
    <div className="space-y-6">
      <section
        className={`rounded-2xl border p-5 md:p-7 ${
          isLight
            ? "border-slate-200 bg-gradient-to-br from-sky-50 to-white"
            : "border-white/10 bg-gradient-to-br from-slate-800/85 to-slate-900/80"
        }`}
      >
        <h2
          className={`font-heading text-3xl font-semibold tracking-tight ${
            isLight ? "text-slate-900" : "text-white"
          }`}
        >
          Local Workbench
        </h2>
        <p className={`mt-2 max-w-2xl text-sm ${isLight ? "text-slate-600" : "text-slate-300"}`}>
          Import, run, and inspect local frontend projects with a single control plane.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div
            className={`rounded-xl border p-4 ${
              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/55"
            }`}
          >
            <div className={`text-xs uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Total
            </div>
            <div className={`mt-2 font-heading text-2xl ${isLight ? "text-slate-900" : "text-white"}`}>
              {projects.length}
            </div>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/55"
            }`}
          >
            <div className={`text-xs uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Active
            </div>
            <div className={`mt-2 font-heading text-2xl ${isLight ? "text-slate-900" : "text-white"}`}>
              {activeCount}
            </div>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/55"
            }`}
          >
            <div className={`text-xs uppercase tracking-wide ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Ready
            </div>
            <div className={`mt-2 font-heading text-2xl ${isLight ? "text-slate-900" : "text-white"}`}>
              {readyCount}
            </div>
          </div>
        </div>
      </section>

      {projects.length === 0 ? (
        <div
          className={`rounded-2xl border border-dashed p-10 text-center ${
            isLight ? "border-slate-300 bg-white" : "border-white/25 bg-slate-900/60"
          }`}
        >
          <p className={`font-heading text-lg font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
            No projects imported
          </p>
          <p className={`mt-2 text-sm ${isLight ? "text-slate-600" : "text-slate-300"}`}>
            Start from the sidebar button{" "}
            <code
              className={`rounded px-1.5 py-0.5 ${
                isLight ? "bg-slate-100 text-slate-700" : "bg-slate-800/80 text-slate-200"
              }`}
            >
              Import Project
            </code>{" "}
            to add a frontend project folder or zip.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {projects.map((project) => (
            <article
              key={project.id}
              className={`rounded-2xl border p-5 transition-colors duration-200 ease-out ${
                isLight
                  ? "border-slate-200 bg-white hover:border-slate-300"
                  : "border-white/10 bg-slate-900/70 hover:border-[var(--wb-primary)]/60 hover:bg-slate-800/65"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenProject(project.id)}
                className="w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3
                    className={`truncate font-heading text-lg font-semibold ${
                      isLight ? "text-slate-900" : "text-white"
                    }`}
                  >
                    {project.name}
                  </h3>
                  <StatusBadge status={project.status} theme={theme} />
                </div>
                <div className={`mt-4 grid grid-cols-2 gap-3 text-sm ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Framework</div>
                    <div className={`mt-1 ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                      {getProjectFrameworkLabel(project)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Port</div>
                    <div className={`mt-1 ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                      {getProjectPort(project)}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Updated: {formatProjectDate(project.updatedAt)}
                </p>
              </button>

              {project.status === "ready" && project.previewUrl ? (
                supportsEmbeddedPreview(project) ? (
                  <div
                    className={`mt-4 overflow-hidden rounded-xl border ${
                      isLight ? "border-slate-300 bg-white" : "border-slate-700 bg-white/95"
                    }`}
                  >
                    <iframe
                      title={`dashboard-preview-${project.id}`}
                      src={project.previewUrl}
                      loading="lazy"
                      className="pointer-events-none h-44 w-full border-0"
                    />
                  </div>
                ) : (
                  <div
                    className={`mt-4 rounded-xl border border-dashed px-4 py-3 text-sm ${
                      isLight
                        ? "border-slate-300 bg-slate-50 text-slate-600"
                        : "border-slate-700 bg-slate-900/70 text-slate-300"
                    }`}
                  >
                    Browser preview only. Open the project to launch it in a new tab.
                  </div>
                )
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
