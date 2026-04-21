import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSchemaSql } from "../../../server/db/schema";
import { ProjectRepository } from "../../../server/infrastructure/projectRepository";

function insertProject(
  db: Database.Database,
  values: {
    id: string;
    updatedAt: string;
  }
) {
  db.prepare(
    `
      INSERT INTO projects (
        id, name, source_type, workspace_path, deployment_root_path, status,
        package_manager, framework, container_name, container_port,
        runtime_pid, runtime_port, preview_url,
        warnings_json, last_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, '[]', NULL, ?, ?)
    `
  ).run(
    values.id,
    values.id,
    "folder",
    `C:/workspace/${values.id}`,
    "C:/deploy-root",
    "stopped",
    "npm",
    "React + Vite",
    values.updatedAt,
    values.updatedAt
  );
}

describe("ProjectRepository", () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it("lists projects ordered by updated_at desc", () => {
    db = new Database(":memory:");
    db.exec(createSchemaSql());
    insertProject(db, { id: "older-project", updatedAt: "2026-04-01T12:00:00.000Z" });
    insertProject(db, { id: "newer-project", updatedAt: "2026-04-02T12:00:00.000Z" });

    const repository = new ProjectRepository(db);
    const projects = repository.listProjects();

    expect(projects.map((project) => project.id)).toEqual([
      "newer-project",
      "older-project",
    ]);
    expect(projects[0]).toMatchObject({
      projectType: null,
      frameworkId: null,
      frameworkLabel: null,
      previewMode: null,
    });
  });

  it("stores adapter metadata updates and returns them on read", () => {
    db = new Database(":memory:");
    db.exec(createSchemaSql());

    const repository = new ProjectRepository(db);
    repository.createProject({
      id: "adapter-project",
      name: "adapter-project",
      sourceType: "folder",
      workspacePath: "C:/workspace/adapter-project",
      deploymentRootPath: "C:/deploy-root",
      status: "stopped",
      createdAt: "2026-04-17T00:00:00.000Z",
    });

    repository.updateProject(
      "adapter-project",
      {
        framework: "React + Vite",
        projectType: "vite",
        frameworkId: "react-vite",
        frameworkLabel: "React + Vite",
        previewMode: "embedded",
      } as unknown as Parameters<ProjectRepository["updateProject"]>[1]
    );

    expect(repository.getProject("adapter-project")).toMatchObject({
      framework: "React + Vite",
      projectType: "vite",
      frameworkId: "react-vite",
      frameworkLabel: "React + Vite",
      previewMode: "embedded",
    });
  });
});
