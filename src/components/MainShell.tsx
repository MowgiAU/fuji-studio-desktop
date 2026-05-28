import React from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import { FolderOpen, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { SettingsView } from './SettingsView';

export type Route =
  | { name: 'list' }
  | { name: 'detail'; projectId: string }
  | { name: 'settings' };

interface Props {
  route: Route;
  setRoute: (r: Route) => void;
  onSignOut: () => Promise<void>;
}

export const MainShell: React.FC<Props> = ({ route, setRoute, onSignOut }) => {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        background: colors.background,
        color: colors.textPrimary,
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 200,
          background: colors.sidebarBg,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          padding: spacing.lg,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            padding: `${spacing.md} ${spacing.sm}`,
            marginBottom: spacing.xl,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: borderRadius.md,
              background: 'rgba(16,185,129,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.primary,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            FS
          </div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Fuji Studio</div>
        </div>

        <NavButton
          icon={<FolderOpen size={16} />}
          label="Projects"
          active={route.name === 'list' || route.name === 'detail'}
          onClick={() => setRoute({ name: 'list' })}
        />
        <NavButton
          icon={<SettingsIcon size={16} />}
          label="Settings"
          active={route.name === 'settings'}
          onClick={() => setRoute({ name: 'settings' })}
        />

        <div style={{ flex: 1 }} />

        <button
          onClick={onSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            color: colors.textTertiary,
            padding: `${spacing.sm} ${spacing.md}`,
            fontSize: 12,
            cursor: 'pointer',
            borderRadius: borderRadius.sm,
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {route.name === 'list' && (
          <ProjectList
            onOpenProject={projectId => setRoute({ name: 'detail', projectId })}
          />
        )}
        {route.name === 'detail' && (
          <ProjectDetail
            projectId={route.projectId}
            onBack={() => setRoute({ name: 'list' })}
          />
        )}
        {route.name === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};

const NavButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      background: active ? 'rgba(16,185,129,0.1)' : 'transparent',
      color: active ? colors.primary : colors.textSecondary,
      border: 'none',
      padding: `${spacing.md} ${spacing.md}`,
      borderRadius: borderRadius.md,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      width: '100%',
      textAlign: 'left',
      marginBottom: 4,
    }}
  >
    {icon} {label}
  </button>
);
