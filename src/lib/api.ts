import type { Project } from "../types/project";

const ABSOLUTE_DEPLOYMENT_ROOT_PATTERN = /^(?:[a-zA-Z]:[\\/]|\\\\|[\\/])/;

export function parseProjectsResponse(input: unknown): Project[] {
  const payload = input as { projects?: Project[] };
  return Array.isArray(payload?.projects) ? payload.projects : [];
}

async function readJson<T>(response: Response): Promise<T> {
  const bodyText = await response.text();
  const hasBody = bodyText.trim().length > 0;

  let data: unknown = undefined;
  if (hasBody) {
    try {
      data = JSON.parse(bodyText) as T;
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      throw new Error(`Invalid JSON response: ${response.status}`);
    }
  }

  if (!response.ok) {
    const message =
      (data as { error?: string } | undefined)?.error ??
      `Request failed: ${response.status}`;
    throw new Error(message);
  }

  if (!hasBody || data === undefined) {
    throw new Error(`Empty JSON response: ${response.status}`);
  }

  return data as T;
}

export function isLikelyAbsoluteDeploymentRootPath(
  deploymentRootPath: string
): boolean {
  return ABSOLUTE_DEPLOYMENT_ROOT_PATTERN.test(deploymentRootPath.trim());
}

function appendOptionalProjectName(formData: FormData, name?: string): void {
  if (name?.trim()) {
    formData.append("name", name.trim());
  }
}

export function buildZipImportFormData(
  file: File,
  name: string | undefined,
  deploymentRootPath: string
): FormData {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("deploymentRootPath", deploymentRootPath.trim());
  appendOptionalProjectName(formData, name);
  return formData;
}

export function buildFolderImportFormData(
  files: File[],
  name: string | undefined,
  deploymentRootPath: string
): FormData {
  const formData = new FormData();
  formData.append("deploymentRootPath", deploymentRootPath.trim());
  appendOptionalProjectName(formData, name);

  for (const file of files) {
    const relativePath =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name;
    formData.append("files", file, relativePath);
  }

  return formData;
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects");
  const data = await readJson<{ projects: Project[] }>(response);
  return data.projects;
}

export async function fetchProjectLogs(projectId: string): Promise<string[]> {
  const response = await fetch(`/api/projects/${projectId}/logs`);
  const data = await readJson<{ logs: string[] }>(response);
  return data.logs;
}

export function createProjectLogsEventSource(projectId: string): EventSource {
  return new EventSource(`/api/projects/${projectId}/logs/stream`);
}

export async function importZip(
  file: File,
  name: string | undefined,
  deploymentRootPath: string
): Promise<Project> {
  const response = await fetch("/api/projects/import-zip", {
    method: "POST",
    body: buildZipImportFormData(file, name, deploymentRootPath),
  });

  const data = await readJson<{ project: Project }>(response);
  return data.project;
}

export async function importFolder(
  files: File[],
  name: string | undefined,
  deploymentRootPath: string
): Promise<Project> {
  const response = await fetch("/api/projects/import-folder", {
    method: "POST",
    body: buildFolderImportFormData(files, name, deploymentRootPath),
  });
  const data = await readJson<{ project: Project }>(response);
  return data.project;
}

export async function deleteProject(projectId: string): Promise<{ id: string }> {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
  return readJson<{ id: string }>(response);
}

async function mutateProject(
  projectId: string,
  action: "start" | "stop" | "restart"
): Promise<Project> {
  const response = await fetch(`/api/projects/${projectId}/${action}`, {
    method: "POST",
  });
  const data = await readJson<{ project: Project }>(response);
  return data.project;
}

export function startProject(projectId: string): Promise<Project> {
  return mutateProject(projectId, "start");
}

export function stopProject(projectId: string): Promise<Project> {
  return mutateProject(projectId, "stop");
}

export function restartProject(projectId: string): Promise<Project> {
  return mutateProject(projectId, "restart");
}
