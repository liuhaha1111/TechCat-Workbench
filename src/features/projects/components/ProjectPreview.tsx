import type { Project } from "../../../types/project";
import {
  isLightTheme,
  supportsEmbeddedPreview,
  type WorkbenchTheme,
} from "./projectUi";

interface ProjectPreviewProps {
  project: Project;
  theme: WorkbenchTheme;
}

export function ProjectPreview({ project, theme }: ProjectPreviewProps) {
  const isLight = isLightTheme(theme);
  const canEmbedPreview = supportsEmbeddedPreview(project);

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        isLight ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900/70"
      }`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 ${
          isLight ? "border-b border-slate-200" : "border-b border-white/10"
        }`}
      >
        <span
          className={`text-xs font-medium uppercase tracking-[0.16em] ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        >
          Preview
        </span>
        {project.previewUrl ? (
          <a
            href={project.previewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-emerald-500 transition-colors duration-200 hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)]"
          >
            Open in Browser
          </a>
        ) : null}
      </div>
      <div className={`h-[420px] p-4 sm:h-[520px] ${isLight ? "bg-slate-100" : "bg-slate-950"}`}>
        {project.status === "ready" && project.previewUrl ? (
          canEmbedPreview ? (
            <iframe
              title={`preview-${project.id}`}
              src={project.previewUrl}
              className={`h-full w-full rounded-xl border bg-white ${
                isLight ? "border-slate-300" : "border-slate-700"
              }`}
            />
          ) : (
            <div
              className={`flex h-full items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm ${
                isLight
                  ? "border-slate-300 bg-white text-slate-500"
                  : "border-slate-600 bg-slate-900 text-slate-400"
              }`}
            >
              Preview opens in your browser for this project.
            </div>
          )
        ) : (
          <div
            className={`flex h-full items-center justify-center rounded-xl border border-dashed text-center text-sm ${
              isLight
                ? "border-slate-300 bg-white text-slate-500"
                : "border-slate-600 bg-slate-900 text-slate-400"
            }`}
          >
            {project.lastError
              ? project.lastError
              : "Waiting for project runtime to become ready..."}
          </div>
        )}
      </div>
    </div>
  );
}
