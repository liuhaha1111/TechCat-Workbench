import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDatabase } from "../../../server/db/client";
import { applyProjectMigrations } from "../../../server/db/migrations";

describe("applyProjectMigrations", () => {
  it("adds local runtime columns to a legacy projects table", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        status TEXT NOT NULL,
        package_manager TEXT,
        framework TEXT,
        container_name TEXT,
        container_port INTEGER,
        preview_url TEXT,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    applyProjectMigrations(db);

    const columns = db
      .prepare("PRAGMA table_info(projects)")
      .all() as Array<{ name: string }>;

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "deployment_root_path",
        "runtime_pid",
        "runtime_port",
        "project_type",
        "framework_id",
        "framework_label",
        "preview_mode",
      ])
    );
  });

  it("migrates an existing legacy on-disk database via createDatabase", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-db-migrate-"));
    const dbPath = path.join(tempDir, "legacy.db");

    try {
      const legacyDb = new Database(dbPath);
      legacyDb.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          source_type TEXT NOT NULL,
          workspace_path TEXT NOT NULL,
          status TEXT NOT NULL,
          package_manager TEXT,
          framework TEXT,
          container_name TEXT,
          container_port INTEGER,
          preview_url TEXT,
          warnings_json TEXT NOT NULL DEFAULT '[]',
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      legacyDb
        .prepare(
          `
            INSERT INTO projects (
              id, name, source_type, workspace_path, status,
              package_manager, framework, container_name, container_port, preview_url,
              warnings_json, last_error, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          "legacy-1",
          "legacy-project",
          "zip",
          "D:\\legacy\\project",
          "stopped",
          "npm",
          "Vite",
          null,
          null,
          null,
          "[]",
          null,
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z"
        );
      legacyDb.close();

      const migratedDb = createDatabase(dbPath);
      let columns: Array<{ name: string }>;
      let row:
        | {
            id: string;
            name: string;
            project_type: string | null;
            framework_id: string | null;
            framework_label: string | null;
            preview_mode: string | null;
          }
        | undefined;

      try {
        columns = migratedDb
          .prepare("PRAGMA table_info(projects)")
          .all() as Array<{ name: string }>;
        row = migratedDb
          .prepare(
            `
              SELECT
                id,
                name,
                project_type,
                framework_id,
                framework_label,
                preview_mode
              FROM projects
              WHERE id = ?
            `
          )
          .get("legacy-1") as
          | {
              id: string;
              name: string;
              project_type: string | null;
              framework_id: string | null;
              framework_label: string | null;
              preview_mode: string | null;
            }
          | undefined;
      } finally {
        migratedDb.close();
      }

      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "deployment_root_path",
          "runtime_pid",
          "runtime_port",
          "project_type",
          "framework_id",
          "framework_label",
          "preview_mode",
        ])
      );
      expect(row).toEqual({
        id: "legacy-1",
        name: "legacy-project",
        project_type: null,
        framework_id: null,
        framework_label: null,
        preview_mode: null,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
