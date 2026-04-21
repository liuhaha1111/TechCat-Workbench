import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectActions } from "./ProjectActions";

describe("ProjectActions", () => {
  it("renders execute button", () => {
    const html = renderToStaticMarkup(
      <ProjectActions
        status="ready"
        busy={false}
        onExecute={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRestart={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(html).toContain("Execute");
  });

  it("renders delete button", () => {
    const html = renderToStaticMarkup(
      <ProjectActions
        status="ready"
        busy={false}
        onExecute={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRestart={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(html).toContain("Delete");
  });

  it("renders start button for stopped projects", () => {
    const html = renderToStaticMarkup(
      <ProjectActions
        status="stopped"
        busy={false}
        onExecute={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRestart={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(html).toContain("Start");
    expect(html).not.toContain("Stop");
  });
});
