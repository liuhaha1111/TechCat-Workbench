import AdmZip from "adm-zip";
import request from "supertest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock, execFileMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

import { createApp } from "../../../server/index";
import { createDatabase } from "../../../server/db/client";
import { decodeMultipartText } from "../../../server/routes/projects";

function createMockProcess() {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 7001,
  };
}

execFileMock.mockImplementation(
  (_file: string, _args: string[], callback: (error: Error | null) => void) => {
    queueMicrotask(() => callback(null));
  }
);

function createViteZipBuffer(): Buffer {
  const zip = new AdmZip();
  zip.addFile("package.json", Buffer.from('{"name":"demo","scripts":{"dev":"vite"}}'));
  zip.addFile("index.html", Buffer.from("<!doctype html>"));
  zip.addFile("src/main.ts", Buffer.from("console.log('ok');"));
  return zip.toBuffer();
}

describe("projects routes", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    spawnMock.mockReset();
    execFileMock.mockReset();
    execFileMock.mockImplementation(
      (_file: string, _args: string[], callback: (error: Error | null) => void) => {
        queueMicrotask(() => callback(null));
      }
    );
    delete process.env.AI_WORKBENCH_DB_PATH;
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // App-level DB handle may still be open during test teardown on Windows.
      }
      tempDir = null;
    }
  });

  it("returns projects list", async () => {
    const app = createApp();
    const response = await request(app).get("/api/projects");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.projects)).toBe(true);
  });

  it("reconciles stale ready project to stopped on startup", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-test-"));
    const dbPath = path.join(tempDir, "workbench.db");

    const db = createDatabase(dbPath);
    const now = new Date().toISOString();
    db.prepare(
      `
        INSERT INTO projects (
          id, name, source_type, workspace_path, status,
          package_manager, framework, container_name, container_port, preview_url,
          warnings_json, last_error, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      "stale-ready-project",
      "stale.zip",
      "zip",
      "D:\\sandbox\\projects\\stale-ready-project",
      "ready",
      "npm",
      "React + Vite",
      "aiwb-stale-ready",
      43000,
      "http://127.0.0.1:43000",
      "[]",
      null,
      now,
      now
    );
    db.close();

    process.env.AI_WORKBENCH_DB_PATH = dbPath;
    const app = createApp();
    const response = await request(app).get("/api/projects");

    expect(response.status).toBe(200);
    const stale = response.body.projects.find(
      (project: { id: string }) => project.id === "stale-ready-project"
    );

    expect(stale).toBeDefined();
    expect(stale.status).toBe("stopped");
    expect(stale.previewUrl).toBeNull();
    expect(stale.containerName).toBeNull();
    expect(stale.containerPort).toBeNull();
  });

  it("rejects folder import when deploymentRootPath is missing", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-folder")
      .field("name", "demo")
      .attach("files", Buffer.from('{"name":"demo"}'), "package.json")
      .attach("files", Buffer.from("<!doctype html>"), "index.html")
      .attach("files", Buffer.from("console.log('ok');"), "src/main.ts");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("deploymentRootPath");
  });

  it("rejects folder import when deploymentRootPath is relative", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-folder")
      .field("deploymentRootPath", "relative\\deploy")
      .field("name", "demo")
      .attach("files", Buffer.from('{"name":"demo"}'), "package.json")
      .attach("files", Buffer.from("<!doctype html>"), "index.html")
      .attach("files", Buffer.from("console.log('ok');"), "src/main.ts");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("absolute path");
  });

  it("rejects folder import when deploymentRootPath does not exist", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-test-"));
    const missingRoot = path.join(tempDir, "missing-root");

    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-folder")
      .field("deploymentRootPath", missingRoot)
      .field("name", "demo")
      .attach("files", Buffer.from('{"name":"demo"}'), "package.json")
      .attach("files", Buffer.from("<!doctype html>"), "index.html")
      .attach("files", Buffer.from("console.log('ok');"), "src/main.ts");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("must exist and be a directory");
  });

  it("rejects folder import when deploymentRootPath is not a directory", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-test-"));
    const filePath = path.join(tempDir, "not-a-directory.txt");
    writeFileSync(filePath, "not a directory");

    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-folder")
      .field("deploymentRootPath", filePath)
      .field("name", "demo")
      .attach("files", Buffer.from('{"name":"demo"}'), "package.json")
      .attach("files", Buffer.from("<!doctype html>"), "index.html")
      .attach("files", Buffer.from("console.log('ok');"), "src/main.ts");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("must exist and be a directory");
  });

  it("returns deploymentRootPath on successful folder import", async () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-test-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });

    process.env.AI_WORKBENCH_DB_PATH = dbPath;
    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-folder")
      .field("deploymentRootPath", deploymentRoot)
      .field("name", "demo")
      .attach("files", Buffer.from('{"name":"demo"}'), "package.json")
      .attach("files", Buffer.from("<!doctype html>"), "index.html")
      .attach("files", Buffer.from("console.log('ok');"), "src/main.ts");

    expect(response.status).toBe(201);
    expect(response.body.project.deploymentRootPath).toBe(deploymentRoot);
    expect(response.body.project.workspacePath.startsWith(deploymentRoot)).toBe(true);
  });

  it("rejects zip import when deploymentRootPath is missing", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-zip")
      .field("name", "demo-zip")
      .attach("file", createViteZipBuffer(), "demo.zip");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("deploymentRootPath");
  });

  it("returns deploymentRootPath on successful zip import", async () => {
    spawnMock.mockImplementation(() => createMockProcess());

    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-test-"));
    const dbPath = path.join(tempDir, "workbench.db");
    const deploymentRoot = path.join(tempDir, "deploy-root");
    mkdirSync(deploymentRoot, { recursive: true });

    process.env.AI_WORKBENCH_DB_PATH = dbPath;
    const app = createApp();
    const response = await request(app)
      .post("/api/projects/import-zip")
      .field("deploymentRootPath", deploymentRoot)
      .field("name", "demo-zip")
      .attach("file", createViteZipBuffer(), "demo.zip");

    expect(response.status).toBe(201);
    expect(response.body.project.deploymentRootPath).toBe(deploymentRoot);
    expect(response.body.project.workspacePath.startsWith(deploymentRoot)).toBe(true);
  });

  it("decodes mojibake multipart text to utf8", () => {
    const mojibake = Buffer.from("娴嬭瘯椤圭洰", "utf8").toString("latin1");
    expect(decodeMultipartText(mojibake)).toBe("娴嬭瘯椤圭洰");
    expect(decodeMultipartText("normal-project")).toBe("normal-project");
  });

  it("decodes mojibake sample reported from browser upload", () => {
    const original = "\u4e2d\u6587\u9879\u76ee";
    const mojibake = Buffer.from(original, "utf8").toString("latin1");
    expect(decodeMultipartText(mojibake)).toBe(original);
  });

  it("decodes percent-encoded utf8 filename text", () => {
    expect(decodeMultipartText("%E6%B5%8B%E8%AF%95.zip")).toBe(
      "\u6d4b\u8bd5.zip"
    );
    expect(decodeMultipartText("UTF-8''%E4%B8%AD%E6%96%87.zip")).toBe(
      "\u4e2d\u6587.zip"
    );
  });

  it("returns 404 when deleting a missing project", async () => {
    const app = createApp();
    const response = await request(app).delete("/api/projects/not-found");

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("Project not found");
  });
});
