import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import type { AttachmentMetadata, MapShareOwnerSummary } from '../types';

export type SecureVaultTab = 'attachments' | 'shares';

type UploadState = {
  busy: boolean;
  label?: string;
};

type ShareDraft = {
  name: string;
  passphrase: string;
  passphraseConfirm: string;
  passphraseHint: string;
  expiresInDays: string;
  includeAttachments: boolean;
};

interface EncryptedVaultDialogProps {
  open: boolean;
  initialTab: SecureVaultTab;
  attachments: AttachmentMetadata[];
  shares: MapShareOwnerSummary[];
  selectedNodeId: string | null;
  nodeOptions: Array<{ id: string; label: string }>;
  loading: boolean;
  error: string | null;
  uploadState: UploadState;
  shareBusy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onUploadFiles: (files: FileList) => void;
  onDownloadAttachment: (attachment: AttachmentMetadata) => void;
  onDeleteAttachment: (attachment: AttachmentMetadata) => void;
  onAssignAttachmentNode: (attachment: AttachmentMetadata, nodeId?: string) => void;
  onCreateShare: (draft: ShareDraft) => void;
  onCopyShareUrl: (share: MapShareOwnerSummary) => void;
  onRevokeShare: (share: MapShareOwnerSummary) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatDate(value?: string | null): string {
  if (!value) return 'No expiry';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getFileExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '#10b981';
  if (['pdf'].includes(ext)) return '#ef4444';
  if (['doc', 'docx'].includes(ext)) return '#3b82f6';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '#22c55e';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return '#8b5cf6';
  if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return '#f59e0b';
  return '#64748b';
}

function FileTypeChip({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? 'file';
  const color = getFileExtColor(name);
  return (
    <div
      style={{ background: color + '22', color, borderRadius: 4, padding: '2px 5px', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', minWidth: 32, textAlign: 'center', flexShrink: 0 }}
    >
      {ext}
    </div>
  );
}

// ── Fluent-style form field ─────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-400 encrypted-vault-dialog__field-label">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'encrypted-vault-dialog__input w-full rounded-lg border border-slate-600/60 bg-slate-800/70 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/25';

export function EncryptedVaultDialog({
  open,
  initialTab,
  attachments,
  shares,
  selectedNodeId,
  nodeOptions,
  loading,
  error,
  uploadState,
  shareBusy,
  onClose,
  onRefresh,
  onUploadFiles,
  onDownloadAttachment,
  onDeleteAttachment,
  onAssignAttachmentNode,
  onCreateShare,
  onCopyShareUrl,
  onRevokeShare,
}: EncryptedVaultDialogProps) {
  const [activeTab, setActiveTab] = useState<SecureVaultTab>(initialTab);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttachmentMetadata | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<MapShareOwnerSummary | null>(null);
  const [shareDraft, setShareDraft] = useState<ShareDraft>({
    name: 'Encrypted share export.cmvshare',
    passphrase: '',
    passphraseConfirm: '',
    passphraseHint: '',
    expiresInDays: '7',
    includeAttachments: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const attachmentCount = attachments.filter((item) => item.status === 'available').length;
  const activeShareCount = shares.filter((item) => !item.revoked).length;
  const selectedNodeLabel = useMemo(
    () => nodeOptions.find((item) => item.id === selectedNodeId)?.label ?? 'Vault root',
    [nodeOptions, selectedNodeId],
  );

  if (!open) return null;

  return (
    <>
      {/* ── Modal overlay ─────────────────────────────────────────────────── */}
      <div
        className="encrypted-vault-dialog fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="encrypted-vault-dialog__panel flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/8 bg-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
          style={{ maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="encrypted-vault-dialog__header flex items-center gap-4 border-b border-slate-700/60 px-6 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight text-white">Vault files</h2>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {attachmentCount} file{attachmentCount !== 1 ? 's' : ''} · {activeShareCount} active share{activeShareCount !== 1 ? 's' : ''} · {selectedNodeLabel}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* ── Fluent pivot tabs ───────────────────────────────────────────── */}
          <div className="encrypted-vault-dialog__tabs flex items-center gap-0 border-b border-slate-700/60 px-6">
            {(['attachments', 'shares'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-4 py-3 text-sm font-medium transition ${active ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {tab === 'attachments' ? 'Files' : 'Share exports'}
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-accent" />
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onRefresh}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-700/50 hover:text-white"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              Refresh
            </button>
          </div>

          {/* ── Content ─────────────────────────────────────────────────────── */}
          <div className="encrypted-vault-dialog__body flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}
            {loading && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-xs text-slate-400">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".25"/><path d="M21 12a9 9 0 00-9-9"/></svg>
                Loading…
              </div>
            )}

            {/* ── Attachments tab ──────────────────────────────────────────── */}
            {activeTab === 'attachments' && (
              <div>
                {/* Command bar */}
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {attachmentCount === 0 ? 'No files yet' : `${attachmentCount} encrypted file${attachmentCount !== 1 ? 's' : ''}`}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">New files attach to {selectedNodeLabel}</span>
                    <input ref={fileInputRef} type="file" multiple className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) onUploadFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadState.busy || loading}
                      className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      {uploadState.busy ? (uploadState.label ?? 'Uploading…') : 'Upload file'}
                    </button>
                  </div>
                </div>

                <div
                  className={`mb-4 rounded-xl border-2 border-dashed px-4 py-5 transition ${isDragOverUpload ? 'border-accent bg-accent/10' : 'encrypted-vault-dialog__dropzone border-slate-700/70 bg-slate-800/25'}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!uploadState.busy && !loading) {
                      setIsDragOverUpload(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDragOverUpload(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOverUpload(false);
                    if (uploadState.busy || loading) return;
                    const files = event.dataTransfer.files;
                    if (files && files.length > 0) {
                      onUploadFiles(files);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">Drop files here to upload</p>
                      <p className="mt-0.5 text-xs text-slate-400">Files are encrypted before storage and attach to {selectedNodeLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadState.busy || loading}
                      className="rounded-lg border border-slate-600/80 bg-slate-900/55 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Browse files
                    </button>
                  </div>
                </div>

                {/* Column headers */}
                {attachments.length > 0 && (
                  <div className="mb-1 grid grid-cols-[minmax(0,2fr)_120px_70px_140px_auto] items-center gap-3 px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Name</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Node</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Size</span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Uploaded</span>
                    <span />
                  </div>
                )}

                {/* File rows */}
                <div className="space-y-1">
                  {attachments.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/30 py-12 text-center encrypted-vault-dialog__empty">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mb-3 text-slate-600"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                      <p className="text-sm text-slate-400">No encrypted attachments yet</p>
                      <p className="mt-1 text-xs text-slate-600">Click "Upload file" to add encrypted files to this vault</p>
                    </div>
                  )}
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="encrypted-vault-dialog__file-row group grid grid-cols-[minmax(0,2fr)_120px_70px_140px_auto] items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-slate-800/60"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileTypeChip name={attachment.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{attachment.name}</p>
                          <p className="text-[10px] text-slate-500">{attachment.content_type}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <select
                          value={attachment.node_id ?? ''}
                          onChange={(e) => onAssignAttachmentNode(attachment, e.target.value || undefined)}
                          className="encrypted-vault-dialog__select w-full truncate rounded border border-slate-600/50 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-accent focus:outline-none"
                        >
                          <option value="">Vault root</option>
                          {nodeOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <span className="text-xs text-slate-400">{formatBytes(attachment.size_bytes)}</span>
                      <span className="text-xs text-slate-500">{new Date(attachment.uploaded_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onDownloadAttachment(attachment)}
                          title="Download"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-600/50 text-slate-300 transition hover:border-slate-400 hover:text-white"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(attachment)}
                          title="Delete"
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-700/40 text-red-400 transition hover:border-red-500 hover:text-red-300"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Share exports tab ────────────────────────────────────────── */}
            {activeTab === 'shares' && (
              <div className="space-y-5">
                {/* Create share form */}
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5 encrypted-vault-dialog__section">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">New share export</p>
                      <p className="mt-1 text-xs text-slate-400">Create a password-protected, encrypted snapshot of this vault.</p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={shareDraft.includeAttachments}
                        onChange={(e) => setShareDraft((d) => ({ ...d, includeAttachments: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-500 accent-[var(--accent)]"
                      />
                      <span className="text-xs text-slate-400">Include files</span>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Export file name">
                      <input
                        value={shareDraft.name}
                        onChange={(e) => setShareDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Project export.cmvshare"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Passphrase">
                      <input
                        value={shareDraft.passphrase}
                        onChange={(e) => setShareDraft((d) => ({ ...d, passphrase: e.target.value }))}
                        placeholder="Choose a strong passphrase"
                        type="password"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Confirm passphrase">
                      <input
                        value={shareDraft.passphraseConfirm}
                        onChange={(e) => setShareDraft((d) => ({ ...d, passphraseConfirm: e.target.value }))}
                        placeholder="Repeat passphrase"
                        type="password"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Passphrase hint (optional)">
                      <input
                        value={shareDraft.passphraseHint}
                        onChange={(e) => setShareDraft((d) => ({ ...d, passphraseHint: e.target.value }))}
                        placeholder="Hint shown to recipients"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Expiry in days">
                      <input
                        value={shareDraft.expiresInDays}
                        onChange={(e) => setShareDraft((d) => ({ ...d, expiresInDays: e.target.value }))}
                        type="number"
                        min="1"
                        max="365"
                        className={inputCls}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onCreateShare(shareDraft)}
                      disabled={shareBusy || loading}
                      className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      {shareBusy ? 'Creating…' : 'Create encrypted share'}
                    </button>
                    {shareDraft.passphrase && shareDraft.passphrase !== shareDraft.passphraseConfirm && (
                      <span className="text-xs text-red-400">Passphrases do not match</span>
                    )}
                  </div>
                </div>

                {/* Existing shares list */}
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5 encrypted-vault-dialog__section">
                  <p className="mb-3 text-sm font-semibold text-white">Existing exports</p>
                  {shares.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-800/30 py-8 text-center">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mb-2 text-slate-600"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                      <p className="text-sm text-slate-500">No encrypted shares created yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shares.map((share) => (
                        <div key={share.id} className="group rounded-lg border border-slate-700/50 bg-slate-900/50 px-4 py-3 transition hover:border-slate-600/70">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-white">{share.name}</p>
                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${share.revoked ? 'bg-slate-700/60 text-slate-400' : 'bg-emerald-900/40 text-emerald-300'}`}>
                                  {share.revoked ? 'revoked' : share.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {share.scope} · {formatBytes(share.size_bytes)} · {new Date(share.created_at).toLocaleDateString()} · Expires {formatDate(share.expires_at)}
                              </p>
                              {share.passphrase_hint && (
                                <p className="mt-0.5 text-xs text-slate-500">Hint: {share.passphrase_hint}</p>
                              )}
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => onCopyShareUrl(share)}
                              className="flex items-center gap-1.5 rounded-md border border-slate-600/50 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-400 hover:text-white"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                              Copy link
                            </button>
                            <a
                              href={share.share_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 rounded-md border border-slate-600/50 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-400 hover:text-white"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                              Open
                            </a>
                            {!share.revoked && (
                              <button
                                type="button"
                                onClick={() => setRevokeTarget(share)}
                                className="flex items-center gap-1.5 rounded-md border border-red-700/40 px-3 py-1 text-xs text-red-400 transition hover:border-red-500 hover:text-red-300"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                Revoke
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete encrypted attachment"
        message={deleteTarget ? `Delete ${deleteTarget.name}? The encrypted attachment blob will be permanently removed from remote storage.` : ''}
        confirmLabel="Delete attachment"
        danger
        onConfirm={() => { if (deleteTarget) onDeleteAttachment(deleteTarget); setDeleteTarget(null); }}
        onClose={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke encrypted share"
        message={revokeTarget ? `Revoke ${revokeTarget.name}? This blocks future downloads but cannot retract files that were already downloaded.` : ''}
        confirmLabel="Revoke share"
        danger
        onConfirm={() => { if (revokeTarget) onRevokeShare(revokeTarget); setRevokeTarget(null); }}
        onClose={() => setRevokeTarget(null)}
      />
    </>
  );
}

export default EncryptedVaultDialog;

