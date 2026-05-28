import React, { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { borderRadius, colors, spacing } from '../theme/theme';
import * as api from '../services/api';
import { Persist, PersistedWatch } from '../services/store';
import { useSyncProgress } from '../hooks/useSync';
import {
  ChevronLeft, ExternalLink, FileAudio, FolderPlus, HardDrive,
  RefreshCw, X,
} from 'lucide-react';

interface Props {
  projectId: string;
  onBack: () => void;
}

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export const ProjectDetail: React.FC<Props> = ({ projectId, onBack }) => {
  const [project, setProject] = useState<api.RemoteProject | null>(null);
  const [watch, setWatch] = useState<PersistedWatch | null>(null);
  const [scan, setScan] = useState<api.ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progressMap = useSyncProgress();
  const progress = progressMap[projectId];
  const [apiBase, setApiBase] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [list, watches, base] = await Promise.all([
          api.listRemoteProjects(),
          Persist.getWatches(),
          api.getApiBase(),
        ]);
        setApiBase(base);
        setProject(list.find(p => p.id === projectId) || null);
        const w = watches.find(x => x.projectId === projectId) || null;
        setWatch(w);
        if (w) {
          setScanning(true);
          try {
            const r = await api.scanLocalFolder(w.folderPath);
            setScan(r);
          } catch (e: any) {
            setError(typeof e === 'string' ? e : e?.message);
          } finally {
            setScanning(false);
          }
        }
      } catch (e: any) {
        setError(typeof e === 'string' ? e : e?.message);
      }
    })();
  }, [projectId]);

  const pickFolder = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    const w: PersistedWatch = { projectId, folderPath: selected, autoSync: true };
    await Persist.upsertWatch(w);
    try {
      await api.watchProjectFolder(projectId, selected);
    } catch (e) {
      console.warn('Watcher already active', e);
    }
    setWatch(w);
    try {
      setScanning(true);
      const r = await api.scanLocalFolder(selected);
      setScan(r);
    } finally {
      setScanning(false);
    }
  };

  const toggleAutoSync = async () => {
    if (!watch) return;
    const next: PersistedWatch = { ...watch, autoSync: !watch.autoSync };
    await Persist.upsertWatch(next);
    if (next.autoSync) {
      try {
        await api.watchProjectFolder(projectId, watch.folderPath);
      } catch (e) {
        console.warn(e);
      }
    } else {
      try {
        await api.unwatchProjectFolder(projectId);
      } catch (e) {
        console.warn(e);
      }
    }
    setWatch(next);
  };

  const unlink = async () => {
    try {
      await api.unwatchProjectFolder(projectId);
    } catch { /* not watching */ }
    await Persist.removeWatch(projectId);
    setWatch(null);
    setScan(null);
  };

  const syncNow = async () => {
    if (!watch) return;
    try {
      await api.syncLocalProject(projectId, watch.folderPath, 'Manual sync');
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message);
    }
  };

  const openInBrowser = () => {
    if (!project) return;
    openExternal(`${apiBase}/projects/${project.id}`).catch(() => {});
  };

  return (
    <div style={{ padding: spacing.xxl, maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          border: 'none',
          color: colors.textSecondary,
          cursor: 'pointer',
          marginBottom: spacing.lg,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
        }}
      >
        <ChevronLeft size={14} /> Back
      </button>

      {!project ? (
        <div style={{ color: colors.textTertiary }}>Project not found</div>
      ) : (
        <>
          <div style={{ marginBottom: spacing.xxl }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{project.name}</h1>
            {project.description && (
              <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: 13 }}>
                {project.description}
              </p>
            )}
            <button
              onClick={openInBrowser}
              style={{
                marginTop: 10,
                background: 'transparent',
                border: `1px solid ${colors.glassBorder}`,
                color: colors.textSecondary,
                borderRadius: borderRadius.sm,
                padding: '4px 10px',
                fontSize: 11,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={12} /> Open on fujistud.io
            </button>
          </div>

          {/* Linked folder */}
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textSecondary, marginBottom: 8 }}>
              Local Folder
            </div>
            {watch ? (
              <>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px 10px',
                    borderRadius: borderRadius.sm,
                    fontFamily: "'Menlo', monospace",
                    fontSize: 12,
                    color: colors.textPrimary,
                    wordBreak: 'break-all',
                  }}
                >
                  {watch.folderPath}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={syncNow} style={primaryBtn}>
                    <RefreshCw size={14} /> Sync now
                  </button>
                  <button onClick={toggleAutoSync} style={secondaryBtn}>
                    {watch.autoSync ? 'Disable auto-sync' : 'Enable auto-sync'}
                  </button>
                  <button onClick={unlink} style={dangerBtn}>
                    <X size={14} /> Unlink
                  </button>
                </div>
                {scanning && (
                  <div style={{ marginTop: 12, color: colors.textTertiary, fontSize: 12 }}>
                    Scanning local files…
                  </div>
                )}
                {scan && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 24, color: colors.textSecondary, fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <FileAudio size={12} /> {scan.files.length} files
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <HardDrive size={12} /> {formatBytes(scan.total_size)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <button onClick={pickFolder} style={primaryBtn}>
                <FolderPlus size={14} /> Link a local folder
              </button>
            )}
          </div>

          {progress && (
            <div style={{ ...card, marginTop: spacing.lg }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textSecondary, marginBottom: 8 }}>
                Sync Status
              </div>
              <div style={{ color: colors.textPrimary, fontSize: 13 }}>
                {progress.message || progress.stage}
              </div>
              {progress.total > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    height: 6,
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round((progress.uploaded / progress.total) * 100)}%`,
                      background: colors.primary,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {scan && scan.files.length > 0 && (
            <div style={{ ...card, marginTop: spacing.lg }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: colors.textSecondary,
                  marginBottom: 8,
                }}
              >
                Files ({scan.files.length})
              </div>
              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: borderRadius.sm,
                  padding: 8,
                }}
              >
                {scan.files.slice(0, 200).map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      padding: '2px 6px',
                      fontSize: 11,
                      color: colors.textTertiary,
                    }}
                  >
                    <FileAudio size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ flex: 1, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.path}
                    </span>
                    <span>{formatBytes(f.size)}</span>
                  </div>
                ))}
                {scan.files.length > 200 && (
                  <div style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 11, padding: 4 }}>
                    + {scan.files.length - 200} more files
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: `1px solid rgba(239,68,68,0.25)`,
                color: colors.error,
                borderRadius: borderRadius.md,
                padding: spacing.md,
                fontSize: 12,
                marginTop: spacing.lg,
              }}
            >
              {error}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const card: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: borderRadius.lg,
  padding: spacing.xl,
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: colors.primary,
  color: '#fff',
  border: 'none',
  padding: '8px 14px',
  borderRadius: borderRadius.md,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(255,255,255,0.04)',
  color: colors.textSecondary,
  border: `1px solid ${colors.glassBorder}`,
  padding: '8px 14px',
  borderRadius: borderRadius.md,
  fontSize: 13,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(239,68,68,0.1)',
  color: colors.error,
  border: 'none',
  padding: '8px 14px',
  borderRadius: borderRadius.md,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
