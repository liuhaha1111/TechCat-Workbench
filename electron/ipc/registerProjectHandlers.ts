import { dialog, type IpcMain, type WebContents } from "electron";
import type { ProjectApplicationService } from "../../server/application/projectApplicationService";
import {
  WORKBENCH_CHANNELS,
  type ImportFolderFromPathRequest,
  type ImportZipFromPathRequest,
  type ProjectLogsEvent,
} from "../types";

interface RegisterProjectHandlersOptions {
  ipcMain: IpcMain;
  projectApplicationService: ProjectApplicationService;
}

function getSubscriptionKey(senderId: number, projectId: string): string {
  return `${senderId}:${projectId}`;
}

function cleanupSenderSubscriptions(
  senderId: number,
  subscriptions: Map<string, () => void>
): void {
  for (const [key, unsubscribe] of subscriptions.entries()) {
    if (!key.startsWith(`${senderId}:`)) {
      continue;
    }

    unsubscribe();
    subscriptions.delete(key);
  }
}

function ensureProjectExists(
  projectApplicationService: ProjectApplicationService,
  projectId: string
): void {
  if (!projectApplicationService.getProject(projectId)) {
    throw new Error("Project not found");
  }
}

async function selectSinglePath(options: {
  title: string;
  properties: Array<"openFile" | "openDirectory">;
  filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: options.title,
    properties: options.properties,
    filters: options.filters,
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

export function registerProjectHandlers({
  ipcMain,
  projectApplicationService,
}: RegisterProjectHandlersOptions): void {
  const subscriptions = new Map<string, () => void>();
  const trackedSenders = new Set<number>();

  const ensureSenderCleanup = (sender: WebContents) => {
    const senderId = sender.id;
    if (trackedSenders.has(senderId)) {
      return;
    }

    trackedSenders.add(senderId);
    sender.once("destroyed", () => {
      cleanupSenderSubscriptions(senderId, subscriptions);
      trackedSenders.delete(senderId);
    });
  };

  ipcMain.handle(WORKBENCH_CHANNELS.projects.list, () => {
    return projectApplicationService.listProjects();
  });

  ipcMain.handle(WORKBENCH_CHANNELS.projects.get, (_event, projectId: string) => {
    return projectApplicationService.getProject(projectId);
  });

  ipcMain.handle(
    WORKBENCH_CHANNELS.projects.logs.list,
    (_event, projectId: string) => {
      ensureProjectExists(projectApplicationService, projectId);
      return projectApplicationService.getProjectLogs(projectId);
    }
  );

  ipcMain.on(WORKBENCH_CHANNELS.projects.logs.subscribe, (event, projectId: string) => {
    ensureProjectExists(projectApplicationService, projectId);

    const subscriptionKey = getSubscriptionKey(event.sender.id, projectId);
    subscriptions.get(subscriptionKey)?.();

    const unsubscribe = projectApplicationService.subscribeLogs(projectId, (payload) => {
      const message: ProjectLogsEvent = {
        type: "log",
        projectId,
        stream: payload.stream,
        line: payload.line,
        createdAt: payload.createdAt,
      };
      event.sender.send(WORKBENCH_CHANNELS.projects.logs.event, message);
    });

    subscriptions.set(subscriptionKey, unsubscribe);
    ensureSenderCleanup(event.sender);

    const snapshot: ProjectLogsEvent = {
      type: "snapshot",
      projectId,
      logs: projectApplicationService.getProjectLogs(projectId),
    };
    event.sender.send(WORKBENCH_CHANNELS.projects.logs.event, snapshot);
  });

  ipcMain.on(
    WORKBENCH_CHANNELS.projects.logs.unsubscribe,
    (event, projectId: string) => {
      const subscriptionKey = getSubscriptionKey(event.sender.id, projectId);
      subscriptions.get(subscriptionKey)?.();
      subscriptions.delete(subscriptionKey);
    }
  );

  ipcMain.handle(WORKBENCH_CHANNELS.projects.selectZipFile, () => {
    return selectSinglePath({
      title: "Select Zip Archive",
      properties: ["openFile"],
      filters: [{ name: "Zip Archive", extensions: ["zip"] }],
    });
  });

  ipcMain.handle(WORKBENCH_CHANNELS.projects.selectSourceFolder, () => {
    return selectSinglePath({
      title: "Select Project Folder",
      properties: ["openDirectory"],
    });
  });

  ipcMain.handle(WORKBENCH_CHANNELS.projects.selectDeploymentRoot, () => {
    return selectSinglePath({
      title: "Select Deployment Root",
      properties: ["openDirectory"],
    });
  });

  ipcMain.handle(
    WORKBENCH_CHANNELS.projects.importZipFromPath,
    (_event, request: ImportZipFromPathRequest) => {
      return projectApplicationService.importZipFromPath(request);
    }
  );

  ipcMain.handle(
    WORKBENCH_CHANNELS.projects.importFolderFromPath,
    (_event, request: ImportFolderFromPathRequest) => {
      return projectApplicationService.importFolderFromPath(request);
    }
  );

  ipcMain.handle(WORKBENCH_CHANNELS.projects.start, (_event, projectId: string) => {
    return projectApplicationService.startProject(projectId);
  });

  ipcMain.handle(WORKBENCH_CHANNELS.projects.stop, (_event, projectId: string) => {
    return projectApplicationService.stopProject(projectId);
  });

  ipcMain.handle(
    WORKBENCH_CHANNELS.projects.restart,
    (_event, projectId: string) => {
      return projectApplicationService.restartProject(projectId);
    }
  );

  ipcMain.handle(WORKBENCH_CHANNELS.projects.delete, (_event, projectId: string) => {
    return projectApplicationService.deleteProject(projectId);
  });

  ipcMain.handle(
    WORKBENCH_CHANNELS.projects.previewInfo,
    (_event, projectId: string) => {
      return projectApplicationService.getPreviewInfo(projectId);
    }
  );
}
