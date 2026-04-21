import type Database from "better-sqlite3";

function getProjectColumnNames(db: Database.Database): Set<string> {
  const columns = db
    .prepare("PRAGMA table_info(projects)")
    .all() as Array<{ name: string }>;
  return new Set(columns.map((column) => column.name));
}

export function applyProjectMigrations(db: Database.Database): void {
  const names = getProjectColumnNames(db);

  if (!names.has("deployment_root_path")) {
    db.exec("ALTER TABLE projects ADD COLUMN deployment_root_path TEXT");
  }
  if (!names.has("runtime_pid")) {
    db.exec("ALTER TABLE projects ADD COLUMN runtime_pid INTEGER");
  }
  if (!names.has("runtime_port")) {
    db.exec("ALTER TABLE projects ADD COLUMN runtime_port INTEGER");
  }
  if (!names.has("project_type")) {
    db.exec("ALTER TABLE projects ADD COLUMN project_type TEXT");
  }
  if (!names.has("framework_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN framework_id TEXT");
  }
  if (!names.has("framework_label")) {
    db.exec("ALTER TABLE projects ADD COLUMN framework_label TEXT");
  }
  if (!names.has("preview_mode")) {
    db.exec("ALTER TABLE projects ADD COLUMN preview_mode TEXT");
  }
}
