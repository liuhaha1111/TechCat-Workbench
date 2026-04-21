import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UpdatesPanel } from "./UpdatesPanel";

describe("UpdatesPanel", () => {
  it("shows app version, content version, and manual actions", () => {
    const html = renderToStaticMarkup(
      <UpdatesPanel
        snapshot={{
          appVersion: "0.2.1",
          contentVersion: "2026.04.04.1",
          appUpdate: { kind: "idle" },
          contentUpdate: { kind: "idle" },
        }}
        busy={false}
        onCheckApp={vi.fn()}
        onCheckContent={vi.fn()}
        onApplyAppUpdate={vi.fn()}
      />
    );

    expect(html).toContain("0.2.1");
    expect(html).toContain("2026.04.04.1");
    expect(html).toContain("Check App Updates");
    expect(html).toContain("Check Content Updates");
  });
});
