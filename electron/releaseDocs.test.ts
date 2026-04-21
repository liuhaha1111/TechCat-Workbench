import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop release docs", () => {
  it("documents GitHub Releases as the public distribution source", () => {
    const readme = readFileSync(path.resolve("README.md"), "utf8");

    expect(readme).toContain("https://github.com/liuhaha1111/TechCat-Workbench/releases");
    expect(readme).toContain("TechCat-Workbench-1.0.0-Windows-Portable.zip");
    expect(readme).toContain("TechCat-Workbench-1.0.0-x64.exe");
    expect(readme).toContain("SHA256SUMS.txt");
    expect(readme).toContain("SHA512SUMS.txt");
    expect(readme).toContain("npm run desktop:release");
  });
});

