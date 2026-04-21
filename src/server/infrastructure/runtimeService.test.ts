import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../../server/db/client";
import { LogService } from "../../../server/infrastructure/logService";
import { ProjectRepository } from "../../../server/infrastructure/projectRepository";
import { RuntimeService } from "../../../server/infrastructure/runtimeService";

const { spawnMock, execFileMock, requestMock, createServerMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
  requestMock: vi.fn(),
  createServerMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  execFile: execFileMock,
}));

vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    request: requestMock,
  };
});

vi.mock("node:net", () => ({
  createServer: createServerMock,
}));

type MockProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  pid: number;
};

let nextPid = 5100;

function createMockProcess(options?: {
  autoExit?: boolean;
  exitCode?: number;
  pid?: number;
}): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = options?.pid ?? nextPid++;
  proc.kill = vi.fn(() => {
    proc.emit("exit", 0, null);
  });

  if (options?.autoExit) {
    queueMicrotask(() => {
      proc.emit("exit", options.exitCode ?? 0, null);
    });
  }

  return proc;
}

function createMockHttpRequest() {
  const req = new EventEmitter() as EventEmitter & {
    destroy: ReturnType<typeof vi.fn>;
    end: () => void;
  };
  req.destroy = vi.fn();
  req.end = () => {
    queueMicrotask(() => {
      req.emit("error", new Error("ECONNREFUSED"));
    });
  };
  return req;
}

function createViteWorkspace(workspacePath: string) {
  mkdirSync(path.join(workspacePath, "src"), { recursive: true });
  writeFileSync(path.join(workspacePath, "package.json"), '{"name":"demo"}');
  writeFileSync(path.join(workspacePath, "index.html"), "<!doctype html>");
  writeFileSync(
    path.join(workspacePath, "src", "main.tsx"),
    'import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; ReactDOM.createRoot(document.getElementById("root")!).render(<App />);'
  );
  writeFileSync(
    path.join(workspacePath, "src", "App.tsx"),
    "export default function App() { return <div>ok</div>; }"
  );
}

function createAstroWorkspace(workspacePath: string) {
  mkdirSync(path.join(workspacePath, "src", "pages"), { recursive: true });
  writeFileSync(path.join(workspacePath, "package.json"), '{"name":"astro-demo"}');
  writeFileSync(path.join(workspacePath, "astro.config.mjs"), "export default {};");
  writeFileSync(
    path.join(workspacePath, "src", "pages", "index.astro"),
    "---\n---\n<html><body>Astro</body></html>"
  );
}

function createStaticWorkspace(workspacePath: string) {
  mkdirSync(workspacePath, { recursive: true });
  writeFileSync(
    path.join(workspacePath, "index.html"),
    "<!doctype html><html><body>Static</body></html>"
  );
}

function insertProject(
  repositoryDb: ReturnType<typeof createDatabase>,
  options: {
    id: string;
    workspacePath: string;
    deploymentRootPath: string;
    packageManager?: string | null;
    framework?: string | null;
    projectType?: string | null;
    frameworkId?: string | null;
    frameworkLabel?: string | null;
    previewMode?: string | null;
  }
) {
  const now = new Date().toISOString();
  repositoryDb.prepare(
    `
      INSERT INTO projects (
        id, name, source_type, workspace_path, deployment_root_path, status,
        package_manager, framework, project_type, framework_id, framework_label,
        preview_mode, container_name, container_port,
        runtime_pid, runtime_port, preview_url,
        warnings_json, last_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, '[]', NULL, ?, ?)
    `
  ).run(
    options.id,
    "sample",
    "zip",
    options.workspacePath,
    options.deploymentRootPath,
    "stopped",
    options.packageManager === undefined ? "npm" : options.packageManager,
    options.framework === undefined ? "React + Vite" : options.framework,
    options.projectType === undefined ? "vite" : options.projectType,
    options.frameworkId === undefined ? "react-vite" : options.frameworkId,
    options.frameworkLabel === undefined ? "React + Vite" : options.frameworkLabel,
    options.previewMode === undefined ? "embedded" : options.previewMode,
    now,
    now
  );
}

