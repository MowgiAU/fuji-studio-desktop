import React, { useEffect, useState } from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import {
  LayoutDashboard, FolderOpen, ArrowLeftRight, Settings as SettingsIcon,
  LogOut, HelpCircle, Plus, User,
} from 'lucide-react';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { SettingsView } from './SettingsView';
import { Dashboard } from './Dashboard';
import * as api from '../services/api';

export type Route =
  | { name: 'dashboard' }
  | { name: 'list' }
  | { name: 'detail'; projectId: string }
  | { name: 'sync-progress' }
  | { name: 'settings' };

interface Props {
  route: Route;
  setRoute: (r: Route) => void;
  onSignOut: () => Promise<void>;
  onNewProject: () => void;
}

export const MainShell: React.FC<Props> = ({ route, setRoute, onSignOut, onNewProject }) => {
  const [me, setMe] = useState<api.DesktopMe | null>(null);
  const [projects, setProjects] = useState<api.RemoteProject[]>([]);

  useEffect(() => {
    api.getDesktopMe().then(setMe).catch(() => {});
    api.listRemoteProjects().then(setProjects).catch(() => {});
  }, []);

  const projectNameMap: Record<string, string> = {};
  for (const p of projects) projectNameMap[p.id] = p.name;

  const displayName = me?.displayName || me?.username || 'Producer';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div style={{ height: '100vh', display: 'flex', background: colors.background, color: colors.textPrimary }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: colors.sidebarBg,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: `${spacing.lg} 0`,
      }}>
        {/* Logo */}
        <div style={{ padding: `0 ${spacing.lg}`, marginBottom: spacing.xl }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: colors.primary, letterSpacing: '-0.02em' }}>
            FUJI STUDIO
          </div>
        </div>

        {/* User info */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: spacing.md,
          padding: `${spacing.md} ${spacing.lg}`,
          marginBottom: spacing.lg,
        }}>
          {me?.avatar ? (
            <img src={me.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(16,185,129,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: colors.primary, fontWeight: 700, fontSize: 13,
            }}>
              {initials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </div>
            <div style={{ fontSize: 11, color: colors.success, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.success, display: 'inline-block' }} />
              Sync Active
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: colors.border, margin: `0 ${spacing.lg} ${spacing.md}` }} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: `0 ${spacing.sm}` }}>
          <NavItem icon={<LayoutDashboard size={16} />} label="Dashboard"
            active={route.name === 'dashboard'}
            onClick={() => setRoute({ name: 'dashboard' })} />
          <NavItem icon={<FolderOpen size={16} />} label="Projects"
            active={route.name === 'list' || route.name === 'detail'}
            onClick={() => setRoute({ name: 'list' })} />
          <NavItem icon={<ArrowLeftRight size={16} />} label="Sync Progress"
            active={route.name === 'sync-progress'}
            onClick={() => setRoute({ name: 'sync-progress' })} />
          <NavItem icon={<SettingsIcon size={16} />} label="Settings"
            active={route.name === 'settings'}
            onClick={() => setRoute({ name: 'settings' })} />
        </nav>

        {/* New Project button */}
        <div style={{ padding: `${spacing.md} ${spacing.lg}` }}>
          <button
            onClick={onNewProject}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: colors.primary, color: '#fff', border: 'none',
              borderRadius: borderRadius.md, padding: '9px 0', fontSize: 12,
              fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> NEW PROJECT
          </button>
        </div>

        <div style={{ height: 1, background: colors.border, margin: `0 ${spacing.lg} ${spacing.md}` }} />

        {/* Bottom links */}
        <div style={{ padding: `0 ${spacing.sm}` }}>
          <NavItem icon={<HelpCircle size={16} />} label="Support" active={false}
            onClick={() => {}} />
          <NavItem icon={<LogOut size={16} />} label="Sign Out" active={false}
            onClick={onSignOut} />
        </div>
      </aside>

      {/* Header + content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top header */}
        <header style={{
          height: 52, flexShrink: 0,
          borderBottom: `1px solid ${colors.border}`,
          background: colors.sidebarBg,
          display: 'flex', alignItems: 'center',
          padding: `0 ${spacing.xxl}`,
          gap: spacing.lg,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: colors.primary, letterSpacing: '-0.01em', marginRight: 'auto' }}>
            FUJI STUDIO {routeTitle(route).toUpperCase()}
          </span>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <input
              placeholder="Search projects…"
              style={{
                background: colors.surface, border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.pill, padding: '6px 14px 6px 32px',
                color: colors.textPrimary, fontSize: 12, outline: 'none', width: 200,
              }}
            />
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
          </div>

          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(16,185,129,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: colors.primary,
            cursor: 'pointer', flexShrink: 0,
          }}>
            <User size={15} />
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {route.name === 'dashboard' && <Dashboard projectNameMap={projectNameMap} />}
          {(route.name === 'list' || route.name === 'sync-progress') && (
            <ProjectList
              onOpenProject={projectId => setRoute({ name: 'detail', projectId })}
              showSyncOnly={route.name === 'sync-progress'}
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
    </div>
  );
};

function routeTitle(route: Route): string {
  switch (route.name) {
    case 'dashboard': return 'Sync';
    case 'list': return 'Sync — Projects';
    case 'detail': return 'Sync — Project';
    case 'sync-progress': return 'Sync — Progress';
    case 'settings': return 'Sync — Settings';
  }
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: spacing.md,
      background: active ? 'rgba(16,185,129,0.1)' : 'transparent',
      color: active ? colors.primary : colors.textSecondary,
      border: 'none', padding: `9px ${spacing.md}`,
      borderRadius: borderRadius.md, fontSize: 13,
      fontWeight: active ? 600 : 400, cursor: 'pointer',
      width: '100%', textAlign: 'left', marginBottom: 2,
    }}
  >
    {icon} {label}
  </button>
);
