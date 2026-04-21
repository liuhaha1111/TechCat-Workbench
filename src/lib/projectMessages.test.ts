import { describe, expect, it } from "vitest";
import { formatImportStartedMessage } from "./projectMessages";

describe("projectMessages", () => {
  it("formats zip import messages with the workspace path", () => {
    expect(formatImportStartedMessage("zip", "D:\\deploy\\demo-app-1234")).toBe(
      "Zip imported to D:\\deploy\\demo-app-1234."
    );
  });

  it("formats folder import messages with the workspace path", () => {
    expect(formatImportStartedMessage("folder", "/srv/deploy/demo-app-1234")).toBe(
      "Folder imported to /srv/deploy/demo-app-1234."
    );
  });
});
