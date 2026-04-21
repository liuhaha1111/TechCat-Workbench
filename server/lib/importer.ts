import type { UploadedFile } from "../types";
import {
  ImportService,
  sanitizeImportPath,
} from "../infrastructure/import/importService";

const importService = new ImportService();

export { sanitizeImportPath };

export async function importZipToDirectory(
  zipBuffer: Buffer,
  destinationDir: string
): Promise<void> {
  await importService.importZipBufferToDirectory(zipBuffer, destinationDir);
}

export async function importFolderFilesToDirectory(
  files: UploadedFile[],
  destinationDir: string
): Promise<void> {
  await importService.importUploadedFilesToDirectory(files, destinationDir);
}

export async function listProjectFiles(projectRoot: string): Promise<string[]> {
  return importService.listProjectFiles(projectRoot);
}
