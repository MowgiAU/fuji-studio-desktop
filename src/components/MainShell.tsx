import React, { useEffect, useRef, useState } from 'react';
import { borderRadius, colors, spacing } from '../theme/theme';
import {
  LayoutDashboard, FolderOpen, ArrowLeftRight, Settings as SettingsIcon,
  LogOut, HelpCircle, Plus, MessageCircle, ChevronDown, Music,
} from 'lucide-react';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { SettingsView } from './SettingsView';
import { Dashboard } from './Dashboard';
import { MessagesPanel } from './MessagesPanel';
import { MyTracksPanel } from './MyTracksPanel';
import { NotificationsDropdown } from './NotificationsDropdown';
import * as api from '../services/api';

export type Route =
  | { name: 'dashboard' }
  | { name: 'list' }
  | { name: 'detail'; projectId: string }
  | { name: 'sync-progress' }
  | { name: 'messages' }
  | { name: 'my-tracks' }
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
  const [searchQuery, setSearchQuery] = useState('');
  const [apiBase, setApiBase] = useState('https://fujistud.io');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const refreshMe = () => api.getDesktopMe().then(setMe).catch(() => {});

  useEffect(() => {
    refreshMe();
    api.listRemoteProjects().then((p) => setProjects(p as api.RemoteProject[])).catch(() => {});
    api.getApiBase().then(setApiBase).catch(() => {});
  }, []);

  // Poll unread message count
  useEffect(() => {
    const check = async () => {
      try {
        const { unread } = await window.electronAPI.getUnreadCount();
        setUnreadMessages(unread);
      } catch { /* not logged in yet */ }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const projectNameMap: Record<string, string> = {};
  for (const p of projects) projectNameMap[p.id] = p.name;

  const displayName = me?.displayName || me?.username || 'Producer';
  const initials = displayName.slice(0, 2).toUpperCase();

  // Clear search when navigating away from projects
  useEffect(() => {
    if (route.name !== 'list') setSearchQuery('');
  }, [route.name]);

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
          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.primary, fontWeight: 700, fontSize: 13 }}>
            {me?.avatar ? (
              <img
                src={me.avatar}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            ) : initials}
          </div>
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
          <NavItem
            icon={<MessageCircle size={16} />}
            label="Messages"
            active={route.name === 'messages'}
            badge={unreadMessages}
            onClick={() => setRoute({ name: 'messages' })}
          />
          <NavItem
            icon={<Music size={16} />}
            label="My Tracks"
            active={route.name === 'my-tracks'}
            onClick={() => setRoute({ name: 'my-tracks' })}
          />
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
          <NavItem
            icon={<HelpCircle size={16} />}
            label="Support"
            active={false}
            onClick={() => window.electronAPI.openExternal(`${apiBase}/support`).catch(() => {})}
          />
          <NavItem icon={<LogOut size={16} />} label="Sign Out" active={false} onClick={onSignOut} />
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

          {/* Search — only shown on projects pages */}
          {(route.name === 'list' || route.name === 'sync-progress' || route.name === 'dashboard') && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (route.name !== 'list') setRoute({ name: 'list' });
                }}
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
          )}

          {/* Notifications bell */}
          <NotificationsDropdown apiBase={apiBase} />

          {/* User menu */}
          <div ref={userMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: userMenuOpen ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.1)',
                border: 'none', borderRadius: borderRadius.pill,
                padding: '3px 10px 3px 4px', cursor: 'pointer', color: colors.textPrimary,
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%', overflow: 'hidden',
                background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: colors.primary, fontWeight: 700, fontSize: 10, flexShrink: 0,
              }}>
                {me?.avatar ? (
                  <img src={me.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                ) : initials}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
              <ChevronDown size={11} color={colors.textTertiary} />
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute', top: 38, right: 0, zIndex: 200,
                width: 200, background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.lg,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: `${spacing.md} ${spacing.lg}`, borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>{displayName}</div>
                  {me?.username && me.username !== displayName && (
                    <div style={{ fontSize: 11, color: colors.textSecondary }}>@{me.username}</div>
                  )}
                </div>
                <MenuAction label="View Profile" onClick={() => {
                  window.electronAPI.openExternal(`${apiBase}/u/${me?.username || ''}`).catch(() => {});
                  setUserMenuOpen(false);
                }} />
                <MenuAction label="Open fujistud.io" onClick={() => {
                  window.electronAPI.openExternal(apiBase).catch(() => {});
                  setUserMenuOpen(false);
                }} />
                <div style={{ height: 1, background: colors.border }} />
                <MenuAction label="Sign Out" danger onClick={async () => { setUserMenuOpen(false); await onSignOut(); }} />
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {route.name === 'dashboard' && <Dashboard projectNameMap={projectNameMap} />}
          {(route.name === 'list' || route.name === 'sync-progress') && (
            <ProjectList
              onOpenProject={(projectId) => setRoute({ name: 'detail', projectId })}
              showSyncOnly={route.name === 'sync-progress'}
              searchQuery={searchQuery}
            />
          )}
          {route.name === 'detail' && (
            <ProjectDetail
              projectId={route.projectId}
              onBack={() => setRoute({ name: 'list' })}
              username={me?.username}
            />
          )}
          {route.name === 'messages' && me && <MessagesPanel myId={me.discordId || me.userId} />}
          {route.name === 'my-tracks' && me && <MyTracksPanel me={me} onStorageChange={refreshMe} />}
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
    case 'messages': return 'Messages';
    case 'my-tracks': return 'My Tracks';
    case 'settings': return 'Settings';
  }
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}> = ({ icon, label, active, badge, onClick }) => (
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
    {icon}
    <span style={{ flex: 1 }}>{label}</span>
    {badge != null && badge > 0 && (
      <span style={{
        background: colors.primary, color: '#fff',
        borderRadius: '50%', width: 18, height: 18,
        fontSize: 10, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

const MenuAction: React.FC<{ label: string; onClick: () => void; danger?: boolean }> = ({ label, onClick, danger }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block', width: '100%', textAlign: 'left',
      padding: `${spacing.sm} ${spacing.lg}`,
      background: 'transparent', border: 'none',
      color: danger ? colors.error : colors.textPrimary,
      fontSize: 13, cursor: 'pointer',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
  >
    {label}
  </button>
);
