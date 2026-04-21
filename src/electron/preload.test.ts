import { describe, expect, it, vi } from "vitest";
import { createWorkbenchApi } from "../../electron/preload";
import { WORKBENCH_CHANNELS } from "../../electron/types";

describe("WorkbenchApi updates bridge", () => {
  it("exposes typed update methods and channels", () => {
    const api = createWorkbenchApi({
      invoke: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    } as never);

    expect(api.updates).toBeDefined();
    expect(typeof api.updates.getStatus).toBe("function");
    expect(typeof api.updates.checkAppUpdate).toBe("function");
    expect(typeof api.updates.checkContentUpdate).toBe("function");
    expect(WORKBENCH_CHANNELS.updates.status).toBe("updates:status");
    expect(WORKBENCH_CHANNELS.updates.checkApp).toBe("updates:checkApp");
    expect(WORKBENCH_CHANNELS.updates.checkContent).toBe("updates:checkContent");
  });
});
