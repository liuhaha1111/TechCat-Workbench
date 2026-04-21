import type {
  CheckAppUpdateResponse,
  CheckContentUpdateResponse,
  QuitAndInstallResponse,
  UpdateStatusResponse,
  WorkbenchApi,
} from "../../../../electron/types";

function requireWorkbenchBridge(): WorkbenchApi {
  if (typeof window === "undefined" || !window.workbench) {
    throw new Error("Electron preload bridge is not available.");
  }

  return window.workbench;
}

export interface UpdatesClient {
  getStatus(): Promise<UpdateStatusResponse>;
  checkAppUpdate(): Promise<CheckAppUpdateResponse>;
  checkContentUpdate(): Promise<CheckContentUpdateResponse>;
  applyAppUpdate(): Promise<QuitAndInstallResponse>;
}

export const updatesClient: UpdatesClient = {
  getStatus: () => requireWorkbenchBridge().updates.getStatus(),
  checkAppUpdate: () => requireWorkbenchBridge().updates.checkAppUpdate(),
  checkContentUpdate: () => requireWorkbenchBridge().updates.checkContentUpdate(),
  applyAppUpdate: () => requireWorkbenchBridge().updates.quitAndInstall(),
};
