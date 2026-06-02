import React, { useEffect, useState } from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import * as api from '../services/api';
import { Persist, PersistedWatch } from '../services/store';
import { useSyncProgress, useTraySyncEvent, useWatcherEvents } from '../hooks/useSync';
import {
  ChevronRight, FolderOpen, FolderPlus, Plus, RefreshCw, X,
} from 'lucide-react';

interface Props {
  onOpenProject: (projectId: string) => void;
  showSyncOnly?: boolean;
  searchQuery?: string;
}

export const ProjectList: React.FC<Props> = ({ onOpenProject, showSyncOnly, searchQuery }) => {
  const [projects, setProjects] = useState<api.RemoteProject[]>([]);
  const [watches, setWatches] = useState<PersistedWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const progress = useSyncProgress();

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const [remote, locallyWatched] = await Promise.all([
        api.listRemoteProjects(),
        Persist.getWatches(),
      ]);
      setProjects(remote);
      setWatches(locallyWatched);

      // Re-register active watches in Rust state on each refresh
      const active = await api.listWatchedFolders();
      const activeIds = new Set(active.map(w => w.project_id));
      for (const w of locallyWatched) {
        if (!activeIds.has(w.projectId) && w.autoSync) {
          try {
            await api.watchProjectFolder(w.projectId, w.folderPath);
          } catch (e) {
            console.warn('Failed to re-watch', w.projectId, e);
          }
        }
      }
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the watcher fires, kick off a sync for that project
  useWatcherEvents(async (projectId, _paths) => {
    const w = watches.find(x => x.projectId === projectId);
    if (!w) return;
    try {
      await api.syncLocalProject(projectId, w.folderPath, 'Auto-sync');
    } catch (e) {
      console.error('Auto-sync failed', e);
    }
  });

  // Tray "Sync now" → sync all linked projects
  useTraySyncEvent(async () => {
    for (const w of watches) {
      try {
        await api.syncLocalProject(w.projectId, w.folderPath);
      } catch (e) {
        console.warn('Manual sync failed', w.projectId, e);
      }
    }
  });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const created = await api.createRemoteProject(newName.trim(), newDescription || undefined);
      setProjects(p => [created, ...p]);
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const pickFolderAndLink = async (projectId: string) => {
    try {
      const selected = await window.electronAPI.selectFolder();
      if (!selected || typeof selected !== 'string') return;
      const watch: PersistedWatch = {
        projectId,
        folderPath: selected,
        autoSync: true,
      };
      await Persist.upsertWatch(watch);
      await api.watchProjectFolder(projectId, selected);
      setWatches(curr => {
        const others = curr.filter(w => w.projectId !== projectId);
        return [...others, watch];
      });
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Failed to link folder');
    }
  };

  const unlinkFolder = async (projectId: string) => {
    try {
      try {
        await api.unwatchProjectFolder(projectId);
      } catch { /* not watching */ }
      await Persist.removeWatch(projectId);
      setWatches(curr => curr.filter(w => w.projectId !== projectId));
    } catch (e) {
      console.error(e);
    }
  };

  const syncNow = async (projectId: string) => {
    const w = watches.find(x => x.projectId === projectId);
    if (!w) return;
    try {
      await api.syncLocalProject(projectId, w.folderPath, 'Manual sync');
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Sync failed');
    }
  };

  const q = searchQuery?.trim().toLowerCase() ?? '';
  const visibleProjects = projects
    .filter(p => {
      if (showSyncOnly) {
        const prog = progress[p.id];
        return prog && prog.stage !== 'done' && prog.stage !== 'error';
      }
      return true;
    })
    .filter(p => !q || p.name.toLowerCase().includes(q));

  return (
    <div style={{ padding: spacing.xxl, maxWidth: 900, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.xxl,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            <FolderOpen size={22} color={colors.primary} style={{ verticalAlign: 'middle', marginRight: 10 }} />
            {showSyncOnly ? 'Sync Progress' : 'Projects'}
          </h1>
          <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: 12 }}>
            {showSyncOnly
              ? 'Projects currently syncing'
              : 'Sync FL Studio projects to your fujistud.io account'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: colors.textSecondary,
              border: `1px solid ${colors.glassBorder}`,
              padding: '8px 12px',
              borderRadius: borderRadius.md,
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
          {!showSyncOnly && (
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: colors.primary,
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: borderRadius.md,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={14} /> New Project
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          style={{
            background: colors.surface,
            border: `1px solid ${colors.glassBorder}`,
            borderLeft: `4px solid ${colors.primary}`,
            borderRadius: borderRadius.lg,
            padding: spacing.xl,
            marginBottom: spacing.xl,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.md,
            }}
          >
            <strong>Create New Project</strong>
            <button
              onClick={() => setShowCreate(false)}
              style={{ background: 'transparent', border: 'none', color: colors.textTertiary, cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
          <input
            placeholder="Project name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={inputStyle}
          />
          <textarea
            placeholder="Optional description"
            rows={2}
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', marginTop: 8 }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            style={{
              marginTop: 12,
              background: newName.trim() ? colors.primary : colors.surfaceLight,
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: borderRadius.md,
              fontSize: 13,
              fontWeight: 600,
              cursor: newName.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: `1px solid rgba(239,68,68,0.25)`,
            borderRadius: borderRadius.md,
            color: colors.error,
            padding: spacing.md,
            fontSize: 12,
            marginBottom: spacing.lg,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.textTertiary }}>Loading…</div>
      ) : visibleProjects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: colors.textSecondary }}>
          <FolderOpen size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ margin: 0 }}>{showSyncOnly ? 'No active syncs' : 'No projects yet'}</p>
          <p style={{ fontSize: 12, color: colors.textTertiary }}>
            {showSyncOnly
              ? 'Start a sync from the Projects page'
              : 'Create a project and link it to a folder on your computer'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleProjects.map(project => {
            const watch = watches.find(w => w.projectId === project.id);
            const prog = progress[project.id];
            return (
              <div
                key={project.id}
                style={{
                  background: colors.surface,
                  border: `1px solid ${colors.glassBorder}`,
                  borderRadius: borderRadius.lg,
                  padding: spacing.lg,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: borderRadius.md,
                      background: 'rgba(16,185,129,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: colors.primary,
                      flexShrink: 0,
                    }}
                  >
                    <FolderOpen size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={() => onOpenProject(project.id)}
                      style={{
                        fontWeight: 600,
                        color: colors.textPrimary,
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      {project.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: colors.textTertiary,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {watch ? watch.folderPath : 'Not linked to a local folder'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {watch ? (
                      <>
                        <button
                          onClick={() => syncNow(project.id)}
                          style={smallBtn(colors.primary)}
                        >
                          <RefreshCw size={12} /> Sync now
                        </button>
                        <button
                          onClick={() => unlinkFolder(project.id)}
                          style={smallBtn('rgba(239,68,68,0.15)', colors.error)}
                          title="Unlink folder"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => pickFolderAndLink(project.id)}
                        style={smallBtn('rgba(16,185,129,0.1)', colors.primary)}
                      >
                        <FolderPlus size={12} /> Link folder
                      </button>
                    )}
                    <button
                      onClick={() => onOpenProject(project.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.textTertiary,
                        cursor: 'pointer',
                        padding: 4,
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
                {prog && prog.stage !== 'done' && prog.stage !== 'error' && (
                  <ProgressBar progress={prog} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: borderRadius.sm,
  padding: '8px 10px',
  color: colors.textPrimary,
  fontSize: 13,
  outline: 'none',
};

const smallBtn = (bg: string, color: string = '#fff'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: bg,
  color,
  border: 'none',
  borderRadius: borderRadius.sm,
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
});

const ProgressBar: React.FC<{ progress: api.SyncProgress }> = ({ progress }) => {
  const pct =
    progress.total > 0
      ? Math.round((progress.uploaded / progress.total) * 100)
      : progress.stage === 'finalizing'
        ? 90
        : 0;
  const stageLabel = ({
    scanning: 'Scanning',
    checking: 'Checking',
    uploading: `Uploading ${progress.uploaded}/${progress.total}`,
    finalizing: 'Finalizing',
    done: 'Done',
    error: 'Error',
  } as const)[progress.stage];
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: colors.textTertiary,
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span>{stageLabel}</span>
        <span>{pct}%</span>
      </div>
      <div
        style={{
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: colors.primary,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {progress.current_file && (
        <div
          style={{
            fontSize: 10,
            color: colors.textTertiary,
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {progress.current_file}
        </div>
      )}
    </div>
  );
};
