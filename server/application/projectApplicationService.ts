import type {
  ProjectImportResult,
  Project,
  LogStream,
  UploadedFile,
} from "../types";
import type { ProjectService } from "../services/projectService";

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

export class ProjectApplicationService {
  constructor(
    private readonly projectService: Pick<
      ProjectService,
      | "listProjects"
      | "getProject"
      | "getProjectLogs"
      | "subscribeLogs"
      | "importZipProject"
      | "importFolderProject"
      | "importZipProjectFromPath"
      | "importFolderProjectFromPath"
      | "startProject"
      | "stopProject"
      | "restartProject"
      | "deleteProject"
      | "getPreviewInfo"
    >
  ) {}

  listProjects(): Project[] {
    return this.projectService.listProjects();
  }

  getProject(projectId: string): Project | null {
    return this.projectService.getProject(projectId);
  }

  getProjectLogs(projectId: string): string[] {
    return this.projectService.getProjectLogs(projectId);
  }

  subscribeLogs(
    projectId: string,
    listener: (event: { line: string; createdAt: string; stream: LogStream }) => void
  ): () => void {
    return this.projectService.subscribeLogs(projectId, listener);
  }

  importZipBuffer(
    name: string,
    zipBuffer: Buffer,
    deploymentRootPath: string
  ): Promise<Project> {
    return this.projectService.importZipProject(name, zipBuffer, deploymentRootPath);
  }

  importFolderUpload(
    name: string,
    files: UploadedFile[],
    deploymentRootPath: string
  ): Promise<Project> {
    return this.projectService.importFolderProject(name, files, deploymentRootPath);
  }

  importZipFromPath(request: ImportZipFromPathRequest): Promise<ProjectImportResult> {
    return this.projectService.importZipProjectFromPath(
      request.name ?? undefined,
      request.zipPath,
      request.deploymentRootPath
    );
  }

  importFolderFromPath(
    request: ImportFolderFromPathRequest
  ): Promise<ProjectImportResult> {
    return this.projectService.importFolderProjectFromPath(
      request.name ?? undefined,
      request.sourcePath,
      request.deploymentRootPath
    );
  }

  startProject(projectId: string) {
    return this.projectService.startProject(projectId);
  }

  stopProject(projectId: string) {
    return this.projectService.stopProject(projectId);
  }

  restartProject(projectId: string) {
    return this.projectService.restartProject(projectId);
  }

  deleteProject(projectId: string) {
    return this.projectService.deleteProject(projectId);
  }

  getPreviewInfo(projectId: string) {
    return this.projectService.getPreviewInfo(projectId);
  }
}
