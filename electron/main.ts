import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  shell,
  Notification,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { autoUpdater } from 'electron-updater';
import * as chokidar from 'chokidar';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_API_BASE = 'https://fujistud.io';
const MAX_PARALLEL_UPLOADS = 8;
const IS_DEV = !app.isPackaged;

// ─── App state ────────────────────────────────────────────────────────────────

interface WatcherEntry {
  watcher: ReturnType<typeof chokidar.watch>;
  projectId: string;
  folderPath: string;
}

interface AppState {
  token: string | null;
  apiBase: string;
  watchers: Map<string, WatcherEntry>;
  lastMessageCount: number;
}

const state: AppState = {
  token: null,
  apiBase: DEFAULT_API_BASE,
  watchers: new Map(),
  lastMessageCount: 0,
};

// ─── Persistent store (JSON file) ────────────────────────────────────────────

function readStore(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'fuji-studio.json'), 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(app.getPath('userData'), 'fuji-studio.json'),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

function getSetting<T>(key: string, defaultValue: T): T {
  const store = readStore();
  return (store[key] as T) ?? defaultValue;
}

// ─── Window & tray ────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 860,
    minHeight: 580,
    title: 'Fuji Studio',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (IS_DEV) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting && getSetting('minimizeToTray', true)) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray(): void {
  const iconPath = IS_DEV
    ? path.join(process.cwd(), 'resources', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png');

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Fuji Studio');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Fuji Studio', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Sync now', click: () => { mainWindow?.webContents.send('tray:sync_now'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ─── File hashing + walking ───────────────────────────────────────────────────

interface LocalFile {
  path: string;
  hash: string;
  size: number;
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function shouldSkip(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const part of normalized.split('/')) {
    if (part === '.fuji-sync') return true;
    if (part.startsWith('.') && part !== '.' && part !== '..') return true;
  }
  const ext = path.extname(filePath).toLowerCase().slice(1);
  if (['bak', 'tmp', 'swp'].includes(ext)) return true;
  if (filePath.endsWith('~')) return true;
  return false;
}

function walkProject(rootDir: string): LocalFile[] {
  const files: LocalFile[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (shouldSkip(fullPath)) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const hash = hashFile(fullPath);
          const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
          files.push({ path: relPath, hash, size: stat.size });
        } catch { /* skip unreadable */ }
      }
    }
  }
  walk(rootDir);
  return files;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function authHeader(): string {
  if (!state.token) throw new Error('Not authenticated. Please sign in first.');
  return `Bearer ${state.token}`;
}

async function apiGet<T>(urlPath: string): Promise<T> {
  const resp = await fetch(`${state.apiBase}${urlPath}`, {
    headers: { Authorization: authHeader() },
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json() as Promise<T>;
}

async function apiPost<T>(urlPath: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${state.apiBase}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt || `API error: ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

async function apiPut<T>(urlPath: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${state.apiBase}${urlPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json() as Promise<T>;
}

// Fix relative avatar URLs so they resolve against the API base
function fixAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${state.apiBase}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

interface SyncProgress {
  project_id: string;
  stage: 'scanning' | 'checking' | 'uploading' | 'finalizing' | 'done' | 'error';
  uploaded: number;
  total: number;
  current_file?: string | null;
  message?: string | null;
}

function emitProgress(p: SyncProgress): void {
  mainWindow?.webContents.send('sync:progress', p);
}

async function parallelEach<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    let item: T | undefined;
    while ((item = queue.shift()) !== undefined) await fn(item);
  });
  await Promise.all(workers);
}

// ─── IPC: Auth ────────────────────────────────────────────────────────────────

ipcMain.handle('start_device_auth', async () => {
  const resp = await fetch(`${state.apiBase}/api/oauth/device/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'fuji-studio-desktop', scope: 'project:read project:write' }),
  });
  if (!resp.ok) throw new Error(`Server returned error: ${await resp.text()}`);
  return resp.json();
});

