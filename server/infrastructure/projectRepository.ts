import type Database from "better-sqlite3";
import type {
  LogStream,
  PackageManager,
  PreviewMode,
  Project,
  ProjectStatus,
  ProjectType,
} from "../types";

type ProjectRow = {
  id: string;
  name: string;
  source_type: string;
  workspace_path: string;
  deployment_root_path: string | null;
  status: ProjectStatus;
  package_manager: PackageManager | null;
  framework: string | null;
  project_type: ProjectType | null;
  framework_id: string | null;
  framework_label: string | null;
  preview_mode: PreviewMode | null;
  container_name: string | null;
  container_port: number | null;
  runtime_pid: number | null;
  runtime_port: number | null;
  preview_url: string | null;
  warnings_json: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectUpdate = Partial<{
  status: ProjectStatus;
  packageManager: PackageManager | null;
  framework: string | null;
  projectType: ProjectType | null;
  frameworkId: string | null;
  frameworkLabel: string | null;
  previewMode: PreviewMode | null;
  containerName: string | null;
  containerPort: number | null;
  deploymentRootPath: string | null;
  runtimePid: number | null;
  runtimePort: number | null;
  previewUrl: string | null;
  warnings: string[];
  lastError: string | null;
  updatedAt: string;
}>;

export interface CreateProjectInput {
  id: string;
  name: string;
  sourceType: Project["sourceType"];
  workspacePath: string;
  deploymentRootPath: string;
  status: ProjectStatus;
  projectType?: ProjectType | null;
  frameworkId?: string | null;
  frameworkLabel?: string | null;
  previewMode?: PreviewMode | null;
  createdAt: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type as Project["sourceType"],
    workspacePath: row.workspace_path,
    deploymentRootPath: row.deployment_root_path,
    status: row.status,
    packageManager: row.package_manager,
    framework: row.framework,
    projectType: row.project_type,
    frameworkId: row.framework_id,
    frameworkLabel: row.framework_label,
    previewMode: row.preview_mode,
    containerName: row.container_name,
    containerPort: row.container_port,
    runtimePid: row.runtime_pid,
    runtimePort: row.runtime_port,
    previewUrl: row.preview_url,
    warnings: JSON.parse(row.warnings_json ?? "[]"),
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  listProjects(): Project[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
      .all() as ProjectRow[];
    return rows.map(toProject);
  }

  getProject(projectId: string): Project | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  getProjectLogs(projectId: string, limit = 400): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT line
          FROM project_logs
          WHERE project_id = ?
          ORDER BY id DESC
          LIMIT ?
        `
      )
      .all(projectId, limit) as Array<{ line: string }>;

    return rows.reverse().map((row) => row.line);
  }

  listProjectStatuses(): Array<{ id: string; status: ProjectStatus }> {
    return this.db
      .prepare(
        `
          SELECT id, status
          FROM projects
        `
      )
      .all() as Array<{ id: string; status: ProjectStatus }>;
  }

  createProject(input: CreateProjectInput): void {
    this.db
      .prepare(
        `
          INSERT INTO projects (
            id, name, source_type, workspace_path, deployment_root_path, status,
            package_manager, framework, project_type, framework_id, framework_label,
            preview_mode, container_name, container_port,
            runtime_pid, runtime_port, preview_url,
            warnings_json, last_error, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, '[]', NULL, ?, ?)
        `
      )
      .run(
        input.id,
        input.name,
        input.sourceType,
        input.workspacePath,
        input.deploymentRootPath,
        input.status,
        input.projectType ?? null,
        input.frameworkId ?? null,
        input.frameworkLabel ?? null,
        input.previewMode ?? null,
        input.createdAt,
        input.createdAt
      );
  }

  deleteProject(projectId: string): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM project_logs WHERE project_id = ?").run(projectId);
      this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    });
    tx();
  }

  appendLog(input: {
    projectId: string;
    stream: LogStream;
    line: string;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `
          INSERT INTO project_logs (project_id, stream, line, created_at)
          VALUES (?, ?, ?, ?)
        `
      )
      .run(input.projectId, input.stream, input.line, input.createdAt);
  }

  updateProject(projectId: string, values: ProjectUpdate): void {
    const current = this.getProject(projectId);
    if (!current) {
      return;
    }

    const has = (key: keyof ProjectUpdate) =>
      Object.prototype.hasOwnProperty.call(values, key);

    const updated = {
      status: has("status") ? values.status : current.status,
      packageManager: has("packageManager")
        ? values.packageManager
        : current.packageManager,
      framework: has("framework") ? values.framework : current.framework,
      projectType: has("projectType") ? values.projectType : current.projectType,
      frameworkId: has("frameworkId") ? values.frameworkId : current.frameworkId,
      frameworkLabel: has("frameworkLabel")
        ? values.frameworkLabel
        : current.frameworkLabel,
      previewMode: has("previewMode") ? values.previewMode : current.previewMode,
      containerName: has("containerName")
        ? values.containerName
        : current.containerName,
      containerPort: has("containerPort")
        ? values.containerPort
        : current.containerPort,
      deploymentRootPath: has("deploymentRootPath")
        ? values.deploymentRootPath
        : current.deploymentRootPath,
      runtimePid: has("runtimePid") ? values.runtimePid : current.runtimePid,
      runtimePort: has("runtimePort") ? values.runtimePort : current.runtimePort,
      previewUrl: has("previewUrl") ? values.previewUrl : current.previewUrl,
      warnings: has("warnings") ? values.warnings : current.warnings,
      lastError: has("lastError") ? values.lastError : current.lastError,
      updatedAt: has("updatedAt") ? values.updatedAt : new Date().toISOString(),
    };

    this.db
      .prepare(
        `
          UPDATE projects
          SET
            status = ?,
            package_manager = ?,
            framework = ?,
            project_type = ?,
            framework_id = ?,
            framework_label = ?,
            preview_mode = ?,
            container_name = ?,
            container_port = ?,
            deployment_root_path = ?,
            runtime_pid = ?,
            runtime_port = ?,
            preview_url = ?,
            warnings_json = ?,
            last_error = ?,
            updated_at = ?
          WHERE id = ?
        `
      )
      .run(
        updated.status,
        updated.packageManager,
        updated.framework,
        updated.projectType,
        updated.frameworkId,
        updated.frameworkLabel,
        updated.previewMode,
        updated.containerName,
        updated.containerPort,
        updated.deploymentRootPath,
        updated.runtimePid,
        updated.runtimePort,
        updated.previewUrl,
        JSON.stringify(updated.warnings),
        updated.lastError,
        updated.updatedAt,
        projectId
      );
  }
}
