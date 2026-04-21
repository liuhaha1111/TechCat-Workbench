import AdmZip from "adm-zip";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImportService } from "../../../../server/infrastructure/import/importService";

describe("ImportService", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("copies a source folder by path and skips ignored directories", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-import-service-"));
    const sourceDir = path.join(tempDir, "source");
    const destinationDir = path.join(tempDir, "destination");

    mkdirSync(path.join(sourceDir, "src"), { recursive: true });
    mkdirSync(path.join(sourceDir, "node_modules", "react"), { recursive: true });
    mkdirSync(path.join(sourceDir, "dist"), { recursive: true });
    writeFileSync(path.join(sourceDir, "src", "main.ts"), "console.log('ok');");
    writeFileSync(path.join(sourceDir, "node_modules", "react", "index.js"), "export {};" );
    writeFileSync(path.join(sourceDir, "dist", "index.js"), "console.log('dist');");

    const service = new ImportService();
    const result = await service.importPathToDirectory(sourceDir, destinationDir);

    expect(existsSync(path.join(destinationDir, "src", "main.ts"))).toBe(true);
    expect(existsSync(path.join(destinationDir, "node_modules"))).toBe(false);
    expect(existsSync(path.join(destinationDir, "dist"))).toBe(false);
    expect(result.skippedPaths).toEqual(expect.arrayContaining(["node_modules", "dist"]));
  });

  it("imports a zip by local path and skips ignored directories", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "aiwb-import-service-"));
    const zipPath = path.join(tempDir, "project.zip");
    const destinationDir = path.join(tempDir, "destination");
    const zip = new AdmZip();

    zip.addFile("src/main.ts", Buffer.from("console.log('ok');"));
    zip.addFile("node_modules/react/index.js", Buffer.from("export {};"));
    zip.writeZip(zipPath);

    const service = new ImportService();
    const result = await service.importZipPathToDirectory(zipPath, destinationDir);

    expect(existsSync(path.join(destinationDir, "src", "main.ts"))).toBe(true);
    expect(existsSync(path.join(destinationDir, "node_modules"))).toBe(false);
    expect(result.skippedPaths).toEqual(["node_modules"]);
  });
});
