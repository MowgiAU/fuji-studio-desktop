// Persistent settings via the Electron main process store (JSON file in userData).

export interface PersistedWatch {
  projectId: string;
  folderPath: string;
  autoSync: boolean;
}

export const Persist = {
  async getToken(): Promise<string | null> {
    return (await window.electronAPI.store.get('token')) as string | null;
  },
  async setToken(token: string | null): Promise<void> {
    if (token) {
      await window.electronAPI.store.set('token', token);
    } else {
      await window.electronAPI.store.delete('token');
    }
  },

  async getApiBase(): Promise<string | null> {
    return (await window.electronAPI.store.get('api_base')) as string | null;
  },
  async setApiBase(base: string): Promise<void> {
    await window.electronAPI.store.set('api_base', base);
  },

  async getWatches(): Promise<PersistedWatch[]> {
    return ((await window.electronAPI.store.get('watches')) as PersistedWatch[] | null) ?? [];
  },
  async setWatches(watches: PersistedWatch[]): Promise<void> {
    await window.electronAPI.store.set('watches', watches);
  },
  async upsertWatch(watch: PersistedWatch): Promise<void> {
    const all = await this.getWatches();
    const idx = all.findIndex((w) => w.projectId === watch.projectId);
    if (idx >= 0) all[idx] = watch;
    else all.push(watch);
    await this.setWatches(all);
  },
  async removeWatch(projectId: string): Promise<void> {
    const all = await this.getWatches();
    await this.setWatches(all.filter((w) => w.projectId !== projectId));
  },
};
