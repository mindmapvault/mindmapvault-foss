// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createRef, createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { MindMapNotesDialog } from '../../MindMapNotesDialog';
import { normalizeBareTasks, toggleTaskAtIndex } from '../markdownEditing';
import type { NoteEditorHandle } from '../NoteEditor';

/**
 * End-to-end cover for ticking a box with the mouse: the preview HTML is built
 * the way the editor builds it, clicked the way a user clicks it, and the
 * markdown that comes back out is checked.
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The editor's own render path, minus the attachment rewriting. */
function previewHtml(markdown: string): string {
  const el = document.createElement('div');
  el.innerHTML = marked.parse(normalizeBareTasks(markdown), { async: false }) as string;
  el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box, i) => {
    box.removeAttribute('disabled');
    box.classList.add('mm-notes-task');
    box.setAttribute('data-task-index', String(i));
    box.closest('li')?.classList.add('mm-notes-task-item');
  });
  return DOMPurify.sanitize(el.innerHTML, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|data|attachment):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}

async function renderRead(markdown: string) {
  await import('../NoteEditor');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const editorRef = createRef<NoteEditorHandle>();
  let text = markdown;
  const toggled: number[] = [];

  const paint = async () => {
    await act(async () => {
      root!.render(createElement(MindMapNotesDialog, {
        open: true, notesDropActive: false, nodeId: 'n1', nodeTitle: 'n', hasNodeNotes: true,
        nodeTags: [], attachmentCount: 0, attachmentLabel: '', attachments: [],
        attachmentPreviewUrls: {}, canDeleteAttachment: false, notesUploadBusy: false,
        initialNotesText: markdown,
        notesPreviewHtml: previewHtml(text),
        saveState: 'saved' as const,
        editorRef, notesAttachmentInputRef: createRef<HTMLInputElement>(),
        onClose: () => {}, onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {},
        onAddAttachmentFiles: () => {}, onInsertMarkdownAction: () => {},
        onNotesTextChange: () => {}, onNotesPaste: () => {}, onDeleteNotes: () => {},
        resolveImageUrl: () => undefined,
        // Mirrors the editor's toggleNotesTask.
        onToggleTask: (i: number) => {
          toggled.push(i);
          const next = toggleTaskAtIndex(text, i);
          if (next !== null) text = next;
        },
      }));
    });
  };

  await paint();
  for (let i = 0; i < 5 && !editorRef.current; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  const readBtn = Array.from(container!.querySelectorAll('.mm-notes-modeswitch button'))
    .find((b) => b.textContent === 'Read') as HTMLButtonElement;
  await act(async () => { readBtn.click(); });

  return {
    boxes: () => Array.from(container!.querySelectorAll<HTMLInputElement>('.mm-notes-preview input[type="checkbox"]')),
    click: async (i: number) => {
      const b = container!.querySelectorAll<HTMLInputElement>('.mm-notes-preview input[type="checkbox"]')[i];
      await act(async () => { b.click(); });
      await paint();
    },
    text: () => text,
    toggled,
  };
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  root = null; container = null;
});

describe('ticking a note checkbox with the mouse', () => {
  it('renders enabled boxes in read mode', async () => {
    const h = await renderRead('- [ ] a\n- [x] b');
    expect(h.boxes().length).toBe(2);
    expect(h.boxes().every((b) => !b.disabled)).toBe(true);
  });

  it('ticks the clicked box and writes it back to the markdown', async () => {
    const h = await renderRead('- [ ] a\n- [ ] b');
    await h.click(1);
    expect(h.toggled).toEqual([1]);
    expect(h.text()).toBe('- [ ] a\n- [x] b');
    expect(h.boxes()[1].checked).toBe(true);
  });

  it('unticks a checked box', async () => {
    const h = await renderRead('- [x] done');
    await h.click(0);
    expect(h.text()).toBe('- [ ] done');
    expect(h.boxes()[0].checked).toBe(false);
  });

  it('works for the bare form too', async () => {
    const h = await renderRead('[x] one\n[ ] two');
    expect(h.boxes().length).toBe(2);
    await h.click(1);
    expect(h.text()).toBe('[x] one\n[x] two');
  });
});
