import { lazy, Suspense, useEffect, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react';
import type { NodeAttachmentRef } from '../types';
import { handleDelegatedLinkClick } from '../utils/openExternal';
import type { NoteEditorHandle } from './notes/NoteEditor';

// CodeMirror is ~175 KB gzipped and only needed once a note is actually
// opened, so it stays out of the editor's main chunk.
const NoteEditor = lazy(() => import('./notes/NoteEditor'));

export type NotesViewMode = 'write' | 'read';

interface MindMapNotesDialogProps {
  open: boolean;
  notesDropActive: boolean;
  nodeId: string;
  nodeTitle: string;
  hasNodeNotes: boolean;
  nodeTags: Array<{ name: string; color: string }>;
  attachmentCount: number;
  attachmentLabel: string;
  attachments: NodeAttachmentRef[];
  attachmentPreviewUrls: Record<string, string>;
  canDeleteAttachment: boolean;
  notesUploadBusy: boolean;
  /** Seeds the editor; not fed back on every keystroke (see NoteEditor). */
  initialNotesText: string;
  notesPreviewHtml: string;
  saveState: 'saved' | 'saving';
  editorRef: RefObject<NoteEditorHandle | null>;
  notesAttachmentInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onOpenAttachment?: (attachment: NodeAttachmentRef) => void;
  onDeleteAttachment?: (attachment: NodeAttachmentRef) => void;
  onAddAttachmentFiles: (files: File[]) => void;
  onInsertMarkdownAction: (action: 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'ul' | 'ol' | 'task' | 'quote' | 'code' | 'link') => void;
  onNotesTextChange: (value: string) => void;
  onNotesPaste: (e: ClipboardEvent<HTMLDivElement>) => void;
  onDeleteNotes: () => void;
  resolveImageUrl: (url: string) => string | undefined;
}

/**
 * Single-screen note editor.
 *
 * The writing surface owns the window: metadata and attachments live behind a
 * disclosure rather than stacked above the text, and there is no second pane —
 * markdown renders in place as you type. Changes autosave, so there is no Save
 * button to forget.
 */
export function MindMapNotesDialog({
  open,
  notesDropActive,
  nodeId,
  nodeTitle,
  hasNodeNotes,
  nodeTags,
  attachmentCount,
  attachmentLabel,
  attachments,
  attachmentPreviewUrls,
  canDeleteAttachment,
  notesUploadBusy,
  initialNotesText,
  notesPreviewHtml,
  saveState,
  editorRef,
  notesAttachmentInputRef,
  onClose,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenAttachment,
  onDeleteAttachment,
  onAddAttachmentFiles,
  onInsertMarkdownAction,
  onNotesTextChange,
  onNotesPaste,
  onDeleteNotes,
  resolveImageUrl,
}: MindMapNotesDialogProps) {
  const [mode, setMode] = useState<NotesViewMode>('write');
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Ctrl+E flips Write/Read. CodeMirror's editable is a contenteditable div, so
  // the editor's own keymap never sees it as an input — a window listener is
  // what actually reaches the key while the caret is in the note.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'e') return;
      e.preventDefault();
      setMode((current) => {
        if (current === 'read') requestAnimationFrame(() => editorRef.current?.refresh());
        return current === 'write' ? 'read' : 'write';
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, editorRef]);

  if (!open) return null;

  const detailCount = nodeTags.length + attachmentCount;

  return (
    <>
      <div className="mm-overlay" onClick={onClose} />
      <div
        className={`mm-notes-modal${notesDropActive ? ' mm-notes-panel--drop' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPaste={onNotesPaste}
      >
        {/* ── Header: title, save state, mode, close ───────────────────── */}
        <div className="mm-notes-header">
          <span className="mm-notes-title">
            {nodeTitle}
            {hasNodeNotes && <span className="mm-notes-flag">Note</span>}
          </span>

          <span className={`mm-notes-savestate mm-notes-savestate--${saveState}`}>
            {saveState === 'saving' ? 'Saving…' : 'Saved'}
          </span>

          <div className="mm-notes-modeswitch" role="group" aria-label="View mode">
            <button
              type="button"
              className={mode === 'write' ? 'is-active' : ''}
              onClick={() => { setMode('write'); requestAnimationFrame(() => editorRef.current?.refresh()); }}
              title="Write (Ctrl+E)"
            >
              Write
            </button>
            <button
              type="button"
              className={mode === 'read' ? 'is-active' : ''}
              onClick={() => setMode('read')}
              title="Read (Ctrl+E)"
            >
              Read
            </button>
          </div>

          <button className="mm-btn-icon" onClick={onClose} title="Close (Esc)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Formatting bar: only while writing ───────────────────────── */}
        {mode === 'write' && (
          <div className="mm-notes-markdown-tools">
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('h1')} title="Heading 1">H1</button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('h2')} title="Heading 2">H2</button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('h3')} title="Heading 3">H3</button>
            <span className="mm-notes-md-sep" />
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('bold')} title="Bold (Ctrl+B)"><strong>B</strong></button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('italic')} title="Italic (Ctrl+I)"><em>I</em></button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('code')} title="Inline code">&lt;/&gt;</button>
            <span className="mm-notes-md-sep" />
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('ul')} title="Bulleted list">• List</button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('ol')} title="Numbered list">1. List</button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('task')} title="Checklist">☐ Task</button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('quote')} title="Quote">" Quote</button>
            <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('link')} title="Link (Ctrl+K)">Link</button>
            <span className="mm-notes-md-sep" />
            <button
              className="mm-notes-md-btn"
              onClick={() => notesAttachmentInputRef.current?.click()}
              title="Attach files"
              type="button"
            >
              + File
            </button>
            <input
              ref={notesAttachmentInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) onAddAttachmentFiles(files);
                e.currentTarget.value = '';
              }}
            />
            {notesUploadBusy && <span className="mm-notes-upload-hint">Uploading…</span>}
          </div>
        )}

        {/* ── The writing surface ──────────────────────────────────────── */}
        {/* The editor stays mounted in both modes: unmounting it would discard
            the document and re-seed from initialValue, losing every edit made
            since the note was opened. Read mode just covers it. */}
        <div className="mm-notes-surface">
          <div className="mm-notes-pane" style={mode === 'write' ? undefined : { display: 'none' }}>
            <Suspense fallback={<div className="mm-notes-editor-loading">Loading editor…</div>}>
              <NoteEditor
                ref={editorRef}
                docKey={nodeId}
                initialValue={initialNotesText}
                placeholder="Start writing… Markdown renders as you type."
                onChange={onNotesTextChange}
                onEscape={onClose}
                resolveImageUrl={resolveImageUrl}
              />
            </Suspense>
          </div>
          {mode === 'read' && (
            <div
              className="mm-notes-preview mm-notes-preview--full"
              dangerouslySetInnerHTML={{ __html: notesPreviewHtml }}
              onClick={(e) => handleDelegatedLinkClick(e as unknown as MouseEvent)}
            />
          )}
        </div>

        {/* ── Details: labels + attachments, collapsed by default ──────── */}
        <div className="mm-notes-details">
          <button
            type="button"
            className="mm-notes-details-toggle"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: detailsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            Details
            {detailCount > 0 && <span className="mm-notes-details-count">{detailCount}</span>}
          </button>

          {detailsOpen && (
            <div className="mm-notes-details-body">
              <div className="mm-notes-details-row">
                {nodeTags.length > 0 ? (
                  nodeTags.map((tag) => (
                    <span key={tag.name} className="mm-notes-node-tag" style={{ background: tag.color }}>{tag.name}</span>
                  ))
                ) : (
                  <span className="mm-notes-node-preview-muted">No labels</span>
                )}
              </div>

              {attachments.length > 0 && (
                <>
                  <div className="mm-notes-attachments-header">
                    <span>Files on this node</span>
                    <span>{attachmentLabel}</span>
                  </div>
                  <div className="mm-notes-attachments">
                    {attachments.map((attachment) => {
                      const previewUrl = attachmentPreviewUrls[attachment.attachment_id];
                      return (
                        <div key={attachment.attachment_id} className="mm-notes-attachment-card">
                          <button
                            type="button"
                            className="mm-notes-attachment-open"
                            onClick={() => onOpenAttachment?.(attachment)}
                          >
                            <div className="mm-notes-attachment-thumb">
                              {previewUrl ? (
                                <img src={previewUrl} alt={attachment.name} className="mm-notes-attachment-image" />
                              ) : (attachment.content_type ?? '').startsWith('audio/') ? (
                                <svg className="mm-notes-attachment-audio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                                </svg>
                              ) : (
                                <span>{attachment.preview_kind === 'image' ? 'IMG' : 'FILE'}</span>
                              )}
                            </div>
                            <div className="mm-notes-attachment-meta">
                              <strong>{attachment.name}</strong>
                              <span>{Math.max(1, Math.round(attachment.size_bytes / 1024))} KB</span>
                            </div>
                          </button>
                          {canDeleteAttachment && (
                            <button
                              type="button"
                              className="mm-notes-attachment-delete"
                              title="Delete attachment"
                              onClick={() => onDeleteAttachment?.(attachment)}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3,6 5,6 21,6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4h6v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <button className="mm-btn mm-btn--danger mm-notes-delete-btn" onClick={onDeleteNotes}>
                Delete note
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
