import { Plus } from "lucide-react";
import type { Project } from "../../../types/project";
import {
  getProjectFrameworkLabel,
  isLightTheme,
  type WorkbenchTheme,
} from "./projectUi";

interface ProjectSidebarProps {
  projects: Project[];
  loading: boolean;
  selectedId: string | null;
  theme?: WorkbenchTheme;
  onSelect: (projectId: string) => void;
  onImport: () => void;
}

export function ProjectSidebar({
  projects,
  loading,
  selectedId,
  theme = "dark",
  onSelect,
  onImport,
}: ProjectSidebarProps) {
  const isLight = isLightTheme(theme);

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden rounded-2xl border md:w-80 ${
        isLight ? "border-slate-200 bg-white/85" : "border-white/10 bg-slate-900/65"
      }`}
    >
      <div className={`p-4 ${isLight ? "border-b border-slate-200" : "border-b border-white/10"}`}>
        <button
          type="button"
          onClick={onImport}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--wb-accent)] px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 ease-out hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
        >
          <Plus size={16} />
          Import Project
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div
          className={`mb-2 px-2 text-xs font-semibold uppercase tracking-[0.16em] ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Projects
        </div>
        {loading ? (
          <p className={`px-2 py-2 text-sm ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Loading...
          </p>
        ) : projects.length === 0 ? (
          <p className={`px-2 py-2 text-sm ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            No projects yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => onSelect(project.id)}
                className={`w-full cursor-pointer rounded-xl border px-3 py-3 text-left transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)] ${
                  selectedId === project.id
                    ? isLight
                      ? "border-slate-300 bg-slate-100"
                      : "border-[var(--wb-primary)] bg-slate-800/80"
                    : isLight
                      ? "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                      : "border-transparent bg-slate-900/45 hover:border-white/10 hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`truncate text-sm font-medium ${
                      isLight ? "text-slate-900" : "text-slate-100"
                    }`}
                  >
                    {project.name}
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      project.status === "ready"
                        ? "bg-emerald-300"
                        : project.status === "error"
                          ? "bg-rose-300"
                          : "bg-sky-300"
                    }`}
                  />
                </div>
                <div
                  className={`mt-1 flex items-center justify-between text-xs ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  <span>{getProjectFrameworkLabel(project)}</span>
                  <span>{project.packageManager ?? "none"}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