describe("RuntimeService", () => {
  let tempDir: string | null = null;
  let db: ReturnType<typeof createDatabase> | null = null;

  afterEach(() => {
    spawnMock.mockReset();
    execFileMock.mockReset();
    requestMock.mockReset();
    createServerMock.mockReset();
    execFileMock.mockImplementation(
      (_file: string, _args: string[], callback: (error: Error | null) => void) => {
        queueMicrotask(() => callback(null));
      }
    );
    requestMock.mockImplementation(() => createMockHttpRequest());
    createServerMock.mockImplementation(() => {
      return {
        once: vi.fn(),
        listen: vi.fn((_port: number, _host: string, callback: () => void) => {
          queueMicrotask(callback);
        }),
        close: vi.fn((callback: () => void) => {
          queueMicrotask(callback);
        }),
      };
    });
    if (db) {
      db.close();
      db = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  execFileMock.mockImplementation(
    (_file: string, _args: string[], callback: (error: Error | null) => void) => {
      queueMicrotask(() => callback(null));
    }
  );
  requestMock.mockImplementation(() => createMockHttpRequest());
  createServerMock.mockImplementation(() => {
    return {
      once: vi.fn(),
      listen: vi.fn((_port: number, _host: string, callback: () => void) => {
        queueMicrotask(callback);
      }),
      close: vi.fn((callback: () => void) => {
        queueMicrotask(callback);
      }),
    };
  });

  it("clears runtime metadata when the process exits with error", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 6101 });
      }

      const proc = createMockProcess({ pid: 6102 });
      queueMicrotask(() => {
        proc.emit("exit", 1, null);
      });
      return proc;
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-runtime-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-runtime");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "runtime-service-project",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const repository = new ProjectRepository(db);
    const service = new RuntimeService(repository, new LogService());
    await service.startProject("runtime-service-project");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const updated = repository.getProject("runtime-service-project");
    expect(updated?.status).toBe("error");
    expect(updated?.runtimePid).toBeNull();
    expect(updated?.runtimePort).toBeNull();
    expect(updated?.previewUrl).toBeNull();
  });

  it("starts static projects without running install", async () => {
    spawnMock.mockImplementation(() => createMockProcess({ pid: 7101 }));

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-runtime-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-static");
    createStaticWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "runtime-static-project",
      workspacePath,
      deploymentRootPath: deploymentRoot,
      packageManager: null,
      framework: null,
      projectType: null,
      frameworkId: null,
      frameworkLabel: null,
      previewMode: null,
    });

    const repository = new ProjectRepository(db);
    const service = new RuntimeService(repository, new LogService());
    await service.startProject("runtime-static-project");

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["-e", expect.any(String), "43000"]),
      expect.objectContaining({
        cwd: workspacePath,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );

    const updated = repository.getProject("runtime-static-project");
    expect(updated?.framework).toBe("Static HTML");
    expect(updated?.packageManager).toBeNull();
    expect(updated?.status).toBe("starting");
  });

  it("runs Astro install before starting Astro dev", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 7201 });
      }

      return createMockProcess({ pid: 7202 });
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-runtime-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-astro");
    createAstroWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "runtime-astro-project",
      workspacePath,
      deploymentRootPath: deploymentRoot,
      framework: null,
      projectType: null,
      frameworkId: null,
      frameworkLabel: null,
      previewMode: null,
    });

    const repository = new ProjectRepository(db);
    const service = new RuntimeService(repository, new LogService());
    await service.startProject("runtime-astro-project");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      "npm.cmd",
      ["install"],
      expect.objectContaining({
        cwd: workspacePath,
      })
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      "npm.cmd",
      ["run", "dev", "--", "--host", "0.0.0.0", "--port", "43000"],
      expect.objectContaining({
        cwd: workspacePath,
      })
    );
  });

  it("skips ports that are occupied on the runtime host binding", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 7301 });
      }

      return createMockProcess({ pid: 7302 });
    });

    createServerMock.mockImplementation(() => {
      let errorHandler: ((error: Error) => void) | null = null;

      return {
        once: vi.fn((event: string, handler: (error: Error) => void) => {
          if (event === "error") {
            errorHandler = handler;
          }
        }),
        listen: vi.fn((port: number, host: string, callback: () => void) => {
          queueMicrotask(() => {
            if (port === 43000 && host === "0.0.0.0") {
              errorHandler?.(Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" }));
              return;
            }

            callback();
          });
        }),
        close: vi.fn((callback: () => void) => {
          queueMicrotask(callback);
        }),
      };
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-runtime-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-runtime-port-scan");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "runtime-port-scan-project",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const repository = new ProjectRepository(db);
    const service = new RuntimeService(repository, new LogService());
    await service.startProject("runtime-port-scan-project");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[1]?.[1]).toContain("43001");
    const updated = repository.getProject("runtime-port-scan-project");
    expect(updated?.runtimePort).toBe(43001);
    expect(updated?.previewUrl).toBe("http://127.0.0.1:43001");
  });
});
