import React, { useEffect, useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { MainShell } from './components/MainShell';
import { useAuth } from './hooks/useAuth';
import { colors, borderRadius, spacing } from './theme/theme';
import * as api from './services/api';
import { Download, X } from 'lucide-react';

export const App: React.FC = () => {
  const auth = useAuth();
  const [route, setRoute] = useState<
    | { name: 'dashboard' }
    | { name: 'list' }
    | { name: 'detail'; projectId: string }
    | { name: 'sync-progress' }
    | { name: 'messages' }
    | { name: 'my-tracks' }
    | { name: 'settings' }
  >({ name: 'dashboard' });
  const [update, setUpdate] = useState<api.UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // Check for updates once after app loads (non-blocking, silent on failure)
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const timer = setTimeout(() => {
      api.checkForUpdate()
        .then(info => { if (info.available) setUpdate(info); })
        .catch(() => {});
    }, 3000); // delay so it doesn't compete with initial load
    return () => clearTimeout(timer);
  }, [auth.isAuthenticated]);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await api.installUpdate();
      // After install the app will restart automatically
    } catch (e) {
      console.error('Update install failed', e);
      setInstalling(false);
    }
  };

  if (auth.loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textSecondary }}>
        Loading…
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginScreen onAuthenticated={auth.signIn} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {update && !updateDismissed && (
        <div style={{
          background: 'rgba(16,185,129,0.12)',
          borderBottom: `1px solid rgba(16,185,129,0.25)`,
          padding: `${spacing.sm} ${spacing.xl}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          flexShrink: 0,
        }}>
          <Download size={15} color={colors.primary} />
          <span style={{ flex: 1, color: colors.textPrimary }}>
            <strong style={{ color: colors.primary }}>Update available — v{update.version}</strong>
            {update.body && <span style={{ color: colors.textSecondary }}> · {update.body}</span>}
          </span>
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{ background: colors.primary, color: '#fff', border: 'none', borderRadius: borderRadius.sm, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {installing ? 'Installing…' : 'Install & restart'}
          </button>
          <button
            onClick={() => setUpdateDismissed(true)}
            style={{ background: 'transparent', border: 'none', color: colors.textTertiary, cursor: 'pointer', padding: 4 }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <MainShell
          route={route}
          setRoute={setRoute}
          onSignOut={auth.signOut}
          onNewProject={() => setRoute({ name: 'list' })}
        />
      </div>
    </div>
  );
};
