import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const builderConfig = readFileSync(path.join(projectRoot, "electron-builder.yml"), "utf8");

describe("Electron native dependency packaging", () => {
  it("rebuilds native dependencies for the Electron runtime before bundling", () => {
    expect(packageJson.scripts["electron:rebuild"]).toBe("electron-builder install-app-deps");
    expect(packageJson.scripts["electron:build"]).toContain("npm run electron:rebuild && electron-builder");
    expect(builderConfig).toContain("npmRebuild: true");
    expect(builderConfig).toContain("nativeRebuilder: sequential");
  });
});
