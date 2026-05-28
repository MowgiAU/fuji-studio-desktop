import React, { useEffect, useState, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { borderRadius, colors, spacing } from '../theme/theme';
import * as api from '../services/api';
import { Persist, PersistedWatch } from '../services/store';
import { useSyncProgress } from '../hooks/useSync';
import {
  ChevronLeft, ChevronDown, ChevronUp, ExternalLink, FileAudio, FolderPlus,
  HardDrive, RefreshCw, X, Link, Link2Off, Music, Check, AlertCircle,
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

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const ProjectDetail: React.FC<Props> = ({ projectId, onBack }) => {
  const [project, setProject] = useState<api.RemoteProjectDetail | null>(null);
  const [watch, setWatch] = useState<PersistedWatch | null>(null);
  const [scan, setScan] = useState<api.ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState('');
  const progressMap = useSyncProgress();
  const progress = progressMap[projectId];

  // Version history state
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, api.VersionDiff>>({});
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);

  // Publish flow state
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
  const [myTracks, setMyTracks] = useState<api.MyTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');
  const [publishLoading, setPublishLoading] = useState(false);
  const [unpublishLoading, setUnpublishLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, watches, base] = await Promise.all([
        api.getProjectDetail(projectId),
        Persist.getWatches(),
        api.getApiBase(),
      ]);
      setProject(detail);
      setApiBase(base);
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
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const pickFolder = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    const w: PersistedWatch = { projectId, folderPath: selected, autoSync: true };
    await Persist.upsertWatch(w);
    try { await api.watchProjectFolder(projectId, selected); } catch {}
    setWatch(w);
    try {
      setScanning(true);
      const r = await api.scanLocalFolder(selected);
      setScan(r);
    } finally { setScanning(false); }
  };

  const toggleAutoSync = async () => {
    if (!watch) return;
    const next: PersistedWatch = { ...watch, autoSync: !watch.autoSync };
    await Persist.upsertWatch(next);
    if (next.autoSync) {
      try { await api.watchProjectFolder(projectId, watch.folderPath); } catch {}
    } else {
      try { await api.unwatchProjectFolder(projectId); } catch {}
    }
    setWatch(next);
  };

  const unlink = async () => {
    try { await api.unwatchProjectFolder(projectId); } catch {}
    await Persist.removeWatch(projectId);
    setWatch(null);
    setScan(null);
  };

  const syncNow = async () => {
    if (!watch) return;
    try {
      await api.syncLocalProject(projectId, watch.folderPath, 'Manual sync');
      await load();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message);
    }
  };

  const toggleDiff = async (versionId: string) => {
    if (expandedDiff === versionId) {
      setExpandedDiff(null);
      return;
    }
    setExpandedDiff(versionId);
    if (!diffs[versionId]) {
      setLoadingDiff(versionId);
      try {
        const d = await api.getVersionDiff(projectId, versionId);
        setDiffs(curr => ({ ...curr, [versionId]: d }));
      } catch {}
      setLoadingDiff(null);
    }
  };

  const openPublishFlow = async (versionId: string) => {
    setPublishingVersionId(versionId);
    setSelectedTrackId('');
    if (myTracks.length === 0) {
      setTracksLoading(true);
      try {
        const tracks = await api.listMyTracks();
        setMyTracks(tracks);
        if (tracks.length > 0) setSelectedTrackId(tracks[0].id);
      } catch {}
      setTracksLoading(false);
    } else {
      setSelectedTrackId(myTracks[0]?.id ?? '');
    }
  };

  const confirmPublish = async () => {
    if (!publishingVersionId || !selectedTrackId) return;
    setPublishLoading(true);
    setError(null);
    try {
      await api.publishVersion(projectId, publishingVersionId, selectedTrackId);
      setPublishingVersionId(null);
      await load();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Publish failed');
    } finally {
      setPublishLoading(false);
    }
  };

  const handleUnpublish = async (trackId: string) => {
    setUnpublishLoading(trackId);
    setError(null);
    try {
      await api.unpublishVersion(projectId, trackId);
      await load();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Unpublish failed');
    } finally {
      setUnpublishLoading(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: spacing.xxl, color: colors.textTertiary }}>Loading…</div>
    );
  }

  return (
    <div style={{ padding: spacing.xxl, maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', marginBottom: spacing.lg, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
      >
        <ChevronLeft size={14} /> Back
      </button>

      {!project ? (
        <div style={{ color: colors.textTertiary }}>Project not found</div>
      ) : (
        <>
          {/* Header */}
          <div style={{ marginBottom: spacing.xxl }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{project.name}</h1>
            {project.description && (
              <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: 13 }}>{project.description}</p>
            )}
            <button
              onClick={() => openExternal(`${apiBase}/projects/${project.id}`).catch(() => {})}
              style={{ marginTop: 10, background: 'transparent', border: `1px solid ${colors.glassBorder}`, color: colors.textSecondary, borderRadius: borderRadius.sm, padding: '4px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              <ExternalLink size={12} /> Open on fujistud.io
            </button>
          </div>

          {/* Local Folder */}
          <div style={card}>
            <SectionLabel>Local Folder</SectionLabel>
            {watch ? (
              <>
                <div style={monoPath}>{watch.folderPath}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={syncNow} style={primaryBtn}><RefreshCw size={14} /> Sync now</button>
                  <button onClick={toggleAutoSync} style={secondaryBtn}>
                    {watch.autoSync ? 'Disable auto-sync' : 'Enable auto-sync'}
                  </button>
                  <button onClick={unlink} style={dangerBtn}><X size={14} /> Unlink</button>
                </div>
                {scanning && <div style={{ marginTop: 12, color: colors.textTertiary, fontSize: 12 }}>Scanning local files…</div>}
                {scan && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 24, color: colors.textSecondary, fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileAudio size={12} /> {scan.files.length} files</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><HardDrive size={12} /> {formatBytes(scan.total_size)}</span>
                  </div>
                )}
              </>
            ) : (
              <button onClick={pickFolder} style={primaryBtn}><FolderPlus size={14} /> Link a local folder</button>
            )}
          </div>

          {/* Active sync progress */}
          {progress && progress.stage !== 'done' && progress.stage !== 'error' && (
            <div style={{ ...card, marginTop: spacing.lg }}>
              <SectionLabel>Syncing…</SectionLabel>
              <div style={{ color: colors.textPrimary, fontSize: 13 }}>{progress.message || progress.stage}</div>
              {progress.total > 0 && (
                <div style={{ marginTop: 10, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((progress.uploaded / progress.total) * 100)}%`, background: colors.primary, transition: 'width 0.3s ease' }} />
                </div>
              )}
              {progress.current_file && (
                <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.current_file}
                </div>
              )}
            </div>
          )}

          {/* Version History */}
          {project.versions.length > 0 && (
            <div style={{ ...card, marginTop: spacing.lg }}>
              <SectionLabel>Version History</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {project.versions.map(v => {
                  const publishedLink = v.trackLinks[0] ?? null;
                  const isExpanded = expandedDiff === v.id;
                  const diff = diffs[v.id];
                  const isPublishTarget = publishingVersionId === v.id;

                  return (
                    <div
                      key={v.id}
                      style={{ background: 'rgba(0,0,0,0.2)', borderRadius: borderRadius.md, padding: '10px 12px', border: `1px solid ${colors.glassBorder}` }}
                    >
                      {/* Version row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: borderRadius.sm, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          v{v.versionNumber}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
                            {v.message || `Version ${v.versionNumber}`}
                          </div>
                          <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                            {formatDate(v.createdAt)} · {v.totalFiles} files · {formatBytes(v.totalSize)}
                            {v.isParsed && <span style={{ marginLeft: 8, color: colors.primary }}>✓ FLP parsed</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => toggleDiff(v.id)}
                            style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            Diff
                          </button>
                          {!publishedLink ? (
                            <button
                              onClick={() => openPublishFlow(v.id)}
                              style={{ ...ghostBtn, color: colors.primary }}
                            >
                              <Link size={12} /> Publish
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnpublish(publishedLink.trackId)}
                              disabled={!!unpublishLoading}
                              style={{ ...ghostBtn, color: colors.error }}
                            >
                              {unpublishLoading === publishedLink.trackId
                                ? '…'
                                : <><Link2Off size={12} /> Unpublish</>}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Published track badge */}
                      {publishedLink && (
                        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.08)', border: `1px solid rgba(16,185,129,0.2)`, borderRadius: borderRadius.sm, padding: '3px 8px', fontSize: 11, color: colors.primary }}>
                          <Check size={11} /> Published to: <strong>{publishedLink.track.title}</strong>
                        </div>
                      )}

                      {/* Diff panel */}
                      {isExpanded && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.glassBorder}` }}>
                          {loadingDiff === v.id ? (
                            <div style={{ fontSize: 12, color: colors.textTertiary }}>Loading diff…</div>
                          ) : diff ? (
                            <DiffSummary diff={diff} />
                          ) : (
                            <div style={{ fontSize: 12, color: colors.textTertiary }}>No diff available</div>
                          )}
                        </div>
                      )}

                      {/* Publish form */}
                      {isPublishTarget && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.glassBorder}` }}>
                          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                            Select a track to publish this version to. This generates a download ZIP for the track.
                          </div>
                          {tracksLoading ? (
                            <div style={{ fontSize: 12, color: colors.textTertiary }}>Loading tracks…</div>
                          ) : myTracks.length === 0 ? (
                            <div style={{ fontSize: 12, color: colors.textTertiary, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <AlertCircle size={13} /> No tracks found. Upload a track on fujistud.io first.
                            </div>
                          ) : (
                            <>
                              <select
                                value={selectedTrackId}
                                onChange={e => setSelectedTrackId(e.target.value)}
                                style={{ display: 'block', width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.glassBorder}`, borderRadius: borderRadius.sm, padding: '7px 10px', color: colors.textPrimary, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}
                              >
                                {myTracks.map(t => (
                                  <option key={t.id} value={t.id} style={{ background: '#1a1a2e' }}>
                                    {t.title}{!t.isPublic ? ' (private)' : ''}
                                  </option>
                                ))}
                              </select>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={confirmPublish} disabled={publishLoading || !selectedTrackId} style={primaryBtn}>
                                  {publishLoading ? 'Publishing…' : <><Music size={13} /> Confirm publish</>}
                                </button>
                                <button onClick={() => setPublishingVersionId(null)} style={secondaryBtn}>Cancel</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Local file list */}
          {scan && scan.files.length > 0 && (
            <div style={{ ...card, marginTop: spacing.lg }}>
              <SectionLabel>Files ({scan.files.length})</SectionLabel>
              <div style={{ maxHeight: 280, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: borderRadius.sm, padding: 8 }}>
                {scan.files.slice(0, 200).map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 6px', fontSize: 11, color: colors.textTertiary }}>
                    <FileAudio size={11} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ flex: 1, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
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
            <div style={{ background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.25)`, color: colors.error, borderRadius: borderRadius.md, padding: spacing.md, fontSize: 12, marginTop: spacing.lg }}>
              {error}
            </div>
          )}
        </>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const DiffSummary: React.FC<{ diff: api.VersionDiff }> = ({ diff }) => {
  const isFirst = diff.previousVersionNumber === null;
  if (isFirst) {
    return <div style={{ fontSize: 12, color: colors.textTertiary }}>Initial version — {diff.totalFiles} files added</div>;
  }
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  if (total === 0) {
    return <div style={{ fontSize: 12, color: colors.textTertiary }}>No changes from v{diff.previousVersionNumber}</div>;
  }
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
      {diff.added.length > 0 && (
        <span style={{ color: '#4ade80' }}>+{diff.added.length} added</span>
      )}
      {diff.changed.length > 0 && (
        <span style={{ color: '#facc15' }}>~{diff.changed.length} changed</span>
      )}
      {diff.removed.length > 0 && (
        <span style={{ color: colors.error }}>-{diff.removed.length} removed</span>
      )}
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textSecondary, marginBottom: 10 }}>
    {children}
  </div>
);

const card: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: borderRadius.lg,
  padding: spacing.xl,
};

const monoPath: React.CSSProperties = {
  background: 'rgba(0,0,0,0.2)',
  padding: '8px 10px',
  borderRadius: borderRadius.sm,
  fontFamily: "'Menlo', monospace",
  fontSize: 12,
  color: colors.textPrimary,
  wordBreak: 'break-all',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: colors.primary, color: '#fff', border: 'none',
  padding: '8px 14px', borderRadius: borderRadius.md,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'rgba(255,255,255,0.04)', color: colors.textSecondary,
  border: `1px solid ${colors.glassBorder}`,
  padding: '8px 14px', borderRadius: borderRadius.md, fontSize: 13, cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'rgba(239,68,68,0.1)', color: colors.error, border: 'none',
  padding: '8px 14px', borderRadius: borderRadius.md,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'transparent', color: colors.textTertiary, border: 'none',
  padding: '4px 8px', borderRadius: borderRadius.sm, fontSize: 11,
  fontWeight: 600, cursor: 'pointer',
};
