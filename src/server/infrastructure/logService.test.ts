import { describe, expect, it, vi } from "vitest";
import { LogService } from "../../../server/infrastructure/logService";

describe("LogService", () => {
  it("publishes events to subscribers and unsubscribes cleanly", () => {
    const logService = new LogService();
    const listener = vi.fn();
    const unsubscribe = logService.subscribe("project-1", listener);

    logService.publish({
      projectId: "project-1",
      stream: "system",
      line: "hello",
      createdAt: "2026-04-02T00:00:00.000Z",
    });

    expect(listener).toHaveBeenCalledWith({
      projectId: "project-1",
      stream: "system",
      line: "hello",
      createdAt: "2026-04-02T00:00:00.000Z",
    });

    unsubscribe();
    logService.publish({
      projectId: "project-1",
      stream: "system",
      line: "again",
      createdAt: "2026-04-02T00:00:01.000Z",
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
