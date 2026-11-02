import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const builderConfig = readFileSync(path.join(projectRoot, "electron-builder.yml"), "utf8");
const scripts = packageJson.scripts;

describe("Electron native dependency packaging", () => {
  it("rebuilds native dependencies against the Electron ABI before bundling", () => {
    // 必须是确定性脚本，而不是 electron-builder install-app-deps：
    // 后者匹配不到预编译包时回落 node-gyp，无 MSVC 的构建机上会静默失败，
    // 把 Node ABI 的二进制打进安装包（v1.0.0 便携版启动即崩的直接成因）。
    expect(scripts["electron:rebuild"]).toContain("ensureElectronNativeDeps.mjs");
    expect(scripts["electron:rebuild"]).toContain("--runtime electron");
    expect(scripts["electron:build"]).toContain("npm run electron:rebuild");
    expect(scripts["electron:build"]).not.toContain("install-app-deps");
  });

  it("verifies the packaged artifact before it can be published", () => {
    expect(scripts["electron:verify-native"]).toBe(
      "node ./scripts/verifyPackagedNativeDeps.mjs"
    );
    expect(scripts["electron:build"]).toContain("npm run electron:verify-native");
  });

  it("disables electron-builder's own native rebuild", () => {
    // npmRebuild: true 会再跑一次 @electron/rebuild，可能覆盖掉上一步的成果。
    expect(builderConfig).toContain("npmRebuild: false");
    expect(builderConfig).not.toContain("npmRebuild: true");
  });

  it("switches back to the Node ABI for test and server workflows", () => {
    // 一个文件位同时只能是一种 ABI：打包要 Electron ABI，vitest / server:dev 跑在
    // 本机 Node 上要 Node ABI。没有这些钩子，跑完 electron:rebuild 后测试必然崩。
    expect(scripts["pretest"]).toContain("--runtime node");
    expect(scripts["preserver:dev"]).toContain("--runtime node");
    expect(scripts["preelectron:dev"]).toContain("--runtime electron");
  });
});
