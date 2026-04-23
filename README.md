# Northstar

Local-first **Markdown** and **PDF** reader for Windows (web + **Tauri** desktop). Import files into a private library, read and annotate PDFs, edit Markdown, and export when you need a file on disk.

## Quick links

- **[Install and use](docs/INSTALL-AND-USE.md)** — Windows installers, portable folder, WebView2, troubleshooting  
- **[GitHub / release checklist](docs/GITHUB-READINESS.md)** — what to commit, releases, risks  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite dev server (browser) |
| `npm run tauri:dev` | Desktop app + dev server |
| `npm run build` | Production `dist/` |
| `npm run tauri:build` | Desktop installers + exe |
| `npm run tauri:build:exe` | Release exe only (`--no-bundle`) |
| `npm run lint` | ESLint |

**Prerequisites (desktop):** Node.js, Rust + `cargo` on `PATH`, Microsoft Edge WebView2 Runtime (or let the app/bootstrapper install it).

## License

See `src-tauri/Cargo.toml` (MIT) and project `package.json` for npm package metadata.
