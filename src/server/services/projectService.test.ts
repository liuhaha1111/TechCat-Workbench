import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../../server/db/client";
import { ProjectRepository } from "../../../server/infrastructure/projectRepository";
import type { ProjectRuntimeController } from "../../../server/infrastructure/runtimeService";
import { getMetadataMarkerPath } from "../../../server/lib/localRuntime";
import { LogStreamService } from "../../../server/services/logStream";
import { ProjectService } from "../../../server/services/projectService";

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

let nextPid = 4100;

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

requestMock.mockImplementation(() => createMockHttpRequest());
execFileMock.mockImplementation(
  (_file: string, _args: string[], callback: (error: Error | null) => void) => {
    queueMicrotask(() => callback(null));
  }
);
createServerMock.mockImplementation(() => {
  const handlers = new Map<string, () => void>();
  return {
    once: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler);
    }),
    listen: vi.fn((_port: number, _host: string, callback: () => void) => {
      queueMicrotask(callback);
    }),
    close: vi.fn((callback: () => void) => {
      queueMicrotask(callback);
    }),
  };
});

function createViteWorkspace(workspacePath: string, packageManager: "npm" | "pnpm" = "npm") {
  mkdirSync(path.join(workspacePath, "src"), { recursive: true });
  writeFileSync(path.join(workspacePath, "package.json"), '{"name":"demo"}');
  writeFileSync(path.join(workspacePath, "index.html"), "<!doctype html>");
  writeFileSync(
    path.join(workspacePath, "src", "main.tsx"),
    'import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; ReactDOM.createRoot(document.getElementById("root")!).render(<App />);'
  );
  writeFileSync(path.join(workspacePath, "src", "App.tsx"), "export default function App() { return <div>ok</div>; }");

  if (packageManager === "pnpm") {
    writeFileSync(path.join(workspacePath, "pnpm-lock.yaml"), "lockfileVersion: 9");
  }
}

function createUploadedFiles(entries: Array<[string, string]>) {
  return entries.map(([relativePath, contents]) => ({
    relativePath,
    buffer: Buffer.from(contents),
  }));
}

function createNextWorkspace(workspacePath: string) {
  mkdirSync(path.join(workspacePath, "app"), { recursive: true });
  writeFileSync(path.join(workspacePath, "package.json"), '{"name":"next-demo"}');
  writeFileSync(path.join(workspacePath, "next.config.mjs"), "export default {};");
  writeFileSync(path.join(workspacePath, "app", "page.tsx"), "export default function Page() { return null; }");
}

function writeManagedMarker(
  workspacePath: string,
  projectId: string,
  deploymentRootPath: string
) {
  writeFileSync(
    getMetadataMarkerPath(workspacePath),
    JSON.stringify(
      {
        projectId,
        deploymentRootPath,
        workspacePath,
      },
      null,
      2
    )
  );
}

