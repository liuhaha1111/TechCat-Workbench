import AdmZip from "adm-zip";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { UploadedFile } from "../../types";
import { getIgnoredImportPath } from "./pathFilters";

function toPosixPath(input: string): string {
  return input.replace(/\\/g, "/");
}

export function sanitizeImportPath(relativePath: string): string {
  const normalized = toPosixPath(relativePath)
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");

  if (!normalized || normalized.includes("\0")) {
    throw new Error("invalid path");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    throw new Error("path traversal");
  }

  return segments.join("/");
}

async function writeImportedFile(
  destinationDir: string,
  relativePath: string,
  contents: Buffer
): Promise<void> {
  const targetPath = path.join(destinationDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents);
}

function markSkippedPath(skippedPaths: Set<string>, relativePath: string): boolean {
  const ignoredPath = getIgnoredImportPath(relativePath);
  if (!ignoredPath) {
    return false;
  }

  skippedPaths.add(ignoredPath);
  return true;
}

export class ImportService {
  async importZipBufferToDirectory(
    zipBuffer: Buffer,
    destinationDir: string
  ): Promise<{ skippedPaths: string[] }> {
    const skippedPaths = new Set<string>();
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    await fs.mkdir(destinationDir, { recursive: true });

    for (const entry of entries) {
      if (entry.isDirectory) {
        const directoryPath = sanitizeImportPath(entry.entryName);
        markSkippedPath(skippedPaths, directoryPath);
        continue;
      }

      const relativePath = sanitizeImportPath(entry.entryName);
      if (markSkippedPath(skippedPaths, relativePath)) {
        continue;
      }

      await writeImportedFile(destinationDir, relativePath, entry.getData());
    }

    return { skippedPaths: Array.from(skippedPaths).sort() };
  }

  async importZipPathToDirectory(
    zipPath: string,
    destinationDir: string
  ): Promise<{ skippedPaths: string[] }> {
    const zipStats = await fs.stat(zipPath).catch(() => null);
    if (!zipStats?.isFile()) {
      throw new Error("Zip path must exist and be a file");
    }

    const zipBuffer = await fs.readFile(zipPath);
    return this.importZipBufferToDirectory(zipBuffer, destinationDir);
  }

  async importUploadedFilesToDirectory(
    files: UploadedFile[],
    destinationDir: string
  ): Promise<{ skippedPaths: string[] }> {
    const skippedPaths = new Set<string>();

    await fs.mkdir(destinationDir, { recursive: true });

    for (const file of files) {
      const relativePath = sanitizeImportPath(file.relativePath);
      if (markSkippedPath(skippedPaths, relativePath)) {
        continue;
      }

      await writeImportedFile(destinationDir, relativePath, file.buffer);
    }

    return { skippedPaths: Array.from(skippedPaths).sort() };
  }

  async importPathToDirectory(
    sourceDir: string,
    destinationDir: string
  ): Promise<{ skippedPaths: string[] }> {
    const sourceStats = await fs.stat(sourceDir).catch(() => null);
    if (!sourceStats?.isDirectory()) {
      throw new Error("Source path must exist and be a directory");
    }

    const skippedPaths = new Set<string>();
    await fs.mkdir(destinationDir, { recursive: true });

    const copyDirectory = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const sourcePath = path.join(currentDir, entry.name);
        const relativePath = toPosixPath(path.relative(sourceDir, sourcePath));

        if (markSkippedPath(skippedPaths, relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await copyDirectory(sourcePath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const targetPath = path.join(destinationDir, relativePath);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.copyFile(sourcePath, targetPath);
      }
    };

    await copyDirectory(sourceDir);
    return { skippedPaths: Array.from(skippedPaths).sort() };
  }

  async listProjectFiles(projectRoot: string): Promise<string[]> {
    const result: string[] = [];

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(projectRoot, fullPath);
          result.push(toPosixPath(relativePath));
        }
      }
    };

    await walk(projectRoot);
    return result.sort();
  }
}
