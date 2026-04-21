import type { AppUpdateState } from "./updateContracts";

interface UpdateInfo {
  version?: string;
  releaseNotes?: string | string[];
}

export interface UpdateServiceUpdater {
  autoDownload: boolean;
  on(eventName: string, listener: (...args: unknown[]) => void): void;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateServiceOptions {
  currentVersion: string;
  checkOnStartup: boolean;
}

export class UpdateService {
  private status: AppUpdateState = { kind: "idle" };

  constructor(
    private readonly updater: UpdateServiceUpdater,
    private readonly options: UpdateServiceOptions
  ) {
    this.updater.autoDownload = false;
    this.registerListeners();

    if (this.options.checkOnStartup) {
      void this.checkForAppUpdate();
    }
  }

  getStatus(): AppUpdateState {
    return this.status;
  }

  async checkForAppUpdate(): Promise<AppUpdateState> {
    this.status = { kind: "checking" };
    await this.updater.checkForUpdates();
    return this.status;
  }

  quitAndInstall(): void {
    this.updater.quitAndInstall();
  }

  private registerListeners(): void {
    this.updater.on("checking-for-update", () => {
      this.status = { kind: "checking" };
    });

    this.updater.on("update-not-available", () => {
      this.status = { kind: "idle" };
    });

    this.updater.on("update-available", (info: unknown) => {
      const nextVersion = this.getVersionFromInfo(info) ?? this.options.currentVersion;
      const notes = this.getNotesFromInfo(info);
      this.status = notes
        ? { kind: "available", version: nextVersion, notes }
        : { kind: "available", version: nextVersion };
    });

    this.updater.on("download-progress", (info: unknown) => {
      const nextVersion = this.getVersionFromInfo(info) ?? this.getTrackedVersion();
      this.status = { kind: "downloading", version: nextVersion };
    });

    this.updater.on("update-downloaded", (info: unknown) => {
      const nextVersion = this.getVersionFromInfo(info) ?? this.getTrackedVersion();
      this.status = { kind: "downloaded", version: nextVersion };
    });

    this.updater.on("error", (error: unknown) => {
      this.status = {
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    });
  }

  private getTrackedVersion(): string {
    if (
      this.status.kind === "available" ||
      this.status.kind === "downloading" ||
      this.status.kind === "downloaded"
    ) {
      return this.status.version;
    }

    return this.options.currentVersion;
  }

  private getVersionFromInfo(info: unknown): string | undefined {
    if (!info || typeof info !== "object") {
      return undefined;
    }

    return (info as UpdateInfo).version;
  }

  private getNotesFromInfo(info: unknown): string | undefined {
    if (!info || typeof info !== "object") {
      return undefined;
    }

    const { releaseNotes } = info as UpdateInfo;
    if (Array.isArray(releaseNotes)) {
      return releaseNotes.join("\n");
    }

    return typeof releaseNotes === "string" ? releaseNotes : undefined;
  }
}
