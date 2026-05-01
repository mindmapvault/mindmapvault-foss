import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

interface Props {
  onUnlocked: () => void;
}

/**
 * Shown when a user has a valid JWT (page reload) but their session keys
 * are not in memory. They must re-enter their password to re-derive the
 * master key and decrypt their private key bundle.
 */
export function UnlockModal({ onUnlocked }: Props) {
  const navigate = useNavigate();
  const { username } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      navigate('/local-unlock', { replace: true });
      onUnlocked();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-surface-1 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
          </svg>
          <div>
            <h2 className="text-lg font-bold text-white">Unlock Vault</h2>
            <p className="text-sm text-slate-400">Session keys are locked. Continue to local unlock.</p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <p className="rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-slate-300">
            Profile: <span className="text-accent">{username ?? 'local user'}</span>
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-2.5 font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Redirecting…
              </span>
            ) : (
              'Go to local unlock'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
