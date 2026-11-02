import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildWorkspaceDirectoryName,
  getMetadataMarkerPath,
  isPathInside,
} from "../lib/localRuntime";
import { ImportService } from "../infrastructure/import/importService";
import { RuntimeService, type ProjectRuntimeController } from "../infrastructure/runtimeService";
import { inspectProjectFiles } from "../lib/projectInspector";
import type {
  LogStream,
  Project,
  ProjectImportResult,
  ProjectStatus,
  UploadedFile,
} from "../types";
import type { ProjectLogPublisher } from "../infrastructure/logService";
import { ProjectRepository, type ProjectUpdate } from "../infrastructure/projectRepository";

type ManagedMarker = {
  projectId: string;
  deploymentRootPath: string;
  workspacePath: string;
  createdAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function formatProjectRunError(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${detail}`;
}

function hasProjectRuntimeMetadata(project: Project): boolean {
  if (
    project.projectType === null ||
    project.frameworkId === null ||
    project.frameworkLabel === null ||
    project.previewMode === null
  ) {
    return false;
  }

  if (project.projectType === "static") {
    return true;
  }

  return project.packageManager !== null;
}

export class ProjectService {
  private readonly repository: ProjectRepository;
  private readonly importService: ImportService;
  private readonly runtimeService: ProjectRuntimeController;

  constructor(
    repositoryOrDb: ProjectRepository | Database.Database,
    private readonly logStream: ProjectLogPublisher,
    importService = new ImportService(),
    runtimeService?: ProjectRuntimeController
  ) {
    this.repository =
      repositoryOrDb instanceof ProjectRepository
        ? repositoryOrDb
        : new ProjectRepository(repositoryOrDb);
    this.importService = importService;
    this.runtimeService = runtimeService ?? new RuntimeService(this.repository, logStream);
  }

  listProjects(): Project[] {
    return this.repository.listProjects();
  }

  getProject(projectId: string): Project | null {
    return this.repository.getProject(projectId);
  }

  getProjectLogs(projectId: string, limit = 400): Project["warnings"] {
    return this.repository.getProjectLogs(projectId, limit);
  }

  async importZipProject(
    name: string,
    zipBuffer: Buffer,
    deploymentRootPath: string
  ): Promise<Project> {
    const result = await this.importProjectInternal(
      name,
      "zip",
      deploymentRootPath,
      async (workspacePath) => {
        return this.importService.importZipBufferToDirectory(zipBuffer, workspacePath);
      }
    );

    return result.project;
  }

  async importFolderProject(
    name: string,
    files: UploadedFile[],
    deploymentRootPath: string
  ): Promise<Project> {
    const result = await this.importProjectInternal(
      name,
      "folder",
      deploymentRootPath,
      async (workspacePath) => {
        return this.importService.importUploadedFilesToDirectory(files, workspacePath);
      }
    );

    return result.project;
  }

  async importZipProjectFromPath(
    name: string | undefined,
    zipPath: string,
    deploymentRootPath: string
  ): Promise<ProjectImportResult> {
    const resolvedZipPath = path.resolve(zipPath);
    const projectName =
      name?.trim() || path.basename(resolvedZipPath, path.extname(resolvedZipPath));

    return this.importProjectInternal(
      projectName,
      "zip",
      deploymentRootPath,
      async (workspacePath) => {
        return this.importService.importZipPathToDirectory(
          resolvedZipPath,
          workspacePath
        );
      }
    );
  }

  async importFolderProjectFromPath(
    name: string | undefined,
    sourcePath: string,
    deploymentRootPath: string
  ): Promise<ProjectImportResult> {
    const resolvedSourcePath = path.resolve(sourcePath);
    const projectName = name?.trim() || path.basename(resolvedSourcePath);

    return this.importProjectInternal(
      projectName,
      "folder",
      deploymentRootPath,
      async (workspacePath) => {
        return this.importService.importPathToDirectory(
          resolvedSourcePath,
          workspacePath
        );
      }
    );
  }
  async startProject(projectId: string): Promise<Project> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.deploymentRootPath) {
      throw new Error(
        "This project was created with the old Docker runtime. Re-import it to use local deployment."
      );
    }

    await this.ensureProjectRuntimeMetadata(projectId);
    await this.runtimeService.startProject(projectId);
    const updated = this.getProject(projectId);
    if (!updated) {
      throw new Error("Project missing after start");
    }
    return updated;
  }

  async stopProject(projectId: string): Promise<Project> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await this.runtimeService.stopProject(projectId);

    const updated = this.getProject(projectId);
    if (!updated) {
      throw new Error("Project missing after stop");
    }
    return updated;
  }

  async restartProject(projectId: string): Promise<Project> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.deploymentRootPath) {
      throw new Error(
        "This project was created with the old Docker runtime. Re-import it to use local deployment."
      );
    }

    await this.stopProject(projectId);
    await this.ensureProjectRuntimeMetadata(projectId);
    await this.runtimeService.startProject(projectId);
    const updated = this.getProject(projectId);
    if (!updated) {
      throw new Error("Project missing after restart");
    }
    return updated;
  }

  async deleteProject(projectId: string): Promise<{ id: string }> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (project.status !== "stopped" || project.runtimePid) {
      await this.runtimeService.stopProject(projectId);
    }

    await this.ensureManagedWorkspace(projectId, project.workspacePath, project.deploymentRootPath);
    await fs.rm(project.workspacePath, { recursive: true, force: true });

    this.repository.deleteProject(projectId);


    return { id: projectId };
  }

  subscribeLogs(
    projectId: string,
    listener: (event: { line: string; createdAt: string; stream: LogStream }) => void
  ): () => void {
    return this.logStream.subscribe(projectId, listener);
  }

  getPreviewInfo(projectId: string): {
    previewUrl: string | null;
    port: number | null;
    status: ProjectStatus;
  } {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    return {
      previewUrl: project.previewUrl,
      port: project.runtimePort ?? project.containerPort,
      status: project.status,
    };
  }

  private async importProjectInternal(
    name: string,
    sourceType: Project["sourceType"],
    deploymentRootPath: string,
    importer: (workspacePath: string) => Promise<{ skippedPaths: string[] }>
  ): Promise<ProjectImportResult> {
    const id = randomUUID();
    const createdAt = nowIso();
    const workspacePath = await this.createManagedWorkspace(
      name,
      id,
      deploymentRootPath
    );

    this.repository.createProject({
      id,
      name,
      sourceType,
      workspacePath,
      deploymentRootPath: path.resolve(deploymentRootPath),
      status: "importing",
      createdAt,
    });

    this.appendLog(id, "system", `Import started from ${sourceType}`);

    let skippedPaths: string[] = [];

    try {
      const importResult = await importer(workspacePath);
      skippedPaths = importResult.skippedPaths;
      await this.writeManagedMarker(workspacePath, {
        projectId: id,
        deploymentRootPath: path.resolve(deploymentRootPath),
        workspacePath,
        createdAt,
      });

      const files = await this.importService.listProjectFiles(workspacePath);
      const inspection = inspectProjectFiles(files);
      if (!inspection.valid) {
        throw new Error(`Invalid project: ${inspection.errors.join("; ")}`);
      }

      const combinedWarnings =
        skippedPaths.length > 0
          ? [
              ...inspection.warnings,
              `Skipped import paths: ${skippedPaths.join(", ")}`,
            ]
          : inspection.warnings;

      this.updateProject(id, {
        status: "installing",
        packageManager: inspection.packageManager,
        framework: inspection.frameworkLabel,
        projectType: inspection.projectType,
        frameworkId: inspection.frameworkId,
        frameworkLabel: inspection.frameworkLabel,
        previewMode: inspection.previewMode,
        warnings: combinedWarnings,
        lastError: null,
        updatedAt: nowIso(),
      });

      if (combinedWarnings.length > 0) {
        this.appendLog(id, "system", `Warnings: ${combinedWarnings.join("; ")}`);
      }

      await this.runtimeService.startProject(id).catch((error) => {
        this.failProjectRun(
          id,
          formatProjectRunError("Failed to start local runtime after import", error)
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(await this.pathExists(getMetadataMarkerPath(workspacePath)))) {
        await this.writeManagedMarker(workspacePath, {
          projectId: id,
          deploymentRootPath: path.resolve(deploymentRootPath),
          workspacePath,
          createdAt,
        }).catch(() => undefined);
      }
      this.updateProject(id, {
        status: "error",
        runtimePid: null,
        runtimePort: null,
        previewUrl: null,
        lastError: message,
        updatedAt: nowIso(),
      });
      this.appendLog(id, "system", `Import failed: ${message}`);
    }

    const project = this.getProject(id);
    if (!project) {
      throw new Error("Imported project was not persisted");
    }
    return {
      project,
      skippedPaths,
    };
  }

  private async createManagedWorkspace(
    name: string,
    projectId: string,
    deploymentRootPath: string
  ): Promise<string> {
    const resolvedDeploymentRoot = path.resolve(deploymentRootPath);
    const stats = await fs.stat(resolvedDeploymentRoot).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new Error("Deployment root path must exist and be a directory");
    }

    const baseName = buildWorkspaceDirectoryName(name, projectId);
    let workspacePath = path.join(resolvedDeploymentRoot, baseName);
    let suffix = 1;

    while (await this.pathExists(workspacePath)) {
      workspacePath = path.join(resolvedDeploymentRoot, `${baseName}-${suffix}`);
      suffix += 1;
    }

    await fs.mkdir(workspacePath, { recursive: true });
    return workspacePath;
  }

  private async writeManagedMarker(
    workspacePath: string,
    marker: ManagedMarker
  ): Promise<void> {
    await fs.writeFile(getMetadataMarkerPath(workspacePath), JSON.stringify(marker, null, 2));
  }

  private async ensureManagedWorkspace(
    projectId: string,
    workspacePath: string,
    deploymentRootPath: string | null | undefined
  ): Promise<void> {
    if (!(await this.pathExists(workspacePath))) {
      return;
    }
    if (!deploymentRootPath) {
      throw new Error("Refusing to delete workspace without deployment root path");
    }
    if (!isPathInside(deploymentRootPath, workspacePath)) {
      throw new Error("Refusing to delete workspace outside deployment root");
    }

    const markerPath = getMetadataMarkerPath(workspacePath);
    const markerText = await fs.readFile(markerPath, "utf8").catch(() => null);
    if (!markerText) {
      throw new Error("Refusing to delete workspace without managed marker file");
    }

    const marker = JSON.parse(markerText) as ManagedMarker;
    if (
      marker.projectId !== projectId ||
      path.resolve(marker.deploymentRootPath) !== path.resolve(deploymentRootPath) ||
      path.resolve(marker.workspacePath) !== path.resolve(workspacePath)
    ) {
      throw new Error("Refusing to delete workspace with mismatched managed marker");
    }
  }

  private async ensureProjectRuntimeMetadata(projectId: string): Promise<void> {
    const current = this.getProject(projectId);
    if (!current) {
      throw new Error("Project not found");
    }
    if (hasProjectRuntimeMetadata(current)) {
      return;
    }

    const files = await this.importService.listProjectFiles(current.workspacePath);
    const inspection = inspectProjectFiles(files);
    if (!inspection.valid) {
      throw new Error(
        `Project runtime metadata is unknown. Invalid project: ${inspection.errors.join("; ")}`
      );
    }

    this.updateProject(projectId, {
      packageManager: inspection.packageManager,
      framework: inspection.frameworkLabel,
      projectType: inspection.projectType,
      frameworkId: inspection.frameworkId,
      frameworkLabel: inspection.frameworkLabel,
      previewMode: inspection.previewMode,
      warnings: inspection.warnings,
      updatedAt: nowIso(),
    });
  }

  private failProjectRun(projectId: string, message: string): void {
    this.updateProject(projectId, {
      status: "error",
      containerName: null,
      containerPort: null,
      runtimePid: null,
      runtimePort: null,
      previewUrl: null,
      lastError: message,
      updatedAt: nowIso(),
    });
    this.appendLog(projectId, "system", message);
  }

  private appendLog(projectId: string, stream: LogStream, line: string): void {
    const createdAt = nowIso();
    this.repository.appendLog({
      projectId,
      stream,
      line,
      createdAt,
    });

    this.logStream.publish({
      projectId,
      stream,
      line,
      createdAt,
    });
  }

  private updateProject(projectId: string, values: ProjectUpdate): void {
    this.repository.updateProject(projectId, values);
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

