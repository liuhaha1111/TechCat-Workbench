import type { FormEvent } from "react";
import { FileArchive, FolderOpen, Loader2, Play } from "lucide-react";
import { isLightTheme, type WorkbenchTheme } from "./projectUi";

type ImportTab = "zip" | "folder";

interface ImportDialogProps {
  theme: WorkbenchTheme;
  importTab: ImportTab;
  nameInput: string;
  deploymentRootInput: string;
  zipSourcePath: string | null;
  folderSourcePath: string | null;
  importBusy: boolean;
  onClose: () => void;
  onImportTabChange: (tab: ImportTab) => void;
  onNameChange: (value: string) => void;
  onDeploymentRootChange: (value: string) => void;
  onSelectDeploymentRoot: () => void;
  onSelectZipSource: () => void;
  onSelectFolderSource: () => void;
  onZipImport: (event: FormEvent<HTMLFormElement>) => void;
  onFolderImport: (event: FormEvent<HTMLFormElement>) => void;
}

function PathSelectionField({
  label,
  buttonLabel,
  description,
  selectedPath,
  onSelect,
  isLight,
}: {
  label: string;
  buttonLabel: string;
  description: string;
  selectedPath: string | null;
  onSelect: () => void;
  isLight: boolean;
}) {
  return (
    <div className="space-y-2">
      <label
        className={`block text-xs font-medium ${
          isLight ? "text-slate-600" : "text-slate-300"
        }`}
      >
        {label}
      </label>
      <button
        type="button"
        onClick={onSelect}
        className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
          isLight
            ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            : "border-white/15 bg-slate-800 text-slate-100 hover:bg-slate-700"
        }`}
      >
        <FolderOpen size={14} />
        {buttonLabel}
      </button>
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          isLight
            ? "border-slate-200 bg-slate-50 text-slate-700"
            : "border-white/10 bg-slate-950/60 text-slate-300"
        }`}
      >
        {selectedPath ?? description}
      </div>
    </div>
  );
}

export function ImportDialog({
  theme,
  importTab,
  nameInput,
  deploymentRootInput,
  zipSourcePath,
  folderSourcePath,
  importBusy,
  onClose,
  onImportTabChange,
  onNameChange,
  onDeploymentRootChange,
  onSelectDeploymentRoot,
  onSelectZipSource,
  onSelectFolderSource,
  onZipImport,
  onFolderImport,
}: ImportDialogProps) {
  const isLight = isLightTheme(theme);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 backdrop-blur-sm ${
          isLight ? "bg-slate-900/35" : "bg-slate-950/75"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-xl rounded-2xl border p-6 shadow-2xl ${
          isLight
            ? "border-slate-200 bg-white shadow-slate-400/30"
            : "border-white/10 bg-slate-900 shadow-slate-950/70"
        }`}
      >
        <div className={`pb-4 ${isLight ? "border-b border-slate-200" : "border-b border-white/10"}`}>
          <h3
            className={`font-heading text-lg font-semibold ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            Import Project
          </h3>
          <p className={`mt-1 text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Pick a local zip or project folder, then choose the deployment root on this machine.
            Supported adapters include React + Vite, Vue + Vite, Svelte + Vite, Solid + Vite,
            Astro, Next.js, and static HTML.
          </p>
        </div>
        <div className="space-y-4 pt-5">
          <div className={`flex rounded-lg p-1 ${isLight ? "bg-slate-100" : "bg-slate-800"}`}>
            <button
              type="button"
              onClick={() => onImportTabChange("zip")}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md py-2 text-sm transition-colors duration-200 ${
                importTab === "zip"
                  ? isLight
                    ? "bg-white font-medium text-slate-900"
                    : "bg-slate-700 font-medium text-white"
                  : isLight
                    ? "text-slate-500 hover:text-slate-700"
                    : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileArchive size={14} />
              Zip
            </button>
            <button
              type="button"
              onClick={() => onImportTabChange("folder")}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md py-2 text-sm transition-colors duration-200 ${
                importTab === "folder"
                  ? isLight
                    ? "bg-white font-medium text-slate-900"
                    : "bg-slate-700 font-medium text-white"
                  : isLight
                    ? "text-slate-500 hover:text-slate-700"
                    : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FolderOpen size={14} />
              Folder
            </button>
          </div>

          <div>
            <label
              className={`mb-1 block text-xs font-medium ${
                isLight ? "text-slate-600" : "text-slate-300"
              }`}
            >
              Project Name (optional)
            </label>
            <input
              value={nameInput}
              onChange={(event) => onNameChange(event.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)] ${
                isLight
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-white/15 bg-slate-800 text-slate-100"
              }`}
              placeholder="My Frontend Project"
            />
          </div>

          <div className="space-y-2">
            <label
              className={`block text-xs font-medium ${
                isLight ? "text-slate-600" : "text-slate-300"
              }`}
            >
              Deployment Root Path
            </label>
            <div className="flex gap-2">
              <input
                value={deploymentRootInput}
                onChange={(event) => onDeploymentRootChange(event.target.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)] ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-white/15 bg-slate-800 text-slate-100"
                }`}
                placeholder="D:\\deploy-projects"
              />
              <button
                type="button"
                onClick={onSelectDeploymentRoot}
                className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    : "border-white/15 bg-slate-800 text-slate-100 hover:bg-slate-700"
                }`}
              >
                Browse
              </button>
            </div>
            <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              Use an absolute folder path that already exists, for example D:\\deploy-projects or /srv/deploy-projects.
            </p>
          </div>

          {importTab === "zip" ? (
            <form onSubmit={onZipImport} className="space-y-3">
              <PathSelectionField
                label="Zip Archive"
                buttonLabel="Choose Zip File"
                description="No zip file selected yet."
                selectedPath={zipSourcePath}
                onSelect={onSelectZipSource}
                isLight={isLight}
              />
              <button
                type="submit"
                disabled={importBusy}
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--wb-accent)] px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importBusy ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
                Import Zip
              </button>
            </form>
          ) : (
            <form onSubmit={onFolderImport} className="space-y-3">
              <PathSelectionField
                label="Source Folder"
                buttonLabel="Choose Source Folder"
                description="No source folder selected yet."
                selectedPath={folderSourcePath}
                onSelect={onSelectFolderSource}
                isLight={isLight}
              />
              <button
                type="submit"
                disabled={importBusy}
                className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    : "border-white/15 bg-slate-800 text-slate-100 hover:bg-slate-700"
                }`}
              >
                {importBusy ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Play size={14} />
                )}
                Import Folder
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
