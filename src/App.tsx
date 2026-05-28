import React, { useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { MainShell } from './components/MainShell';
import { useAuth } from './hooks/useAuth';
import { colors } from './theme/theme';

export const App: React.FC = () => {
  const auth = useAuth();
  const [route, setRoute] = useState<{ name: 'list' } | { name: 'detail'; projectId: string } | { name: 'settings' }>(
    { name: 'list' },
  );

  if (auth.loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.textSecondary,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <LoginScreen onAuthenticated={auth.signIn} />;
  }

  return <MainShell route={route} setRoute={setRoute} onSignOut={auth.signOut} />;
};
