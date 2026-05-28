import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { SyncProgress } from '../services/api';

export interface ProjectSyncMap {
  [projectId: string]: SyncProgress | undefined;
}

export function useSyncProgress() {
  const [progress, setProgress] = useState<ProjectSyncMap>({});

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    (async () => {
      const un = await listen<SyncProgress>('sync:progress', event => {
        const p = event.payload;
        setProgress(curr => ({ ...curr, [p.project_id]: p }));
      });
      unlistenFn = un;
    })();
    return () => {
      unlistenFn?.();
    };
  }, []);

  return progress;
}

export function useWatcherEvents(onChange: (projectId: string, paths: string[]) => void) {
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    (async () => {
      const un = await listen<{ project_id: string; paths: string[] }>(
        'watcher:changed',
        event => {
          onChange(event.payload.project_id, event.payload.paths);
        },
      );
      unlistenFn = un;
    })();
    return () => {
      unlistenFn?.();
    };
  }, [onChange]);
}

export function useTraySyncEvent(onSync: () => void) {
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    (async () => {
      const un = await listen<void>('tray:sync_now', () => {
        onSync();
      });
      unlistenFn = un;
    })();
    return () => {
      unlistenFn?.();
    };
  }, [onSync]);
}
