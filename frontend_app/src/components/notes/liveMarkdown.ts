import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';

/**
 * Obsidian-style "live preview" for Markdown.
 *
 * One rule drives everything: syntax markers are hidden and their content
 * styled, EXCEPT on the element the caret is currently inside, where the raw
 * source is revealed so it stays editable.
 *
 * The document is always plain Markdown — nothing is converted to HTML — so the
 * stored `node.notes` value is byte-for-byte what the user typed.
 */

/** Replaces a range with nothing — used to hide syntax markers. */
const hideMark = Decoration.replace({});

/** Does any cursor/selection touch [from, to]? Then reveal the raw syntax. */
function isActive(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** Clickable checkbox for `- [ ]` / `- [x]` that rewrites the source. */
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }

  eq(other: TaskWidget) { return other.checked === this.checked && other.pos === this.pos; }

  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'mm-cm-task';
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({
        changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' },
      });
    });
    return box;
  }

  ignoreEvent() { return false; }
}

/** Renders an image inline once the caret leaves it. */
class ImageWidget extends WidgetType {
  constructor(readonly url: string, readonly alt: string) { super(); }

  eq(other: ImageWidget) { return other.url === this.url && other.alt === this.alt; }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'mm-cm-image-wrap';
    if (!this.url) {
      const missing = document.createElement('span');
      missing.className = 'mm-cm-image-missing';
      missing.textContent = this.alt ? `Image unavailable: ${this.alt}` : 'Image unavailable';
      wrap.appendChild(missing);
      return wrap;
    }
    const img = document.createElement('img');
    img.src = this.url;
    img.alt = this.alt;
    img.className = 'mm-cm-image';
    wrap.appendChild(img);
    return wrap;
  }
}

const HEADING_RE = /^ATXHeading(\d)$/;
const LINK_RE = /^(!?)\[([^\]]*)\]\(([^)]*)\)$/;

/**
 * Resolves an image URL for rendering. Notes reference attachments as
 * `attachment://<id>`, which is meaningless to the DOM — the editor host maps
 * it to a decrypted blob URL.
 */
export type ResolveImageUrl = (url: string) => string | undefined;

function buildDecorations(view: EditorView, resolveImageUrl: ResolveImageUrl): DecorationSet {
  const marks: Range<Decoration>[] = [];
  const { state } = view;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // ── Headings ──────────────────────────────────────────────────────
        const heading = HEADING_RE.exec(name);
        if (heading) {
          marks.push(
            Decoration.line({ class: `mm-cm-h${heading[1]}` }).range(state.doc.lineAt(node.from).from),
          );
          return;
        }
        if (name === 'HeaderMark') {
          const line = state.doc.lineAt(node.from);
          if (!isActive(state, line.from, line.to)) {
            // swallow the space after the #'s too
            const end = state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            marks.push(hideMark.range(node.from, end));
          }
          return;
        }

        // ── Emphasis / inline code ────────────────────────────────────────
        if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'InlineCode') {
          const cls =
            name === 'StrongEmphasis' ? 'mm-cm-strong'
              : name === 'Emphasis' ? 'mm-cm-em'
                : name === 'Strikethrough' ? 'mm-cm-strike'
                  : 'mm-cm-code';
          marks.push(Decoration.mark({ class: cls }).range(node.from, node.to));
          return;
        }
        if (name === 'EmphasisMark' || name === 'CodeMark' || name === 'StrikethroughMark') {
          // Reveal against the ENCLOSING element, not the marker itself: a
          // caret in the middle of "**bold**" never touches the two-character
          // marker, so testing the marker's own range would keep the syntax
          // hidden while the user is editing inside it.
          const parent = node.node.parent;
          const revealFrom = parent ? parent.from : node.from;
          const revealTo = parent ? parent.to : node.to;
          if (!isActive(state, revealFrom, revealTo)) marks.push(hideMark.range(node.from, node.to));
          return;
        }

        // ── Blockquote ────────────────────────────────────────────────────
        if (name === 'QuoteMark') {
          const line = state.doc.lineAt(node.from);
          marks.push(Decoration.line({ class: 'mm-cm-quote' }).range(line.from));
          if (!isActive(state, line.from, line.to)) {
            const end = state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
            marks.push(hideMark.range(node.from, end));
          }
          return;
        }

        // ── Task checkboxes ───────────────────────────────────────────────
        if (name === 'TaskMarker') {
          const raw = state.doc.sliceString(node.from, node.to); // "[ ]" | "[x]"
          marks.push(
            Decoration.replace({ widget: new TaskWidget(/x/i.test(raw), node.from) })
              .range(node.from, node.to),
          );
          return;
        }

        // ── Links and images ──────────────────────────────────────────────
        if (name === 'Link' || name === 'Image') {
          if (isActive(state, node.from, node.to)) return;
          const m = LINK_RE.exec(state.doc.sliceString(node.from, node.to));
          if (!m) return;
          const [, bang, label, url] = m;

          if (bang) {
            marks.push(
              Decoration.replace({ widget: new ImageWidget(resolveImageUrl(url) ?? '', label) })
                .range(node.from, node.to),
            );
            return;
          }
          // hide "[", style the label, hide "](url)"
          marks.push(hideMark.range(node.from, node.from + 1));
          marks.push(
            Decoration.mark({ class: 'mm-cm-link' }).range(node.from + 1, node.from + 1 + label.length),
          );
          marks.push(hideMark.range(node.from + 1 + label.length, node.to));
          return;
        }

        // ── Fenced code ───────────────────────────────────────────────────
        if (name === 'FencedCode') {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            marks.push(Decoration.line({ class: 'mm-cm-codeblock' }).range(state.doc.line(n).from));
          }
          return;
        }

        if (name === 'ListMark') {
          marks.push(Decoration.mark({ class: 'mm-cm-listmark' }).range(node.from, node.to));
          return;
        }

        if (name === 'HorizontalRule') {
          const line = state.doc.lineAt(node.from);
          marks.push(Decoration.line({ class: 'mm-cm-hr' }).range(line.from));
          if (!isActive(state, line.from, line.to)) marks.push(hideMark.range(node.from, node.to));
        }
      },
    });
  }

  // RangeSetBuilder requires document order.
  marks.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of marks) builder.add(m.from, m.to, m.value);
  return builder.finish();
}

export function liveMarkdown(resolveImageUrl: ResolveImageUrl) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, resolveImageUrl);
      }

      update(u: ViewUpdate) {
        // selectionSet matters as much as docChanged: moving the caret is what
        // decides which element shows its raw source.
        if (u.docChanged || u.viewportChanged || u.selectionSet) {
          this.decorations = buildDecorations(u.view, resolveImageUrl);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
