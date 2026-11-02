import { execFile, spawn } from "node:child_process";
import { request } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import {
  LOCAL_RUNTIME_HOST,
  LOCAL_RUNTIME_PORT_SCAN_START,
  LOCAL_RUNTIME_READY_TIMEOUT_MS,
  getProjectDevCommand,
  getProjectInstallCommand,
  shouldInstallDependencies,
  type RuntimeCommand,
} from "../lib/localRuntime";
import { inspectProjectDirectory, type ProjectInspectionReport } from "../lib/projectInspector";
import type { LogStream, ProjectStatus } from "../types";
import type { ProjectLogPublisher } from "./logService";
import { ProjectRepository, type ProjectUpdate } from "./projectRepository";

interface RunnerState {
  process: ReturnType<typeof spawn>;
  wasStopped: boolean;
  exitDisposition: "stopped" | "error" | null;
  runtimePort: number | null;
}

const execFileAsync = promisify(execFile);

/** Sentinel exit code used when an install child is killed by a user-initiated stop. */
const INSTALL_STOPPED_SENTINEL = -1;

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
    server.listen(port, LOCAL_RUNTIME_HOST, () => {
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

export interface ProjectRuntimeController {
  startProject(projectId: string): Promise<void>;
  stopProject(projectId: string): Promise<void>;
  restartProject(projectId: string): Promise<void>;
}

export class RuntimeService implements ProjectRuntimeController {
  private readonly runners = new Map<string, RunnerState>();
  private readonly reservedRuntimePorts = new Set<number>();

  constructor(
    private readonly repository: ProjectRepository,
    private readonly logStream: ProjectLogPublisher
  ) {
    this.reconcileRuntimeState();
  }

  private runInstallProcess(
    projectId: string,
    cwd: string,
    command: RuntimeCommand
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command.command, command.args, {
          cwd,
          shell: process.platform === "win32",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        reject(error);
        return;
      }

      const runner: RunnerState = {
        process: child,
        wasStopped: false,
        exitDisposition: null,
        runtimePort: null,
      };
      this.runners.set(projectId, runner);
      this.attachProcessLogs(projectId, child);

      child.on("error", (error) => {
        if (this.runners.get(projectId) === runner) {
          this.runners.delete(projectId);
        }
        reject(error);
      });

      child.on("exit", (code) => {
        if (this.runners.get(projectId) === runner) {
          this.runners.delete(projectId);
        }
        if (runner.exitDisposition === "stopped") {
          resolve(INSTALL_STOPPED_SENTINEL);
          return;
        }
        resolve(code ?? 1);
      });
    });
  }

  async startProject(projectId: string): Promise<void> {
    const project = this.repository.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const inspection = await inspectProjectDirectory(project.workspacePath);
    if (!inspection.valid) {
      throw new Error(`Invalid project: ${inspection.errors.join("; ")}`);
    }

    if (shouldInstallDependencies(inspection) && !inspection.packageManager) {
      throw new Error(
        "Project package manager is unknown. Re-import this project and ensure package.json exists at project root."
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

    const projectRootPath = inspection.rootPath
      ? path.join(project.workspacePath, inspection.rootPath)
      : project.workspacePath;
    const installCommand = getProjectInstallCommand(inspection);
    if (!installCommand) {
      this.appendLog(projectId, "system", "Skipping dependency install");
      await this.startRuntimeProcess(projectId, inspection);
      return;
    }

    this.appendLog(
      projectId,
      "system",
      `Running local install command: ${formatRuntimeCommand(installCommand)}`
    );
    let installCode: number;
    try {
      installCode = await this.runInstallProcess(projectId, projectRootPath, installCommand);
    } catch (error) {
      const message = formatProjectRunError("Install process failed to start", error);
      this.failProjectRun(projectId, message);
      throw error;
    }

    if (installCode === INSTALL_STOPPED_SENTINEL) {
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

    if (installCode !== 0) {
      const legacyCommand = getProjectInstallCommand(inspection, process.platform, {
        legacyPeerDeps: true,
      });
      this.appendLog(
        projectId,
        "system",
        `Install failed (exit ${installCode}); retrying with relaxed peer dependencies: ${formatRuntimeCommand(legacyCommand)}`
      );
      try {
        installCode = await this.runInstallProcess(projectId, projectRootPath, legacyCommand);
      } catch (error) {
        const message = formatProjectRunError("Install (legacy) process failed to start", error);
        this.failProjectRun(projectId, message);
        throw error;
      }
      if (installCode === INSTALL_STOPPED_SENTINEL) {
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
    }

    if (installCode !== 0) {
      this.failProjectRun(projectId, `Install process exited with code ${installCode}`);
      return;
    }

    this.appendLog(projectId, "system", "Dependencies installed; starting runtime");
    await this.startRuntimeProcess(projectId, inspection).catch((error) => {
      this.failProjectRun(
        projectId,
        formatProjectRunError("Failed to prepare local runtime", error)
      );
    });
  }

  async stopProject(projectId: string): Promise<void> {
    const project = this.repository.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const runner = this.runners.get(projectId);
    if (runner) {
      await this.stopRunner(projectId, runner);
      this.runners.delete(projectId);
      this.releaseRuntimePort(runner.runtimePort);
    }
    if (!runner && project.runtimePid) {
      await terminateProcessTree(project.runtimePid).catch(() => undefined);
    }
    this.releaseRuntimePort(project.runtimePort ?? null);

    this.updateProject(projectId, {
      status: "stopped",
      containerName: null,
      containerPort: null,
      runtimePid: null,
      runtimePort: null,
      previewUrl: null,
      lastError: null,
      updatedAt: nowIso(),
    });
    this.appendLog(projectId, "system", "Project stopped");
  }

  async restartProject(projectId: string): Promise<void> {
    await this.stopProject(projectId);
    await this.startProject(projectId);
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

  private async startRuntimeProcess(
    projectId: string,
    inspection?: ProjectInspectionReport
  ): Promise<void> {
    const project = this.repository.getProject(projectId);
    if (!project) {
      return;
    }

    const resolvedInspection =
      inspection ?? (await inspectProjectDirectory(project.workspacePath));
    if (!resolvedInspection.valid) {
      this.failProjectRun(projectId, `Invalid project: ${resolvedInspection.errors.join("; ")}`);
      return;
    }
    if (shouldInstallDependencies(resolvedInspection) && !resolvedInspection.packageManager) {
      this.failProjectRun(
        projectId,
        "Project package manager is unknown. Re-import this project and ensure package.json exists at project root."
      );
      return;
    }

    const runtimePort = await this.reserveRuntimePort(LOCAL_RUNTIME_PORT_SCAN_START);
    const previewUrl = `http://127.0.0.1:${runtimePort}`;
    const projectRootPath = resolvedInspection.rootPath
      ? path.join(project.workspacePath, resolvedInspection.rootPath)
      : project.workspacePath;
    const runtimeCommand = getProjectDevCommand(resolvedInspection, runtimePort);
    this.appendLog(
      projectId,
      "system",
      `Running local dev command: ${formatRuntimeCommand(runtimeCommand)}`
    );
    let runtimeProcess: ReturnType<typeof spawn>;
    try {
      runtimeProcess = spawn(runtimeCommand.command, runtimeCommand.args, {
        cwd: projectRootPath,
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

      const current = this.repository.getProject(projectId);
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
    const healthy = await waitForHealthyPort(runtimePort, LOCAL_RUNTIME_READY_TIMEOUT_MS, () => {
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

  private async reserveRuntimePort(fromPort = LOCAL_RUNTIME_PORT_SCAN_START): Promise<number> {
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
}

