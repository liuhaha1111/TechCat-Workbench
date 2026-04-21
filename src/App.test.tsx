import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reactStateMock = vi.hoisted(() => vi.fn());
const useProjectLogsMock = vi.hoisted(() => vi.fn());
const useWorkbenchProjectsMock = vi.hoisted(() => vi.fn());
const useWorkbenchUpdatesMock = vi.hoisted(() => vi.fn());
const hasWorkbenchBridgeMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: reactStateMock,
  };
});

vi.mock("./hooks/useProjectLogs", () => ({
  useProjectLogs: useProjectLogsMock,
}));

vi.mock("./features/projects/hooks/useWorkbenchProjects", () => ({
  useWorkbenchProjects: useWorkbenchProjectsMock,
}));

vi.mock("./features/updates/hooks/useWorkbenchUpdates", () => ({
  useWorkbenchUpdates: useWorkbenchUpdatesMock,
}));

vi.mock("./lib/workbenchBridge", () => ({
  hasWorkbenchBridge: hasWorkbenchBridgeMock,
}));

import App from "./App";

describe("App import modal", () => {
  beforeEach(() => {
    const setState = vi.fn();

    useWorkbenchProjectsMock.mockReturnValue({
      projects: [],
      loading: false,
      error: null,
      reload: vi.fn().mockResolvedValue(undefined),
    });
    useProjectLogsMock.mockReturnValue([]);
    useWorkbenchUpdatesMock.mockReturnValue({
      snapshot: {
        appVersion: "0.2.0",
        contentVersion: "2026.04.04.1",
        appUpdate: { kind: "idle" },
        contentUpdate: { kind: "idle" },
      },
      busy: false,
      error: null,
      checkAppUpdate: vi.fn(),
      checkContentUpdate: vi.fn(),
      applyAppUpdate: vi.fn(),
    });
    hasWorkbenchBridgeMock.mockReturnValue(true);

    reactStateMock.mockReset();
    reactStateMock
      .mockImplementationOnce(() => ["dashboard", setState])
      .mockImplementationOnce(() => [null, setState])
      .mockImplementationOnce(() => [true, setState])
      .mockImplementationOnce(() => ["zip", setState])
      .mockImplementationOnce(() => ["", setState])
      .mockImplementationOnce(() => ["", setState])
      .mockImplementationOnce(() => [null, setState])
      .mockImplementationOnce(() => [null, setState])
      .mockImplementationOnce(() => [false, setState])
      .mockImplementationOnce(() => [false, setState])
      .mockImplementationOnce(() => [null, setState])
      .mockImplementationOnce(() => ["dark", setState]);
  });

  it("shows the native zip picker action in the import modal", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Choose Zip File");
    expect(html).not.toContain('type="file"');
  });

  it("renders browser file inputs when the preload bridge is unavailable", () => {
    hasWorkbenchBridgeMock.mockReturnValue(false);

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Choose Zip File");
    expect(html).toContain('type="file"');
  });
});
