import { contextBridge, ipcRenderer } from "electron";
import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  WORKBENCH_CHANNELS,
  type ProjectLogsEvent,
  type WorkbenchApi,
} from "./types";

type IpcRendererLike = Pick<IpcRenderer, "invoke" | "on" | "off" | "send">;

export function createWorkbenchApi(ipc: IpcRendererLike): WorkbenchApi {
  return {
    projects: {
      list: () => ipc.invoke(WORKBENCH_CHANNELS.projects.list),
      get: (projectId) => ipc.invoke(WORKBENCH_CHANNELS.projects.get, projectId),
      getLogs: (projectId) => ipc.invoke(WORKBENCH_CHANNELS.projects.logs.list, projectId),
      subscribeLogs: (projectId, listener) => {
        const handleEvent = (
          _event: IpcRendererEvent,
          payload: ProjectLogsEvent
        ) => {
          if (payload.projectId === projectId) {
            listener(payload);
          }
        };

        ipc.on(WORKBENCH_CHANNELS.projects.logs.event, handleEvent);
        ipc.send(WORKBENCH_CHANNELS.projects.logs.subscribe, projectId);

        return () => {
          ipc.off(WORKBENCH_CHANNELS.projects.logs.event, handleEvent);
          ipc.send(WORKBENCH_CHANNELS.projects.logs.unsubscribe, projectId);
        };
      },
      selectZipFile: () => ipc.invoke(WORKBENCH_CHANNELS.projects.selectZipFile),
      selectSourceFolder: () => ipc.invoke(WORKBENCH_CHANNELS.projects.selectSourceFolder),
      selectDeploymentRoot: () =>
        ipc.invoke(WORKBENCH_CHANNELS.projects.selectDeploymentRoot),
      importZipFromPath: (request) =>
        ipc.invoke(WORKBENCH_CHANNELS.projects.importZipFromPath, request),
      importFolderFromPath: (request) =>
        ipc.invoke(WORKBENCH_CHANNELS.projects.importFolderFromPath, request),
      start: (projectId) => ipc.invoke(WORKBENCH_CHANNELS.projects.start, projectId),
      stop: (projectId) => ipc.invoke(WORKBENCH_CHANNELS.projects.stop, projectId),
      restart: (projectId) => ipc.invoke(WORKBENCH_CHANNELS.projects.restart, projectId),
      delete: (projectId) => ipc.invoke(WORKBENCH_CHANNELS.projects.delete, projectId),
      getPreviewInfo: (projectId) =>
        ipc.invoke(WORKBENCH_CHANNELS.projects.previewInfo, projectId),
    },
    ai: {
      generateText: (request) => ipc.invoke(WORKBENCH_CHANNELS.ai.generateText, request),
    },
    updates: {
      getStatus: () => ipc.invoke(WORKBENCH_CHANNELS.updates.status),
      checkAppUpdate: () => ipc.invoke(WORKBENCH_CHANNELS.updates.checkApp),
      checkContentUpdate: () => ipc.invoke(WORKBENCH_CHANNELS.updates.checkContent),
      quitAndInstall: () => ipc.invoke(WORKBENCH_CHANNELS.updates.quitAndInstall),
    },
  };
}

export const workbenchApi = createWorkbenchApi(ipcRenderer);

if (typeof process !== "undefined" && process.contextIsolated) {
  contextBridge.exposeInMainWorld("workbench", workbenchApi);
}
