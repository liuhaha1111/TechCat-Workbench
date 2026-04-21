import { afterEach, describe, expect, it, vi } from "vitest";

const useStateMock = vi.hoisted(() => vi.fn());
const useEffectMock = vi.hoisted(() => vi.fn());
const hasWorkbenchBridgeMock = vi.hoisted(() => vi.fn());
const updatesClientMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  checkAppUpdate: vi.fn(),
  checkContentUpdate: vi.fn(),
  applyAppUpdate: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useState: useStateMock,
    useEffect: useEffectMock,
  };
});

vi.mock("../../../lib/workbenchBridge", () => ({
  hasWorkbenchBridge: hasWorkbenchBridgeMock,
}));

vi.mock("../services/updatesClient", () => ({
  updatesClient: updatesClientMock,
}));

import { useWorkbenchUpdates } from "./useWorkbenchUpdates";

describe("useWorkbenchUpdates", () => {
  afterEach(() => {
    useStateMock.mockReset();
    useEffectMock.mockReset();
    hasWorkbenchBridgeMock.mockReset();
    updatesClientMock.getStatus.mockReset();
    updatesClientMock.checkAppUpdate.mockReset();
    updatesClientMock.checkContentUpdate.mockReset();
    updatesClientMock.applyAppUpdate.mockReset();
  });

  it("shows a friendly desktop-only message when the preload bridge is unavailable", () => {
    const setSnapshot = vi.fn();
    const setBusy = vi.fn();
    const setError = vi.fn();

    useStateMock
      .mockImplementationOnce(() => [null, setSnapshot])
      .mockImplementationOnce(() => [false, setBusy])
      .mockImplementationOnce(() => [null, setError]);
    useEffectMock.mockImplementation((effect: () => void) => {
      effect();
    });
    hasWorkbenchBridgeMock.mockReturnValue(false);

    useWorkbenchUpdates();

    expect(updatesClientMock.getStatus).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(
      "Desktop update controls are available in the Electron app."
    );
  });
});