ipcMain.handle('poll_device_auth', async (_, deviceCode: string) => {
  const resp = await fetch(`${state.apiBase}/api/oauth/device/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  const body = await resp.text();
  if (resp.ok) {
    const { access_token } = JSON.parse(body) as { access_token: string };
    state.token = access_token;
    return { status: 'Ok', access_token };
  }
  let err: { error: string; error_description?: string };
  try { err = JSON.parse(body); } catch { err = { error: 'unknown_error' }; }
  if (err.error === 'authorization_pending' || err.error === 'slow_down') return { status: 'Pending' };
  return { status: 'Error', error: err.error, description: err.error_description };
});

ipcMain.handle('set_token', (_, token: string) => { state.token = token; });
ipcMain.handle('get_token', () => state.token);
ipcMain.handle('clear_token', () => { state.token = null; });
ipcMain.handle('revoke_token', async () => {
  const token = state.token;
  state.token = null;
  if (token) {
    await fetch(`${state.apiBase}/api/oauth/device/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
});
ipcMain.handle('set_api_base', (_, base: string) => {
  state.apiBase = base.trim().replace(/\/+$/, '') || DEFAULT_API_BASE;
});
ipcMain.handle('get_api_base', () => state.apiBase);

// ─── IPC: Projects ────────────────────────────────────────────────────────────

ipcMain.handle('get_desktop_me', async () => {
  const me = await apiGet<{ userId: string; discordId: string | null; username: string; displayName: string | null; avatar: string | null; projectCount: number; totalStorageBytes: number; storageQuotaBytes: number; storageTier: string }>('/api/projects/desktop/me');
  return { ...me, avatar: fixAvatarUrl(me.avatar) };
});
ipcMain.handle('list_remote_projects', () => apiGet('/api/projects'));
ipcMain.handle('create_remote_project', (_, name: string, description?: string) =>
  apiPost('/api/projects', { name, description }),
);
ipcMain.handle('get_project_detail', (_, projectId: string) =>
  apiGet(`/api/projects/${projectId}`),
);
ipcMain.handle('list_my_tracks', () => apiGet('/api/projects/my-tracks'));
ipcMain.handle('get_desktop_storage', () => apiGet('/api/projects/desktop/storage'));
ipcMain.handle('list_genres', () => apiGet('/api/musician/genres'));
ipcMain.handle('upload_track', async (_, payload: {
  audioBuffer: Buffer; audioName: string; audioMime: string;
  artworkBuffer?: Buffer; artworkName?: string; artworkMime?: string;
  title: string; isPublic: boolean;
  bpm?: string; key?: string; description?: string; lyrics?: string;
  trackType?: string; artist?: string; album?: string; year?: string;
  allowAudioDownload?: boolean; allowProjectDownload?: boolean;
  license?: string; genreIds?: string[];
}) => {
  const form = new FormData();
  form.append('audio', new Blob([payload.audioBuffer], { type: payload.audioMime }), payload.audioName);
  form.append('title', payload.title);
  form.append('isPublic', payload.isPublic ? 'true' : 'false');
  if (payload.artworkBuffer && payload.artworkName) {
    form.append('artwork', new Blob([payload.artworkBuffer], { type: payload.artworkMime || 'image/jpeg' }), payload.artworkName);
  }
  if (payload.bpm) form.append('bpm', payload.bpm);
  if (payload.key) form.append('key', payload.key);
  if (payload.description) form.append('description', payload.description);
  if (payload.lyrics) form.append('lyrics', payload.lyrics);
  if (payload.trackType) form.append('trackType', payload.trackType);
  if (payload.artist) form.append('artist', payload.artist);
  if (payload.album) form.append('album', payload.album);
  if (payload.year) form.append('year', payload.year);
  form.append('allowAudioDownload', String(payload.allowAudioDownload ?? true));
  form.append('allowProjectDownload', String(payload.allowProjectDownload ?? true));
  if (payload.license) form.append('license', payload.license);
  if (payload.genreIds?.length) form.append('genreIds', JSON.stringify(payload.genreIds));
  const resp = await fetch(`${state.apiBase}/api/musician/tracks`, {
    method: 'POST',
    headers: { Authorization: authHeader() },
    body: form,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    let parsed: any = {};
    try { parsed = JSON.parse(txt); } catch {}
    throw new Error(parsed.error || txt || `Upload failed (${resp.status})`);
  }
  return resp.json();
});
ipcMain.handle('get_version_diff', (_, projectId: string, versionId: string) =>
  apiGet(`/api/projects/${projectId}/versions/${versionId}/diff`),
);
ipcMain.handle('publish_version', (_, projectId: string, versionId: string, trackId: string) =>
  apiPost(`/api/projects/${projectId}/publish`, { versionId, trackId }),
);
ipcMain.handle('unpublish_version', (_, projectId: string, trackId: string) =>
  apiPost(`/api/projects/${projectId}/unpublish`, { trackId }),
);

// ─── IPC: Sync ────────────────────────────────────────────────────────────────

ipcMain.handle('scan_local_folder', (_, folderPath: string) => {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Not a directory: ${folderPath}`);
  }
  const files = walkProject(folderPath);
  return { files, total_size: files.reduce((a, f) => a + f.size, 0) };
});

ipcMain.handle('sync_local_project', async (_, projectId: string, folderPath: string, message?: string) => {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Folder not found: ${folderPath}`);
  }

  emitProgress({ project_id: projectId, stage: 'scanning', uploaded: 0, total: 0, message: 'Hashing project files…' });
  const files = walkProject(folderPath);
  if (files.length === 0) throw new Error('Project folder is empty or contains no syncable files');

  emitProgress({ project_id: projectId, stage: 'checking', uploaded: 0, total: files.length, message: 'Comparing file hashes against server…' });
  const checkResp = await fetch(`${state.apiBase}/api/projects/${projectId}/versions/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ files }),
  });
  if (!checkResp.ok) throw new Error(`Check failed: ${await checkResp.text()}`);
  const { missingHashes } = await checkResp.json() as { missingHashes: string[] };
  const missingSet = new Set(missingHashes);

  const toUpload = files.filter((f) => missingSet.has(f.hash));
  const totalUploads = toUpload.length;
  let uploaded = 0;

  emitProgress({ project_id: projectId, stage: 'uploading', uploaded: 0, total: totalUploads, message: `${totalUploads} of ${files.length} files need uploading` });

  const uploadUrl = `${state.apiBase}/api/projects/${projectId}/versions/upload-file`;
  await parallelEach(toUpload, async (f) => {
    const absPath = path.join(folderPath, ...f.path.split('/'));
    const buffer = fs.readFileSync(absPath);
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'application/octet-stream' }), f.path);
    formData.append('hash', f.hash);
    formData.append('path', f.path);
    const resp = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: authHeader() }, body: formData });
    if (!resp.ok) throw new Error(`Upload failed for ${f.path}: ${await resp.text()}`);
    uploaded++;
    emitProgress({ project_id: projectId, stage: 'uploading', uploaded, total: totalUploads, current_file: f.path });
  }, MAX_PARALLEL_UPLOADS);

  emitProgress({ project_id: projectId, stage: 'finalizing', uploaded: totalUploads, total: totalUploads, message: 'Creating version & parsing FLP…' });
  const completeResp = await fetch(`${state.apiBase}/api/projects/${projectId}/versions/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify({ files, message }),
  });
  if (!completeResp.ok) throw new Error(`Finalize failed: ${await completeResp.text()}`);
  const version = await completeResp.json();

  emitProgress({ project_id: projectId, stage: 'done', uploaded: totalUploads, total: totalUploads, message: 'Sync complete' });
  return version;
});

