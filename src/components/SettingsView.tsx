import React, { useEffect, useState } from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import * as api from '../services/api';
import { Persist } from '../services/store';
import { Save, Settings as SettingsIcon } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [apiBase, setApiBase] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getApiBase().then(setApiBase).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const trimmed = apiBase.trim().replace(/\/$/, '');
      await api.setApiBase(trimmed);
      await Persist.setApiBase(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: spacing.xxl, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, marginBottom: spacing.xxl }}>
        <SettingsIcon size={22} color={colors.primary} style={{ verticalAlign: 'middle', marginRight: 10 }} />
        Settings
      </h1>

      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.glassBorder}`,
          borderRadius: borderRadius.lg,
          padding: spacing.xl,
        }}
      >
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
          API Endpoint
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.textTertiary }}>
          Change this to point at a self-hosted or staging Fuji Studio instance. Default is
          https://fujistud.io.
        </p>
        <input
          value={apiBase}
          onChange={e => setApiBase(e.target.value)}
          placeholder="https://fujistud.io"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: borderRadius.sm,
            padding: '8px 10px',
            color: colors.textPrimary,
            fontSize: 13,
            outline: 'none',
            fontFamily: "'Menlo', monospace",
          }}
        />
        <button
          onClick={save}
          disabled={saving}
          style={{
            marginTop: 12,
            background: colors.primary,
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: borderRadius.md,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Save size={14} /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
};
