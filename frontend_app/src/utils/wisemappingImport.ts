import type { MindMapTreeNode } from '../types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function makeNode(text: string): MindMapTreeNode {
  return {
    id: uid(),
    text: text.trim() || 'Untitled',
    notes: '',
    collapsed: false,
    color: null,
    icons: [],
    checked: null,
    progress: null,
    startDate: null,
    endDate: null,
    urls: [],
    children: [],
  };
}

function parseTopicEl(el: Element, isTopLevel = false): MindMapTreeNode {
  // Text comes from the `text` attribute for single-line topics, or from a
  // `<text>` CDATA child for multi-line ones (the real tango serializer writes
  // multi-line text as CDATA, leaving no `text` attribute).
  const textChild = el.querySelector(':scope > text');
  const text = el.getAttribute('text') ?? (textChild?.textContent?.trim() || 'Untitled');
  const node = makeNode(text);

  const bgColor = el.getAttribute('bgColor');
  if (bgColor) node.color = bgColor;

  // `side` is only meaningful for the root's direct children in our model.
  const position = el.getAttribute('position');
  if (isTopLevel) {
    if (position === 'left' || position === 'right') {
      node.side = position;
    } else if (position) {
      // Real tango format: position is "x,y" coordinates. Recover the side
      // from the sign of x — negative is left, positive is right.
      const x = parseFloat(position.split(',')[0]);
      if (Number.isFinite(x)) node.side = x < 0 ? 'left' : 'right';
    }
  }

  const noteEl = el.querySelector(':scope > note');
  if (noteEl) node.notes = (noteEl.textContent ?? '').trim();

  const linkEl = el.querySelector(':scope > link');
  if (linkEl) {
    const url = linkEl.getAttribute('url');
    if (url) node.urls = [{ url, label: '' }];
  }

  node.children = Array.from(el.children)
    .filter((c) => c.tagName.toLowerCase() === 'topic')
    .sort((a, b) => {
      const oa = parseInt(a.getAttribute('order') ?? '0', 10);
      const ob = parseInt(b.getAttribute('order') ?? '0', 10);
      return oa - ob;
    })
    // Children of the root are top-level (side is meaningful); deeper nodes not.
    .map((c) => parseTopicEl(c, false));

  return node;
}

/**
 * Parses a WiseMapping XML string into a MindMapTreeNode tree.
 * WiseMapping format: <map name="..."><topic id="1" text="..." central="true">...</topic></map>
 */
export function wisemappingToTree(xmlString: string, title: string): MindMapTreeNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid WiseMapping file: ' + (parseError.textContent ?? 'XML parse error'));
  }

  const mapEl = doc.querySelector('map');
  if (!mapEl) throw new Error('No <map> element found in WiseMapping file');

  const rootTopicEl =
    mapEl.querySelector(':scope > topic[central="true"]') ??
    mapEl.querySelector(':scope > topic');

  if (!rootTopicEl) throw new Error('No root topic found in WiseMapping file');

  const root = parseTopicEl(rootTopicEl);
  // The root's direct children are the top-level branches — re-derive their
  // side from their position, which parseTopicEl skipped for them.
  const rootChildEls = Array.from(rootTopicEl.children).filter(
    (c) => c.tagName.toLowerCase() === 'topic',
  );
  rootChildEls.forEach((el, i) => {
    const position = el.getAttribute('position');
    if (position === 'left' || position === 'right') {
      root.children[i].side = position;
    } else if (position) {
      const x = parseFloat(position.split(',')[0]);
      if (Number.isFinite(x)) root.children[i].side = x < 0 ? 'left' : 'right';
    }
  });

  // WiseMapping allows free-positioned topics as *siblings* of the central
  // topic directly under <map> (no nesting). Attach any top-level non-central
  // topics to the root so a flat map does not import as a single node.
  const topLevel = Array.from(mapEl.children).filter(
    (c) => c.tagName.toLowerCase() === 'topic' && c !== rootTopicEl,
  );
  for (const el of topLevel) {
    root.children.push(parseTopicEl(el, true));
  }

  root.id = 'root';
  root.text = title || root.text;
  return root;
}
