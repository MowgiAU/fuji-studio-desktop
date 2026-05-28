# Fuji Studio Desktop

Windows desktop companion app for [fujistud.io](https://fujistud.io). Watches FL Studio project folders and syncs them to your Fuji Studio account, similar to Splice Studio.

## Features

- **Folder syncing** — link any folder on your computer to a remote project
- **Incremental uploads** — only changed files are uploaded (SHA-256 content addressing)
- **Auto-sync** — watches for FL Studio saves and syncs automatically
- **Version history** — every save creates a new version, accessible from the website
- **Private until published** — projects are private until you attach a version to a public track
- **System tray** — runs in the background, sync from the tray icon
- **OAuth device flow** — secure browser-based authentication

## Architecture

```
src-tauri/         Rust backend (Tauri 2)
  src/
    main.rs        Entry point
    lib.rs         Tauri command registration + system tray
    hasher.rs      SHA-256 streaming + directory walker
    sync.rs        HTTP client for the sync protocol
    auth.rs        OAuth device-flow client
    watcher.rs     File watcher (notify crate)
    state.rs       Shared in-memory state

src/               React frontend
  components/      UI components
  hooks/           React hooks (auth, sync events)
  services/        Tauri command wrappers + persistent store
  theme/           Design tokens (mirrors fujistud.io dashboard)
```

## Prerequisites

You need three things installed before this can build:

### 1. Node.js 18+

Already installed if you can run the main `new-simon` repo. Check with:

```powershell
node --version
npm --version
```

### 2. Rust toolchain

Install via [rustup.rs](https://rustup.rs/) — download `rustup-init.exe` and run it.

After installing, restart your terminal and verify:

```powershell
rustc --version
cargo --version
```

### 3. Microsoft Visual C++ Build Tools

Tauri needs the MSVC linker. If you have Visual Studio installed it's already there.

Otherwise install [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select the **Desktop development with C++** workload.

### 4. WebView2 (almost always already installed)

Bundled with Windows 10/11. If for some reason it's missing, grab it from
[Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/).

## Setup

```powershell
cd "H:\Simon Bot\fuji-studio-desktop"
npm install
```

The first `npm install` downloads Tauri's CLI. The first `npm run tauri:dev` will then
compile Rust dependencies — this takes 5–15 minutes the first time, then is fast on
subsequent runs.

## Development

```powershell
# Run the app in dev mode (hot-reload React frontend, debug Rust backend)
npm run tauri:dev

# Just the frontend (no Tauri window — useful for UI work)
npm run dev

# Type-check the React side only
npm run type-check
```

## Building a release MSI/NSIS installer

```powershell
npm run tauri:build
```

Output ends up in `src-tauri/target/release/bundle/`.

## Connecting to a local API

By default the app talks to `https://fujistud.io`. To point it at a local dev server:

1. Launch the app and sign in
2. Go to **Settings**
3. Set API Endpoint to `http://localhost:3001` (or whatever port your API uses)
4. Restart the sign-in flow

## Sync protocol (for reference)

```
1. POST /api/projects/:id/versions/check
   Body: { files: [{ path, hash, size }, ...] }
   ← { missingHashes: string[] }

2. For every missing hash, in parallel (8 at a time):
   POST /api/projects/:id/versions/upload-file
   multipart: file=<binary>, hash=<sha256>, path=<relative>

3. POST /api/projects/:id/versions/complete
   Body: { files: [...], message?: string }
   ← Full ProjectVersion with parsed FLP arrangement
```

## Icons

Placeholder 1×1 PNG/ICO files are in `src-tauri/icons/`. Replace with the real Fuji Studio
brand assets before shipping a release build (Tauri will fail the bundle step otherwise).

## Roadmap

- [ ] Pre-flight check that warns when a project folder contains plugin presets the user
      may not legally be able to share
- [ ] Per-folder ignore rules (`.fujiignore`)
- [ ] Conflict resolution when remote has newer versions than local
- [ ] Show version history inline (download/compare/restore)
- [ ] Multi-window support for managing multiple projects at once
