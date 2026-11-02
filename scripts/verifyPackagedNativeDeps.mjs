/**
 * 打包后的产物体检：确认 Electron 应用里那份 better-sqlite3 原生二进制
 * 确实能被该 Electron 版本加载。
 *
 * 这是最后一道防线。v1.0.0 便携版事故里，构建"成功"、ZIP 正常产出、
 * 用户下载解压后才弹 `NODE_MODULE_VERSION 137 ... requires 145`。
 * 与其等用户撞上，不如在 release 目录上直接验一次。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const releaseDir = path.join(projectRoot, "release");
const unpackedDir = path.join(releaseDir, "win-unpacked");

const NATIVE_BINARY = path.join(
  "resources",
  "app.asar.unpacked",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node"
);

function fail(message) {
  console.error(`\n[verify-packaged-native-deps] ${message}\n`);
  process.exit(1);
}

if (!existsSync(unpackedDir)) {
  fail(`找不到 ${unpackedDir}，请先执行 \`npm run electron:build\`。`);
}

const executableName = readdirSync(unpackedDir).find(
  (name) => name.toLowerCase().endsWith(".exe") && !/elevate/i.test(name)
);
if (!executableName) {
  fail(`${unpackedDir} 中找不到应用可执行文件。`);
}

const executablePath = path.join(unpackedDir, executableName);
const binaryPath = path.join(unpackedDir, NATIVE_BINARY);

if (!existsSync(binaryPath)) {
  fail(`打包产物中缺少原生模块：${binaryPath}`);
}

const probe = [
  "const m = { exports: {} };",
  `process.dlopen(m, ${JSON.stringify(binaryPath)});`,
  "console.log('PACKAGED_NATIVE_OK', process.versions.modules);",
].join("\n");

try {
  const output = execFileSync(executablePath, ["-e", probe], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (!output.includes("PACKAGED_NATIVE_OK")) {
    fail(`校验输出异常：${JSON.stringify(output)}`);
  }

  const abi = output.trim().split(/\s+/).pop();
  console.log(
    `[verify-packaged-native-deps] 通过：打包产物中的 better-sqlite3 可在 Electron（ABI ${abi}）中加载。`
  );
} catch (error) {
  const raw = String(error.stderr || error.message);
  // Electron 出错时会把整段 asar 包装代码打到 stderr，只挑真正有诊断价值的行。
  const detail = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /NODE_MODULE_VERSION|better_sqlite3\.node|Cannot find module|Error:/.test(line)
    )
    .slice(0, 6)
    .join("\n");
  fail(
    `打包产物中的 better-sqlite3 无法在 Electron 中加载，不要发布这个版本。\n${detail}`
  );
}
