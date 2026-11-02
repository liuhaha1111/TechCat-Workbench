/**
 * 让 better-sqlite3 的原生二进制匹配目标运行时（Electron 或本机 Node）。
 *
 * 背景（2026-08-10 v1.0.0 便携版事故）：
 *   `npm install` 时 better-sqlite3 的 install 脚本会跑 `prebuild-install`，
 *   它按**当前 Node 运行时**的 ABI 下载预编译包（Node 22 -> node-v127、Node 24 -> node-v137）。
 *   打包进 Electron 41（ABI 145）后，dlopen 直接抛
 *   `NODE_MODULE_VERSION 137 ... requires NODE_MODULE_VERSION 145`，应用启动即崩。
 *
 * 为什么不能只靠 electron-builder install-app-deps：
 *   它会让 prebuild-install 以 --runtime=electron 重跑；一旦匹配不到对应 ABI 的
 *   预编译包，就会回落到 `node-gyp rebuild`，而构建机没有 MSVC 时该步骤失败，
 *   node_modules 里那份 **Node ABI 的旧二进制会原样留在原地**，构建"成功"但产物是坏的。
 *
 * 为什么需要两种模式：
 *   一个文件位（build/Release/better_sqlite3.node）同时只能是一种 ABI。
 *   打包和 Electron 开发要 Electron ABI；vitest / server:dev 跑在本机 Node 上，要 Node ABI。
 *   所以两种二进制都缓存在 .native-cache/，按需切换。
 *
 * 用法：
 *   node scripts/ensureElectronNativeDeps.mjs                # 默认 electron
 *   node scripts/ensureElectronNativeDeps.mjs --runtime node # 本机 Node ABI
 *
 * 不需要任何 C++ 工具链。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const NATIVE_PACKAGE = "better-sqlite3";
const BINARY_RELATIVE_PATH = path.join("build", "Release", "better_sqlite3.node");
const CACHE_DIR = path.join(projectRoot, ".native-cache");
const TAG = "[native-deps]";

function fail(message) {
  // 不用 process.exit()：下载阶段可能还有未关闭的 fetch 句柄，
  // 硬退在 Windows 上会触发 libuv 断言（handle->flags & UV_HANDLE_CLOSING）。
  // 抛错让 Node 自然退出，退出码同为 1，构建照样会中止。
  throw new Error(`${TAG} ${message}`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function parseRuntime(argv) {
  const index = argv.indexOf("--runtime");
  const value = index >= 0 ? argv[index + 1] : "electron";
  if (value !== "electron" && value !== "node") {
    fail(`--runtime 只接受 electron 或 node，收到 ${JSON.stringify(value)}`);
  }
  return value;
}

function getElectronExecutable() {
  const distDir = path.join(projectRoot, "node_modules", "electron", "dist");
  const candidates =
    process.platform === "win32"
      ? ["electron.exe"]
      : process.platform === "darwin"
        ? ["Electron.app/Contents/MacOS/Electron", "electron"]
        : ["electron"];

  for (const candidate of candidates) {
    const executablePath = path.join(distDir, candidate);
    if (existsSync(executablePath)) {
      return executablePath;
    }
  }

  return fail("找不到 electron 可执行文件，请先执行 `npm install`。");
}

function getPlatformTag() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const platform = process.platform;
  if (platform !== "win32" && platform !== "darwin" && platform !== "linux") {
    fail(`不支持的平台：${platform}`);
  }
  return `${platform}-${arch}`;
}

/**
 * 直接从目标运行时二进制读取 ABI。
 * 比查 node-abi 的静态映射表可靠：表可能落后于 Electron 发布节奏。
 */
function getElectronAbi(executablePath) {
  const output = execFileSync(executablePath, ["-p", "process.versions.modules"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
  }).trim();

  const abi = Number.parseInt(output, 10);
  if (!Number.isInteger(abi) || abi <= 0) {
    fail(`无法从 electron 读取 ABI，原始输出：${JSON.stringify(output)}`);
  }
  return abi;
}

