import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Moon, PanelLeft, RefreshCw, Sun } from "lucide-react";
import { DashboardSummary } from "./features/projects/components/DashboardSummary";
import { ImportDialog } from "./features/projects/components/ImportDialog";
import { ProjectDetail } from "./features/projects/components/ProjectDetail";
import { ProjectSidebar } from "./features/projects/components/ProjectSidebar";
import { UpdatesPanel } from "./features/updates/components/UpdatesPanel";
import { useWorkbenchProjects } from "./features/projects/hooks/useWorkbenchProjects";
import { useWorkbenchUpdates } from "./features/updates/hooks/useWorkbenchUpdates";
import { projectsClient } from "./features/projects/services/projectsClient";
import { useProjectLogs } from "./hooks/useProjectLogs";
import {
  importFolder,
  importZip,
  isLikelyAbsoluteDeploymentRootPath,
} from "./lib/api";
import { clearBrowserFileInputValue } from "./lib/browserFileInput";
import { formatImportStartedMessage } from "./lib/projectMessages";
import { hasWorkbenchBridge } from "./lib/workbenchBridge";
import type { Project } from "./types/project";

type ViewMode = "dashboard" | "detail";
type ImportTab = "zip" | "folder";
type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "ai-workbench-theme";

function formatSkippedPathsMessage(skippedPaths: string[]): string {
  if (skippedPaths.length === 0) {
    return "";
  }

  return ` Skipped: ${skippedPaths.join(", ")}.`;
}

function formatFolderSelection(files: File[]): string | null {
  if (files.length === 0) {
    return null;
  }

  const first = files[0] as File & { webkitRelativePath?: string };
  const relativePath = first.webkitRelativePath ?? first.name;
  const rootName = relativePath.split("/")[0] || first.name;
  return files.length === 1 ? rootName : `${rootName} (${files.length} files)`;
}

type BrowserDirectoryInputProps = {
  directory?: string;
  webkitdirectory?: string;
};

