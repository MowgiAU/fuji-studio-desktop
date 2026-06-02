// Typed wrappers around the Electron main process IPC commands.
// All actual HTTP traffic and file I/O happens in electron/main.ts.

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export type PollResult =
  | { status: 'Ok'; access_token: string }
  | { status: 'Pending' }
  | { status: 'Error'; error: string; description?: string };

export interface RemoteProject {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  updatedAt?: string | null;
}

export interface TrackRef {
  id: string;
  title: string;
  slug?: string | null;
}

export interface VersionTrackLink {
  trackId: string;
  track: TrackRef;
}

export interface ProjectTrackLink {
  trackId: string;
  versionId: string;
  track: TrackRef;
}

export interface RemoteProjectVersion {
  id: string;
  versionNumber: number;
  message?: string | null;
  totalFiles: number;
  totalSize: number;
  createdAt: string;
  isParsed: boolean;
  trackLinks: VersionTrackLink[];
}

export interface RemoteProjectDetail extends RemoteProject {
  versions: RemoteProjectVersion[];
  trackLinks: ProjectTrackLink[];
}

export interface MyTrack {
  id: string;
  title: string;
  coverUrl?: string | null;
  duration?: number | null;
  isPublic: boolean;
}

export interface VersionDiff {
  versionNumber: number;
  previousVersionNumber: number | null;
  totalFiles: number;
  added: string[];
  changed: string[];
  removed: string[];
  createdAt: string;
}

export interface LocalFile {
  path: string;
  hash: string;
  size: number;
}

export interface ScanResult {
  files: LocalFile[];
  total_size: number;
}

export interface WatchedEntry {
  project_id: string;
  local_path: string;
}

export interface SyncProgress {
  project_id: string;
  stage: 'scanning' | 'checking' | 'uploading' | 'finalizing' | 'done' | 'error';
  uploaded: number;
  total: number;
  current_file?: string | null;
  message?: string | null;
}

export interface DesktopMe {
  userId: string;
  discordId: string | null;
  username: string;
  displayName: string | null;
  avatar: string | null;
  projectCount: number;
  totalStorageBytes: number;
  storageQuotaBytes: number;
  storageTier: string;
}

export interface DesktopStorage {
  usedBytes: number;
  quotaBytes: number;
  tier: string;
}

export interface UpdateInfo {
  available: boolean;
  version?: string | null;
  body?: string | null;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const startDeviceAuth = (): Promise<DeviceCodeResponse> =>
  window.electronAPI.startDeviceAuth();

export const pollDeviceAuth = (device_code: string): Promise<PollResult> =>
  window.electronAPI.pollDeviceAuth(device_code);

export const setToken = (token: string): Promise<void> =>
  window.electronAPI.setToken(token);

export const getToken = (): Promise<string | null> =>
  window.electronAPI.getToken();

export const clearToken = (): Promise<void> =>
  window.electronAPI.clearToken();

export const revokeToken = (): Promise<void> =>
  window.electronAPI.revokeToken();

export const setApiBase = (base: string): Promise<void> =>
  window.electronAPI.setApiBase(base);

export const getApiBase = (): Promise<string> =>
  window.electronAPI.getApiBase();

// ─── Projects ─────────────────────────────────────────────────────────────────

export const getDesktopMe = (): Promise<DesktopMe> =>
  window.electronAPI.getDesktopMe();

export const getDesktopStorage = (): Promise<DesktopStorage> =>
  window.electronAPI.getDesktopStorage();

export interface Genre {
  id: string;
  name: string;
  parentId: string | null;
}

export const listGenres = (): Promise<Genre[]> =>
  window.electronAPI.listGenres();

export const uploadTrack = (payload: Parameters<Window['electronAPI']['uploadTrack']>[0]) =>
  window.electronAPI.uploadTrack(payload);

export const listRemoteProjects = (): Promise<RemoteProject[]> =>
  window.electronAPI.listRemoteProjects() as Promise<RemoteProject[]>;

export const createRemoteProject = (name: string, description?: string): Promise<RemoteProject> =>
  window.electronAPI.createRemoteProject(name, description) as Promise<RemoteProject>;

export const getProjectDetail = (projectId: string): Promise<RemoteProjectDetail> =>
  window.electronAPI.getProjectDetail(projectId) as Promise<RemoteProjectDetail>;

export const listMyTracks = (): Promise<MyTrack[]> =>
  window.electronAPI.listMyTracks() as Promise<MyTrack[]>;

export const getVersionDiff = (projectId: string, versionId: string): Promise<VersionDiff> =>
  window.electronAPI.getVersionDiff(projectId, versionId) as Promise<VersionDiff>;

export const publishVersion = (projectId: string, versionId: string, trackId: string): Promise<unknown> =>
  window.electronAPI.publishVersion(projectId, versionId, trackId);

export const unpublishVersion = (projectId: string, trackId: string): Promise<void> =>
  window.electronAPI.unpublishVersion(projectId, trackId);

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const scanLocalFolder = (folderPath: string): Promise<ScanResult> =>
  window.electronAPI.scanLocalFolder(folderPath);

export const syncLocalProject = (
  projectId: string,
  folderPath: string,
  message?: string,
): Promise<unknown> =>
  window.electronAPI.syncLocalProject(projectId, folderPath, message);

// ─── Updater ──────────────────────────────────────────────────────────────────

export const checkForUpdate = (): Promise<UpdateInfo> =>
  window.electronAPI.checkForUpdate();

export const installUpdate = (): Promise<void> =>
  window.electronAPI.installUpdate();

// ─── Watcher ──────────────────────────────────────────────────────────────────

export const watchProjectFolder = (projectId: string, folderPath: string): Promise<void> =>
  window.electronAPI.watchProjectFolder(projectId, folderPath);

export const unwatchProjectFolder = (projectId: string): Promise<void> =>
  window.electronAPI.unwatchProjectFolder(projectId);

export const listWatchedFolders = (): Promise<WatchedEntry[]> =>
  window.electronAPI.listWatchedFolders();
