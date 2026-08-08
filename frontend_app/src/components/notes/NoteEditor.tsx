import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorView, drawSelection, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
// markdownLanguage (not the default CommonMark base) enables the GFM
// extensions the notes rely on: task lists and strikethrough.
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { liveMarkdown, type ResolveImageUrl } from './liveMarkdown';
import { markdownKeymap } from './markdownEditing';

/**
 * Imperative surface used by the toolbar and the attachment uploader. These
 * replace the raw `selectionStart`/`selectionEnd` arithmetic the old textarea
 * required — CodeMirror owns the selection, so callers go through here.
 */
export interface NoteEditorHandle {
  focus(): void;
  /** Re-measure after being hidden — CodeMirror cannot measure a display:none box. */
  refresh(): void;
  getValue(): string;
  /** Transform the selected text (or `fallback` when the selection is empty). */
  editSelection(writer: (selected: string) => string, fallback?: string): void;
  /** Prefix every selected line — headings, lists, quotes. */
  prefixLines(prefix: string, fallback?: string): void;
  /** Insert a block at the caret, guaranteeing blank-line separation. */
  insertBlock(text: string): void;
}

interface NoteEditorProps {
  /** Seeds the document. Changing `docKey` reloads it; edits do not. */
  initialValue: string;
  /** Identity of the note being edited — usually the node id. */
  docKey: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  resolveImageUrl?: ResolveImageUrl;
}

/**
 * CodeMirror 6 editor with Obsidian-style live preview.
 *
 * Deliberately uncontrolled: the view owns the document and reports changes
 * upward. Feeding `value` back in on every keystroke would fight the caret,
 * which is exactly the bug a controlled <textarea> avoids only because it has
 * no decorations to rebuild.
 */
export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { initialValue, docKey, placeholder, onChange, onEscape, resolveImageUrl },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Latest-ref pattern: the extensions below are created once, so they must not
  // close over stale props.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const resolveRef = useRef(resolveImageUrl);
  resolveRef.current = resolveImageUrl;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        // Caret at the end so nothing is "revealed" the moment the note opens.
        selection: { anchor: initialValue.length },
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage }),
          liveMarkdown((url) => resolveRef.current?.(url)),
          cmPlaceholder(placeholder ?? ''),
          keymap.of([
            ...markdownKeymap,
            { key: 'Escape', run: () => { onEscapeRef.current?.(); return true; } },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.theme({ '&': { height: '100%' }, '&.cm-focused': { outline: 'none' } }),
        ],
      }),
      parent: host,
    });

    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Recreated only when the note identity changes — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  useImperativeHandle(ref, (): NoteEditorHandle => ({
    focus() { viewRef.current?.focus(); },

    refresh() {
      const view = viewRef.current;
      if (!view) return;
      view.requestMeasure();
      view.focus();
    },

    getValue() { return viewRef.current?.state.doc.toString() ?? ''; },

    editSelection(writer, fallback = '') {
      const view = viewRef.current;
      if (!view) return;
      const range = view.state.selection.main;
      const selected = view.state.sliceDoc(range.from, range.to) || fallback;
      const insert = writer(selected);
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: range.from + insert.length },
        userEvent: 'input',
      });
      view.focus();
    },

    prefixLines(prefix, fallback = '') {
      const view = viewRef.current;
      if (!view) return;
      const range = view.state.selection.main;
      const selected = view.state.sliceDoc(range.from, range.to);
      const body = selected || fallback;
      const insert = body.split('\n').map((line) => `${prefix}${line}`).join('\n');
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: range.from + insert.length },
        userEvent: 'input',
      });
      view.focus();
    },

    insertBlock(text) {
      const view = viewRef.current;
      if (!view) return;
      const { state } = view;
      const range = state.selection.main;
      const before = range.from > 0 && state.sliceDoc(range.from - 1, range.from) !== '\n' ? '\n' : '';
      const after = range.to < state.doc.length && state.sliceDoc(range.to, range.to + 1) !== '\n' ? '\n' : '';
      const insert = `${before}${text}${after}`;
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: { anchor: range.from + insert.length },
        userEvent: 'input',
      });
      view.focus();
    },
  }), []);

  return <div ref={hostRef} className="mm-note-editor" />;
});

export default NoteEditor;
