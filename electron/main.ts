import "dotenv/config";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import { AiApplicationService } from "../server/application/aiApplicationService";
import { createWorkbenchServices } from "../server/index";
import { GeminiProvider } from "../server/infrastructure/ai/geminiProvider";
import { registerAiHandlers } from "./ipc/registerAiHandlers";
import { registerProjectHandlers } from "./ipc/registerProjectHandlers";
import { registerUpdateHandlers } from "./ipc/registerUpdateHandlers";
import { ContentResolver } from "./services/contentResolver";
import {
  ContentUpdateService,
  DEFAULT_CONTENT_MANIFEST_URL,
} from "./services/contentUpdateService";
import type { VersionSnapshot } from "./services/updateContracts";
import { UpdateService } from "./services/updateService";

let mainWindow: BrowserWindow | null = null;
let aiService: AiApplicationService | null = null;
let updateService: UpdateService | null = null;
let contentResolver: ContentResolver | null = null;
let contentUpdateService: ContentUpdateService | null = null;

function isElectronDevMode(): boolean {
  return Boolean(process.env.ELECTRON_RENDERER_URL);
}

function getPreloadPath(): string {
  if (isElectronDevMode()) {
    return path.join(app.getAppPath(), "electron", "preload.ts");
  }

  return path.join(app.getAppPath(), "dist-electron", "preload.cjs");
}

function getBuiltInContentRoot(): string {
  return path.join(app.getAppPath(), "resources", "content-bundle");
}

function getContentManifestUrl(): string {
  return process.env.DESKTOP_CONTENT_MANIFEST_URL ?? DEFAULT_CONTENT_MANIFEST_URL;
}

const { projectApplicationService } = createWorkbenchServices();

function getAiService(): AiApplicationService {
  if (!aiService) {
    aiService = new AiApplicationService(new GeminiProvider());
  }

  return aiService;
}

function getUpdateService(): UpdateService {
  if (!updateService) {
    updateService = new UpdateService(autoUpdater, {
      currentVersion: app.getVersion(),
      checkOnStartup: false,
    });
  }

  return updateService;
}

function getContentResolver(): ContentResolver {
  if (!contentResolver) {
    contentResolver = new ContentResolver({
      builtInRoot: getBuiltInContentRoot(),
      userDataRoot: app.getPath("userData"),
    });
  }

  return contentResolver;
}

function getContentUpdateService(): ContentUpdateService {
  if (!contentUpdateService) {
    contentUpdateService = new ContentUpdateService({
      appVersion: app.getVersion(),
      manifestUrl: getContentManifestUrl(),
      userDataRoot: app.getPath("userData"),
    });
  }

  return contentUpdateService;
}

async function getUpdateSnapshot(): Promise<VersionSnapshot> {
  return {
    appVersion: app.getVersion(),
    contentVersion: await getContentResolver().getCurrentContentVersion(),
    appUpdate: getUpdateService().getStatus(),
    contentUpdate: getContentUpdateService().getStatus(),
  };
}

registerProjectHandlers({ ipcMain, projectApplicationService });
registerAiHandlers({
  ipcMain,
  generateText: (request) => getAiService().generateText(request),
});

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await window.loadURL(rendererUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
}

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#020617",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (url === currentUrl) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  await loadRenderer(window);
  mainWindow = window;
}

app.whenReady().then(async () => {
  registerUpdateHandlers({
    ipcMain,
    getStatus: () => getUpdateSnapshot(),
    checkForAppUpdate: () => getUpdateService().checkForAppUpdate(),
    checkForContentUpdate: () => getContentUpdateService().checkForContentUpdate(),
    quitAndInstall: () => getUpdateService().quitAndInstall(),
  });

  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
