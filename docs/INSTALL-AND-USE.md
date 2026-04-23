# Northstar — install and use

_End-user and developer guide (agent-authored; verify UI labels against your build)._

## 1. For end users (Windows)

### Install options

**MSI installer**

- Suited to managed installs and standard “Add/Remove Programs” workflows.
- Artifact directory: `src-tauri/target/release/bundle/msi/`
- Typical name: `Northstar_<version>_x64_en-US.msi`

**NSIS installer (`.exe`)**

- Simple download-and-run setup flow.
- Artifact directory: `src-tauri/target/release/bundle/nsis/`
- Typical name: `Northstar_<version>_x64-setup.exe`

**Portable folder**

- No system-wide install; copy the whole folder.
- After a local build, see `output/portable/Northstar-Portable/` (or assemble `md-readeder.exe` + `resources/` yourself).
- Run `md-readeder.exe` or `Run-Northstar.cmd`.
- **Do not** move only the `.exe` — keep `resources/` beside it.

### WebView2

Northstar is a **Tauri** app and needs the **Microsoft Edge WebView2 Runtime**.

- If WebView2 is missing, installers can run Microsoft’s embedded bootstrapper (`tauri.conf.json` → `bundle.windows.webviewInstallMode`).
- The portable `md-readeder.exe` includes logic to download and silently install WebView2 on first launch when needed (internet once).
- **Offline machines:** install WebView2 manually first:  
  https://developer.microsoft.com/microsoft-edge/webview2/

### First launch

- Possible UAC / installer UI for WebView2.
- App may **relaunch once** after WebView2 install (`NORTHSTAR_WEBVIEW2_BOOTSTRAP_DONE` env guard).
- Library starts empty until you import Markdown or PDF files.

### Troubleshooting

| Issue | What to try |
|--------|----------------|
| Blank window | Wait for WebView2 setup; kill stray `md-readeder` in Task Manager; go online or install WebView2 manually; use a fresh build (see developer section). |
| Double‑click portable does nothing | Use the whole portable folder; try `Run-Northstar.cmd`; end stuck processes. |
| SmartScreen | **More info** → **Run anyway**; or Properties → **Unblock**. |

---

## 2. How to use the app (reader)

### Import

- **Import files** — `.md`, `.markdown`, or `.pdf`.
- **Import folder** — supported files from a directory tree.
- Items appear in the **left library**.

### Markdown

- Center: rendered preview.
- Right: source for editing (verify exact layout in your build).

### PDF

- Center: PDF viewer; page navigation in single-page mode; zoom.
- Modes such as **Single** vs **continuous / book scroll** (verify labels in UI).
- **Full screen** — use app control; **Esc** exits fullscreen (verify in your build).

### Annotations (PDF)

- Tools for highlight-style marks and comments; color picker.
- List/manage annotations in the right panel when a PDF is active.

### Save / export

- **Save markdown** / **Save PDF with annotations** — writes a file download; use these to get content back to disk.

### Persistence

- Library and annotations are stored **locally** (IndexedDB and related prefs). Not synced to a server by default.

---

## 3. For developers

### Prerequisites

- **Node.js** + npm  
- **Rust** + **cargo** on `PATH` (e.g. `%USERPROFILE%\.cargo\bin`)  
- **WebView2** locally, or allow bootstrap on first run  

### Clone and install

```bash
git clone <repo-url>
cd "md readeder"
npm install
```

### Commands

| Goal | Command |
|------|---------|
| Web only (Vite) | `npm run dev` → http://127.0.0.1:1420 |
| Desktop + dev server | `npm run tauri:dev` |
| Production web assets | `npm run build` → `dist/` |
| Full desktop bundles | `npm run tauri:build` (runs `npm run build` via `beforeBuildCommand`) |
| Exe only, no MSI/NSIS | `npm run tauri:build:exe` |
| Lint | `npm run lint` |

### Important packaging notes

- **`base: './'`** in Vite — required so asset URLs work inside Tauri’s custom protocol (avoids blank WebView).
- **`freezePrototype`** — do **not** enable for this React stack; it can freeze `Object.prototype` and break the bundle at runtime.

### Artifact locations

- Web: `dist/`
- Desktop exe: `src-tauri/target/release/md-readeder.exe`
- Installers: `src-tauri/target/release/bundle/msi/`, `.../bundle/nsis/`

---

## 4. GitHub Releases (optional)

Upload, for example:

- MSI + NSIS from `src-tauri/target/release/bundle/...`
- Zip of the portable folder (exe + `resources/` + launcher)

Release notes should call out WebView2, SmartScreen, and portable folder layout. Add SHA256 hashes if you publish broadly.
