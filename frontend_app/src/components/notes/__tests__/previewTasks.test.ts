// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

describe('preview task markup survives sanitizing', () => {
  it('keeps enabled checkboxes and their index', () => {
    const raw = marked.parse('- [ ] a\n- [x] b', { async: false }) as string;
    const container = document.createElement('div');
    container.innerHTML = raw;
    container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box, i) => {
      box.removeAttribute('disabled');
      box.classList.add('mm-notes-task');
      box.setAttribute('data-task-index', String(i));
      box.closest('li')?.classList.add('mm-notes-task-item');
    });
    const clean = DOMPurify.sanitize(container.innerHTML, {
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|data|attachment):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });
    const out = document.createElement('div');
    out.innerHTML = clean;
    const boxes = out.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    expect(boxes[0].hasAttribute('disabled')).toBe(false);
    expect(boxes[0].getAttribute('data-task-index')).toBe('0');
    expect(boxes[1].getAttribute('data-task-index')).toBe('1');
    expect(boxes[1].hasAttribute('checked')).toBe(true);
    expect(out.querySelectorAll('li.mm-notes-task-item').length).toBe(2);
  });
});
