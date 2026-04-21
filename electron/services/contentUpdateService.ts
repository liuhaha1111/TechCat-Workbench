import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ContentActivationState, ContentManifest, ContentUpdateState } from "./updateContracts";
import { isContentManifestCompatible } from "./updateContracts";

export const DEFAULT_CONTENT_MANIFEST_URL =
  "https://updates.example.com/ai-workbench/content/manifest.json";

export interface ContentUpdateServiceOptions {
  appVersion: string;
  manifestUrl?: string;
  userDataRoot?: string | null;
  fetchJson?: (url: string) => Promise<ContentManifest>;
  downloadFile?: (url: string) => Promise<string>;
  computeSha256?: (filePath: string) => Promise<string>;
  extractZip?: (zipPath: string, destinationPath: string) => Promise<void>;
  now?: () => string;
}

export class ContentUpdateService {
  private status: ContentUpdateState = { kind: "idle" };

  constructor(private readonly options: ContentUpdateServiceOptions) {}

  getStatus(): ContentUpdateState {
    return this.status;
  }

  async checkForContentUpdate(): Promise<ContentUpdateState> {
    this.status = { kind: "checking" };

    try {
      const manifest = await this.getFetcher()(this.getManifestUrl());
      if (!isContentManifestCompatible(manifest, this.options.appVersion)) {
        return this.fail(
          `Content bundle ${manifest.version} is not compatible with app ${this.options.appVersion}.`
        );
      }

      this.status = { kind: "downloading", version: manifest.version };
      const archivePath = await this.getDownloader()(manifest.packageUrl);
      const actualSha256 = await this.getChecksumComputer()(archivePath);
      if (actualSha256.toLowerCase() !== manifest.sha256.toLowerCase()) {
        return this.fail("Downloaded content checksum did not match the manifest.");
      }

      if (!this.options.userDataRoot) {
        throw new Error("userDataRoot is required to activate content updates.");
      }

      const previousState = await this.readState();
      const bundlesRoot = path.join(this.options.userDataRoot, "content-bundles");
      const nextBundleRoot = path.join(bundlesRoot, manifest.version);

      await mkdir(bundlesRoot, { recursive: true });
      await rm(nextBundleRoot, { recursive: true, force: true });

      try {
        await this.getExtractor()(archivePath, nextBundleRoot);
        await this.writeState({
          activeVersion: manifest.version,
          previousVersion: previousState?.activeVersion ?? null,
          checksum: actualSha256,
          activatedAt: this.getNow()(),
        });
      } catch (error) {
        await rm(nextBundleRoot, { recursive: true, force: true });
        throw error;
      }

      this.status = { kind: "downloaded", version: manifest.version };
      return this.status;
    } catch (error) {
      return this.fail(error);
    }
  }

  private getManifestUrl(): string {
    return this.options.manifestUrl ?? DEFAULT_CONTENT_MANIFEST_URL;
  }

  private getFetcher(): (url: string) => Promise<ContentManifest> {
    return this.options.fetchJson ?? defaultFetchJson;
  }

  private getDownloader(): (url: string) => Promise<string> {
    return this.options.downloadFile ?? defaultDownloadFile;
  }

  private getChecksumComputer(): (filePath: string) => Promise<string> {
    return this.options.computeSha256 ?? defaultComputeSha256;
  }

  private getExtractor(): (zipPath: string, destinationPath: string) => Promise<void> {
    return this.options.extractZip ?? defaultExtractZip;
  }

  private getNow(): () => string {
    return this.options.now ?? (() => new Date().toISOString());
  }

  private async readState(): Promise<ContentActivationState | null> {
    if (!this.options.userDataRoot) {
      return null;
    }

    const statePath = path.join(this.options.userDataRoot, "content-state.json");
    try {
      return JSON.parse(await readFile(statePath, "utf8")) as ContentActivationState;
    } catch {
      return null;
    }
  }

  private async writeState(state: ContentActivationState): Promise<void> {
    if (!this.options.userDataRoot) {
      throw new Error("userDataRoot is required to write content state.");
    }

    await mkdir(this.options.userDataRoot, { recursive: true });
    const statePath = path.join(this.options.userDataRoot, "content-state.json");
    const tempPath = `${statePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, statePath);
  }

  private fail(error: unknown): ContentUpdateState {
    this.status = {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    return this.status;
  }
}

async function defaultFetchJson(url: string): Promise<ContentManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch content manifest: ${response.status}`);
  }

  return (await response.json()) as ContentManifest;
}

async function defaultDownloadFile(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download content bundle: ${response.status}`);
  }

  const archivePath = path.join(os.tmpdir(), `ai-workbench-content-${Date.now()}.zip`);
  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(archivePath, body);
  return archivePath;
}

async function defaultComputeSha256(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
    stream.on("error", reject);
  });
}

async function defaultExtractZip(zipPath: string, destinationPath: string): Promise<void> {
  await mkdir(destinationPath, { recursive: true });
  const archive = new AdmZip(zipPath);
  archive.extractAllTo(destinationPath, true);
}
