import type { Project } from "../types/project";

export function formatImportStartedMessage(
  sourceType: Project["sourceType"],
  workspacePath: Project["workspacePath"]
): string {
  const label = sourceType === "zip" ? "Zip" : "Folder";
  return `${label} imported to ${workspacePath}.`;
}
