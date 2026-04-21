# TechCat Workbench Desktop

Windows-first Electron shell for managing AI-generated frontend projects locally.

The desktop app now:

- imports projects from native local zip paths or source folders,
- supports React + Vite, Vue + Vite, Svelte + Vite, Solid + Vite, Astro, Next.js, and static HTML projects,
- filters large/generated directories like `node_modules`, `dist`, `build`, `.git`, `.next`, `.turbo`, `coverage`, and `.cache`,
- keeps AI generation on the server-side Electron main process,
- runs supported frontend projects as local host processes and streams runtime logs in the desktop UI,
- packages a standalone Windows installer with Electron Builder,
- checks for app updates and content bundle updates through the desktop preload bridge.

## Prerequisites

- Node.js 20+
- Windows 10/11 for the packaged desktop build path
- If an imported project uses `pnpm` or `yarn`, install that package manager on your machine too.
- GitHub repository access for `liuhaha1111/TechCat-Workbench` when publishing releases.

## Install

```bash
npm install
```

## Desktop Development

Run the Electron shell against the Vite dev server:

```bash
npm run electron:dev
```

This starts Vite on `http://127.0.0.1:3000`, launches Electron, and routes renderer calls through the preload bridge instead of the local HTTP API.

## Transitional HTTP Development

The Express project routes are still available for local testing and transition work:

```bash
npm run server:dev
npm run dev
```

## Windows Packaging

Bundle the renderer, bundle the Electron main/preload process, build the Windows installer, package the portable ZIP, and write release checksums:

```bash
npm run desktop:release
```

Packaged output is written to `frontend/release/`.

## GitHub Releases Distribution

### Public Source of Truth

Public desktop distribution now lives on GitHub Releases:

- Repository: `https://github.com/liuhaha1111/TechCat-Workbench`
- Releases: `https://github.com/liuhaha1111/TechCat-Workbench/releases`
- Tag asset base: `https://github.com/liuhaha1111/TechCat-Workbench/releases/download/v1.0.0/`

### Recommended Windows Downloads

- Primary early-access package: `TechCat-Workbench-1.0.0-Windows-Portable.zip`
- Secondary installer package: `TechCat-Workbench-1.0.0-x64.exe`
- Auto-update metadata: `latest.yml`
- Installer delta metadata: `TechCat-Workbench-1.0.0-x64.exe.blockmap`
- Published checksums: `SHA256SUMS.txt` and `SHA512SUMS.txt`

The Portable ZIP is the recommended Windows download while code signing is not yet in place. It keeps the install surface simple and avoids the installer flow for users who just want to try the app.

The installer remains available as the secondary package for users who want the normal install experience and future `electron-updater` compatibility.

### SmartScreen Note

Windows SmartScreen may still warn on both the installer and the portable executable until the app is code-signed and reputation is established. Publish that warning honestly on the public downloads page and in release notes so users know why it appears.

### Release Asset Generation

`npm run desktop:release` now produces the full GitHub Release asset set in `frontend/release/`:

- `TechCat-Workbench-1.0.0-x64.exe`
- `TechCat-Workbench-1.0.0-x64.exe.blockmap`
- `latest.yml`
- `TechCat-Workbench-1.0.0-Windows-Portable.zip`
- `SHA256SUMS.txt`
- `SHA512SUMS.txt`
- `win-unpacked/`

`latest.yml` stays pointed at the installer asset so the app can keep using installer-based auto-updates, while the Portable ZIP is offered as the human-facing primary download.

### App Release Steps

1. Confirm `package.json` has the release version to publish.
2. Confirm `electron-builder.yml` uses `productName: TechCat Workbench`, `artifactName: TechCat-Workbench-${version}-${arch}.${ext}`, and the GitHub publish target `owner: liuhaha1111`, `repo: TechCat-Workbench`.
3. Run `npm run desktop:release`.
4. Verify `frontend/release/` contains the installer, blockmap, `latest.yml`, portable ZIP, and both checksum files.
5. Create or update the GitHub Release tag `v1.0.0` and upload the generated files.
6. Keep the Portable ZIP as the recommended public download and the installer as the secondary option.
7. Mention SmartScreen in the release notes until code signing is added.

### Manual Verification After Publishing

- Open the desktop app and confirm the update panel shows the current app version.
- Use `Check for app updates` and verify the GitHub-backed installer metadata reaches the downloaded state before restarting.
- Download the Portable ZIP from GitHub Releases, extract it, and confirm the Workbench executable launches.
- Compare `Get-FileHash` output against both `SHA256SUMS.txt` and `SHA512SUMS.txt`.

## Scripts

- `npm run dev` - Vite renderer only
- `npm run electron:dev` - desktop development workflow
- `npm run electron:bundle` - build renderer assets plus bundled Electron main/preload
- `npm run electron:build` - Windows installer build via Electron Builder
- `npm run desktop:dist` - compatibility alias for `electron:build`
- `npm run desktop:release` - build installer, portable ZIP, and release checksum assets
- `npm run server:dev` - transitional HTTP API/watch mode
- `npm run test` - Vitest
- `npm run lint` - TypeScript checks
- `npm run build` - renderer-only production build

## Notes

- Imported project files are written into the deployment root you choose in the desktop UI.
- The deployment root must already exist and should be an absolute path such as `D:\deploy-projects`.
- Metadata and logs are stored in `frontend/.sandbox/workbench.db`.
- Electron preload exposes the typed desktop bridge as `window.workbench`.
