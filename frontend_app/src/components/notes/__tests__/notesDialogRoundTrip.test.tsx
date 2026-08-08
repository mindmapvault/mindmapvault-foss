// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createRef, createElement, act, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MindMapNotesDialog } from '../../MindMapNotesDialog';
import type { NoteEditorHandle } from '../NoteEditor';

/**
 * Regression cover for a data-loss bug: switching Read → Write used to unmount
 * the editor, which re-seeded the document from `initialNotesText` — the text
 * as it was when the note was *opened*. Everything typed since disappeared, and
 * because autosave follows the editor, the stale text was then written back.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// React 19 wants this flag set for act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  editorRef: RefObject<NoteEditorHandle | null>;
  latestText: () => string;
  clickMode: (label: 'Write' | 'Read') => Promise<void>;
}

async function renderDialog(initialText: string): Promise<Harness> {
  // Warm the dynamic import so React.lazy resolves on the first flush.
  await import('../NoteEditor');

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const editorRef = createRef<NoteEditorHandle>();
  let latest = initialText;

  await act(async () => {
    root!.render(createElement(MindMapNotesDialog, {
      open: true,
      notesDropActive: false,
      nodeId: 'node-1',
      nodeTitle: 'Test node',
      hasNodeNotes: true,
      nodeTags: [],
      attachmentCount: 0,
      attachmentLabel: '',
      attachments: [],
      attachmentPreviewUrls: {},
      canDeleteAttachment: false,
      notesUploadBusy: false,
      initialNotesText: initialText,
      notesPreviewHtml: '<p>preview</p>',
      saveState: 'saved' as const,
      editorRef,
      notesAttachmentInputRef: createRef<HTMLInputElement>(),
      onClose: () => {},
      onDragOver: () => {},
      onDragLeave: () => {},
      onDrop: () => {},
      onAddAttachmentFiles: () => {},
      onInsertMarkdownAction: () => {},
      onNotesTextChange: (v: string) => { latest = v; },
      onNotesPaste: () => {},
      onDeleteNotes: () => {},
      resolveImageUrl: () => undefined,
    }));
  });

  // Let React.lazy commit the resolved component.
  for (let i = 0; i < 5 && !editorRef.current; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }

  const clickMode = async (label: 'Write' | 'Read') => {
    const btn = Array.from(container!.querySelectorAll('.mm-notes-modeswitch button'))
      .find((b) => b.textContent === label) as HTMLButtonElement;
    await act(async () => { btn.click(); });
  };

  return { editorRef, latestText: () => latest, clickMode };
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  root = null;
  container = null;
});

describe('notes dialog read/write round trip', () => {
  it('keeps edits when switching Write → Read → Write', async () => {
    const h = await renderDialog('original text');
    expect(h.editorRef.current).not.toBeNull();

    h.editorRef.current!.editSelection(() => ' and more', '');
    const afterEdit = h.editorRef.current!.getValue();
    expect(afterEdit).toContain('and more');

    await h.clickMode('Read');
    await h.clickMode('Write');

    // Before the fix this returned 'original text' — the edit was gone.
    expect(h.editorRef.current!.getValue()).toBe(afterEdit);
  });

  it('keeps the editor mounted in read mode rather than tearing it down', async () => {
    const h = await renderDialog('body');
    await h.clickMode('Read');
    expect(h.editorRef.current).not.toBeNull();
    expect(container!.querySelector('.mm-note-editor')).not.toBeNull();
  });

  it('reports the edited text upward so autosave writes what is on screen', async () => {
    const h = await renderDialog('start');
    h.editorRef.current!.editSelection(() => 'start-edited', '');
    await h.clickMode('Read');
    await h.clickMode('Write');
    expect(h.latestText()).toBe(h.editorRef.current!.getValue());
  });
});
