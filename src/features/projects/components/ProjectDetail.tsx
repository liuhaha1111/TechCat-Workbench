import { ArrowLeft, FolderOpen } from "lucide-react";
import { ProjectActions } from "../../../components/ProjectActions";
import type { Project } from "../../../types/project";
import { ProjectPreview } from "./ProjectPreview";
import { RuntimeLogsPanel } from "./RuntimeLogsPanel";
import {
  getProjectFrameworkLabel,
  StatusBadge,
  getProjectPort,
  isLightTheme,
  type WorkbenchTheme,
} from "./projectUi";

interface ProjectDetailProps {
  project: Project;
  theme: WorkbenchTheme;
  actionBusy: boolean;
  logs: string[];
  onBack: () => void;
  onExecute: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onDelete: () => void;
}

export function ProjectDetail({
  project,
  theme,
  actionBusy,
  logs,
  onBack,
  onExecute,
  onStart,
  onStop,
  onRestart,
  onDelete,
}: ProjectDetailProps) {
  const isLight = isLightTheme(theme);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className={`cursor-pointer rounded-full border p-2 transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)] ${
              isLight
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                : "border-white/15 bg-slate-800/90 text-slate-100 hover:bg-slate-700"
            }`}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={`truncate font-heading text-2xl font-semibold ${
                  isLight ? "text-slate-900" : "text-white"
                }`}
              >
                {project.name}
              </h2>
              <StatusBadge status={project.status} theme={theme} />
            </div>
            <p className={`mt-1 flex items-center gap-1 text-sm ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              <FolderOpen size={14} />
              <span className="truncate">{project.workspacePath}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-3">
        <div className="space-y-4 2xl:col-span-2">
          <ProjectPreview project={project} theme={theme} />
        </div>

        <div className="space-y-4">
          <div
            className={`rounded-2xl border p-4 ${
              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/70"
            }`}
          >
            <h3 className={`text-sm font-semibold uppercase tracking-wide ${isLight ? "text-slate-700" : "text-slate-200"}`}>
              Actions
            </h3>
            <div className="mt-3">
              <ProjectActions
                status={project.status}
                busy={actionBusy}
                onExecute={onExecute}
                onStart={onStart}
                onStop={onStop}
                onRestart={onRestart}
                onDelete={onDelete}
              />
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 ${
              isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/70"
            }`}
          >
            <h3 className={`text-sm font-semibold uppercase tracking-wide ${isLight ? "text-slate-700" : "text-slate-200"}`}>
              Project Info
            </h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className={isLight ? "text-slate-500" : "text-slate-400"}>
                  Package Manager
                </span>
                <span className={isLight ? "text-slate-900" : "text-slate-100"}>
                  {project.packageManager ?? "-"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={isLight ? "text-slate-500" : "text-slate-400"}>Framework</span>
                <span className={isLight ? "text-slate-900" : "text-slate-100"}>
                  {getProjectFrameworkLabel(project)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={isLight ? "text-slate-500" : "text-slate-400"}>Deployment Root</span>
                <span className={`truncate text-right ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                  {project.deploymentRootPath ?? "-"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={isLight ? "text-slate-500" : "text-slate-400"}>Project Directory</span>
                <span className={`truncate text-right ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                  {project.workspacePath}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className={isLight ? "text-slate-500" : "text-slate-400"}>Port</span>
                <span className={isLight ? "text-slate-900" : "text-slate-100"}>
                  {getProjectPort(project)}
                </span>
              </div>
            </div>
          </div>

          <RuntimeLogsPanel logs={logs} theme={theme} />
        </div>
      </div>
    </div>
  );
}
