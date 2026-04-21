import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentActivationState, ContentManifest } from "./updateContracts";

export interface ContentResolverOptions {
  builtInRoot: URL | string;
  userDataRoot: URL | string | null;
}

export class ContentResolver {
  constructor(private readonly options: ContentResolverOptions) {}

  async getBuiltInManifest(): Promise<ContentManifest> {
    return this.readManifest(this.options.builtInRoot);
  }

  async getCurrentManifest(): Promise<ContentManifest> {
    const activeBundleRoot = await this.getActiveDownloadedBundleRoot();
    if (activeBundleRoot) {
      const manifestPath = path.join(activeBundleRoot, "manifest.json");
      if (await this.pathExists(manifestPath)) {
        return this.readManifest(activeBundleRoot);
      }
    }

    return this.getBuiltInManifest();
  }

  async getCurrentContentVersion(): Promise<string> {
    return (await this.getCurrentManifest()).version;
  }

  async getPrompt(id: string): Promise<string> {
    const relativePath = path.join("prompts", `${id}.txt`);
    const activeBundleRoot = await this.getActiveDownloadedBundleRoot();

    if (activeBundleRoot) {
      const activePromptPath = path.join(activeBundleRoot, relativePath);
      if (await this.pathExists(activePromptPath)) {
        return readFile(activePromptPath, "utf8");
      }
    }

    const bundledPromptPath = this.resolvePath(this.options.builtInRoot, relativePath);
    return readFile(bundledPromptPath, "utf8");
  }

  private async getActiveDownloadedBundleRoot(): Promise<string | null> {
    const state = await this.getContentState();
    if (!state?.activeVersion || !this.options.userDataRoot) {
      return null;
    }

    const activeBundleRoot = this.resolvePath(
      this.options.userDataRoot,
      "content-bundles",
      state.activeVersion
    );

    return (await this.pathExists(activeBundleRoot)) ? activeBundleRoot : null;
  }

  private async getContentState(): Promise<ContentActivationState | null> {
    if (!this.options.userDataRoot) {
      return null;
    }

    const statePath = this.resolvePath(this.options.userDataRoot, "content-state.json");
    if (!(await this.pathExists(statePath))) {
      return null;
    }

    return JSON.parse(await readFile(statePath, "utf8")) as ContentActivationState;
  }

  private async readManifest(root: URL | string): Promise<ContentManifest> {
    const manifestPath = this.resolvePath(root, "manifest.json");
    return JSON.parse(await readFile(manifestPath, "utf8")) as ContentManifest;
  }

  private resolvePath(root: URL | string, ...segments: string[]): string {
    const basePath = root instanceof URL ? fileURLToPath(root) : root;
    return path.join(basePath, ...segments);
  }

  private async pathExists(candidatePath: string): Promise<boolean> {
    try {
      await access(candidatePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
