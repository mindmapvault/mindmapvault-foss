import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordRotationForm } from '../components/PasswordRotationForm';
import { useAuthStore } from '../store/auth';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { sessionKeys } = useAuthStore();

  // Redirect sessions without keys (not unlocked / locked out).
  useEffect(() => {
    if (!sessionKeys) {
      navigate('/vaults', { replace: true });
    }
  }, [sessionKeys, navigate]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate('/vaults')}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] transition hover:border-[var(--accent)] hover:text-[var(--fg)]"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-[var(--fg)]">Change Password</h1>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
          <PasswordRotationForm
            secondaryAction={{ label: 'Cancel', onClick: () => navigate('/vaults') }}
            doneAction={{ label: 'Return to vaults', onClick: () => navigate('/vaults') }}
          />
        </div>
      </div>
    </div>
  );
}