/** 极简 tar 解析：只取出目标文件，避免引入额外依赖。 */
function extractFileFromTarGz(archiveBuffer, wantedPath) {
  const tar = gunzipSync(archiveBuffer);
  let offset = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const sizeField = header
      .subarray(124, 136)
      .toString("ascii")
      .replace(/\0.*$/, "")
      .trim();
    const size = Number.parseInt(sizeField, 8) || 0;
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const entryName = prefix ? `${prefix}/${rawName}` : rawName;
    const dataStart = offset + 512;

    if (entryName === wantedPath) {
      return tar.subarray(dataStart, dataStart + size);
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return null;
}

function canLoad(executablePath, binaryPath) {
  const probe = [
    "const m = { exports: {} };",
    `process.dlopen(m, ${JSON.stringify(binaryPath)});`,
    "console.log('OK');",
  ].join("\n");

  try {
    const output = execFileSync(executablePath, ["-e", probe], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return output.includes("OK");
  } catch {
    return false;
  }
}

async function downloadBinary({ nativeVersion, abi, platformTag, label }) {
  const assetName = `${NATIVE_PACKAGE}-v${nativeVersion}-${label}-v${abi}-${platformTag}.tar.gz`;
  const downloadUrl = `https://github.com/WiseLibs/${NATIVE_PACKAGE}/releases/download/v${nativeVersion}/${assetName}`;

  const response = await fetch(downloadUrl, { redirect: "follow" });
  if (!response.ok) {
    fail(
      `下载 ${assetName} 失败（HTTP ${response.status}）。\n` +
        `该 ABI 可能尚无官方预编译包，需要在本机用 C++ 工具链从源码编译。\n` +
        `URL: ${downloadUrl}`
    );
  }

  const binary = extractFileFromTarGz(
    Buffer.from(await response.arrayBuffer()),
    BINARY_RELATIVE_PATH.replace(/\\/g, "/")
  );
  if (!binary) {
    fail(`下载包中找不到 ${BINARY_RELATIVE_PATH}，资产结构可能已变化。`);
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(
    CACHE_DIR,
    `${NATIVE_PACKAGE}-${label}-v${abi}-${platformTag}.node`
  );
  writeFileSync(cachePath, binary);
  return cachePath;
}

async function main() {
  const runtime = parseRuntime(process.argv.slice(2));

  const nativePackageDir = path.join(projectRoot, "node_modules", NATIVE_PACKAGE);
  const nativePackageJsonPath = path.join(nativePackageDir, "package.json");
  if (!existsSync(nativePackageJsonPath)) {
    fail(`node_modules/${NATIVE_PACKAGE} 不存在，请先执行 \`npm install\`。`);
  }
  const nativeVersion = readJson(nativePackageJsonPath).version;
  const targetBinaryPath = path.join(nativePackageDir, BINARY_RELATIVE_PATH);
  const platformTag = getPlatformTag();

  let executablePath;
  let abi;
  let label;

  if (runtime === "electron") {
    executablePath = getElectronExecutable();
    abi = getElectronAbi(executablePath);
    label = "electron";
  } else {
    executablePath = process.execPath;
    abi = Number.parseInt(process.versions.modules, 10);
    label = "node";
  }

  // 快路径：已经是目标 ABI 就直接返回，避免每次 npm test 都重复下载。
  if (existsSync(targetBinaryPath) && canLoad(executablePath, targetBinaryPath)) {
    console.log(`${TAG} 已是 ${label} ABI ${abi}，跳过。`);
    return;
  }

  const cachedPath = path.join(
    CACHE_DIR,
    `${NATIVE_PACKAGE}-${label}-v${abi}-${platformTag}.node`
  );

  let sourcePath;
  if (existsSync(cachedPath) && canLoad(executablePath, cachedPath)) {
    sourcePath = cachedPath;
    console.log(`${TAG} 使用缓存 ${path.basename(cachedPath)}`);
  } else {
    console.log(
      `${TAG} 下载 ${label} ABI ${abi}（${NATIVE_PACKAGE} ${nativeVersion}, ${platformTag}）`
    );
    sourcePath = await downloadBinary({
      nativeVersion,
      abi,
      platformTag,
      label,
    });
  }

  mkdirSync(path.dirname(targetBinaryPath), { recursive: true });
  writeFileSync(targetBinaryPath, readFileSync(sourcePath));
  console.log(`${TAG} 已切换到 ${label} ABI ${abi}`);

  if (!canLoad(executablePath, targetBinaryPath)) {
    fail(
      `${label} ABI ${abi} 的二进制无法在目标运行时中加载，构建已中止。\n` +
        "若提示 ABI 不匹配，说明下载到的资产与目标运行时版本不符。"
    );
  }

  console.log(`${TAG} 校验通过：可在 ${label}（ABI ${abi}）中加载。`);
}

try {
  await main();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
}
