import type {
  GenerateTextRequest,
  GenerateTextResponse,
} from "../server/application/aiApplicationService";
import type { ProjectImportResult, LogStream } from "../server/types";
import type { Project } from "../src/types/project";
import type {
  AppUpdateState,
  ContentUpdateState,
  VersionSnapshot,
} from "./services/updateContracts";

export const WORKBENCH_CHANNELS = {
  projects: {
    list: "projects:list",
    get: "projects:get",
    selectZipFile: "projects:selectZipFile",
    selectSourceFolder: "projects:selectSourceFolder",
    selectDeploymentRoot: "projects:selectDeploymentRoot",
    importZipFromPath: "projects:importZipFromPath",
    importFolderFromPath: "projects:importFolderFromPath",
    start: "projects:start",
    stop: "projects:stop",
    restart: "projects:restart",
    delete: "projects:delete",
    previewInfo: "projects:previewInfo",
    logs: {
      list: "projects:logs:list",
      subscribe: "projects:logs:subscribe",
      unsubscribe: "projects:logs:unsubscribe",
      event: "projects:logs:event",
    },
  },
  ai: {
    generateText: "ai:generateText",
  },
  updates: {
    status: "updates:status",
    checkApp: "updates:checkApp",
    checkContent: "updates:checkContent",
    quitAndInstall: "updates:quitAndInstall",
  },
} as const;

export interface ImportZipFromPathRequest {
  name?: string;
  zipPath: string;
  deploymentRootPath: string;
}

export interface ImportFolderFromPathRequest {
  name?: string;
  sourcePath: string;
  deploymentRootPath: string;
}

export interface ProjectPreviewInfo {
  previewUrl: string | null;
  port: number | null;
  status: Project["status"];
}

export type ProjectLogsEvent =
  | {
      type: "snapshot";
      projectId: string;
      logs: string[];
    }
  | {
      type: "log";
      projectId: string;
      stream: LogStream;
      line: string;
      createdAt: string;
    };

export interface UpdateStatusRequest {}

export type UpdateStatusResponse = VersionSnapshot;

export interface CheckAppUpdateRequest {}

export type CheckAppUpdateResponse = AppUpdateState;

export interface CheckContentUpdateRequest {}

export type CheckContentUpdateResponse = ContentUpdateState;

export interface QuitAndInstallRequest {}

export interface QuitAndInstallResponse {
  accepted: true;
}

export interface WorkbenchApi {
  projects: {
    list(): Promise<Project[]>;
    get(projectId: string): Promise<Project | null>;
    getLogs(projectId: string): Promise<string[]>;
    subscribeLogs(
      projectId: string,
      listener: (event: ProjectLogsEvent) => void
    ): () => void;
    selectZipFile(): Promise<string | null>;
    selectSourceFolder(): Promise<string | null>;
    selectDeploymentRoot(): Promise<string | null>;
    importZipFromPath(request: ImportZipFromPathRequest): Promise<ProjectImportResult>;
    importFolderFromPath(
      request: ImportFolderFromPathRequest
    ): Promise<ProjectImportResult>;
    start(projectId: string): Promise<Project>;
    stop(projectId: string): Promise<Project>;
    restart(projectId: string): Promise<Project>;
    delete(projectId: string): Promise<{ id: string }>;
    getPreviewInfo(projectId: string): Promise<ProjectPreviewInfo>;
  };
  ai: {
    generateText(request: GenerateTextRequest): Promise<GenerateTextResponse>;
  };
  updates: {
    getStatus(): Promise<UpdateStatusResponse>;
    checkAppUpdate(): Promise<CheckAppUpdateResponse>;
    checkContentUpdate(): Promise<CheckContentUpdateResponse>;
    quitAndInstall(): Promise<QuitAndInstallResponse>;
  };
}
