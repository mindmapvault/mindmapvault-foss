// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { liveMarkdown } from '../liveMarkdown';
import { continueListOnEnter, toggleWrap } from '../markdownEditing';

let view: EditorView | null = null;

function mount(doc: string, anchor = doc.length) {
  view?.destroy();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [
        markdown({ base: markdownLanguage }),
        liveMarkdown((url) => (url.startsWith('attachment://') ? 'blob:resolved' : url)),
      ],
    }),
    parent,
  });
  return view;
}

/** Text as the user sees it, with hidden syntax markers removed. */
function rendered(v: EditorView): string {
  return Array.from(v.dom.querySelectorAll('.cm-line')).map((l) => l.textContent).join('\n');
}

function moveCaret(v: EditorView, anchor: number) {
  v.dispatch({ selection: { anchor } });
}

afterEach(() => { view?.destroy(); view = null; });

describe('liveMarkdown decorations', () => {
  it('hides heading markers when the caret is elsewhere', () => {
    const v = mount('# Title\n\nbody text');
    expect(rendered(v)).toContain('Title');
    expect(rendered(v)).not.toContain('# Title');
  });

  it('reveals heading markers when the caret is on that line', () => {
    const v = mount('# Title\n\nbody text', 3);
    expect(rendered(v)).toContain('# Title');
  });

  it('hides bold markers while reading', () => {
    const v = mount('Some **bold** text', 0);
    expect(rendered(v)).toBe('Some bold text');
  });

  it('reveals bold markers with the caret MID-WORD, not just on the marker', () => {
    const doc = 'Some **bold** text';
    // caret inside "bol|d" — never touches the ** markers themselves
    const v = mount(doc, doc.indexOf('bold') + 2);
    expect(rendered(v)).toBe('Some **bold** text');
  });

  it('hides the markers again once the caret leaves', () => {
    const doc = 'Some **bold** text';
    const v = mount(doc, doc.indexOf('bold') + 2);
    expect(rendered(v)).toContain('**');
    moveCaret(v, 0);
    expect(rendered(v)).not.toContain('**');
  });

  it('renders task markers as checkboxes (requires the GFM base)', () => {
    const v = mount('- [ ] todo\n- [x] done', 0);
    const boxes = v.dom.querySelectorAll('input.mm-cm-task');
    expect(boxes.length).toBe(2);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('shows only the label of a link', () => {
    const v = mount('see [the docs](https://example.com) now', 0);
    expect(rendered(v)).toBe('see the docs now');
  });

  it('resolves attachment:// images through the host resolver', () => {
    // Caret parked on the trailing line: inside the image the raw source is
    // revealed instead, which is the intended behaviour.
    const doc = '![diagram](attachment://abc123)\n\nafter';
    const v = mount(doc, doc.length);
    const img = v.dom.querySelector('img.mm-cm-image') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toContain('blob:resolved');
  });

  it('reveals the image source when the caret is inside it', () => {
    const doc = '![diagram](attachment://abc123)\n\nafter';
    const v = mount(doc, 5);
    expect(v.dom.querySelector('img.mm-cm-image')).toBeNull();
    expect(rendered(v)).toContain('![diagram](attachment://abc123)');
  });

  it('falls back gracefully when an attachment cannot be resolved', () => {
    view?.destroy();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      state: EditorState.create({
        doc: '![gone](attachment://missing)\n\nafter',
        selection: { anchor: 35 },
        extensions: [markdown({ base: markdownLanguage }), liveMarkdown(() => undefined)],
      }),
      parent,
    });
    expect(view.dom.querySelector('.mm-cm-image-missing')).not.toBeNull();
  });

  it('keeps the document as plain markdown — decorations never rewrite it', () => {
    const doc = '# Title\n\n**bold** and [a link](https://x.dev)\n\n- [ ] task';
    const v = mount(doc, 0);
    expect(v.state.doc.toString()).toBe(doc);
  });
});

describe('markdown editing behaviours', () => {
  it('continues a bullet list on Enter', () => {
    const v = mount('- first');
    continueListOnEnter(v);
    expect(v.state.doc.toString()).toBe('- first\n- ');
  });

  it('continues a numbered list and increments', () => {
    const v = mount('3. third');
    continueListOnEnter(v);
    expect(v.state.doc.toString()).toBe('3. third\n4. ');
  });

  it('continues a task list with an unchecked box', () => {
    const v = mount('- [x] done');
    continueListOnEnter(v);
    expect(v.state.doc.toString()).toBe('- [x] done\n- [ ] ');
  });

  it('clears the marker instead of continuing an empty item', () => {
    const v = mount('- first\n- ');
    continueListOnEnter(v);
    expect(v.state.doc.toString()).toBe('- first\n');
  });

  it('preserves indentation of nested items', () => {
    const v = mount('  - nested');
    continueListOnEnter(v);
    expect(v.state.doc.toString()).toBe('  - nested\n  - ');
  });

  it('does nothing on a plain paragraph so Enter stays default', () => {
    const v = mount('just prose');
    expect(continueListOnEnter(v)).toBe(false);
  });

  it('wraps the selection in bold', () => {
    const v = mount('word');
    v.dispatch({ selection: { anchor: 0, head: 4 } });
    toggleWrap(v, '**', 'bold text');
    expect(v.state.doc.toString()).toBe('**word**');
  });

  it('unwraps an already-bold selection', () => {
    const v = mount('**word**');
    v.dispatch({ selection: { anchor: 0, head: 8 } });
    toggleWrap(v, '**', 'bold text');
    expect(v.state.doc.toString()).toBe('word');
  });
});
