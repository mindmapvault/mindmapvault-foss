// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PasswordInput } from '../PasswordInput';

let root: Root | null = null;
let container: HTMLDivElement | null = null;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(createElement(PasswordInput, props)); });
  const input = container.querySelector('input')!;
  const toggle = container.querySelector<HTMLButtonElement>('[data-testid="toggle-password"]')!;
  return { input, toggle };
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  root = null; container = null;
});

describe('PasswordInput', () => {
  it('starts masked', () => {
    expect(render().input.type).toBe('password');
  });

  it('reveals and re-masks on click', () => {
    const { input, toggle } = render();
    act(() => { toggle.click(); });
    expect(input.type).toBe('text');
    act(() => { toggle.click(); });
    expect(input.type).toBe('password');
  });

  it('never submits the form it sits in', () => {
    expect(render().toggle.type).toBe('button');
  });

  it('passes autoComplete through so password managers still see the field', () => {
    expect(render({ autoComplete: 'new-password' }).input.autocomplete).toBe('new-password');
  });

  it('keeps the caller class and adds room for the toggle', () => {
    const { input } = render({ className: 'my-field' });
    expect(input.className).toContain('my-field');
    expect(input.className).toContain('pr-11');
  });

  it('labels itself for screen readers, and tracks state', () => {
    const { toggle } = render();
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    act(() => { toggle.click(); });
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('points the toggle at the input it controls', () => {
    const { input, toggle } = render();
    expect(toggle.getAttribute('aria-controls')).toBe(input.id);
    expect(input.id).toBeTruthy();
  });
});
