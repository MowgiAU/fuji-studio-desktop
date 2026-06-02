import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Upload, Trash2, Globe, Lock, Plus, X, CheckCircle, AlertCircle } from 'lucide-react';
import { borderRadius, colors, spacing } from '../theme/theme';
import * as api from '../services/api';

interface Track {
  id: string;
  title: string;
  coverUrl: string | null;
  duration: number | null;
  isPublic: boolean;
  playCount: number;
  createdAt: string;
}

interface Props {
  me: api.DesktopMe;
  onStorageChange?: () => void;
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'done'; title: string }
  | { phase: 'error'; message: string };

function formatDuration(s: number | null): string {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(0)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

export const MyTracksPanel: React.FC<Props> = ({ me, onStorageChange }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [storageInfo, setStorageInfo] = useState<api.DesktopStorage | null>(null);

  // Upload form state
  const [title, setTitle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);

  const loadTracks = useCallback(async () => {
    try {
      const data = await window.electronAPI.listMyTracks() as Track[];
      setTracks(data);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStorage = useCallback(async () => {
    try {
      const info = await api.getDesktopStorage();
      setStorageInfo(info);
    } catch {}
  }, []);

  useEffect(() => {
    loadTracks();
    refreshStorage();
  }, [loadTracks, refreshStorage]);

  const resetForm = () => {
    setTitle('');
    setIsPublic(true);
    setAudioFile(null);
    setArtworkFile(null);
    setUploadState({ phase: 'idle' });
    setShowUploadForm(false);
    if (audioInputRef.current) audioInputRef.current.value = '';
    if (artworkInputRef.current) artworkInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!audioFile || !title.trim()) return;

    setUploadState({ phase: 'uploading', progress: 0 });

    try {
      const audioBuffer = await audioFile.arrayBuffer();
      const artworkBuffer = artworkFile ? await artworkFile.arrayBuffer() : undefined;

      await api.uploadTrack({
        audioBuffer,
        audioName: audioFile.name,
        audioMime: audioFile.type || 'audio/mpeg',
        artworkBuffer,
        artworkName: artworkFile?.name,
        artworkMime: artworkFile?.type,
        title: title.trim(),
        isPublic,
      });

      setUploadState({ phase: 'done', title: title.trim() });
      await loadTracks();
      await refreshStorage();
      onStorageChange?.();
      setTimeout(resetForm, 2000);
    } catch (e: any) {
      setUploadState({ phase: 'error', message: e?.message || 'Upload failed' });
    }
  };

  const usedBytes = storageInfo?.usedBytes ?? me.totalStorageBytes;
  const quotaBytes = storageInfo?.quotaBytes ?? me.storageQuotaBytes ?? 1073741824;
  const usedPct = Math.min((usedBytes / quotaBytes) * 100, 100);
  const barColor = usedPct >= 90 ? colors.error : usedPct >= 75 ? colors.warning : colors.primary;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: `${spacing.xxl} ${spacing.xxl} ${spacing.lg}`,
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
            <Music size={22} color={colors.primary} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>My Tracks</div>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>Upload and manage your music</div>
            </div>
          </div>
          <button
            onClick={() => setShowUploadForm((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: colors.primary, color: '#fff', border: 'none',
              borderRadius: borderRadius.md, padding: '8px 14px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> UPLOAD TRACK
          </button>
        </div>

        {/* Storage bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: borderRadius.pill, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${usedPct}%`, background: barColor, borderRadius: borderRadius.pill, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: 11, color: colors.textSecondary, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
          </div>
        </div>
        {usedPct >= 85 && (
          <div style={{ marginTop: spacing.sm, fontSize: 11, color: usedPct >= 90 ? colors.error : colors.warning }}>
            {usedPct >= 90 ? 'Storage nearly full — delete tracks or projects to upload more.' : 'Storage running low.'}
          </div>
        )}
      </div>

      {/* Upload form */}
      {showUploadForm && (
        <div style={{
          background: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          padding: spacing.xxl,
          flexShrink: 0,
        }}>
          {uploadState.phase === 'done' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, color: colors.success }}>
              <CheckCircle size={18} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>"{uploadState.title}" uploaded successfully!</span>
            </div>
          ) : uploadState.phase === 'error' ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, color: colors.error, marginBottom: spacing.md }}>
                <AlertCircle size={18} />
                <span style={{ fontSize: 13 }}>{uploadState.message}</span>
              </div>
              <button onClick={() => setUploadState({ phase: 'idle' })} style={{ fontSize: 12, color: colors.textSecondary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Try again</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>New Track</span>
                <button onClick={resetForm} style={{ background: 'none', border: 'none', color: colors.textTertiary, cursor: 'pointer', display: 'flex' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Title input */}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track title *"
                style={{
                  background: colors.surfaceLight, border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.md, padding: '8px 12px',
                  color: colors.textPrimary, fontSize: 13, outline: 'none',
                }}
              />

              {/* File pickers */}
              <div style={{ display: 'flex', gap: spacing.md }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Audio file * (MP3, WAV, FLAC)</label>
                  <div
                    onClick={() => audioInputRef.current?.click()}
                    style={{
                      border: `1px dashed ${audioFile ? colors.primary : colors.border}`,
                      borderRadius: borderRadius.md, padding: '10px 12px',
                      cursor: 'pointer', fontSize: 12,
                      color: audioFile ? colors.primary : colors.textTertiary,
                      background: colors.surfaceLight,
                    }}
                  >
                    {audioFile ? audioFile.name : 'Click to select…'}
                  </div>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/flac,audio/aiff,audio/ogg,.mp3,.wav,.flac,.aif,.aiff,.ogg"
                    style={{ display: 'none' }}
                    onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: colors.textSecondary, display: 'block', marginBottom: 4 }}>Cover art (optional)</label>
                  <div
                    onClick={() => artworkInputRef.current?.click()}
                    style={{
                      border: `1px dashed ${artworkFile ? colors.primary : colors.border}`,
                      borderRadius: borderRadius.md, padding: '10px 12px',
                      cursor: 'pointer', fontSize: 12,
                      color: artworkFile ? colors.primary : colors.textTertiary,
                      background: colors.surfaceLight,
                    }}
                  >
                    {artworkFile ? artworkFile.name : 'Click to select…'}
                  </div>
                  <input
                    ref={artworkInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    style={{ display: 'none' }}
                    onChange={(e) => setArtworkFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              {/* Visibility toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
                <button
                  onClick={() => setIsPublic((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: isPublic ? 'rgba(16,185,129,0.1)' : colors.surfaceLight,
                    border: `1px solid ${isPublic ? colors.primary : colors.border}`,
                    borderRadius: borderRadius.md, padding: '6px 12px',
                    color: isPublic ? colors.primary : colors.textSecondary,
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {isPublic ? <Globe size={13} /> : <Lock size={13} />}
                  {isPublic ? 'Public' : 'Private'}
                </button>
                <span style={{ fontSize: 11, color: colors.textTertiary }}>
                  {isPublic ? 'Visible on your profile' : 'Only you can see this'}
                </span>
              </div>

              {/* Submit */}
              <button
                onClick={handleUpload}
                disabled={!audioFile || !title.trim() || uploadState.phase === 'uploading'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: !audioFile || !title.trim() ? colors.border : colors.primary,
                  color: '#fff', border: 'none', borderRadius: borderRadius.md,
                  padding: '9px 0', fontSize: 12, fontWeight: 700,
                  cursor: !audioFile || !title.trim() ? 'not-allowed' : 'pointer',
                  opacity: uploadState.phase === 'uploading' ? 0.7 : 1,
                }}
              >
                <Upload size={14} />
                {uploadState.phase === 'uploading' ? 'Uploading…' : 'Upload Track'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Track list */}
      <div style={{ flex: 1, overflow: 'auto', padding: spacing.xxl }}>
        {loading ? (
          <div style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Loading tracks…</div>
        ) : tracks.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 60, color: colors.textTertiary }}>
            <Music size={40} color={colors.border} style={{ marginBottom: spacing.md }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: colors.textSecondary, marginBottom: spacing.sm }}>No tracks yet</div>
            <div style={{ fontSize: 12 }}>Click "Upload Track" to add your first track</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {tracks.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TrackRow: React.FC<{ track: Track }> = ({ track }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: spacing.md,
    background: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md, padding: spacing.md,
  }}>
    {/* Cover */}
    <div style={{
      width: 44, height: 44, borderRadius: borderRadius.sm, flexShrink: 0,
      background: colors.surfaceLight, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {track.coverUrl ? (
        <img src={track.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Music size={18} color={colors.textTertiary} />
      )}
    </div>

    {/* Info */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {track.title}
      </div>
      <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
        {track.playCount > 0 && `${track.playCount} play${track.playCount !== 1 ? 's' : ''} · `}
        {formatDuration(track.duration)}
      </div>
    </div>

    {/* Visibility badge */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600,
      color: track.isPublic ? colors.primary : colors.textTertiary,
      background: track.isPublic ? 'rgba(16,185,129,0.1)' : colors.surfaceLight,
      borderRadius: borderRadius.pill, padding: '3px 8px',
      flexShrink: 0,
    }}>
      {track.isPublic ? <Globe size={10} /> : <Lock size={10} />}
      {track.isPublic ? 'Public' : 'Private'}
    </div>
  </div>
);
