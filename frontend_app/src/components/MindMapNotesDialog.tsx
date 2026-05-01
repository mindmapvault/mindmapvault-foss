import type { ClipboardEvent, DragEvent, RefObject } from 'react';
import type { NodeAttachmentRef } from '../types';
import { handleDelegatedLinkClick } from '../utils/openExternal';

interface MindMapNotesDialogProps {
  open: boolean;
  notesDropActive: boolean;
  nodeTitle: string;
  hasNodeNotes: boolean;
  nodeTags: Array<{ name: string; color: string }>;
  attachmentCount: number;
  attachmentLabel: string;
  attachments: NodeAttachmentRef[];
  attachmentPreviewUrls: Record<string, string>;
  canDeleteAttachment: boolean;
  showMarkdownHelp: boolean;
  notesUploadBusy: boolean;
  notesText: string;
  notesPreviewHtml: string;
  notesRef: RefObject<HTMLTextAreaElement>;
  notesAttachmentInputRef: RefObject<HTMLInputElement>;
  onClose: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onOpenAttachment?: (attachment: NodeAttachmentRef) => void;
  onDeleteAttachment?: (attachment: NodeAttachmentRef) => void;
  onAddAttachmentFiles: (files: File[]) => void;
  onInsertMarkdownAction: (action: 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'ul' | 'ol' | 'task' | 'quote' | 'code' | 'link') => void;
  onToggleMarkdownHelp: () => void;
  onNotesTextChange: (value: string) => void;
  onNotesPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSaveNotes: () => void;
  onDeleteNotes: () => void;
}

export function MindMapNotesDialog({
  open,
  notesDropActive,
  nodeTitle,
  hasNodeNotes,
  nodeTags,
  attachmentCount,
  attachmentLabel,
  attachments,
  attachmentPreviewUrls,
  canDeleteAttachment,
  showMarkdownHelp,
  notesUploadBusy,
  notesText,
  notesPreviewHtml,
  notesRef,
  notesAttachmentInputRef,
  onClose,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenAttachment,
  onDeleteAttachment,
  onAddAttachmentFiles,
  onInsertMarkdownAction,
  onToggleMarkdownHelp,
  onNotesTextChange,
  onNotesPaste,
  onSaveNotes,
  onDeleteNotes,
}: MindMapNotesDialogProps) {
  if (!open) return null;

  return (
    <>
      <div className="mm-overlay" onClick={onClose} />
      <div
        className={`mm-notes-modal${notesDropActive ? ' mm-notes-panel--drop' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="mm-notes-header"><span>Notes — {nodeTitle}</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="mm-btn-icon" onClick={onClose} title="Close"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        </div>
        <div className="mm-notes-node-preview">
          <div className="mm-notes-node-preview-row">
            <span className="mm-notes-node-preview-title">Node preview</span>
            <div className="mm-notes-node-preview-flags">
              {hasNodeNotes && <span className="mm-notes-node-flag">Note</span>}
              {attachmentCount > 0 && <span className="mm-notes-node-flag">{attachmentLabel}</span>}
            </div>
          </div>
          <div className="mm-notes-node-preview-row" style={{ flexWrap: 'wrap' }}>
            {nodeTags.length > 0 ? (
              nodeTags.map((tag) => (
                <span key={tag.name} className="mm-notes-node-tag" style={{ background: tag.color }}>{tag.name}</span>
              ))
            ) : (
              <span className="mm-notes-node-preview-muted">No labels</span>
            )}
          </div>
        </div>
        {attachments.length > 0 && (
          <div className="mm-notes-attachments-wrap">
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
                          <polyline points="3,6 5,6 21,6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mm-notes-markdown-tools">
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
              if (files.length > 0) {
                onAddAttachmentFiles(files);
              }
              e.currentTarget.value = '';
            }}
          />
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('h1')} title="Heading 1">H1</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('h2')} title="Heading 2">H2</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('h3')} title="Heading 3">H3</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('bold')} title="Bold"><strong>B</strong></button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('italic')} title="Italic"><em>I</em></button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('ul')} title="Bulleted list">• List</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('ol')} title="Numbered list">1. List</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('task')} title="Checklist">☐ Task</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('quote')} title="Quote">" Quote</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('code')} title="Inline code">&lt;/&gt;</button>
          <button className="mm-notes-md-btn" onClick={() => onInsertMarkdownAction('link')} title="Link">Link</button>
          <button className="mm-notes-md-btn" onClick={onToggleMarkdownHelp} title="Markdown help">ⓘ</button>
          {notesUploadBusy && <span className="mm-notes-upload-hint">Uploading files…</span>}
        </div>
        {showMarkdownHelp && (
          <div className="mm-notes-md-help">
            <div><strong>#</strong> / <strong>##</strong> / <strong>###</strong> headings</div>
            <div><strong>**bold**</strong>, <em>*italic*</em>, <strong>`code`</strong></div>
            <div><strong>- item</strong> unordered, <strong>1. item</strong> ordered, <strong>- [ ] task</strong> checklist</div>
            <div><strong>&gt; quote</strong> block quote, <strong>[text](url)</strong> links</div>
            <div>Drop files anywhere in this dialog, use <strong>+ File</strong>, or paste images with <strong>Ctrl+V</strong> to insert attachment markdown.</div>
          </div>
        )}
        <div className="mm-notes-split">
          <div className="mm-notes-editor-pane">
            <textarea ref={notesRef} className="mm-notes-textarea" value={notesText} onChange={(e) => onNotesTextChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
              onPaste={onNotesPaste}
              placeholder="Add notes… (supports **Markdown**)"
              autoFocus
            />
          </div>
          <div className="mm-notes-preview-pane">
            <div
              className="mm-notes-preview"
              dangerouslySetInnerHTML={{ __html: notesPreviewHtml }}
              onClick={(e) => {
                handleDelegatedLinkClick(e as unknown as MouseEvent);
              }}
            />
          </div>
        </div>
        <div className="mm-notes-footer">
          <button className="mm-btn mm-btn--primary" onClick={onSaveNotes}>Save notes</button>
          <button className="mm-btn" onClick={onClose}>Cancel</button>
          <button className="mm-btn mm-btn--danger" style={{ marginLeft: 'auto' }} onClick={onDeleteNotes}>Delete note</button>
        </div>
      </div>
    </>
  );
}
