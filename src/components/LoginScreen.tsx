import React, { useEffect, useState, useRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { borderRadius, colors, shadows, spacing } from '../theme/theme';
import * as api from '../services/api';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';

interface Props {
  onAuthenticated: (token: string) => Promise<void>;
}

export const LoginScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [code, setCode] = useState<api.DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const cancelRef = useRef<boolean>(false);

  const begin = async () => {
    setError(null);
    setCode(null);
    cancelRef.current = false;
    try {
      const resp = await api.startDeviceAuth();
      setCode(resp);
      setPolling(true);
      pollUntilDone(resp);
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Failed to start authentication');
    }
  };

  const pollUntilDone = async (resp: api.DeviceCodeResponse) => {
    const interval = Math.max(2, resp.interval) * 1000;
    while (!cancelRef.current) {
      await new Promise(r => setTimeout(r, interval));
      if (cancelRef.current) return;
      try {
        const r = await api.pollDeviceAuth(resp.device_code);
        if (r.status === 'Ok') {
          await onAuthenticated(r.access_token);
          return;
        }
        if (r.status === 'Error') {
          setError(r.description || r.error);
          setPolling(false);
          return;
        }
        // Pending — keep polling
      } catch (e: any) {
        setError(typeof e === 'string' ? e : e?.message || 'Polling failed');
        setPolling(false);
        return;
      }
    }
  };

  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const openUrl = async (url: string) => {
    try {
      await open(url);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '100%',
          background: colors.surface,
          border: `1px solid ${colors.glassBorder}`,
          borderRadius: borderRadius.lg,
          padding: spacing['3xl'],
          boxShadow: shadows.lg,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: spacing.xxl }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: borderRadius.lg,
              background: 'rgba(16,185,129,0.1)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.lg,
              fontSize: 28,
              color: colors.primary,
              fontWeight: 700,
            }}
          >
            FS
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: colors.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            Fuji Studio Desktop
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              color: colors.textSecondary,
              fontSize: 13,
            }}
          >
            Connect your account to start syncing FL Studio projects
          </p>
        </div>

        {!code && (
          <button
            onClick={begin}
            style={{
              width: '100%',
              background: colors.primary,
              color: '#fff',
              border: 'none',
              padding: '12px 16px',
              borderRadius: borderRadius.md,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Connect to Fuji Studio
          </button>
        )}

        {code && (
          <div>
            <div
              style={{
                background: 'rgba(16,185,129,0.06)',
                border: `1px solid rgba(16,185,129,0.18)`,
                borderRadius: borderRadius.md,
                padding: spacing.lg,
                textAlign: 'center',
                marginBottom: spacing.lg,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: colors.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 8,
                }}
              >
                Your verification code
              </div>
              <div
                style={{
                  fontFamily: "'Menlo', 'Consolas', monospace",
                  fontSize: 28,
                  letterSpacing: '0.2em',
                  fontWeight: 700,
                  color: colors.primary,
                }}
              >
                {code.user_code}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(code.user_code)}
                style={{
                  marginTop: 8,
                  background: 'transparent',
                  border: `1px solid ${colors.glassBorder}`,
                  color: colors.textSecondary,
                  borderRadius: borderRadius.sm,
                  padding: '4px 10px',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <Copy size={12} /> Copy
              </button>
            </div>

            <p
              style={{
                margin: 0,
                color: colors.textSecondary,
                fontSize: 13,
                marginBottom: spacing.lg,
                lineHeight: 1.6,
              }}
            >
              1. Open the verification page in your browser
              <br />
              2. Sign in to Fuji Studio (if needed)
              <br />
              3. Enter the code above
            </p>

            <button
              onClick={() => openUrl(code.verification_uri_complete || code.verification_uri)}
              style={{
                width: '100%',
                background: colors.primary,
                color: '#fff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: borderRadius.md,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: spacing.md,
              }}
            >
              <ExternalLink size={16} /> Open Verification Page
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: colors.textTertiary,
                fontSize: 12,
                justifyContent: 'center',
              }}
            >
              {polling ? (
                <>
                  <RefreshCw size={12} style={{ animation: 'spin 1.2s linear infinite' }} />{' '}
                  Waiting for confirmation…
                </>
              ) : (
                <button
                  onClick={begin}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.primary,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Get a new code
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: spacing.lg,
              padding: spacing.md,
              background: 'rgba(239,68,68,0.1)',
              border: `1px solid rgba(239,68,68,0.25)`,
              borderRadius: borderRadius.md,
              color: colors.error,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
