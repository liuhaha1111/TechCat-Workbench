import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const script = readFileSync(
  path.join(projectRoot, "scripts", "buildPortableRelease.mjs"),
  "utf8"
);

describe("portable release packaging", () => {
  it("keeps runtime state out of the published archive", () => {
    // 应用启动时会在可执行文件同级写 .sandbox/workbench.db。
    // 只要有人在打包前从 release/win-unpacked 跑过一次应用，这个本地数据库
    // 就会跟着 ZIP 发给所有人。排除规则必须存在，且必须真的作用在目录遍历里。
    expect(script).toContain("EXCLUDED_ENTRY_NAMES");
    expect(script).toContain(".sandbox");
    expect(script).toContain(".native-cache");
    expect(script).toMatch(/EXCLUDED_ENTRY_NAMES\.has\(entry\.name\)/);
  });
});
