import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { applyProjectMigrations } from "./migrations";
import { createSchemaSql } from "./schema";

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath =
    dbPath ?? path.resolve(process.cwd(), ".sandbox", "workbench.db");
  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.exec(createSchemaSql());
  applyProjectMigrations(db);
  return db;
}
