// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { normalizeBareTasks, toggleTaskAtIndex } from '../markdownEditing';

// The note from the bug report, verbatim.
const NOTE = `# kde bylo, tam bylo
## byla jednou jedna babicka
sfsadfasdf
dsfasdf
-  dfasdf
-  sdfsadfa
-  asdfasdf

[x] sdafsadf
[ ] sdfsdf


> sdfasdfsdfsadfsdf
>sdfsdfadfsas


sdfasdf
sdfasdfasd`;

describe('bare [ ] / [x] in a real note', () => {
  it('renders a checkbox for each bare task', () => {
    const html = marked.parse(normalizeBareTasks(NOTE), { async: false }) as string;
    const el = document.createElement('div');
    el.innerHTML = html;
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    expect(boxes[0].checked).toBe(true);   // [x] sdafsadf
    expect(boxes[1].checked).toBe(false);  // [ ] sdfsdf
  });

  it('leaves the three plain bullets as plain bullets', () => {
    const html = marked.parse(normalizeBareTasks(NOTE), { async: false }) as string;
    const el = document.createElement('div');
    el.innerHTML = html;
    const plain = [...el.querySelectorAll('li')].filter((li) => !li.querySelector('input'));
    expect(plain.length).toBe(3);
  });

  it('toggles the box the preview clicked', () => {
    expect(toggleTaskAtIndex(NOTE, 0)).toContain('[ ] sdafsadf');
    expect(toggleTaskAtIndex(NOTE, 1)).toContain('[x] sdfsdf');
  });

  it('renders exactly as many boxes as the toggler can address', () => {
    const html = marked.parse(normalizeBareTasks(NOTE), { async: false }) as string;
    const el = document.createElement('div');
    el.innerHTML = html;
    const rendered = el.querySelectorAll('input[type="checkbox"]').length;
    expect(toggleTaskAtIndex(NOTE, rendered - 1)).not.toBeNull();
    expect(toggleTaskAtIndex(NOTE, rendered)).toBeNull();
  });
});
