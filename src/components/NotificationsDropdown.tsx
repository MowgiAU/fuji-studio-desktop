import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { borderRadius, colors, spacing } from '../theme/theme';
import type { AppNotification } from '../electron-env';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const POLL_INTERVAL = 30_000;

export const NotificationsDropdown: React.FC<{ apiBase: string }> = ({ apiBase }) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  const load = async () => {
    try {
      const data = await window.electronAPI.getNotifications();
      setNotifications(data);
    } catch { /* ignore if not authed */ }
  };

  // Poll for notifications
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      // Mark as read after a short delay so they see the count first
      setTimeout(async () => {
        try {
          await window.electronAPI.markNotificationsRead();
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } catch { /* ignore */ }
      }, 1500);
    }
  };

  const handleClick = (n: AppNotification) => {
    const url = n.link
      ? (n.link.startsWith('http') ? n.link : `${apiBase}${n.link}`)
      : `${apiBase}/notifications`;
    window.electronAPI.openExternal(url).catch(() => {});
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        style={{
          position: 'relative',
          width: 30, height: 30, borderRadius: '50%',
          background: open ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.1)',
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: colors.primary, cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Bell size={14} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: colors.error, color: '#fff',
            borderRadius: '50%', fontSize: 9, fontWeight: 700,
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 38, right: 0, zIndex: 200,
          width: 340, maxHeight: 420,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.lg,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: `${spacing.md} ${spacing.lg}`,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: colors.textPrimary }}>Notifications</span>
            <button
              onClick={() => window.electronAPI.openExternal(`${apiBase}/notifications`).catch(() => {})}
              style={{ background: 'transparent', border: 'none', color: colors.primary, fontSize: 11, cursor: 'pointer' }}
            >
              View all →
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: colors.textTertiary, fontSize: 13 }}>
                No notifications
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    width: '100%', textAlign: 'left',
                    padding: `${spacing.md} ${spacing.lg}`,
                    background: n.isRead ? 'transparent' : 'rgba(16,185,129,0.05)',
                    border: 'none', borderBottom: `1px solid ${colors.border}`,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = n.isRead ? 'transparent' : 'rgba(16,185,129,0.05)')}
                >
                  {/* Actor avatar */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                    background: 'rgba(16,185,129,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: colors.primary,
                  }}>
                    {n.actorAvatar ? (
                      <img src={n.actorAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (n.actorName || '?').slice(0, 1).toUpperCase()
                    )}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: colors.textPrimary, lineHeight: 1.4 }}>
                      {n.title}
                    </div>
                    <div style={{
                      fontSize: 11, color: colors.textSecondary, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 3 }}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>

                  {!n.isRead && (
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: colors.primary, flexShrink: 0, marginTop: 4,
                    }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
