import React, { useEffect, useState, useCallback, useRef } from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import * as api from '../services/api';
import { Persist, PersistedWatch } from '../services/store';
import { useSyncProgress, useWatcherEvents } from '../hooks/useSync';
import {
  ChevronLeft, ChevronDown, ChevronUp, ExternalLink, FileAudio, FolderPlus,
  HardDrive, RefreshCw, X, Link, Link2Off, Music, Check, AlertCircle,
  Upload, Globe, Lock, Plus, Tag,
} from 'lucide-react';

interface Props {
  projectId: string;
  onBack: () => void;
  username?: string;
}

const TRACK_TYPES = [
  { value: 'original', label: 'Original' },
  { value: 'remix', label: 'Remix' },
  { value: 'cover', label: 'Cover' },
];

const KEYS = [
  'C Major', 'C Minor', 'C# Major', 'C# Minor',
  'D Major', 'D Minor', 'D# Major', 'D# Minor',
  'E Major', 'E Minor',
  'F Major', 'F Minor', 'F# Major', 'F# Minor',
  'G Major', 'G Minor', 'G# Major', 'G# Minor',
  'A Major', 'A Minor', 'A# Major', 'A# Minor',
  'B Major', 'B Minor',
];

const LICENSES = [
  { value: 'all-rights-reserved', label: 'All Rights Reserved' },
  { value: 'cc0', label: 'CC0 — Public Domain' },
  { value: 'cc-by', label: 'CC BY' },
  { value: 'cc-by-sa', label: 'CC BY-SA' },
  { value: 'cc-by-nc', label: 'CC BY-NC' },
  { value: 'cc-by-nc-sa', label: 'CC BY-NC-SA' },
  { value: 'cc-by-nd', label: 'CC BY-ND' },
  { value: 'cc-by-nc-nd', label: 'CC BY-NC-ND' },
];

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const ProjectDetail: React.FC<Props> = ({ projectId, onBack, username }) => {
  const [project, setProject] = useState<api.RemoteProjectDetail | null>(null);
  const [watch, setWatch] = useState<PersistedWatch | null>(null);
  const [scan, setScan] = useState<api.ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState('');
  const progressMap = useSyncProgress();
  const progress = progressMap[projectId];

  // Version history
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, api.VersionDiff>>({});
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);

  // Create track form
  const [createVersionId, setCreateVersionId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('');
  const [createAudioFile, setCreateAudioFile] = useState<File | null>(null);
  const [createArtworkFile, setCreateArtworkFile] = useState<File | null>(null);
  const [createIsPublic, setCreateIsPublic] = useState(true);
  const [createBpm, setCreateBpm] = useState('');
  const [createKey, setCreateKey] = useState('');
  const [createTrackType, setCreateTrackType] = useState('original');
  const [createArtist, setCreateArtist] = useState('');
  const [createAlbum, setCreateAlbum] = useState('');
  const [createYear, setCreateYear] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createLyrics, setCreateLyrics] = useState('');
  const [createAllowAudio, setCreateAllowAudio] = useState(true);
  const [createAllowProject, setCreateAllowProject] = useState(true);
  const [createLicense, setCreateLicense] = useState('all-rights-reserved');
  const [createGenreIds, setCreateGenreIds] = useState<string[]>([]);
  const [createTosAccepted, setCreateTosAccepted] = useState(false);
  const [createUploading, setCreateUploading] = useState(false);
  const [createPhase, setCreatePhase] = useState<'uploading' | 'linking' | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [genres, setGenres] = useState<api.Genre[]>([]);
  const [showMoreMeta, setShowMoreMeta] = useState(false);
  const createAudioRef = useRef<HTMLInputElement>(null);
  const createArtworkRef = useRef<HTMLInputElement>(null);

  // Link-to-existing flow
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(null);
  const [myTracks, setMyTracks] = useState<api.MyTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('');
  const [publishLoading, setPublishLoading] = useState(false);
  const [unpublishLoading, setUnpublishLoading] = useState<string | null>(null);

  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef(0);

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

  useWatcherEvents(useCallback((pid, paths) => {
    if (pid !== projectId) return;
    if (!watch?.autoSync) return;
    const hasFlp = paths.some(p => p.toLowerCase().endsWith('.flp'));
    if (!hasFlp) return;
    if (isSyncingRef.current) return;
    const now = Date.now();
    if (now - lastSyncTimeRef.current < 60_000) return;
    isSyncingRef.current = true;
    lastSyncTimeRef.current = now;
    api.syncLocalProject(projectId, watch.folderPath, 'Auto-sync (FLP saved)')
      .then(() => load())
      .catch((e: any) => setError(typeof e === 'string' ? e : e?.message))
      .finally(() => { isSyncingRef.current = false; });
  }, [projectId, watch, load]));

  const pickFolder = async () => {
    const selected = await window.electronAPI.selectFolder();
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
    if (expandedDiff === versionId) { setExpandedDiff(null); return; }
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

  // ─── Create track ─────────────────────────────────────────────────────────

  const openCreateTrack = async (versionId: string) => {
    setCreateVersionId(versionId);
    setCreateTitle(project?.name || '');
    setCreateAudioFile(null);
    setCreateArtworkFile(null);
    setCreateIsPublic(true);
    setCreateBpm('');
    setCreateKey('');
    setCreateTrackType('original');
    setCreateArtist('');
    setCreateAlbum('');
    setCreateYear('');
    setCreateDescription('');
    setCreateLyrics('');
    setCreateAllowAudio(true);
    setCreateAllowProject(true);
    setCreateLicense('all-rights-reserved');
    setCreateGenreIds([]);
    setCreateTosAccepted(false);
    setCreateError(null);
    setCreatePhase(null);
    setShowMoreMeta(false);
    setPublishingVersionId(null);
    if (createAudioRef.current) createAudioRef.current.value = '';
    if (createArtworkRef.current) createArtworkRef.current.value = '';
    if (genres.length === 0) {
      try { setGenres(await api.listGenres()); } catch {}
    }
  };

  const closeCreateTrack = () => {
    setCreateVersionId(null);
    setCreateError(null);
    setCreatePhase(null);
    setCreateUploading(false);
  };

  const toggleGenre = (id: string) => {
    setCreateGenreIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleCreateTrack = async () => {
    if (!createVersionId || !createAudioFile || !createTitle.trim() || !createTosAccepted) return;

    setCreateUploading(true);
    setCreateError(null);
    setCreatePhase('uploading');

    try {
      const audioBuffer = await createAudioFile.arrayBuffer();
      const artworkBuffer = createArtworkFile ? await createArtworkFile.arrayBuffer() : undefined;

      const track = await api.uploadTrack({
        audioBuffer,
        audioName: createAudioFile.name,
        audioMime: createAudioFile.type || 'audio/mpeg',
        artworkBuffer,
        artworkName: createArtworkFile?.name,
        artworkMime: createArtworkFile?.type,
        title: createTitle.trim(),
        isPublic: createIsPublic,
        bpm: createBpm.trim() || undefined,
        key: createKey || undefined,
        trackType: createTrackType,
        artist: createArtist.trim() || undefined,
        album: createAlbum.trim() || undefined,
        year: createYear.trim() || undefined,
        description: createDescription.trim() || undefined,
        lyrics: createLyrics.trim() || undefined,
        allowAudioDownload: createAllowAudio,
        allowProjectDownload: createAllowProject,
        license: createLicense,
        genreIds: createGenreIds.length > 0 ? createGenreIds : undefined,
        flpFolderPath: watch?.folderPath,
      });

      setCreatePhase('linking');
      await api.publishVersion(projectId, createVersionId, track.id);

      closeCreateTrack();
      await load();
    } catch (e: any) {
      setCreateError(e?.message || 'Something went wrong');
      setCreateUploading(false);
      setCreatePhase(null);
    }
  };

  // ─── Link-to-existing ─────────────────────────────────────────────────────

  const openLinkExisting = async (versionId: string) => {
    setPublishingVersionId(versionId);
    setSelectedTrackId('');
    setCreateVersionId(null);
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

  const confirmLink = async () => {
    if (!publishingVersionId || !selectedTrackId) return;
    setPublishLoading(true);
    setError(null);
    try {
      await api.publishVersion(projectId, publishingVersionId, selectedTrackId);
      setPublishingVersionId(null);
      await load();
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Link failed');
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
      setError(typeof e === 'string' ? e : e?.message || 'Unlink failed');
    } finally {
      setUnpublishLoading(null);
    }
  };

  if (loading) return <div style={{ padding: spacing.xxl, color: colors.textTertiary }}>Loading…</div>;

  // Group genres by parent
  const parentGenres = genres.filter(g => !g.parentId);
  const childGenres = (parentId: string) => genres.filter(g => g.parentId === parentId);

  return (
    <div style={{ padding: spacing.xxl, maxWidth: 900, margin: '0 auto', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <button
        onClick={onBack}
        style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', marginBottom: spacing.lg, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
      >
        <ChevronLeft size={14} /> Back
      </button>

      {!project ? (
        <div style={{ color: error?.includes('401') || error?.includes('expired') ? '#f59e0b' : colors.textTertiary, fontSize: 13 }}>
          {error?.includes('401') || error?.includes('expired')
            ? 'Session expired — please sign out and sign back in.'
            : error || 'Project not found'}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: spacing.xxl }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{project.name}</h1>
            {project.description && (
              <p style={{ margin: '4px 0 0', color: colors.textSecondary, fontSize: 13 }}>{project.description}</p>
            )}
            <button
              onClick={() => window.electronAPI.openExternal(`${apiBase}/projects/${project.id}`).catch(() => {})}
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
                    {watch.autoSync ? 'Auto-sync: on' : 'Auto-sync: off'}
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
                  const isCreating = createVersionId === v.id;
                  const isLinking = publishingVersionId === v.id;

                  return (
                    <div
                      key={v.id}
                      style={{ background: 'rgba(0,0,0,0.2)', borderRadius: borderRadius.md, padding: '10px 12px', border: `1px solid ${isCreating ? 'rgba(16,185,129,0.35)' : colors.glassBorder}`, transition: 'border-color 0.15s' }}
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
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                          <button onClick={() => toggleDiff(v.id)} style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {expandedDiff === v.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Diff
                          </button>
                          {!publishedLink ? (
                            <>
                              <button
                                onClick={() => isCreating ? closeCreateTrack() : openCreateTrack(v.id)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: isCreating ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.12)',
                                  color: isCreating ? colors.textSecondary : colors.primary,
                                  border: `1px solid ${isCreating ? colors.glassBorder : 'rgba(16,185,129,0.3)'}`,
                                  borderRadius: borderRadius.sm, padding: '4px 10px',
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                {isCreating ? <X size={11} /> : <Plus size={11} />}
                                {isCreating ? 'Cancel' : 'Create Track'}
                              </button>
                              <button onClick={() => isLinking ? setPublishingVersionId(null) : openLinkExisting(v.id)} style={ghostBtn}>
                                <Link size={11} /> {isLinking ? 'Cancel' : 'Link existing'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => window.electronAPI.openExternal(`${apiBase}/profile/${username}/${publishedLink.track.slug}`).catch(() => {})}
                                style={{ ...ghostBtn, color: colors.primary }}
                              >
                                <ExternalLink size={11} /> View track
                              </button>
                              <button
                                onClick={() => handleUnpublish(publishedLink.trackId)}
                                disabled={!!unpublishLoading}
                                style={{ ...ghostBtn, color: colors.error }}
                              >
                                {unpublishLoading === publishedLink.trackId ? '…' : <><Link2Off size={11} /> Unlink</>}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Published badge */}
                      {publishedLink && (
                        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.08)', border: `1px solid rgba(16,185,129,0.2)`, borderRadius: borderRadius.sm, padding: '3px 10px', fontSize: 11, color: colors.primary }}>
                          <Check size={11} /> <strong>{publishedLink.track.title}</strong>
                          <span style={{ color: colors.textTertiary }}>· project files bundled for download</span>
                        </div>
                      )}

                      {/* Diff panel */}
                      {expandedDiff === v.id && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.glassBorder}` }}>
                          {loadingDiff === v.id ? (
                            <div style={{ fontSize: 12, color: colors.textTertiary }}>Loading diff…</div>
                          ) : diffs[v.id] ? (
                            <DiffSummary diff={diffs[v.id]} />
                          ) : (
                            <div style={{ fontSize: 12, color: colors.textTertiary }}>No diff available</div>
                          )}
                        </div>
                      )}

                      {/* ── Create Track form ── */}
                      {isCreating && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid rgba(16,185,129,0.2)` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Music size={13} color={colors.primary} /> Create Track from v{v.versionNumber}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                            {/* Row 1: Title */}
                            <div>
                              <label style={formLabel}>Track title *</label>
                              <input value={createTitle} onChange={e => setCreateTitle(e.target.value)} placeholder="Track title" style={formInput} />
                            </div>

                            {/* Row 2: Audio + Artwork */}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ flex: 2 }}>
                                <label style={formLabel}>Audio render * (MP3, WAV, FLAC)</label>
                                <div onClick={() => createAudioRef.current?.click()} style={{ ...filePicker, borderColor: createAudioFile ? colors.primary : 'rgba(255,255,255,0.12)', color: createAudioFile ? colors.primary : colors.textTertiary }}>
                                  <FileAudio size={13} style={{ flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{createAudioFile ? createAudioFile.name : 'Click to select…'}</span>
                                </div>
                                <input ref={createAudioRef} type="file" accept="audio/mpeg,audio/wav,audio/flac,audio/aiff,audio/ogg,.mp3,.wav,.flac,.aif,.aiff,.ogg" style={{ display: 'none' }} onChange={e => setCreateAudioFile(e.target.files?.[0] ?? null)} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={formLabel}>Cover art</label>
                                <div onClick={() => createArtworkRef.current?.click()} style={{ ...filePicker, borderColor: createArtworkFile ? colors.primary : 'rgba(255,255,255,0.12)', color: createArtworkFile ? colors.primary : colors.textTertiary }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{createArtworkFile ? createArtworkFile.name : 'Optional'}</span>
                                </div>
                                <input ref={createArtworkRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={e => setCreateArtworkFile(e.target.files?.[0] ?? null)} />
                              </div>
                            </div>

                            {/* Row 3: Type + BPM + Key */}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ flex: 1 }}>
                                <label style={formLabel}>Type</label>
                                <select value={createTrackType} onChange={e => setCreateTrackType(e.target.value)} style={formSelect}>
                                  {TRACK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div style={{ width: 80 }}>
                                <label style={formLabel}>BPM</label>
                                <input value={createBpm} onChange={e => setCreateBpm(e.target.value.replace(/\D/g, ''))} placeholder="140" maxLength={3} style={formInput} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={formLabel}>Key</label>
                                <select value={createKey} onChange={e => setCreateKey(e.target.value)} style={formSelect}>
                                  <option value="">Unknown</option>
                                  {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                                </select>
                              </div>
                            </div>

                            {/* Row 4: Artist */}
                            <div>
                              <label style={formLabel}>Artist name</label>
                              <input value={createArtist} onChange={e => setCreateArtist(e.target.value)} placeholder="Leave blank to use your profile name" style={formInput} />
                            </div>

                            {/* More metadata toggle */}
                            <button
                              onClick={() => setShowMoreMeta(v => !v)}
                              style={{ background: 'none', border: 'none', color: colors.textTertiary, fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              {showMoreMeta ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              {showMoreMeta ? 'Hide' : 'Show'} album, year, description, lyrics
                            </button>

                            {showMoreMeta && (
                              <>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <div style={{ flex: 2 }}>
                                    <label style={formLabel}>Album</label>
                                    <input value={createAlbum} onChange={e => setCreateAlbum(e.target.value)} placeholder="Album name" style={formInput} />
                                  </div>
                                  <div style={{ width: 80 }}>
                                    <label style={formLabel}>Year</label>
                                    <input value={createYear} onChange={e => setCreateYear(e.target.value.replace(/\D/g, ''))} placeholder="2025" maxLength={4} style={formInput} />
                                  </div>
                                </div>
                                <div>
                                  <label style={formLabel}>Description</label>
                                  <textarea value={createDescription} onChange={e => setCreateDescription(e.target.value)} placeholder="Tell people about this track…" rows={3} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
                                </div>
                                <div>
                                  <label style={formLabel}>Lyrics</label>
                                  <textarea value={createLyrics} onChange={e => setCreateLyrics(e.target.value)} placeholder="Paste lyrics here…" rows={4} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
                                </div>
                              </>
                            )}

                            {/* Genres */}
                            {genres.length > 0 && (
                              <div>
                                <label style={{ ...formLabel, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Tag size={10} /> Genres
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {parentGenres.map(pg => (
                                    <React.Fragment key={pg.id}>
                                      <button
                                        onClick={() => toggleGenre(pg.id)}
                                        style={{
                                          padding: '3px 10px', borderRadius: borderRadius.pill, fontSize: 11, cursor: 'pointer', border: '1px solid',
                                          background: createGenreIds.includes(pg.id) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                                          borderColor: createGenreIds.includes(pg.id) ? colors.primary : 'rgba(255,255,255,0.1)',
                                          color: createGenreIds.includes(pg.id) ? colors.primary : colors.textSecondary,
                                        }}
                                      >
                                        {pg.name}
                                      </button>
                                      {childGenres(pg.id).map(cg => (
                                        <button
                                          key={cg.id}
                                          onClick={() => toggleGenre(cg.id)}
                                          style={{
                                            padding: '3px 10px', borderRadius: borderRadius.pill, fontSize: 11, cursor: 'pointer', border: '1px solid',
                                            background: createGenreIds.includes(cg.id) ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.02)',
                                            borderColor: createGenreIds.includes(cg.id) ? colors.primary : 'rgba(255,255,255,0.07)',
                                            color: createGenreIds.includes(cg.id) ? colors.primary : colors.textTertiary,
                                          }}
                                        >
                                          {cg.name}
                                        </button>
                                      ))}
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Visibility + download options */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                              <button
                                onClick={() => setCreateIsPublic(p => !p)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  background: createIsPublic ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${createIsPublic ? 'rgba(16,185,129,0.35)' : colors.glassBorder}`,
                                  borderRadius: borderRadius.sm, padding: '6px 12px',
                                  color: createIsPublic ? colors.primary : colors.textSecondary,
                                  fontSize: 12, cursor: 'pointer',
                                }}
                              >
                                {createIsPublic ? <Globe size={12} /> : <Lock size={12} />}
                                {createIsPublic ? 'Public' : 'Private'}
                              </button>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textSecondary, cursor: 'pointer' }}>
                                <input type="checkbox" checked={createAllowAudio} onChange={e => setCreateAllowAudio(e.target.checked)} />
                                Allow audio download
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textSecondary, cursor: 'pointer' }}>
                                <input type="checkbox" checked={createAllowProject} onChange={e => setCreateAllowProject(e.target.checked)} />
                                Allow project download
                              </label>
                            </div>

                            {/* License */}
                            <div>
                              <label style={formLabel}>License</label>
                              <select value={createLicense} onChange={e => setCreateLicense(e.target.value)} style={formSelect}>
                                {LICENSES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                              </select>
                            </div>

                            {/* Terms of service */}
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: colors.textSecondary, cursor: 'pointer', lineHeight: 1.4 }}>
                              <input type="checkbox" checked={createTosAccepted} onChange={e => setCreateTosAccepted(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                              <span>
                                I confirm this track is my original work (or I have rights to share it), does not infringe any copyright, and I agree to the{' '}
                                <span
                                  onClick={() => window.electronAPI.openExternal(`${apiBase}/terms`).catch(() => {})}
                                  style={{ color: colors.primary, cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                  Terms of Service
                                </span>.
                              </span>
                            </label>

                            {/* Error */}
                            {createError && (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: colors.error, fontSize: 12 }}>
                                <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                                {createError}
                              </div>
                            )}

                            {/* Submit */}
                            <button
                              onClick={handleCreateTrack}
                              disabled={createUploading || !createAudioFile || !createTitle.trim() || !createTosAccepted}
                              style={{
                                ...primaryBtn,
                                justifyContent: 'center',
                                opacity: createUploading || !createAudioFile || !createTitle.trim() || !createTosAccepted ? 0.55 : 1,
                                cursor: createUploading || !createAudioFile || !createTitle.trim() || !createTosAccepted ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {createUploading
                                ? createPhase === 'linking'
                                  ? <><Check size={13} /> Linking project files…</>
                                  : <><Upload size={13} /> Uploading audio…</>
                                : <><Upload size={13} /> Upload &amp; Create Track</>}
                            </button>

                            <div style={{ fontSize: 11, color: colors.textTertiary }}>
                              All {v.totalFiles} project files from this version will be bundled into a download ZIP automatically.
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Link-to-existing form */}
                      {isLinking && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.glassBorder}` }}>
                          <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                            Link v{v.versionNumber} to a track you already uploaded.
                          </div>
                          {tracksLoading ? (
                            <div style={{ fontSize: 12, color: colors.textTertiary }}>Loading tracks…</div>
                          ) : myTracks.length === 0 ? (
                            <div style={{ fontSize: 12, color: colors.textTertiary, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <AlertCircle size={13} /> No tracks found. Use "Create Track" to make one.
                            </div>
                          ) : (
                            <>
                              <select value={selectedTrackId} onChange={e => setSelectedTrackId(e.target.value)} style={{ display: 'block', width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.glassBorder}`, borderRadius: borderRadius.sm, padding: '7px 10px', color: colors.textPrimary, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                                {myTracks.map(t => (
                                  <option key={t.id} value={t.id} style={{ background: '#1a1a2e' }}>
                                    {t.title}{!t.isPublic ? ' (private)' : ''}
                                  </option>
                                ))}
                              </select>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={confirmLink} disabled={publishLoading || !selectedTrackId} style={primaryBtn}>
                                  {publishLoading ? 'Linking…' : <><Music size={13} /> Confirm link</>}
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
                  <div style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 11, padding: 4 }}>+ {scan.files.length - 200} more files</div>
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
  if (isFirst) return <div style={{ fontSize: 12, color: colors.textTertiary }}>Initial version — {diff.totalFiles} files added</div>;
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  if (total === 0) return <div style={{ fontSize: 12, color: colors.textTertiary }}>No changes from v{diff.previousVersionNumber}</div>;
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
      {diff.added.length > 0 && <span style={{ color: '#4ade80' }}>+{diff.added.length} added</span>}
      {diff.changed.length > 0 && <span style={{ color: '#facc15' }}>~{diff.changed.length} changed</span>}
      {diff.removed.length > 0 && <span style={{ color: colors.error }}>-{diff.removed.length} removed</span>}
    </div>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textSecondary, marginBottom: 10 }}>
    {children}
  </div>
);

const card: React.CSSProperties = { background: colors.surface, border: `1px solid ${colors.glassBorder}`, borderRadius: borderRadius.lg, padding: spacing.xl };
const monoPath: React.CSSProperties = { background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: borderRadius.sm, fontFamily: "'Menlo', monospace", fontSize: 12, color: colors.textPrimary, wordBreak: 'break-all' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: colors.primary, color: '#fff', border: 'none', padding: '8px 14px', borderRadius: borderRadius.md, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const secondaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', color: colors.textSecondary, border: `1px solid ${colors.glassBorder}`, padding: '8px 14px', borderRadius: borderRadius.md, fontSize: 13, cursor: 'pointer' };
const dangerBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.1)', color: colors.error, border: 'none', padding: '8px 14px', borderRadius: borderRadius.md, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', color: colors.textTertiary, border: 'none', padding: '4px 8px', borderRadius: borderRadius.sm, fontSize: 11, fontWeight: 600, cursor: 'pointer' };
const formLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textTertiary, display: 'block', marginBottom: 4 };
const formInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: borderRadius.sm, padding: '7px 10px', color: colors.textPrimary, fontSize: 13, outline: 'none' };
const formSelect: React.CSSProperties = { ...formInput, cursor: 'pointer' };
const filePicker: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: borderRadius.sm, cursor: 'pointer', fontSize: 12 };
