// Persistent settings via tauri-plugin-store.
// Keeps the auth token and watched-folder mapping across app launches.

import { LazyStore } from '@tauri-apps/plugin-store';

const store = new LazyStore('fuji-studio.json');

export interface PersistedWatch {
  projectId: string;
  folderPath: string;
  autoSync: boolean;
}

export const Persist = {
  async getToken(): Promise<string | null> {
    return (await store.get<string>('token')) ?? null;
  },
  async setToken(token: string | null): Promise<void> {
    if (token) {
      await store.set('token', token);
    } else {
      await store.delete('token');
    }
    await store.save();
  },

  async getApiBase(): Promise<string | null> {
    return (await store.get<string>('api_base')) ?? null;
  },
  async setApiBase(base: string): Promise<void> {
    await store.set('api_base', base);
    await store.save();
  },

  async getWatches(): Promise<PersistedWatch[]> {
    return (await store.get<PersistedWatch[]>('watches')) ?? [];
  },
  async setWatches(watches: PersistedWatch[]): Promise<void> {
    await store.set('watches', watches);
    await store.save();
  },
  async upsertWatch(watch: PersistedWatch): Promise<void> {
    const all = await this.getWatches();
    const idx = all.findIndex(w => w.projectId === watch.projectId);
    if (idx >= 0) all[idx] = watch;
    else all.push(watch);
    await this.setWatches(all);
  },
  async removeWatch(projectId: string): Promise<void> {
    const all = await this.getWatches();
    await this.setWatches(all.filter(w => w.projectId !== projectId));
  },
};
