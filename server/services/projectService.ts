import type Database from "better-sqlite3";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildWorkspaceDirectoryName,
  getDevCommand,
  getInstallCommand,
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

interface RunnerState {
  process: ReturnType<typeof spawn>;
  wasStopped: boolean;
  exitDisposition: "stopped" | "error" | null;
  runtimePort: number | null;
}

type ManagedMarker = {
  projectId: string;
  deploymentRootPath: string;
  workspacePath: string;
  createdAt: string;
};

const execFileAsync = promisify(execFile);

function nowIso(): string {
  return new Date().toISOString();
}

function formatProjectRunError(prefix: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${detail}`;
}

function parseLogLines(chunk: Buffer | string): string[] {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

async function terminateProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function terminateChildProcess(
  child: ReturnType<typeof spawn>
): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    return;
  }

  await terminateProcessTree(pid).catch((error) => {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ESRCH" && code !== "128") {
      throw error;
    }
  });
}

async function isPreviewHealthy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method: "GET",
        path: "/",
        timeout: 1000,
      },
      (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForHealthyPort(
  port: number,
  timeoutMs: number,
  shouldContinue: () => boolean
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!shouldContinue()) {
      return false;
    }
    if (await isPreviewHealthy(port)) {
      return true;
    }
    if (!shouldContinue()) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function formatRuntimeCommand(command: {
  command: string;
  args: string[];
}): string {
  const executable =
    process.platform === "win32"
      ? command.command.replace(/\.cmd$/i, "")
      : command.command;
  return [executable, ...command.args].join(" ");
}

function getRestartRecoveryDetails(status: ProjectStatus): {
  status: ProjectStatus;
  lastError: string | null;
  logLine: string;
} {
  if (status === "ready") {
    return {
      status: "stopped",
      lastError: null,
      logLine: "Local runtime stopped after server restart. Start the project again.",
    };
  }

  const phase =
    status === "starting"
      ? "starting"
      : status === "importing"
        ? "importing"
        : "installing";
  const message = `Local runtime was interrupted by server restart while ${phase}. Start the project again.`;
  return {
    status: "error",
    lastError: message,
    logLine: message,
  };
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
  private readonly runners = new Map<string, RunnerState>();
  private readonly reservedRuntimePorts = new Set<number>();
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

    this.runners.delete(projectId);

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

  private reconcileRuntimeState(): void {
    const rows = this.repository.listProjectStatuses();

    for (const row of rows) {
      if (
        row.status !== "ready" &&
        row.status !== "starting" &&
        row.status !== "installing" &&
        row.status !== "importing"
      ) {
        continue;
      }

      const recovery = getRestartRecoveryDetails(row.status);
      this.updateProject(row.id, {
        status: recovery.status,
        containerName: null,
        containerPort: null,
        runtimePid: null,
        runtimePort: null,
        previewUrl: null,
        lastError: recovery.lastError,
        updatedAt: nowIso(),
      });
      this.appendLog(row.id, "system", recovery.logLine);
    }
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

  private async runLocalProject(projectId: string): Promise<void> {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    if (!project.packageManager) {
      throw new Error(
        "Project package manager is unknown. Re-import this project and ensure package.json exists at project root."
      );
    }

    const activeRunner = this.runners.get(projectId);
    if (activeRunner) {
      activeRunner.wasStopped = true;
      activeRunner.exitDisposition = "stopped";
      activeRunner.process.kill("SIGTERM");
      this.runners.delete(projectId);
    }

    this.updateProject(projectId, {
      status: "installing",
      containerName: null,
      containerPort: null,
      runtimePid: null,
      runtimePort: null,
      previewUrl: null,
      lastError: null,
      updatedAt: nowIso(),
    });
    this.appendLog(projectId, "system", "Preparing local runtime");

    const installCommand = getInstallCommand(project.packageManager);
    this.appendLog(
      projectId,
      "system",
      `Running local install command: ${formatRuntimeCommand(installCommand)}`
    );
    let installProcess: ReturnType<typeof spawn>;
    try {
      installProcess = spawn(installCommand.command, installCommand.args, {
        cwd: project.workspacePath,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = formatProjectRunError("Install process failed to start", error);
      this.failProjectRun(projectId, message);
      throw error;
    }

    const runner: RunnerState = {
      process: installProcess,
      wasStopped: false,
      exitDisposition: null,
      runtimePort: null,
    };
    this.runners.set(projectId, runner);
    this.attachProcessLogs(projectId, installProcess);

    installProcess.on("error", (error) => {
      if (this.runners.get(projectId) === runner) {
        this.runners.delete(projectId);
      }
      this.failProjectRun(projectId, `Install process failed: ${error.message}`);
    });

    installProcess.on("exit", (code, signal) => {
      if (this.runners.get(projectId) === runner) {
        this.runners.delete(projectId);
      }

      if (runner.exitDisposition === "error") {
        return;
      }

      if (runner.exitDisposition === "stopped") {
        this.updateProject(projectId, {
          status: "stopped",
          runtimePid: null,
          runtimePort: null,
          previewUrl: null,
          lastError: null,
          updatedAt: nowIso(),
        });
        return;
      }

      if (code === 0) {
        void this.startRuntimeProcess(projectId).catch((error) => {
          this.failProjectRun(
            projectId,
            formatProjectRunError("Failed to prepare local runtime", error)
          );
        });
        return;
      }

      const exitMessage =
        code !== null
          ? `Install process exited with code ${code}`
          : `Install process terminated by signal ${signal ?? "unknown"}`;
      this.failProjectRun(projectId, exitMessage);
    });
  }

  private async startRuntimeProcess(projectId: string): Promise<void> {
    const project = this.getProject(projectId);
    if (!project) {
      return;
    }
    if (!project.packageManager) {
      this.failProjectRun(
        projectId,
        "Project package manager is unknown. Re-import this project and ensure package.json exists at project root."
      );
      return;
    }

    const runtimePort = await this.reserveRuntimePort(43000);
    const previewUrl = `http://127.0.0.1:${runtimePort}`;
    const runtimeCommand = getDevCommand(project.packageManager, runtimePort);
    this.appendLog(
      projectId,
      "system",
      `Running local dev command: ${formatRuntimeCommand(runtimeCommand)}`
    );
    let runtimeProcess: ReturnType<typeof spawn>;
    try {
      runtimeProcess = spawn(runtimeCommand.command, runtimeCommand.args, {
        cwd: project.workspacePath,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      this.releaseRuntimePort(runtimePort);
      const message = formatProjectRunError("Local process failed to start", error);
      this.failProjectRun(projectId, message);
      throw error;
    }

    const runner: RunnerState = {
      process: runtimeProcess,
      wasStopped: false,
      exitDisposition: null,
      runtimePort,
    };
    this.runners.set(projectId, runner);
    this.attachProcessLogs(projectId, runtimeProcess);
    this.updateProject(projectId, {
      status: "starting",
      containerName: null,
      containerPort: null,
      runtimePid: runtimeProcess.pid ?? null,
      runtimePort,
      previewUrl,
      lastError: null,
      updatedAt: nowIso(),
    });
    this.appendLog(projectId, "system", "Starting local runtime");

    runtimeProcess.on("error", (error) => {
      if (this.runners.get(projectId) === runner) {
        this.runners.delete(projectId);
      }
      this.releaseRuntimePort(runner.runtimePort);
      this.failProjectRun(projectId, `Local process failed: ${error.message}`);
    });

    runtimeProcess.on("exit", (code, signal) => {
      if (this.runners.get(projectId) === runner) {
        this.runners.delete(projectId);
      }
      this.releaseRuntimePort(runner.runtimePort);

      if (runner.exitDisposition === "error") {
        return;
      }

      if (runner.exitDisposition === "stopped") {
        this.updateProject(projectId, {
          status: "stopped",
          runtimePid: null,
          runtimePort: null,
          previewUrl: null,
          lastError: null,
          updatedAt: nowIso(),
        });
        return;
      }

      const current = this.getProject(projectId);
      if (!current) {
        return;
      }

      if (current.status === "ready" && code === 0) {
        this.updateProject(projectId, {
          status: "stopped",
          runtimePid: null,
          runtimePort: null,
          previewUrl: null,
          lastError: null,
          updatedAt: nowIso(),
        });
        return;
      }

      const exitMessage =
        code !== null
          ? `Local process exited with code ${code}`
          : `Local process terminated by signal ${signal ?? "unknown"}`;
      this.failProjectRun(projectId, exitMessage);
    });

    void this.waitForProjectReady(projectId, runtimePort, runner);
  }

  private async waitForProjectReady(
    projectId: string,
    runtimePort: number,
    runner: RunnerState
  ): Promise<void> {
    const healthy = await waitForHealthyPort(runtimePort, 120_000, () => {
      return this.runners.get(projectId) === runner && !runner.wasStopped;
    });

    if (this.runners.get(projectId) !== runner || runner.wasStopped) {
      return;
    }

    if (healthy) {
      this.updateProject(projectId, {
        status: "ready",
        lastError: null,
        updatedAt: nowIso(),
      });
      this.appendLog(projectId, "system", "Preview server is healthy");
      return;
    }

    this.runners.delete(projectId);
    runner.wasStopped = true;
    runner.exitDisposition = "error";
    runner.process.kill("SIGTERM");
    this.failProjectRun(projectId, "Dev server health check timed out");
  }

  private async reserveRuntimePort(fromPort = 43000): Promise<number> {
    for (let port = fromPort; port < fromPort + 5000; port += 1) {
      if (this.reservedRuntimePorts.has(port)) {
        continue;
      }

      const available = await isPortAvailable(port);
      if (!available) {
        continue;
      }
      if (this.reservedRuntimePorts.has(port)) {
        continue;
      }

      this.reservedRuntimePorts.add(port);
      return port;
    }

    throw new Error("No available port found");
  }

  private releaseRuntimePort(port: number | null): void {
    if (typeof port === "number") {
      this.reservedRuntimePorts.delete(port);
    }
  }

  private async stopRunner(projectId: string, runner: RunnerState): Promise<void> {
    runner.wasStopped = true;
    runner.exitDisposition = "stopped";
    await terminateChildProcess(runner.process).catch(() => undefined);

    if (this.runners.get(projectId) === runner) {
      this.runners.delete(projectId);
    }
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

  private attachProcessLogs(
    projectId: string,
    process: ReturnType<typeof spawn>
  ): void {
    process.stdout?.on("data", (chunk) => {
      for (const line of parseLogLines(chunk)) {
        this.appendLog(projectId, "runtime", line);
      }
    });
    process.stderr?.on("data", (chunk) => {
      for (const line of parseLogLines(chunk)) {
        this.appendLog(projectId, "runtime", line);
      }
    });
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

