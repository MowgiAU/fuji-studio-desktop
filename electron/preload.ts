import { contextBridge, ipcRenderer } from 'electron';

type UnlistenFn = () => void;

function onEvent(channel: string, callback: (...args: unknown[]) => void): UnlistenFn {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  startDeviceAuth: () => ipcRenderer.invoke('start_device_auth'),
  pollDeviceAuth: (deviceCode: string) => ipcRenderer.invoke('poll_device_auth', deviceCode),
  setToken: (token: string) => ipcRenderer.invoke('set_token', token),
  getToken: () => ipcRenderer.invoke('get_token'),
  clearToken: () => ipcRenderer.invoke('clear_token'),
  revokeToken: () => ipcRenderer.invoke('revoke_token'),
  setApiBase: (base: string) => ipcRenderer.invoke('set_api_base', base),
  getApiBase: () => ipcRenderer.invoke('get_api_base'),

  // Projects
  getDesktopMe: () => ipcRenderer.invoke('get_desktop_me'),
  listRemoteProjects: () => ipcRenderer.invoke('list_remote_projects'),
  createRemoteProject: (name: string, description?: string) =>
    ipcRenderer.invoke('create_remote_project', name, description),
  getProjectDetail: (projectId: string) => ipcRenderer.invoke('get_project_detail', projectId),
  listMyTracks: () => ipcRenderer.invoke('list_my_tracks'),
  getDesktopStorage: () => ipcRenderer.invoke('get_desktop_storage'),
  listGenres: () => ipcRenderer.invoke('list_genres'),
  uploadTrack: (payload: unknown) => ipcRenderer.invoke('upload_track', payload),
  getVersionDiff: (projectId: string, versionId: string) =>
    ipcRenderer.invoke('get_version_diff', projectId, versionId),
  publishVersion: (projectId: string, versionId: string, trackId: string) =>
    ipcRenderer.invoke('publish_version', projectId, versionId, trackId),
  unpublishVersion: (projectId: string, trackId: string) =>
    ipcRenderer.invoke('unpublish_version', projectId, trackId),

  // Sync
  scanLocalFolder: (folderPath: string) => ipcRenderer.invoke('scan_local_folder', folderPath),
  syncLocalProject: (projectId: string, folderPath: string, message?: string) =>
    ipcRenderer.invoke('sync_local_project', projectId, folderPath, message),

  // Updater
  checkForUpdate: () => ipcRenderer.invoke('check_for_update'),
  installUpdate: () => ipcRenderer.invoke('install_update'),

  // Watcher
  watchProjectFolder: (projectId: string, folderPath: string) =>
    ipcRenderer.invoke('watch_project_folder', projectId, folderPath),
  unwatchProjectFolder: (projectId: string) =>
    ipcRenderer.invoke('unwatch_project_folder', projectId),
  listWatchedFolders: () => ipcRenderer.invoke('list_watched_folders'),

  // Persistent store
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
  },

  // Dialog & shell
  selectFolder: () => ipcRenderer.invoke('select_folder'),
  openExternal: (url: string) => ipcRenderer.invoke('open_external', url),

  // App settings
  getSettings: () => ipcRenderer.invoke('get_settings'),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set_setting', key, value),

  // Notifications
  getNotifications: () => ipcRenderer.invoke('get_notifications'),
  markNotificationsRead: () => ipcRenderer.invoke('mark_notifications_read'),

  // Messages
  listConversations: () => ipcRenderer.invoke('list_conversations'),
  createConversation: (participantIds: string[]) =>
    ipcRenderer.invoke('create_conversation', participantIds),
  getMessages: (convId: string, before?: string) =>
    ipcRenderer.invoke('get_messages', convId, before),
  sendMessage: (convId: string, content: string) =>
    ipcRenderer.invoke('send_message', convId, content),
  markConversationRead: (convId: string) =>
    ipcRenderer.invoke('mark_conversation_read', convId),
  getUnreadCount: () => ipcRenderer.invoke('get_unread_count'),
  searchUsers: (q: string) => ipcRenderer.invoke('search_users', q),
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('show_notification', title, body),

  // Events (return unlisten function)
  onSyncProgress: (cb: (payload: unknown) => void): UnlistenFn =>
    onEvent('sync:progress', cb),
  onWatcherChanged: (cb: (payload: unknown) => void): UnlistenFn =>
    onEvent('watcher:changed', cb),
  onTraySyncNow: (cb: () => void): UnlistenFn =>
    onEvent('tray:sync_now', cb),
});
