import React, { useEffect, useState } from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import { Settings as SettingsIcon } from 'lucide-react';
import type { AppSettings } from '../electron-env';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    minimizeToTray: true,
    desktopNotifications: true,
    launchAtStartup: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof AppSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try {
      await window.electronAPI.setSetting(key, next[key]);
    } catch (e) {
      console.error('Failed to save setting', e);
      setSettings(settings);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: spacing.xxl, color: colors.textTertiary }}>Loading…</div>
    );
  }

  return (
    <div style={{ padding: spacing.xxl, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing.xxl }}>
        <SettingsIcon size={32} color={colors.primary} style={{ marginRight: 16 }} />
        <div>
          <h1 style={{ margin: 0 }}>Settings</h1>
          <p style={{ margin: '4px 0 0', color: colors.textSecondary }}>Manage your Fuji Studio desktop preferences</p>
        </div>
      </div>

      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
      }}>
        <SettingRow
          label="Launch at startup"
          description="Automatically start Fuji Studio when you log in to your computer."
          checked={settings.launchAtStartup}
          onChange={() => toggle('launchAtStartup')}
        />
        <div style={{ height: 1, background: colors.border }} />
        <SettingRow
          label="Minimize to tray on close"
          description="Keep Fuji Studio running in the background when you close the window so syncing continues."
          checked={settings.minimizeToTray}
          onChange={() => toggle('minimizeToTray')}
        />
        <div style={{ height: 1, background: colors.border }} />
        <SettingRow
          label="Desktop notifications"
          description="Show system notifications for messages, sync completions, and other activity."
          checked={settings.desktopNotifications}
          onChange={() => toggle('desktopNotifications')}
        />
      </div>
    </div>
  );
};

const SettingRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}> = ({ label, description, checked, onChange }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: `${spacing.lg} ${spacing.xl}`, gap: 24,
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: colors.textPrimary }}>{label}</div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>{description}</div>
    </div>
    <button
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0,
        background: checked ? colors.primary : 'rgba(255,255,255,0.1)',
        border: 'none', cursor: 'pointer', padding: 0,
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
      }} />
    </button>
  </div>
);
