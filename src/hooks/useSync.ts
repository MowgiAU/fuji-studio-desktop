import { useEffect, useRef, useState } from 'react';
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
  completedListeners.forEach((fn) => fn());
}

export function useRecentCompleted() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
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
    const unlisten = window.electronAPI.onSyncProgress((payload) => {
      const p = payload as SyncProgress;
      setProgress((curr) => {
        const prev = curr[p.project_id];
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
    return unlisten;
  }, []);

  return progress;
}

export function useWatcherEvents(onChange: (projectId: string, paths: string[]) => void) {
  useEffect(() => {
    const unlisten = window.electronAPI.onWatcherChanged((payload) => {
      const { project_id, paths } = payload as { project_id: string; paths: string[] };
      onChange(project_id, paths);
    });
    return unlisten;
  }, [onChange]);
}

export function useTraySyncEvent(onSync: () => void) {
  useEffect(() => {
    const unlisten = window.electronAPI.onTraySyncNow(() => onSync());
    return unlisten;
  }, [onSync]);
}
