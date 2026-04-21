import type { WorkbenchApi } from "../../electron/types";

export function hasWorkbenchBridge(): boolean {
  return typeof window !== "undefined" && typeof window.workbench !== "undefined";
}

export function requireWorkbenchBridge(): WorkbenchApi {
  if (!hasWorkbenchBridge()) {
    throw new Error("Electron preload bridge is not available.");
  }

  return window.workbench;
}
