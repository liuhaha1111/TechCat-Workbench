import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";

describe("Vite config", () => {
  it("uses a relative base path so packaged Electron builds can load assets over file://", () => {
    expect(viteConfig.base).toBe("./");
  });
});