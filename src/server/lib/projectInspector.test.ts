import { describe, expect, it } from "vitest";
import {
  detectPackageManager,
  inspectProjectFiles,
} from "../../../server/lib/projectInspector";

describe("projectInspector", () => {
  it("prefers pnpm lockfile", () => {
    expect(detectPackageManager(["pnpm-lock.yaml"])).toBe("pnpm");
  });

  it("detects package manager from wrapped root folder", () => {
    expect(
      detectPackageManager(["my-app/package.json", "my-app/pnpm-lock.yaml"])
    ).toBe("pnpm");
  });

  it("detects package manager from monorepo root lockfile", () => {
    expect(
      detectPackageManager([
        "package.json",
        "pnpm-lock.yaml",
        "frontend/package.json",
        "frontend/index.html",
        "frontend/src/main.tsx",
      ])
    ).toBe("pnpm");
  });

  it("marks missing package.json for vite-like projects as invalid", () => {
    const report = inspectProjectFiles(["index.html", "src/main.tsx"]);

    expect(report.valid).toBe(false);
    expect(report.errors).toContain("No supported frontend app was found");
  });

  it("treats index.html-only projects with package.json as static", () => {
    const report = inspectProjectFiles(["package.json", "index.html"]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "",
      packageManager: null,
      projectType: "static",
      frameworkId: "static-html",
      frameworkLabel: "Static HTML",
      previewMode: "embedded",
    });
  });

  it("detects Vue + Vite inside a wrapped project root", () => {
    const report = inspectProjectFiles([
      "my-app/package.json",
      "my-app/index.html",
      "my-app/vite.config.ts",
      "my-app/src/main.ts",
      "my-app/src/App.vue",
    ]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "my-app",
      packageManager: "npm",
      projectType: "vite",
      frameworkId: "vue-vite",
      frameworkLabel: "Vue + Vite",
      previewMode: "embedded",
    });
  });

  it("detects Svelte + Vite", () => {
    const report = inspectProjectFiles([
      "package.json",
      "index.html",
      "vite.config.ts",
      "src/main.ts",
      "src/App.svelte",
    ]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "",
      packageManager: "npm",
      projectType: "vite",
      frameworkId: "svelte-vite",
      frameworkLabel: "Svelte + Vite",
      previewMode: "embedded",
    });
  });

  it("detects Solid + Vite", () => {
    const report = inspectProjectFiles([
      "package.json",
      "index.html",
      "vite.config.ts",
      "src/index.tsx",
      "src/index.css",
    ]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "",
      packageManager: "npm",
      projectType: "vite",
      frameworkId: "solid-vite",
      frameworkLabel: "Solid + Vite",
      previewMode: "embedded",
    });
  });

  it("detects Astro", () => {
    const report = inspectProjectFiles([
      "package.json",
      "astro.config.mjs",
      "src/pages/index.astro",
      "src/layouts/Layout.astro",
    ]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "",
      packageManager: "npm",
      projectType: "astro",
      frameworkId: "astro",
      frameworkLabel: "Astro",
      previewMode: "embedded",
    });
  });

  it("reports adapter metadata for React + Vite", () => {
    const report = inspectProjectFiles([
      "package.json",
      "index.html",
      "vite.config.ts",
      "src/main.tsx",
      "src/App.tsx",
    ]);

    expect(report).toMatchObject({
      valid: true,
      projectType: "vite",
      frameworkId: "react-vite",
      frameworkLabel: "React + Vite",
      previewMode: "embedded",
    });
  });

  it("detects a wrapped next.js project root", () => {
    const report = inspectProjectFiles([
      "archive/site/package.json",
      "archive/site/next.config.mjs",
      "archive/site/app/page.tsx",
    ]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "archive/site",
      packageManager: "npm",
      projectType: "next",
      frameworkId: "next",
      frameworkLabel: "Next.js",
      previewMode: "external",
    });
  });

  it("reports adapter metadata for Next.js", () => {
    const report = inspectProjectFiles([
      "package.json",
      "next.config.mjs",
      "next-env.d.ts",
      "app/page.tsx",
    ]);

    expect(report).toMatchObject({
      valid: true,
      projectType: "next",
      frameworkId: "next",
      frameworkLabel: "Next.js",
      previewMode: "external",
    });
  });

  it("reports adapter metadata for static HTML", () => {
    const report = inspectProjectFiles([
      "index.html",
      "styles.css",
      "assets/logo.svg",
    ]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "",
      packageManager: null,
      projectType: "static",
      frameworkId: "static-html",
      frameworkLabel: "Static HTML",
      previewMode: "embedded",
    });
  });

  it("accepts an exported static site under out", () => {
    const report = inspectProjectFiles(["out/index.html", "out/assets/app.js"]);

    expect(report).toMatchObject({
      valid: true,
      rootPath: "out",
      packageManager: null,
      projectType: "static",
      frameworkId: "static-html",
      frameworkLabel: "Static HTML",
      previewMode: "embedded",
    });
  });

  it("returns a frontend-neutral error for unsupported JavaScript projects", () => {
    const report = inspectProjectFiles([
      "package.json",
      "src/index.js",
      "src/components/App.js",
    ]);

    expect(report.valid).toBe(false);
    expect(report.errors).toContain("No supported frontend app was found");
    expect(report.warnings).toContain(
      "A JavaScript project was detected, but its framework is not supported yet"
    );
  });
});
