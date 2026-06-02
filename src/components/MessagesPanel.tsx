import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Search, Send, UserPlus, ArrowLeft, Users } from 'lucide-react';
import { borderRadius, colors, spacing } from '../theme/theme';
import type { Conversation, Message, UserResult } from '../electron-env';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function convoName(conv: Conversation, myId: string): string {
  if (conv.isGroup) return conv.name || 'Group Chat';
  const other = conv.participants.find((p) => p.userId !== myId);
  return other?.displayName || other?.username || 'Unknown';
}

function convoAvatar(conv: Conversation, myId: string): string | null {
  if (conv.isGroup) return null;
  const other = conv.participants.find((p) => p.userId !== myId);
  return other?.avatar || null;
}

// ─── Initials avatar ─────────────────────────────────────────────────────────

const Avatar: React.FC<{ src?: string | null; name: string; size?: number }> = ({ src, name, size = 36 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
    background: 'rgba(16,185,129,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.35, fontWeight: 700, color: colors.primary,
  }}>
    {src
      ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      : name.slice(0, 2).toUpperCase()}
  </div>
);

// ─── New conversation dialog ──────────────────────────────────────────────────

const NewConversationDialog: React.FC<{ onClose: () => void; onCreate: (userId: string) => Promise<void> }> = ({ onClose, onCreate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await window.electronAPI.searchUsers(query.trim());
        setResults(r);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
    }}>
      <div style={{
        width: 360, background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing.lg }}>
          <UserPlus size={18} color={colors.primary} style={{ marginRight: 10 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: colors.textPrimary }}>New Message</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: colors.textTertiary, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ position: 'relative', marginBottom: spacing.md }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textTertiary }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md, padding: '8px 12px 8px 32px',
              color: colors.textPrimary, fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {results.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {results.map((u) => (
              <button
                key={u.userId}
                onClick={() => onCreate(u.userId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: `${spacing.sm} ${spacing.md}`,
                  background: 'transparent', border: 'none',
                  borderRadius: borderRadius.sm, cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar src={u.avatar} name={u.displayName || u.username} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
                    {u.displayName || u.username}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textSecondary }}>@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <div style={{ textAlign: 'center', color: colors.textTertiary, fontSize: 12, padding: spacing.md }}>
            No users found
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Message thread ───────────────────────────────────────────────────────────

const MessageThread: React.FC<{
  conv: Conversation;
  myId: string;
  onBack: () => void;
}> = ({ conv, myId, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await window.electronAPI.getMessages(conv.id);
      setMessages(msgs);
    } catch { /* ignore */ }
  }, [conv.id]);

  useEffect(() => {
    loadMessages();
    window.electronAPI.markConversationRead(conv.id).catch(() => {});
    // Poll for new messages every 5 seconds while this thread is open
    const id = setInterval(loadMessages, 5_000);
    return () => clearInterval(id);
  }, [conv.id, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await window.electronAPI.sendMessage(conv.id, content);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch { setDraft(content); }
    finally { setSending(false); inputRef.current?.focus(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const name = convoName(conv, myId);
  const avatarSrc = convoAvatar(conv, myId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Thread header */}
      <div style={{
        height: 52, flexShrink: 0,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center',
        padding: `0 ${spacing.lg}`, gap: spacing.md,
      }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={16} />
        </button>
        <Avatar src={conv.isGroup ? null : avatarSrc} name={name} size={28} />
        <span style={{ fontWeight: 600, fontSize: 13, color: colors.textPrimary }}>{name}</span>
        {conv.isGroup && (
          <span style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 4 }}>
            <Users size={11} style={{ verticalAlign: 'middle', marginRight: 2 }} />
            {conv.participants.length}
          </span>
        )}
      </div>

      {/* Messages list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `${spacing.lg} ${spacing.xl}` }}>
        {messages.map((m, i) => {
          const isMe = m.senderId === myId;
          const showDate = i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const sender = conv.participants.find((p) => p.userId === m.senderId);
          return (
            <React.Fragment key={m.id}>
              {showDate && (
                <div style={{ textAlign: 'center', fontSize: 10, color: colors.textTertiary, margin: `${spacing.md} 0`, letterSpacing: '0.06em' }}>
                  {new Date(m.createdAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              )}
              <div style={{
                display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 8, marginBottom: 6,
              }}>
                {!isMe && (
                  <Avatar src={sender?.avatar} name={sender?.displayName || sender?.username || '?'} size={24} />
                )}
                <div style={{ maxWidth: '72%' }}>
                  <div style={{
                    background: isMe ? colors.primary : colors.surfaceLight,
                    color: isMe ? '#fff' : colors.textPrimary,
                    borderRadius: isMe ? `${borderRadius.lg} ${borderRadius.lg} 4px ${borderRadius.lg}` : `${borderRadius.lg} ${borderRadius.lg} ${borderRadius.lg} 4px`,
                    padding: `8px 12px`,
                    fontSize: 13, lineHeight: 1.5,
                    opacity: m.deleted ? 0.5 : 1,
                    fontStyle: m.deleted ? 'italic' : 'normal',
                    wordBreak: 'break-word',
                  }}>
                    {m.deleted ? '[deleted]' : (m.content || '')}
                  </div>
                  <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                    {fmtTime(m.createdAt)}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, borderTop: `1px solid ${colors.border}`,
        padding: `${spacing.md} ${spacing.lg}`,
        display: 'flex', alignItems: 'flex-end', gap: spacing.md,
      }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`,
            borderRadius: borderRadius.md, padding: '8px 12px',
            color: colors.textPrimary, fontSize: 13, outline: 'none', resize: 'none',
            lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || sending}
          style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: draft.trim() ? colors.primary : 'rgba(16,185,129,0.2)',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: draft.trim() ? 'pointer' : 'default',
            transition: 'background 0.15s',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  myId: string;
}

export const MessagesPanel: React.FC<Props> = ({ myId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');

  const loadConversations = useCallback(async () => {
    try {
      const data = await window.electronAPI.listConversations();
      setConversations(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadConversations();
    const id = setInterval(loadConversations, 15_000);
    return () => clearInterval(id);
  }, [loadConversations]);

  const handleCreate = async (userId: string) => {
    setShowNew(false);
    try {
      const result = await window.electronAPI.createConversation([userId]);
      await loadConversations();
      // Open the new (or existing) conversation
      const updated = await window.electronAPI.listConversations();
      setConversations(updated);
      const conv = updated.find((c) => c.id === result.id);
      if (conv) setSelected(conv);
    } catch { /* ignore */ }
  };

  const filtered = filterQuery.trim()
    ? conversations.filter((c) => {
        const name = convoName(c, myId).toLowerCase();
        return name.includes(filterQuery.toLowerCase());
      })
    : conversations;

  if (selected) {
    return (
      <div style={{ height: '100%' }}>
        <MessageThread
          conv={selected}
          myId={myId}
          onBack={() => { setSelected(null); loadConversations(); }}
        />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: `${spacing.xl} ${spacing.xl} ${spacing.md}`,
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing.md }}>
          <MessageCircle size={20} color={colors.primary} style={{ marginRight: 10 }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Messages</h2>
          <button
            onClick={() => setShowNew(true)}
            style={{
              marginLeft: 'auto', background: colors.primary, border: 'none',
              color: '#fff', borderRadius: borderRadius.md, padding: '5px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <UserPlus size={13} /> New
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textTertiary }} />
          <input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter conversations…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`,
              borderRadius: borderRadius.md, padding: '7px 12px 7px 30px',
              color: colors.textPrimary, fontSize: 12, outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: colors.textTertiary, fontSize: 13 }}>
            {conversations.length === 0
              ? 'No conversations yet. Start a new one!'
              : 'No conversations match your search'}
          </div>
        ) : (
          filtered.map((conv) => {
            const name = convoName(conv, myId);
            const avatarSrc = convoAvatar(conv, myId);
            return (
              <button
                key={conv.id}
                onClick={() => setSelected(conv)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: `${spacing.md} ${spacing.xl}`,
                  background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${colors.border}`,
                  cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar src={conv.isGroup ? null : avatarSrc} name={name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontWeight: conv.unread > 0 ? 700 : 500, fontSize: 13, color: colors.textPrimary }}>
                      {name}
                    </span>
                    {conv.lastMessageAt && (
                      <span style={{ fontSize: 10, color: colors.textTertiary, flexShrink: 0, marginLeft: 8 }}>
                        {timeAgo(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 12, color: conv.unread > 0 ? colors.textSecondary : colors.textTertiary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontWeight: conv.unread > 0 ? 500 : 400,
                  }}>
                    {conv.lastMessagePreview || 'No messages yet'}
                  </div>
                </div>
                {conv.unread > 0 && (
                  <div style={{
                    background: colors.primary, color: '#fff',
                    borderRadius: '50%', width: 20, height: 20,
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {conv.unread > 9 ? '9+' : conv.unread}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {showNew && (
        <NewConversationDialog
          onClose={() => setShowNew(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
};