function insertProject(
  db: ReturnType<typeof createDatabase>,
  options: {
    id: string;
    workspacePath: string;
    deploymentRootPath: string;
    status?: string;
    packageManager?: string | null;
    framework?: string | null;
    projectType?: string | null;
    frameworkId?: string | null;
    frameworkLabel?: string | null;
    previewMode?: string | null;
    runtimePid?: number | null;
    runtimePort?: number | null;
    previewUrl?: string | null;
  }
) {
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO projects (
        id, name, source_type, workspace_path, deployment_root_path, status,
        package_manager, framework, project_type, framework_id, framework_label,
        preview_mode, container_name, container_port,
        runtime_pid, runtime_port, preview_url,
        warnings_json, last_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, '[]', NULL, ?, ?)
    `
  ).run(
    options.id,
    "sample",
    "zip",
    options.workspacePath,
    options.deploymentRootPath,
    options.status ?? "stopped",
    options.packageManager === undefined ? "npm" : options.packageManager,
    options.framework === undefined ? "React + Vite" : options.framework,
    options.projectType === undefined ? "vite" : options.projectType,
    options.frameworkId === undefined ? "react-vite" : options.frameworkId,
    options.frameworkLabel === undefined ? "React + Vite" : options.frameworkLabel,
    options.previewMode === undefined ? "embedded" : options.previewMode,
    options.runtimePid ?? null,
    options.runtimePort ?? null,
    options.previewUrl ?? null,
    now,
    now
  );
}

describe("ProjectService", () => {
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
      const handlers = new Map<string, () => void>();
      return {
        once: vi.fn((event: string, handler: () => void) => {
          handlers.set(event, handler);
        }),
        listen: vi.fn((_port: number, _host: string, callback: () => void) => {
          queueMicrotask(callback);
        }),
        close: vi.fn((callback: () => void) => {
          queueMicrotask(callback);
        }),
      };
    });
    vi.useRealTimers();
    if (db) {
      try {
        db.close();
      } catch {
        // Best effort close for Windows file handle behavior in tests.
      }
      db = null;
    }
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Temp folder can still be in use on Windows during teardown.
      }
      tempDir = null;
    }
  });

  it("imports a folder into a managed child directory under the deployment root", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      args[0] === "install"
        ? createMockProcess({ autoExit: true })
        : createMockProcess()
    );

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });
    db = createDatabase(dbPath);

    const service = new ProjectService(db, new LogStreamService());
    const project = await service.importFolderProject(
      "Demo App",
      createUploadedFiles([
        ["package.json", '{"name":"demo"}'],
        ["index.html", "<!doctype html>"],
        [
          "src/main.tsx",
          'import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; ReactDOM.createRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/App.tsx", "export default function App() { return <div>ok</div>; }"],
      ]),
      deploymentRoot
    );

    const markerPath = getMetadataMarkerPath(project.workspacePath);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
      projectId: string;
      deploymentRootPath: string;
    };

    expect(project.deploymentRootPath).toBe(deploymentRoot);
    expect(project.workspacePath.startsWith(deploymentRoot)).toBe(true);
    expect(existsSync(path.join(project.workspacePath, "src", "main.tsx"))).toBe(true);
    expect(existsSync(markerPath)).toBe(true);
    expect(marker.projectId).toBe(project.id);
    expect(marker.deploymentRootPath).toBe(deploymentRoot);
  });

  it("stores adapter metadata when importing supported frontend adapters", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });
    db = createDatabase(dbPath);

    const runtimeService: ProjectRuntimeController = {
      startProject: vi.fn().mockResolvedValue(undefined),
      stopProject: vi.fn().mockResolvedValue(undefined),
      restartProject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProjectService(
      db,
      new LogStreamService(),
      undefined,
      runtimeService
    );

    const cases = [
      {
        name: "React Demo",
        files: createUploadedFiles([
          ["package.json", '{"name":"react-demo"}'],
          ["index.html", "<!doctype html>"],
          [
            "src/main.tsx",
            'import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; ReactDOM.createRoot(document.getElementById("root")!).render(<App />);',
          ],
          ["src/App.tsx", "export default function App() { return <div>React</div>; }"],
        ]),
        expected: {
          packageManager: "npm",
          framework: "React + Vite",
          projectType: "vite",
          frameworkId: "react-vite",
          frameworkLabel: "React + Vite",
          previewMode: "embedded",
        },
      },
      {
        name: "Vue Demo",
        files: createUploadedFiles([
          ["package.json", '{"name":"vue-demo"}'],
          ["index.html", "<!doctype html>"],
          ["vite.config.ts", "export default {};"],
          ["src/main.ts", "console.log('vue');"],
          ["src/App.vue", "<template><div>Vue</div></template>"],
        ]),
        expected: {
          packageManager: "npm",
          framework: "Vue + Vite",
          projectType: "vite",
          frameworkId: "vue-vite",
          frameworkLabel: "Vue + Vite",
          previewMode: "embedded",
        },
      },
      {
        name: "Svelte Demo",
        files: createUploadedFiles([
          ["package.json", '{"name":"svelte-demo"}'],
          ["index.html", "<!doctype html>"],
          ["vite.config.ts", "export default {};"],
          ["src/main.ts", "console.log('svelte');"],
          ["src/App.svelte", "<script></script><div>Svelte</div>"],
        ]),
        expected: {
          packageManager: "npm",
          framework: "Svelte + Vite",
          projectType: "vite",
          frameworkId: "svelte-vite",
          frameworkLabel: "Svelte + Vite",
          previewMode: "embedded",
        },
      },
      {
        name: "Solid Demo",
        files: createUploadedFiles([
          ["package.json", '{"name":"solid-demo"}'],
          ["index.html", "<!doctype html>"],
          ["vite.config.ts", "export default {};"],
          ["src/index.tsx", "export default function App() { return <div>Solid</div>; }"],
          ["src/index.css", "body { margin: 0; }"],
        ]),
        expected: {
          packageManager: "npm",
          framework: "Solid + Vite",
          projectType: "vite",
          frameworkId: "solid-vite",
          frameworkLabel: "Solid + Vite",
          previewMode: "embedded",
        },
      },
      {
        name: "Astro Demo",
        files: createUploadedFiles([
          ["package.json", '{"name":"astro-demo"}'],
          ["astro.config.mjs", "export default {};"],
          ["src/pages/index.astro", "---\n---\n<html><body>Astro</body></html>"],
        ]),
        expected: {
          packageManager: "npm",
          framework: "Astro",
          projectType: "astro",
          frameworkId: "astro",
          frameworkLabel: "Astro",
          previewMode: "embedded",
        },
      },
      {
        name: "Next Demo",
        files: createUploadedFiles([
          ["package.json", '{"name":"next-demo"}'],
          ["next.config.mjs", "export default {};"],
          ["next-env.d.ts", "/// <reference types=\"next\" />"],
          ["app/page.tsx", "export default function Page() { return <div>Next</div>; }"],
        ]),
        expected: {
          packageManager: "npm",
          framework: "Next.js",
          projectType: "next",
          frameworkId: "next",
          frameworkLabel: "Next.js",
          previewMode: "external",
        },
      },
      {
        name: "Static Demo",
        files: createUploadedFiles([
          ["index.html", "<!doctype html><html><body>Static</body></html>"],
          ["styles.css", "body { color: black; }"],
        ]),
        expected: {
          packageManager: null,
          framework: "Static HTML",
          projectType: "static",
          frameworkId: "static-html",
          frameworkLabel: "Static HTML",
          previewMode: "embedded",
        },
      },
    ];

    for (const testCase of cases) {
      const project = await service.importFolderProject(
        testCase.name,
        testCase.files,
        deploymentRoot
      );

      expect(project).toMatchObject(testCase.expected);
    }
  });

  it("marks imported projects as error when background local startup rejects", async () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });
    db = createDatabase(dbPath);

    const repository = new ProjectRepository(db);
    const runtimeService: ProjectRuntimeController = {
      startProject: vi.fn().mockRejectedValueOnce(new Error("background start failed")),
      stopProject: vi.fn().mockResolvedValue(undefined),
      restartProject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProjectService(
      repository,
      new LogStreamService(),
      undefined,
      runtimeService
    );

    const project = await service.importFolderProject(
      "Demo App",
      createUploadedFiles([
        ["package.json", '{"name":"demo"}'],
        ["index.html", "<!doctype html>"],
        [
          "src/main.tsx",
          'import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; ReactDOM.createRoot(document.getElementById("root")!).render(<App />);',
        ],
        ["src/App.tsx", "export default function App() { return <div>ok</div>; }"],
      ]),
      deploymentRoot
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    const updated = service.getProject(project.id);
    const logs = service.getProjectLogs(project.id);
    expect(updated?.status).toBe("error");
    expect(updated?.lastError).toBe(
      "Failed to start local runtime after import: background start failed"
    );
    expect(logs).toContain(
      "Failed to start local runtime after import: background start failed"
    );
  });

  it("imports a next.js project and records the framework", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });
    db = createDatabase(dbPath);

    const repository = new ProjectRepository(db);
    const runtimeService: ProjectRuntimeController = {
      startProject: vi.fn().mockResolvedValue(undefined),
      stopProject: vi.fn().mockResolvedValue(undefined),
      restartProject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProjectService(
      repository,
      new LogStreamService(),
      undefined,
      runtimeService
    );

    const project = await service.importFolderProject(
      "Next App",
      [
        { relativePath: "package.json", buffer: Buffer.from('{"name":"next-demo"}') },
        { relativePath: "next.config.mjs", buffer: Buffer.from("export default {};") },
        { relativePath: "app/page.tsx", buffer: Buffer.from("export default function Page() { return null; }") },
      ],
      deploymentRoot
    );

    const updated = service.getProject(project.id);
    expect(updated?.framework).toBe("Next.js");
    expect(updated?.packageManager).toBe("npm");
    expect(updated?.status).toBe("installing");
  });

  it("imports a static html project without package.json", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });
    db = createDatabase(dbPath);

    const repository = new ProjectRepository(db);
    const runtimeService: ProjectRuntimeController = {
      startProject: vi.fn().mockResolvedValue(undefined),
      stopProject: vi.fn().mockResolvedValue(undefined),
      restartProject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProjectService(
      repository,
      new LogStreamService(),
      undefined,
      runtimeService
    );

    const project = await service.importFolderProject(
      "Static App",
      [
        { relativePath: "index.html", buffer: Buffer.from("<!doctype html>") },
        { relativePath: "app.js", buffer: Buffer.from("console.log('static');") },
      ],
      deploymentRoot
    );

    const updated = service.getProject(project.id);
    expect(updated?.framework).toBe("Static HTML");
    expect(updated?.packageManager).toBeNull();
    expect(updated?.status).toBe("installing");
  });

  it("marks projects as error when the install process cannot start", async () => {
    spawnMock.mockImplementation(() => {
      throw new Error("spawn install failed");
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-install-spawn");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "13345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());

    await expect(service.startProject("13345678-aaaa-bbbb-cccc-ddddeeeeffff")).rejects.toThrow(
      "spawn install failed"
    );

    const updated = service.getProject("13345678-aaaa-bbbb-cccc-ddddeeeeffff");
    const logs = service.getProjectLogs("13345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(updated?.status).toBe("error");
    expect(updated?.lastError).toBe("Install process failed to start: spawn install failed");
    expect(logs).toContain("Install process failed to start: spawn install failed");
  });

  it("marks projects as error when runtime preparation rejects after install", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 5101 });
      }

      return createMockProcess({ pid: 5102 });
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-runtime-reject");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "14345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const logStream = new LogStreamService();
    const repository = new ProjectRepository(db);
    const runtimeService: ProjectRuntimeController = {
      startProject: vi.fn().mockImplementationOnce(async (projectId: string) => {
        const createdAt = new Date().toISOString();
        repository.updateProject(projectId, {
          status: "error",
          runtimePid: null,
          runtimePort: null,
          previewUrl: null,
          lastError: "Failed to prepare local runtime: port scan failed",
          updatedAt: createdAt,
        });
        repository.appendLog({
          projectId,
          stream: "system",
          line: "Failed to prepare local runtime: port scan failed",
          createdAt,
        });
        throw new Error("port scan failed");
      }),
      stopProject: vi.fn().mockResolvedValue(undefined),
      restartProject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProjectService(repository, logStream, undefined, runtimeService);

    await expect(service.startProject("14345678-aaaa-bbbb-cccc-ddddeeeeffff")).rejects.toThrow(
      "port scan failed"
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updated = service.getProject("14345678-aaaa-bbbb-cccc-ddddeeeeffff");
    const logs = service.getProjectLogs("14345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(updated?.status).toBe("error");
    expect(updated?.lastError).toBe("Failed to prepare local runtime: port scan failed");
    expect(logs).toContain("Failed to prepare local runtime: port scan failed");
  });

  it("clears runtime metadata when the local process exits with error", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 5101 });
      }

      const proc = createMockProcess({ pid: 5102 });
      queueMicrotask(() => {
        proc.emit("exit", 1, null);
      });
      return proc;
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-runtime");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "22345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());
    await service.startProject("22345678-aaaa-bbbb-cccc-ddddeeeeffff");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const updated = service.getProject("22345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(updated?.status).toBe("error");
    expect(updated?.runtimePid).toBeNull();
    expect(updated?.runtimePort).toBeNull();
    expect(updated?.previewUrl).toBeNull();
  });

  it("keeps the project in error after a health-check timeout shuts down the runtime", async () => {
    vi.useFakeTimers();

    requestMock.mockImplementation(() => createMockHttpRequest());

    let runtimeProcess: MockProcess | null = null;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 5201 });
      }

      runtimeProcess = createMockProcess({ pid: 5202 });
      return runtimeProcess;
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-timeout");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "32345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());
    await service.startProject("32345678-aaaa-bbbb-cccc-ddddeeeeffff");
    await Promise.resolve();
    await vi.runAllTimersAsync();

    const updated = service.getProject("32345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(runtimeProcess?.kill).toHaveBeenCalledWith("SIGTERM");
    expect(updated?.status).toBe("error");
    expect(updated?.lastError).toBe("Dev server health check timed out");
    expect(updated?.runtimePid).toBeNull();
    expect(updated?.runtimePort).toBeNull();
    expect(updated?.previewUrl).toBeNull();
  });

  it("hydrates missing adapter metadata from workspace on start", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      args[0] === "install"
        ? createMockProcess({ autoExit: true })
        : createMockProcess()
    );

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-hydrate");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath, "pnpm");
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "42345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
      status: "error",
      packageManager: null,
      framework: null,
      projectType: null,
      frameworkId: null,
      frameworkLabel: null,
      previewMode: null,
    });

    const service = new ProjectService(db, new LogStreamService());
    await service.startProject("42345678-aaaa-bbbb-cccc-ddddeeeeffff");

    const updated = service.getProject("42345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(updated?.packageManager).toBe("pnpm");
    expect(updated?.framework).toBe("React + Vite");
    expect(updated?.projectType).toBe("vite");
    expect(updated?.frameworkId).toBe("react-vite");
    expect(updated?.frameworkLabel).toBe("React + Vite");
    expect(updated?.previewMode).toBe("embedded");
  });

  it("hydrates next.js metadata from workspace on start", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-next-hydrate");
    mkdirSync(workspacePath, { recursive: true });
    createNextWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "43345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
      status: "error",
      packageManager: null,
      framework: null,
    });

    const runtimeService: ProjectRuntimeController = {
      startProject: vi.fn().mockResolvedValue(undefined),
      stopProject: vi.fn().mockResolvedValue(undefined),
      restartProject: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ProjectService(db, new LogStreamService(), undefined, runtimeService);
    await service.startProject("43345678-aaaa-bbbb-cccc-ddddeeeeffff");

    const updated = service.getProject("43345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(updated?.packageManager).toBe("npm");
    expect(updated?.framework).toBe("Next.js");
  });

  it("rejects restart for legacy docker-runtime projects", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 6201 });
      }
      return createMockProcess({ pid: 6202 });
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const workspacePath = path.join(tempDir, "legacy-workspace");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);

    const now = new Date().toISOString();
    db.prepare(
      `
        INSERT INTO projects (
          id, name, source_type, workspace_path, deployment_root_path, status,
          package_manager, framework, container_name, container_port,
          runtime_pid, runtime_port, preview_url,
          warnings_json, last_error, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, '[]', NULL, ?, ?)
      `
    ).run(
      "legacy-restart-project",
      "legacy-project",
      "zip",
      workspacePath,
      "stopped",
      "npm",
      "React + Vite",
      now,
      now
    );

    const service = new ProjectService(db, new LogStreamService());

    await expect(service.restartProject("legacy-restart-project")).rejects.toThrow(
      "This project was created with the old Docker runtime. Re-import it to use local deployment."
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("deletes project row, logs, and managed workspace only", async () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-delete");
    mkdirSync(workspacePath, { recursive: true });
    writeManagedMarker(
      workspacePath,
      "52345678-aaaa-bbbb-cccc-ddddeeeeffff",
      deploymentRoot
    );
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "52345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    db.prepare(
      `
        INSERT INTO project_logs (project_id, stream, line, created_at)
        VALUES (?, ?, ?, ?)
      `
    ).run(
      "52345678-aaaa-bbbb-cccc-ddddeeeeffff",
      "system",
      "test-log",
      new Date().toISOString()
    );

    const service = new ProjectService(db, new LogStreamService());
    await expect(service.deleteProject("52345678-aaaa-bbbb-cccc-ddddeeeeffff")).resolves.toEqual({
      id: "52345678-aaaa-bbbb-cccc-ddddeeeeffff",
    });
    expect(service.getProject("52345678-aaaa-bbbb-cccc-ddddeeeeffff")).toBeNull();
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(deploymentRoot)).toBe(true);

    const logCount = db
      .prepare("SELECT COUNT(*) as c FROM project_logs WHERE project_id = ?")
      .get("52345678-aaaa-bbbb-cccc-ddddeeeeffff") as { c: number };
    expect(logCount.c).toBe(0);
  });

  it("refuses delete when managed marker workspace path does not match", async () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-mismatch");
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(
      getMetadataMarkerPath(workspacePath),
      JSON.stringify(
        {
          projectId: "72345678-aaaa-bbbb-cccc-ddddeeeeffff",
          deploymentRootPath: deploymentRoot,
          workspacePath: path.join(deploymentRoot, "different-workspace"),
        },
        null,
        2
      )
    );
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "72345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());

    await expect(
      service.deleteProject("72345678-aaaa-bbbb-cccc-ddddeeeeffff")
    ).rejects.toThrow("Refusing to delete workspace with mismatched managed marker");
    expect(existsSync(workspacePath)).toBe(true);
  });

  it("deletes stale project rows when the managed workspace is already gone", async () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-missing");
    mkdirSync(deploymentRoot, { recursive: true });
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "82345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    db.prepare(
      `
        INSERT INTO project_logs (project_id, stream, line, created_at)
        VALUES (?, ?, ?, ?)
      `
    ).run(
      "82345678-aaaa-bbbb-cccc-ddddeeeeffff",
      "system",
      "stale-project-log",
      new Date().toISOString()
    );

    const service = new ProjectService(db, new LogStreamService());

    await expect(service.deleteProject("82345678-aaaa-bbbb-cccc-ddddeeeeffff")).resolves.toEqual({
      id: "82345678-aaaa-bbbb-cccc-ddddeeeeffff",
    });
    expect(service.getProject("82345678-aaaa-bbbb-cccc-ddddeeeeffff")).toBeNull();
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(deploymentRoot)).toBe(true);

    const logCount = db
      .prepare("SELECT COUNT(*) as c FROM project_logs WHERE project_id = ?")
      .get("82345678-aaaa-bbbb-cccc-ddddeeeeffff") as { c: number };
    expect(logCount.c).toBe(0);
  });

  it("stops a running local process before delete", async () => {
    let runtimeProcess: MockProcess | null = null;
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true, exitCode: 0, pid: 6101 });
      }

      runtimeProcess = createMockProcess({ pid: 6102 });
      return runtimeProcess;
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-running");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    writeManagedMarker(
      workspacePath,
      "62345678-aaaa-bbbb-cccc-ddddeeeeffff",
      deploymentRoot
    );
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "62345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());
    await service.startProject("62345678-aaaa-bbbb-cccc-ddddeeeeffff");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await service.deleteProject("62345678-aaaa-bbbb-cccc-ddddeeeeffff");

    if (process.platform === "win32") {
      expect(execFileMock).toHaveBeenCalledWith(
        "taskkill",
        ["/PID", "6102", "/T", "/F"],
        expect.any(Function)
      );
    } else {
      expect(runtimeProcess?.kill).toHaveBeenCalled();
    }
    expect(existsSync(workspacePath)).toBe(false);
  });
  it("marks stale installing projects as error with restart guidance", () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-stale-install");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "82345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
      status: "installing",
    });

    const service = new ProjectService(db, new LogStreamService());
    const updated = service.getProject("82345678-aaaa-bbbb-cccc-ddddeeeeffff");
    const logs = service.getProjectLogs("82345678-aaaa-bbbb-cccc-ddddeeeeffff");

    expect(updated?.status).toBe("error");
    expect(updated?.lastError).toBe(
      "Local runtime was interrupted by server restart while installing. Start the project again."
    );
    expect(logs).toContain(
      "Local runtime was interrupted by server restart while installing. Start the project again."
    );
  });

  it("logs the local install command before spawning it", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      args[0] === "install"
        ? createMockProcess({ autoExit: true })
        : createMockProcess()
    );

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-command-log");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "92345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());
    await service.startProject("92345678-aaaa-bbbb-cccc-ddddeeeeffff");

    const logs = service.getProjectLogs("92345678-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(logs).toContain("Running local install command: npm install");
  });

  it("uses platform-safe spawn options for local runtime commands", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) =>
      args[0] === "install"
        ? createMockProcess({ autoExit: true })
        : createMockProcess()
    );

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePath = path.join(deploymentRoot, "sample-spawn-options");
    mkdirSync(workspacePath, { recursive: true });
    createViteWorkspace(workspacePath);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "a2345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());
    await service.startProject("a2345678-aaaa-bbbb-cccc-ddddeeeeffff");

    expect(spawnMock).toHaveBeenCalledWith(
      "npm.cmd",
      ["install"],
      expect.objectContaining({
        cwd: workspacePath,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
  });

  it("assigns distinct runtime ports when projects start concurrently", async () => {
    spawnMock.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "install") {
        return createMockProcess({ autoExit: true });
      }

      return createMockProcess();
    });

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-project-service-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    const workspacePathOne = path.join(deploymentRoot, "sample-one");
    const workspacePathTwo = path.join(deploymentRoot, "sample-two");
    mkdirSync(workspacePathOne, { recursive: true });
    mkdirSync(workspacePathTwo, { recursive: true });
    createViteWorkspace(workspacePathOne);
    createViteWorkspace(workspacePathTwo);
    db = createDatabase(dbPath);
    insertProject(db, {
      id: "b2345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath: workspacePathOne,
      deploymentRootPath: deploymentRoot,
    });
    insertProject(db, {
      id: "c2345678-aaaa-bbbb-cccc-ddddeeeeffff",
      workspacePath: workspacePathTwo,
      deploymentRootPath: deploymentRoot,
    });

    const service = new ProjectService(db, new LogStreamService());
    await Promise.all([
      service.startProject("b2345678-aaaa-bbbb-cccc-ddddeeeeffff"),
      service.startProject("c2345678-aaaa-bbbb-cccc-ddddeeeeffff"),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const first = service.getProject("b2345678-aaaa-bbbb-cccc-ddddeeeeffff");
    const second = service.getProject("c2345678-aaaa-bbbb-cccc-ddddeeeeffff");
    const runtimePorts = [first?.runtimePort, second?.runtimePort].sort();
    const previewUrls = [first?.previewUrl, second?.previewUrl].sort();

    expect(runtimePorts).toEqual([43000, 43001]);
    expect(previewUrls).toEqual([
      "http://127.0.0.1:43000",
      "http://127.0.0.1:43001",
    ]);
  });
});
