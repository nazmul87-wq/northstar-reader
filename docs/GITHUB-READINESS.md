# GitHub readiness review

_Generated from a structured codebase review (agent). Use as a PR/release checklist; adjust before publishing._

## Executive summary

The repo is close to GitHub-ready. The reader app boots from `src/main.tsx` → `src/app/App.tsx`, persists locally via `src/features/reader/storage.ts`, and uses Tauri-friendly Vite settings (`vite.config.ts` with `base: './'`). Tauri config points `frontendDist` at `../dist` and includes Windows WebView2 bootstrap behavior in `src-tauri/src/webview_bootstrap.rs`.

**Hygiene:** Add `output/` to `.gitignore` (done in this branch) so generated audits, QA matrices, portable copies, screenshots, and deck tooling under `output/` are not committed.

**Consistency (addressed in repo):** `package.json`, `package-lock.json`, and `src-tauri/Cargo.toml` are aligned at **0.1.0**; primary in-app title matches **Northstar** (see `src/app/App.tsx`).

**Scope:** A larger vault/workspace stack exists (`src/shared/api/vaultApi.ts`, `src/features/workspace/hooks/useWorkspaceShell.ts`, etc.) that does not appear on the current reader boot path—document as future/alternate mode or trim before a tight public story.

**Secrets scan (first-party):** No `.env`, `.npmrc`, keys/certs, or obvious hardcoded tokens were reported in `src/` or `src-tauri/src/`. No TODO/FIXME/HACK markers were flagged there.

## Files to commit / never commit

**Commit**

- `package.json`, `package-lock.json`, `vite.config.ts`, `.gitignore`
- All intentional source under `src/`
- `src-tauri/Cargo.toml`, `Cargo.lock`, `build.rs`, `tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/**` (Rust backend)
- `src-tauri/icons/**` as applicable
- `docs/**` (this folder)
- `index.html`, `eslint.config.*`, `tsconfig.*`, etc.

**Never commit**

- `node_modules/` (including any under `output/` if recreated)
- `dist/`
- `src-tauri/target/`
- `src-tauri/gen/`
- `src-tauri/target/release/bundle/**` (MSI/NSIS outputs)
- `output/**` (generated; now ignored)

## Suggested PR checklist

**Branch name:** `chore/github-readiness` (example)

**Commits (example split)**

1. `chore: ignore output/ and add maintainer docs`
2. `fix: align version and branding metadata` (done: npm 0.1.0 + Northstar UI title)
3. `docs: README updates for install and GitHub Releases`

**PR title (example):** `Prepare Northstar for GitHub release`

**PR body bullets (example)**

- Document install paths, WebView2, and portable layout
- Ignore generated `output/` tree
- Align versioning and branding (if included in same PR)

**Checklist**

- [x] Public product name **Northstar** (window title, UI h1, `tauri.conf.json`)
- [x] Align versions: `package.json`, lockfile, `src-tauri/Cargo.toml` at `0.1.0` (installer filenames still use Cargo version)
- [ ] Confirm `output/`, `dist/`, `src-tauri/target/` are not staged
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run tauri:build` (or CI equivalent)
- [ ] Smoke: import `.md` / `.pdf`, annotate PDF, save/export, relaunch, persistence

## Release checklist (GitHub Releases)

**Versioning:** Pick one version (e.g. `0.1.0`) and propagate everywhere before tagging.

**Typical Windows assets to upload**

- `src-tauri/target/release/bundle/msi/Northstar_<version>_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Northstar_<version>_x64-setup.exe`
- Optional: zip of `output/portable/Northstar-Portable/` (build/copy first; do not commit the zip)

**Release notes should mention**

- Local-first storage (IndexedDB / local preferences for reader)
- WebView2 requirement; installers embed/bootstrap WebView2 per `tauri.conf.json`
- Portable folder must keep `resources/` next to `md-readeder.exe`
- SmartScreen / Unblock for unsigned or uncommon downloads

## Risks and follow-ups

- **Branding:** Crate/package name remains `md-readeder` (folder/repo naming); product display is **Northstar**.
- **Surface area:** Tauri `lib.rs` exposes vault/search/watch commands while the shipped reader path is storage-driven—reviewers may ask what is supported vs planned.
- **Alternate code:** Workspace shell and vault API may read as dead code unless documented.
- **Hygiene:** Ensure no large binaries or `node_modules` are ever force-added.
