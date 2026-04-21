export function createSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      deployment_root_path TEXT,
      status TEXT NOT NULL,
      package_manager TEXT,
      framework TEXT,
      project_type TEXT,
      framework_id TEXT,
      framework_label TEXT,
      preview_mode TEXT,
      container_name TEXT,
      container_port INTEGER,
      runtime_pid INTEGER,
      runtime_port INTEGER,
      preview_url TEXT,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      stream TEXT NOT NULL,
      line TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_logs_project_id_id
      ON project_logs(project_id, id);
  `;
}
