import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/api';
import { Persist } from '../services/store';

export interface AuthState {
  token: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ token: null, loading: true });

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await Persist.getToken();
        const storedBase = await Persist.getApiBase();
        if (storedBase) {
          await api.setApiBase(storedBase);
        }
        if (storedToken) {
          await api.setToken(storedToken);
        }
        setState({ token: storedToken, loading: false });
      } catch (e) {
        console.error('Failed to load auth state', e);
        setState({ token: null, loading: false });
      }
    })();
  }, []);

  const signOut = useCallback(async () => {
    await api.clearToken();
    await Persist.setToken(null);
    setState({ token: null, loading: false });
  }, []);

  const signIn = useCallback(async (token: string) => {
    await api.setToken(token);
    await Persist.setToken(token);
    setState({ token, loading: false });
  }, []);

  return {
    ...state,
    isAuthenticated: !!state.token,
    signIn,
    signOut,
  };
}
