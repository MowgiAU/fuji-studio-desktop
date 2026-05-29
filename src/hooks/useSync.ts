import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { SyncProgress } from '../services/api';

export interface ProjectSyncMap {
  [projectId: string]: SyncProgress | undefined;
}

export interface CompletedSync {
  projectId: string;
  projectName: string;
  stage: 'done' | 'error';
  completedAt: Date;
  message?: string | null;
}

const MAX_RECENT = 10;

// Module-level store so it persists across hook remounts
const recentCompleted: CompletedSync[] = [];
const completedListeners: Set<() => void> = new Set();

function notifyCompleted() {
  completedListeners.forEach(fn => fn());
}

export function useRecentCompleted() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    completedListeners.add(fn);
    return () => { completedListeners.delete(fn); };
  }, []);
  return [...recentCompleted];
}

export function useSyncProgress(projectNameMap?: Record<string, string>) {
  const [progress, setProgress] = useState<ProjectSyncMap>({});
  const nameMapRef = useRef(projectNameMap);
  nameMapRef.current = projectNameMap;

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    (async () => {
      const un = await listen<SyncProgress>('sync:progress', event => {
        const p = event.payload;
        setProgress(curr => {
          const prev = curr[p.project_id];
          // Detect transition into done/error — record as recently completed
          if ((p.stage === 'done' || p.stage === 'error') && prev?.stage !== p.stage) {
            const entry: CompletedSync = {
              projectId: p.project_id,
              projectName: nameMapRef.current?.[p.project_id] || p.project_id,
              stage: p.stage,
              completedAt: new Date(),
              message: p.message,
            };
            recentCompleted.unshift(entry);
            if (recentCompleted.length > MAX_RECENT) recentCompleted.pop();
            notifyCompleted();
          }
          return { ...curr, [p.project_id]: p };
        });
      });
      unlistenFn = un;
    })();
    return () => { unlistenFn?.(); };
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
