import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const releaseDir = path.join(rootDir, "release");
const packageJsonPath = path.join(rootDir, "package.json");
const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
const version = packageJson.version;
const portableName = `TechCat-Workbench-${version}-Windows-Portable.zip`;
const installerName = `TechCat-Workbench-${version}-x64.exe`;
const portablePath = path.join(releaseDir, portableName);
const installerPath = path.join(releaseDir, installerName);
const unpackedDir = path.join(releaseDir, "win-unpacked");
const fixedZipDate = new Date("2026-01-01T00:00:00.000Z");

await fs.access(unpackedDir);
await fs.access(installerPath);

const zip = new AdmZip();

// 运行时状态目录绝不进发布包。
// 应用启动时会在可执行文件同级写 .sandbox/workbench.db；只要有人在打包前
// 从 release/win-unpacked 跑过一次应用，这个本地数据库就会被打进 ZIP 发给用户。
const EXCLUDED_ENTRY_NAMES = new Set([".sandbox", ".native-cache"]);

async function addDirectoryEntries(currentDir, relativeDir = "") {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (EXCLUDED_ENTRY_NAMES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await addDirectoryEntries(fullPath, relativePath);
      continue;
    }

    const fileBuffer = await fs.readFile(fullPath);
    zip.addFile(relativePath.replace(/\\/g, "/"), fileBuffer);
    const zipEntry = zip.getEntry(relativePath.replace(/\\/g, "/"));
    if (zipEntry) {
      zipEntry.header.time = fixedZipDate;
    }
  }
}

function hashFile(filePath, algorithm) {
  return fs.readFile(filePath).then((buffer) => createHash(algorithm).update(buffer).digest("hex"));
}

await addDirectoryEntries(unpackedDir);
zip.writeZip(portablePath);

const checksumTargets = [installerName, portableName].sort((left, right) => left.localeCompare(right));
const sha256Lines = [];
const sha512Lines = [];

for (const fileName of checksumTargets) {
  const filePath = path.join(releaseDir, fileName);
  sha256Lines.push(`${await hashFile(filePath, "sha256")} *${fileName}`);
  sha512Lines.push(`${await hashFile(filePath, "sha512")} *${fileName}`);
}

await fs.writeFile(path.join(releaseDir, "SHA256SUMS.txt"), `${sha256Lines.join("\n")}\n`, "utf8");
await fs.writeFile(path.join(releaseDir, "SHA512SUMS.txt"), `${sha512Lines.join("\n")}\n`, "utf8");
