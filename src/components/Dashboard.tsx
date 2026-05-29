import React, { useEffect, useState, useRef } from 'react';
import { colors, spacing, borderRadius, shadows } from '../theme/theme';
import { CheckCircle2, XCircle, RefreshCw, ArrowUpDown } from 'lucide-react';
import * as api from '../services/api';
import { useSyncProgress, useRecentCompleted } from '../hooks/useSync';

interface Props {
  projectNameMap: Record<string, string>;
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
  return `${b} B`;
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Simple bar chart — no dependency, just divs
const ThroughputChart: React.FC<{ samples: number[] }> = ({ samples }) => {
  const max = Math.max(...samples, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
      {samples.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i === samples.length - 1
              ? colors.primary
              : `rgba(16,185,129,${0.25 + 0.45 * (v / max)})`,
            borderRadius: '2px 2px 0 0',
            height: `${Math.max(4, (v / max) * 100)}%`,
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
  );
};

export const Dashboard: React.FC<Props> = ({ projectNameMap }) => {
  const [me, setMe] = useState<api.DesktopMe | null>(null);
  const [throughputSamples, setThroughputSamples] = useState<number[]>(Array(20).fill(0));
  const lastBytesRef = useRef(0);
  const progress = useSyncProgress(projectNameMap);
  const recentCompleted = useRecentCompleted();

  useEffect(() => {
    api.getDesktopMe().then(setMe).catch(() => {});
  }, []);

  // Simulate throughput by sampling total uploaded bytes across active syncs
  useEffect(() => {
    const id = setInterval(() => {
      const totalBytes = Object.values(progress).reduce((sum, p) => {
        if (!p || p.stage === 'done' || p.stage === 'error') return sum;
        // Rough: each file ~50 KB
        return sum + p.uploaded * 50_000;
      }, 0);
      const delta = Math.max(0, totalBytes - lastBytesRef.current);
      lastBytesRef.current = totalBytes;
      setThroughputSamples(prev => [...prev.slice(1), delta]);
    }, 1000);
    return () => clearInterval(id);
  }, [progress]);

  const activeProjects = Object.entries(progress).filter(
    ([, p]) => p && p.stage !== 'done' && p.stage !== 'error',
  );

  const storageBytes = me?.totalStorageBytes ?? 0;
  // Placeholder: 5 GB free plan limit
  const FREE_LIMIT = 5 * 1024 * 1024 * 1024;
  const usedPct = Math.min(100, Math.round((storageBytes / FREE_LIMIT) * 100));

  const upKBps = throughputSamples[throughputSamples.length - 1] / 1024;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left column */}
      <div style={{ flex: 1, overflowY: 'auto', padding: spacing.xxl, paddingRight: spacing.lg }}>

        {/* Storage Status */}
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <h2 style={h2}>Storage Status</h2>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px',
              borderRadius: borderRadius.pill,
              border: `1px solid ${colors.warning}`,
              color: colors.warning,
            }}>
              Free Plan
            </span>
          </div>

          <div style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>FREE STORAGE</span>
            <span style={{ color: usedPct > 80 ? colors.error : colors.textTertiary }}>{usedPct}% USED</span>
          </div>
          <div style={{ height: 6, background: colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: spacing.md }}>
            <div style={{
              height: '100%',
              width: `${usedPct}%`,
              background: usedPct > 80 ? colors.error : colors.primary,
              borderRadius: 3,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.lg }}>
            <span style={{ color: colors.textPrimary }}>
              <strong style={{ fontSize: 20 }}>{fmtBytes(storageBytes)}</strong>
              <span style={{ color: colors.textSecondary, fontSize: 13 }}> of 5 GB used</span>
            </span>
            <span style={{ color: colors.textTertiary, fontSize: 12 }}>{fmtBytes(FREE_LIMIT - storageBytes)} remaining</span>
          </div>

          <p style={{ color: colors.textSecondary, fontSize: 13, margin: `0 0 ${spacing.md}` }}>
            Get unlimited storage and high-speed sync with Pro.
          </p>
          <button style={{
            width: '100%', background: colors.primary, color: '#fff', border: 'none',
            borderRadius: borderRadius.md, padding: '10px 0', fontWeight: 700,
            fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8,
          }}>
            ↑ UPGRADE TO PRO
          </button>
        </section>

        {/* Network Throughput */}
        <section style={{ ...card, marginTop: spacing.lg }}>
          <h2 style={{ ...h2, marginBottom: spacing.lg }}>Network Throughput</h2>
          <ThroughputChart samples={throughputSamples} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: spacing.sm, fontSize: 11, color: colors.textTertiary }}>
            <span>UP: {upKBps >= 1000 ? `${(upKBps / 1024).toFixed(1)} MB/s` : `${upKBps.toFixed(1)} KB/s`}</span>
            <span>DOWN: 0 KB/s</span>
          </div>
        </section>
      </div>

      {/* Right column — Transfers */}
      <div style={{
        width: 340, flexShrink: 0, borderLeft: `1px solid ${colors.border}`,
        overflowY: 'auto', padding: spacing.xxl, paddingLeft: spacing.lg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <h2 style={h2}>Transfers</h2>
          {activeProjects.length === 0 && recentCompleted.length === 0 && (
            <ArrowUpDown size={16} color={colors.textTertiary} />
          )}
        </div>

        {activeProjects.length > 0 && (
          <>
            <div style={sectionLabel}>
              <RefreshCw size={11} style={{ animation: 'spin 1.5s linear infinite' }} />
              ACTIVE ({activeProjects.length})
            </div>
            {activeProjects.map(([projectId, p]) => {
              if (!p) return null;
              const pct = p.total > 0 ? Math.round((p.uploaded / p.total) * 100)
                : p.stage === 'finalizing' ? 90 : p.stage === 'scanning' ? 5 : 20;
              const stageText = {
                scanning: 'Scanning files…',
                checking: 'Checking blobs…',
                uploading: `Uploading ${p.uploaded}/${p.total} files`,
                finalizing: 'Finalizing…',
                done: 'Done',
                error: 'Error',
              }[p.stage];
              return (
                <div key={projectId} style={transferCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>
                        {projectNameMap[projectId] || projectId}
                      </div>
                      <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        {stageText.toUpperCase()}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary }}>{pct}%</span>
                  </div>
                  <div style={{ height: 4, background: colors.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, background: colors.primary,
                      borderRadius: 2, transition: 'width 0.3s ease',
                    }} />
                  </div>
                  {p.current_file && (
                    <div style={{ fontSize: 10, color: colors.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.current_file}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {recentCompleted.length > 0 && (
          <>
            <div style={{ ...sectionLabel, marginTop: activeProjects.length > 0 ? spacing.lg : 0 }}>
              RECENTLY COMPLETED
            </div>
            {recentCompleted.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: spacing.md,
                padding: `${spacing.md} 0`,
                borderBottom: i < recentCompleted.length - 1 ? `1px solid ${colors.border}` : 'none',
              }}>
                {c.stage === 'done'
                  ? <CheckCircle2 size={16} color={colors.success} style={{ flexShrink: 0 }} />
                  : <XCircle size={16} color={colors.error} style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.projectName}
                  </div>
                  <div style={{ fontSize: 11, color: c.stage === 'done' ? colors.success : colors.error }}>
                    {c.stage === 'done' ? 'SUCCESS' : 'FAILED'} · {timeAgo(c.completedAt)}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {activeProjects.length === 0 && recentCompleted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: colors.textTertiary, fontSize: 13 }}>
            No active transfers
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const card: React.CSSProperties = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.lg,
  padding: spacing.xl,
  boxShadow: shadows.sm,
};

const h2: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: colors.textPrimary,
};

const sectionLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  color: colors.textTertiary,
  letterSpacing: '0.08em',
  marginBottom: spacing.md,
};

const transferCard: React.CSSProperties = {
  background: colors.surfaceLight,
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.md,
  padding: spacing.md,
  marginBottom: spacing.sm,
};
