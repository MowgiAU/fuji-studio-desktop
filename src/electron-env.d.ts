// Type declarations for the Electron contextBridge API exposed by electron/preload.ts.

export {};

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  actorName?: string | null;
  actorAvatar?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  name?: string | null;
  isGroup: boolean;
  participants: { userId: string; username: string; displayName?: string | null; avatar?: string | null }[];
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  unread: number;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  content: string | null;
  deleted: boolean;
  createdAt: string;
}

export interface AppSettings {
  minimizeToTray: boolean;
  desktopNotifications: boolean;
  launchAtStartup: boolean;
}

export interface UserResult {
  userId: string;
  username: string;
  displayName?: string | null;
  avatar?: string | null;
}

declare global {
  interface Window {
    electronAPI: {
      // Auth
      startDeviceAuth(): Promise<{
        device_code: string; user_code: string; verification_uri: string;
        verification_uri_complete?: string; expires_in: number; interval: number;
      }>;
      pollDeviceAuth(deviceCode: string): Promise<
        | { status: 'Ok'; access_token: string }
        | { status: 'Pending' }
        | { status: 'Error'; error: string; description?: string }
      >;
      setToken(token: string): Promise<void>;
      getToken(): Promise<string | null>;
      clearToken(): Promise<void>;
      revokeToken(): Promise<void>;
      setApiBase(base: string): Promise<void>;
      getApiBase(): Promise<string>;

      // Projects
      getDesktopMe(): Promise<{
        userId: string; discordId: string | null; username: string; displayName: string | null;
        avatar: string | null; projectCount: number; totalStorageBytes: number;
        storageQuotaBytes: number; storageTier: string;
      }>;
      listRemoteProjects(): Promise<unknown>;
      createRemoteProject(name: string, description?: string): Promise<unknown>;
      getProjectDetail(projectId: string): Promise<unknown>;
      listMyTracks(): Promise<unknown>;
      getDesktopStorage(): Promise<{ usedBytes: number; quotaBytes: number; tier: string }>;
      listGenres(): Promise<{ id: string; name: string; parentId: string | null }[]>;
      uploadTrack(payload: {
        audioBuffer: ArrayBuffer; audioName: string; audioMime: string;
        artworkBuffer?: ArrayBuffer; artworkName?: string; artworkMime?: string;
        title: string; isPublic: boolean;
        bpm?: string; key?: string; description?: string; lyrics?: string;
        trackType?: string; artist?: string; album?: string; year?: string;
        allowAudioDownload?: boolean; allowProjectDownload?: boolean;
        license?: string; genreIds?: string[];
        flpFolderPath?: string;
      }): Promise<{ id: string; title: string; slug: string }>;
      getVersionDiff(projectId: string, versionId: string): Promise<unknown>;
      publishVersion(projectId: string, versionId: string, trackId: string): Promise<unknown>;
      unpublishVersion(projectId: string, trackId: string): Promise<void>;

      // Sync
      scanLocalFolder(folderPath: string): Promise<{ files: { path: string; hash: string; size: number }[]; total_size: number }>;
      syncLocalProject(projectId: string, folderPath: string, message?: string): Promise<unknown>;

      // Updater
      checkForUpdate(): Promise<{ available: boolean; version?: string | null; body?: string | null }>;
      installUpdate(): Promise<void>;

      // Watcher
      watchProjectFolder(projectId: string, folderPath: string): Promise<void>;
      unwatchProjectFolder(projectId: string): Promise<void>;
      listWatchedFolders(): Promise<{ project_id: string; local_path: string }[]>;

      // Store
      store: {
        get(key: string): Promise<unknown>;
        set(key: string, value: unknown): Promise<void>;
        delete(key: string): Promise<void>;
      };

      // Dialog & shell
      selectFolder(): Promise<string | null>;
      openExternal(url: string): Promise<void>;

      // App settings
      getSettings(): Promise<AppSettings>;
      setSetting(key: string, value: unknown): Promise<void>;

      // Notifications
      getNotifications(): Promise<AppNotification[]>;
      markNotificationsRead(): Promise<void>;

      // Messages
      listConversations(): Promise<Conversation[]>;
      createConversation(participantIds: string[]): Promise<{ id: string; existing: boolean }>;
      getMessages(convId: string, before?: string): Promise<Message[]>;
      sendMessage(convId: string, content: string): Promise<Message>;
      markConversationRead(convId: string): Promise<void>;
      getUnreadCount(): Promise<{ unread: number }>;
      searchUsers(q: string): Promise<UserResult[]>;
      showNotification(title: string, body: string): Promise<void>;

      // Events
      onSyncProgress(cb: (payload: unknown) => void): () => void;
      onWatcherChanged(cb: (payload: unknown) => void): () => void;
      onTraySyncNow(cb: () => void): () => void;
    };
  }
}
