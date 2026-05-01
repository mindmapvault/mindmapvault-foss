interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="confirm-dialog fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="confirm-dialog__panel w-full max-w-lg rounded-3xl border border-slate-700/70 bg-slate-950 shadow-[0_24px_100px_rgba(15,23,42,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog__hero border-b border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.16),_transparent_36%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(2,6,23,0.98))] px-6 py-5">
          <div className="confirm-dialog__pill inline-flex rounded-full border border-red-400/25 bg-red-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
            Permanent action
          </div>
          <h2 className="confirm-dialog__title mt-4 text-2xl font-semibold text-white">{title}</h2>
          <p className="confirm-dialog__message mt-3 text-sm leading-6 text-slate-300">{message}</p>
        </div>

        <div className="confirm-dialog__actions flex items-center justify-end gap-3 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="confirm-dialog__cancel rounded-full border border-slate-700 bg-slate-900/70 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="confirm-dialog__confirm rounded-full px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: danger ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
            }}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;