export default function App() {
  const bridgeAvailable = hasWorkbenchBridge();
  const { projects, loading, error, reload } = useWorkbenchProjects(3000);
  const {
    snapshot: updateSnapshot,
    busy: updatesBusy,
    error: updatesError,
    checkAppUpdate,
    checkContentUpdate,
    applyAppUpdate,
  } = useWorkbenchUpdates();
  const [view, setView] = useState<ViewMode>("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>("zip");
  const [nameInput, setNameInput] = useState("");
  const [deploymentRootInput, setDeploymentRootInput] = useState("");
  const [zipSourcePath, setZipSourcePath] = useState<string | null>(null);
  const [folderSourcePath, setFolderSourcePath] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "dark";
  });
  const isLight = theme === "light";
  const zipFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedZipFileRef = useRef<File | null>(null);
  const selectedFolderFilesRef = useRef<File[]>([]);
  const browserDirectoryInputProps: BrowserDirectoryInputProps = {
    directory: "",
    webkitdirectory: "",
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const selected = useMemo<Project | null>(() => {
    if (projects.length === 0) {
      return null;
    }

    if (selectedId) {
      return projects.find((project) => project.id === selectedId) ?? projects[0];
    }

    return projects[0];
  }, [projects, selectedId]);

  const logs = useProjectLogs(selected?.id ?? null);
  const readyCount = useMemo(
    () => projects.filter((project) => project.status === "ready").length,
    [projects]
  );
  const activeCount = useMemo(
    () =>
      projects.filter(
        (project) => project.status !== "stopped" && project.status !== "error"
      ).length,
    [projects]
  );

  function openProject(projectId: string) {
    setSelectedId(projectId);
    setView("detail");
  }

  async function chooseZipSourcePath() {
    if (!bridgeAvailable) {
      clearBrowserFileInputValue(zipFileInputRef.current);
      zipFileInputRef.current?.click();
      return;
    }

    try {
      const selectedPath = await projectsClient.selectZipFile();
      if (selectedPath) {
        setZipSourcePath(selectedPath);
      }
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : String(requestError)
      );
    }
  }

  async function chooseFolderSourcePath() {
    if (!bridgeAvailable) {
      clearBrowserFileInputValue(folderFileInputRef.current);
      folderFileInputRef.current?.click();
      return;
    }

    try {
      const selectedPath = await projectsClient.selectSourceFolder();
      if (selectedPath) {
        setFolderSourcePath(selectedPath);
      }
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : String(requestError)
      );
    }
  }

  async function chooseDeploymentRootPath() {
    if (!bridgeAvailable) {
      setMessage(
        "Deployment root browsing is only available in the Electron app. Enter the path manually."
      );
      return;
    }

    try {
      const selectedPath = await projectsClient.selectDeploymentRoot();
      if (selectedPath) {
        setDeploymentRootInput(selectedPath);
      }
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : String(requestError)
      );
    }
  }

  function handleBrowserZipSelection(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    selectedZipFileRef.current = nextFile;
    setZipSourcePath(nextFile?.name ?? null);
  }

  function handleBrowserFolderSelection(event: ChangeEvent<HTMLInputElement>) {
    const files: File[] = event.target.files
      ? Array.from(event.target.files)
      : [];
    selectedFolderFilesRef.current = files;
    setFolderSourcePath(formatFolderSelection(files));
  }

  async function handleZipImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!zipSourcePath) {
      setMessage("Please choose a zip file.");
      return;
    }

    const deploymentRootPath = deploymentRootInput.trim();
    if (!deploymentRootPath) {
      setMessage("Please enter a deployment root path.");
      return;
    }

    if (!isLikelyAbsoluteDeploymentRootPath(deploymentRootPath)) {
      setMessage(
        "Enter an absolute deployment root path, for example D:\\deploy-projects or /srv/deploy-projects."
      );
      return;
    }

    setImportBusy(true);
    setMessage(null);
    try {
      const result = bridgeAvailable
        ? await projectsClient.importZipFromPath(
            zipSourcePath,
            nameInput,
            deploymentRootPath
          )
        : {
            project: await importZip(
              selectedZipFileRef.current as File,
              nameInput,
              deploymentRootPath
            ),
            skippedPaths: [] as string[],
          };
      setShowImportModal(false);
      setNameInput("");
      setDeploymentRootInput("");
      setZipSourcePath(null);
      selectedZipFileRef.current = null;
      if (zipFileInputRef.current) {
        zipFileInputRef.current.value = "";
      }
      setSelectedId(result.project.id);
      setView("detail");
      await reload();
      setMessage(
        `${formatImportStartedMessage("zip", result.project.workspacePath)}${formatSkippedPathsMessage(result.skippedPaths)}`
      );
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : String(requestError)
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function handleFolderImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderSourcePath) {
      setMessage("Please choose a source folder.");
      return;
    }

    const deploymentRootPath = deploymentRootInput.trim();
    if (!deploymentRootPath) {
      setMessage("Please enter a deployment root path.");
      return;
    }

    if (!isLikelyAbsoluteDeploymentRootPath(deploymentRootPath)) {
      setMessage(
        "Enter an absolute deployment root path, for example D:\\deploy-projects or /srv/deploy-projects."
      );
      return;
    }

    setImportBusy(true);
    setMessage(null);
    try {
      const result = bridgeAvailable
        ? await projectsClient.importFolderFromPath(
            folderSourcePath,
            nameInput,
            deploymentRootPath
          )
        : {
            project: await importFolder(
              selectedFolderFilesRef.current,
              nameInput,
              deploymentRootPath
            ),
            skippedPaths: [] as string[],
          };
      setShowImportModal(false);
      setNameInput("");
      setDeploymentRootInput("");
      setFolderSourcePath(null);
      selectedFolderFilesRef.current = [];
      if (folderFileInputRef.current) {
        folderFileInputRef.current.value = "";
      }
      setSelectedId(result.project.id);
      setView("detail");
      await reload();
      setMessage(
        `${formatImportStartedMessage("folder", result.project.workspacePath)}${formatSkippedPathsMessage(result.skippedPaths)}`
      );
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : String(requestError)
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function runAction(action: "start" | "stop" | "restart") {
    if (!selected) {
      return;
    }

    setActionBusy(true);
    setMessage(null);
    try {
      if (action === "start") {
        await projectsClient.startProject(selected.id);
      } else if (action === "stop") {
        await projectsClient.stopProject(selected.id);
      } else {
        await projectsClient.restartProject(selected.id);
      }
      await reload();
    } catch (requestError) {
      setMessage(
        requestError instanceof Error ? requestError.message : String(requestError)
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function executeSelectedProject() {
    if (!selected) {
      return;
    }

    if (selected.status === "stopped" || selected.status === "error") {
      await runAction("start");
      return;
    }

    if (selected.status === "ready" && selected.previewUrl) {
      window.open(selected.previewUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setMessage("Project is still preparing. Wait for Ready status.");
  }

  async function deleteSelectedProject() {
    if (!selected) {
      return;
    }

    const confirmed = window.confirm(
      "This will permanently delete project files and records. Continue?"
    );
    if (!confirmed) {
      return;
    }

    setActionBusy(true);
    setMessage(null);
    try {
      await projectsClient.deleteProject(selected.id);
      setSelectedId(null);
      setView("dashboard");
      await reload();
      setMessage("Project deleted.");
    } catch (requestError) {
      const nextMessage =
        requestError instanceof Error ? requestError.message : String(requestError);
      setMessage(nextMessage);
      if (nextMessage.toLowerCase().includes("not found")) {
        setSelectedId(null);
        setView("dashboard");
        await reload();
      }
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={`absolute -left-24 top-20 h-72 w-72 rounded-full blur-3xl ${
            isLight ? "bg-sky-300/35" : "bg-[var(--wb-primary)]/15"
          }`}
        />
        <div
          className={`absolute -right-20 top-40 h-64 w-64 rounded-full blur-3xl ${
            isLight ? "bg-emerald-300/30" : "bg-[var(--wb-accent)]/20"
          }`}
        />
      </div>

      <div className="relative mx-auto flex h-screen max-w-[1440px] flex-col p-3 md:p-5">
        <header
          className={`rounded-2xl border px-4 py-3 backdrop-blur md:px-6 ${
            isLight
              ? "border-slate-200 bg-white/80 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.22)]"
              : "border-white/10 bg-white/5 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.65)]"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-[var(--wb-primary)] to-slate-900 p-2.5 text-white">
                <PanelLeft size={18} />
              </div>
              <div>
                <h1
                  className={`font-heading text-xl font-semibold tracking-tight ${
                    isLight ? "text-slate-900" : ""
                  }`}
                >
                  AI Workbench
                </h1>
                <p className={`text-xs ${isLight ? "text-slate-600" : "text-slate-300/80"}`}>
                  Local Vite Runtime Console
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`hidden rounded-lg border px-3 py-2 text-xs sm:block ${
                  isLight
                    ? "border-slate-200 bg-white text-slate-600"
                    : "border-white/10 bg-slate-900/60 text-slate-300"
                }`}
              >
                <span className={`font-medium ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                  {projects.length}
                </span>{" "}
                projects
              </div>
              <button
                type="button"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)] ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    : "border-white/15 bg-white/10 text-slate-100 hover:bg-white/15"
                }`}
              >
                {isLight ? <Moon size={14} /> : <Sun size={14} />}
                {isLight ? "Dark" : "Light"}
              </button>
              <button
                type="button"
                onClick={() => void reload()}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)] ${
                  isLight
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    : "border-white/15 bg-white/10 text-slate-100 hover:bg-white/15"
                }`}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <UpdatesPanel
            snapshot={updateSnapshot}
            busy={updatesBusy}
            message={updatesError}
            theme={theme}
            onCheckApp={() => void checkAppUpdate()}
            onCheckContent={() => void checkContentUpdate()}
            onApplyAppUpdate={() => void applyAppUpdate()}
          />

          <div className="min-h-0 flex flex-1 flex-col gap-3 md:flex-row">
            <ProjectSidebar
              projects={projects}
              loading={loading}
              selectedId={selectedId}
              theme={theme}
              onSelect={openProject}
              onImport={() => setShowImportModal(true)}
            />

            <main
              className={`min-h-0 flex-1 overflow-y-auto rounded-2xl border p-4 backdrop-blur md:p-6 ${
                isLight
                  ? "border-slate-200 bg-white/75 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.2)]"
                  : "border-white/10 bg-slate-900/45 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.9)]"
              }`}
            >
              {view === "dashboard" ? (
                <DashboardSummary
                  projects={projects}
                  readyCount={readyCount}
                  activeCount={activeCount}
                  theme={theme}
                  onOpenProject={openProject}
                />
              ) : selected ? (
                <ProjectDetail
                  project={selected}
                  theme={theme}
                  actionBusy={actionBusy}
                  logs={logs}
                  onBack={() => setView("dashboard")}
                  onExecute={() => void executeSelectedProject()}
                  onStart={() => void runAction("start")}
                  onStop={() => void runAction("stop")}
                  onRestart={() => void runAction("restart")}
                  onDelete={() => void deleteSelectedProject()}
                />
              ) : null}
            </main>
          </div>
        </div>
      </div>

      {showImportModal ? (
        <ImportDialog
          theme={theme}
          importTab={importTab}
          nameInput={nameInput}
          deploymentRootInput={deploymentRootInput}
          zipSourcePath={zipSourcePath}
          folderSourcePath={folderSourcePath}
          importBusy={importBusy}
          onClose={() => setShowImportModal(false)}
          onImportTabChange={setImportTab}
          onNameChange={setNameInput}
          onDeploymentRootChange={setDeploymentRootInput}
          onSelectDeploymentRoot={() => void chooseDeploymentRootPath()}
          onSelectZipSource={() => void chooseZipSourcePath()}
          onSelectFolderSource={() => void chooseFolderSourcePath()}
          onZipImport={handleZipImport}
          onFolderImport={handleFolderImport}
        />
      ) : null}

      {(message ?? error) && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-2xl ${
            isLight
              ? "border-slate-300 bg-white text-slate-800 shadow-slate-400/35"
              : "border-white/15 bg-slate-900/95 text-slate-100 shadow-slate-950/70"
          }`}
        >
          {message ?? error}
        </div>
      )}

      {!bridgeAvailable ? (
        <>
          <input
            ref={zipFileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={handleBrowserZipSelection}
          />
          <input
            ref={folderFileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleBrowserFolderSelection}
            {...browserDirectoryInputProps}
          />
        </>
      ) : null}
    </div>
  );
}
