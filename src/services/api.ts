// Thin wrappers around the Rust-side Tauri commands.
//
// All HTTP traffic happens in Rust (`src-tauri/src/sync.rs` etc.) so this
// module exposes a typed surface for the React UI.

import { invoke } from '@tauri-apps/api/core';

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

// ─── Auth ─────────────────────────────────────────────────────────────

export const startDeviceAuth = () =>
  invoke<DeviceCodeResponse>('start_device_auth');

export const pollDeviceAuth = (device_code: string) =>
  invoke<PollResult>('poll_device_auth', { deviceCode: device_code });

export const setToken = (token: string) =>
  invoke<void>('set_token', { token });

export const getToken = () =>
  invoke<string | null>('get_token');

export const clearToken = () =>
  invoke<void>('clear_token');

export const revokeToken = () =>
  invoke<void>('revoke_token');

export const setApiBase = (base: string) =>
  invoke<void>('set_api_base', { base });

export const getApiBase = () =>
  invoke<string>('get_api_base');

// ─── Projects ─────────────────────────────────────────────────────────

export const listRemoteProjects = () =>
  invoke<RemoteProject[]>('list_remote_projects');

export const createRemoteProject = (name: string, description?: string) =>
  invoke<RemoteProject>('create_remote_project', { args: { name, description } });

export const getProjectDetail = (projectId: string) =>
  invoke<RemoteProjectDetail>('get_project_detail', { projectId });

export const listMyTracks = () =>
  invoke<MyTrack[]>('list_my_tracks');

export const getVersionDiff = (projectId: string, versionId: string) =>
  invoke<VersionDiff>('get_version_diff', { projectId, versionId });

export const publishVersion = (projectId: string, versionId: string, trackId: string) =>
  invoke<unknown>('publish_version', { projectId, versionId, trackId });

export const unpublishVersion = (projectId: string, trackId: string) =>
  invoke<void>('unpublish_version', { projectId, trackId });

// ─── Sync ─────────────────────────────────────────────────────────────

export const scanLocalFolder = (folderPath: string) =>
  invoke<ScanResult>('scan_local_folder', { folderPath });

export const syncLocalProject = (
  projectId: string,
  folderPath: string,
  message?: string,
) =>
  invoke<unknown>('sync_local_project', {
    args: { projectId, folderPath, message },
  });

// ─── Watcher ──────────────────────────────────────────────────────────

export const watchProjectFolder = (projectId: string, folderPath: string) =>
  invoke<void>('watch_project_folder', { projectId, folderPath });

export const unwatchProjectFolder = (projectId: string) =>
  invoke<void>('unwatch_project_folder', { projectId });

export const listWatchedFolders = () =>
  invoke<WatchedEntry[]>('list_watched_folders');
