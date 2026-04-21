import type { ProjectLogsEvent } from "../../../../electron/types";
import {
  createProjectLogsEventSource,
  deleteProject as deleteProjectFromApi,
  fetchProjectLogs,
  fetchProjects,
  restartProject as restartProjectFromApi,
  startProject as startProjectFromApi,
  stopProject as stopProjectFromApi,
} from "../../../lib/api";
import { requireWorkbenchBridge } from "../../../lib/workbenchBridge";
import type { Project } from "../../../types/project";

interface ProjectImportResult {
  project: Project;
  skippedPaths: string[];
}

function normalizeProject(project: Partial<Project>): Project {
  return {
    id: project.id ?? "",
    name: project.name ?? "",
    sourceType: project.sourceType ?? "folder",
    workspacePath: project.workspacePath ?? "",
    deploymentRootPath: project.deploymentRootPath ?? null,
    status: project.status ?? "stopped",
    packageManager: project.packageManager ?? null,
    framework: project.framework ?? null,
    projectType: project.projectType ?? null,
    frameworkId: project.frameworkId ?? null,
    frameworkLabel: project.frameworkLabel ?? null,
    previewMode: project.previewMode ?? null,
    containerName: project.containerName ?? null,
    containerPort: project.containerPort ?? null,
    runtimePort: project.runtimePort ?? null,
    previewUrl: project.previewUrl ?? null,
    warnings: Array.isArray(project.warnings) ? project.warnings : [],
    lastError: project.lastError ?? null,
    createdAt: project.createdAt ?? "",
    updatedAt: project.updatedAt ?? "",
  };
}

function normalizeImportResult(result: {
  project: Partial<Project>;
  skippedPaths: string[];
}): ProjectImportResult {
  return {
    project: normalizeProject(result.project),
    skippedPaths: result.skippedPaths,
  };
}

function isMissingBridgeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "Electron preload bridge is not available."
  );
}

export interface ProjectsClient {
  listProjects(): Promise<Project[]>;
  getProjectLogs(projectId: string): Promise<string[]>;
  subscribeProjectLogs(
    projectId: string,
    listener: (event: ProjectLogsEvent) => void
  ): () => void;
  selectZipFile(): Promise<string | null>;
  selectSourceFolder(): Promise<string | null>;
  selectDeploymentRoot(): Promise<string | null>;
  importZipFromPath(
    zipPath: string,
    name: string | undefined,
    deploymentRootPath: string
  ): Promise<ProjectImportResult>;
  importFolderFromPath(
    sourcePath: string,
    name: string | undefined,
    deploymentRootPath: string
  ): Promise<ProjectImportResult>;
  deleteProject(projectId: string): Promise<{ id: string }>;
  startProject(projectId: string): Promise<Project>;
  stopProject(projectId: string): Promise<Project>;
  restartProject(projectId: string): Promise<Project>;
}

export const projectsClient: ProjectsClient = {
  listProjects: async () => {
    try {
      const projects = await requireWorkbenchBridge().projects.list();
      return projects.map((project) => normalizeProject(project));
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      const projects = await fetchProjects();
      return projects.map((project) => normalizeProject(project));
    }
  },
  getProjectLogs: async (projectId) => {
    try {
      return await requireWorkbenchBridge().projects.getLogs(projectId);
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      return fetchProjectLogs(projectId);
    }
  },
  subscribeProjectLogs: (projectId, listener) => {
    try {
      return requireWorkbenchBridge().projects.subscribeLogs(projectId, listener);
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      const eventSource = createProjectLogsEventSource(projectId);
      eventSource.onmessage = (event) => {
        listener(JSON.parse(event.data) as ProjectLogsEvent);
      };
      eventSource.onerror = () => {
        eventSource.close();
      };
      return () => {
        eventSource.close();
      };
    }
  },
  selectZipFile: () => requireWorkbenchBridge().projects.selectZipFile(),
  selectSourceFolder: () => requireWorkbenchBridge().projects.selectSourceFolder(),
  selectDeploymentRoot: () =>
    requireWorkbenchBridge().projects.selectDeploymentRoot(),
  importZipFromPath: (zipPath, name, deploymentRootPath) =>
    requireWorkbenchBridge()
      .projects.importZipFromPath({
        zipPath,
        name,
        deploymentRootPath,
      })
      .then(normalizeImportResult),
  importFolderFromPath: (sourcePath, name, deploymentRootPath) =>
    requireWorkbenchBridge()
      .projects.importFolderFromPath({
        sourcePath,
        name,
        deploymentRootPath,
      })
      .then(normalizeImportResult),
  deleteProject: async (projectId) => {
    try {
      return await requireWorkbenchBridge().projects.delete(projectId);
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      return deleteProjectFromApi(projectId);
    }
  },
  startProject: async (projectId) => {
    try {
      const project = await requireWorkbenchBridge().projects.start(projectId);
      return normalizeProject(project);
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      return startProjectFromApi(projectId).then((project) => normalizeProject(project));
    }
  },
  stopProject: async (projectId) => {
    try {
      const project = await requireWorkbenchBridge().projects.stop(projectId);
      return normalizeProject(project);
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      return stopProjectFromApi(projectId).then((project) => normalizeProject(project));
    }
  },
  restartProject: async (projectId) => {
    try {
      const project = await requireWorkbenchBridge().projects.restart(projectId);
      return normalizeProject(project);
    } catch (error) {
      if (!isMissingBridgeError(error)) {
        throw error;
      }

      return restartProjectFromApi(projectId).then((project) => normalizeProject(project));
    }
  },
};
