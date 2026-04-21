import type { IpcMain } from "electron";
import {
  WORKBENCH_CHANNELS,
  type CheckAppUpdateResponse,
  type CheckContentUpdateResponse,
  type QuitAndInstallResponse,
  type UpdateStatusResponse,
} from "../types";

interface RegisterUpdateHandlersOptions {
  ipcMain: IpcMain;
  getStatus: () => Promise<UpdateStatusResponse> | UpdateStatusResponse;
  checkForAppUpdate: () => Promise<CheckAppUpdateResponse>;
  checkForContentUpdate: () => Promise<CheckContentUpdateResponse>;
  quitAndInstall: () => void;
}

export function registerUpdateHandlers({
  ipcMain,
  getStatus,
  checkForAppUpdate,
  checkForContentUpdate,
  quitAndInstall,
}: RegisterUpdateHandlersOptions): void {
  ipcMain.handle(WORKBENCH_CHANNELS.updates.status, () => {
    return getStatus();
  });

  ipcMain.handle(WORKBENCH_CHANNELS.updates.checkApp, () => {
    return checkForAppUpdate();
  });

  ipcMain.handle(WORKBENCH_CHANNELS.updates.checkContent, () => {
    return checkForContentUpdate();
  });

  ipcMain.handle(WORKBENCH_CHANNELS.updates.quitAndInstall, () => {
    quitAndInstall();
    const response: QuitAndInstallResponse = { accepted: true };
    return response;
  });
}
