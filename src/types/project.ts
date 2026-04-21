export type ProjectStatus =
  | "importing"
  | "installing"
  | "starting"
  | "ready"
  | "error"
  | "stopped";

export type PackageManager = "pnpm" | "yarn" | "npm";
export type ProjectType = "vite" | "astro" | "next" | "static";
export type PreviewMode = "embedded" | "external";

export interface Project {
  id: string;
  name: string;
  sourceType: "zip" | "folder";
  workspacePath: string;
  deploymentRootPath: string | null;
  status: ProjectStatus;
  packageManager: PackageManager | null;
  framework: string | null;
  projectType: ProjectType | null;
  frameworkId: string | null;
  frameworkLabel: string | null;
  previewMode: PreviewMode | null;
  containerName: string | null;
  containerPort: number | null;
  runtimePort: number | null;
  previewUrl: string | null;
  warnings: string[];
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