// ─── IPC: Updater ─────────────────────────────────────────────────────────────

autoUpdater.setFeedURL({ provider: 'generic', url: 'https://fujistud.io/api/desktop/update' });
autoUpdater.autoDownload = false;

ipcMain.handle('check_for_update', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo) {
      return {
        available: true,
        version: result.updateInfo.version,
        body: Array.isArray(result.updateInfo.releaseNotes)
          ? result.updateInfo.releaseNotes[0]?.note ?? null
          : (result.updateInfo.releaseNotes as string | null) ?? null,
      };
    }
    return { available: false };
  } catch { return { available: false }; }
});

ipcMain.handle('install_update', async () => {
  await autoUpdater.downloadUpdate();
  autoUpdater.quitAndInstall();
});

// ─── IPC: Watcher ─────────────────────────────────────────────────────────────

ipcMain.handle('watch_project_folder', (_, projectId: string, folderPath: string) => {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Not a directory: ${folderPath}`);
  }
  if (state.watchers.has(projectId)) throw new Error('Already watching this project');

  const pendingPaths = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: (p: string) => shouldSkip(p),
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('all', (event: string, p: string) => {
    if (!['add', 'change', 'unlink'].includes(event)) return;
    pendingPaths.add(p);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const paths = [...pendingPaths];
      pendingPaths.clear();
      mainWindow?.webContents.send('watcher:changed', { project_id: projectId, paths });
    }, 2000);
  });

  state.watchers.set(projectId, { watcher, projectId, folderPath });
});

ipcMain.handle('unwatch_project_folder', async (_, projectId: string) => {
  const entry = state.watchers.get(projectId);
  if (!entry) throw new Error('Not watching this project');
  await entry.watcher.close();
  state.watchers.delete(projectId);
});

ipcMain.handle('list_watched_folders', () =>
  [...state.watchers.values()].map((w) => ({ project_id: w.projectId, local_path: w.folderPath })),
);

// ─── IPC: Store ───────────────────────────────────────────────────────────────

ipcMain.handle('store:get', (_, key: string) => readStore()[key] ?? null);
ipcMain.handle('store:set', (_, key: string, value: unknown) => {
  const data = readStore();
  data[key] = value;
  writeStore(data);
});
ipcMain.handle('store:delete', (_, key: string) => {
  const data = readStore();
  delete data[key];
  writeStore(data);
});

// ─── IPC: Dialog & shell ──────────────────────────────────────────────────────

ipcMain.handle('select_folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select project folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open_external', (_event, url: string) => shell.openExternal(url));

// ─── IPC: App settings ────────────────────────────────────────────────────────

ipcMain.handle('get_settings', () => {
  const store = readStore();
  return {
    minimizeToTray: (store.minimizeToTray as boolean) ?? true,
    desktopNotifications: (store.desktopNotifications as boolean) ?? true,
    launchAtStartup: app.getLoginItemSettings().openAtLogin,
  };
});

ipcMain.handle('set_setting', (_, key: string, value: unknown) => {
  if (key === 'launchAtStartup') {
    app.setLoginItemSettings({ openAtLogin: !!value });
    return;
  }
  const data = readStore();
  data[key] = value;
  writeStore(data);
});

// ─── IPC: Notifications ───────────────────────────────────────────────────────

ipcMain.handle('get_notifications', () =>
  apiGet('/api/projects/desktop/notifications'),
);

ipcMain.handle('mark_notifications_read', () =>
  apiPost('/api/projects/desktop/notifications/read'),
);

// ─── IPC: Messages ────────────────────────────────────────────────────────────

ipcMain.handle('list_conversations', () =>
  apiGet('/api/projects/desktop/conversations'),
);

ipcMain.handle('create_conversation', (_, participantIds: string[]) =>
  apiPost('/api/projects/desktop/conversations', { participantIds }),
);

ipcMain.handle('get_messages', (_, convId: string, before?: string) => {
  const q = before ? `?before=${encodeURIComponent(before)}` : '';
  return apiGet(`/api/projects/desktop/conversations/${convId}/messages${q}`);
});

ipcMain.handle('send_message', (_, convId: string, content: string) =>
  apiPost(`/api/projects/desktop/conversations/${convId}/messages`, { content }),
);

ipcMain.handle('mark_conversation_read', (_, convId: string) =>
  apiPut(`/api/projects/desktop/conversations/${convId}/read`),
);

ipcMain.handle('get_unread_count', () =>
  apiGet('/api/projects/desktop/messages/unread'),
);

ipcMain.handle('search_users', (_, q: string) =>
  apiGet(`/api/projects/desktop/users/search?q=${encodeURIComponent(q)}`),
);

// Show a desktop notification for new messages (called from renderer via IPC)
ipcMain.handle('show_notification', (_, title: string, body: string) => {
  if (!getSetting('desktopNotifications', true)) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  n.show();
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    for (const entry of state.watchers.values()) entry.watcher.close();
  });
}
