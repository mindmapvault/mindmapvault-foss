import { describe, expect, it } from 'vitest';
import { buildExportFileBaseName } from '../exportFileName';

const name = (over: Partial<Parameters<typeof buildExportFileBaseName>[0]> = {}) =>
  buildExportFileBaseName({ fallback: 'vault', ...over });

describe('buildExportFileBaseName', () => {
  it('prefers the explicit name, then the title, then the fallback', () => {
    expect(name({ baseTitle: 'Explicit', title: 'Title' })).toBe('Explicit');
    expect(name({ title: 'Title' })).toBe('Title');
    expect(name({})).toBe('vault');
  });

  /** A title of only spaces is no title; the export must still have a name. */
  it('falls through a whitespace-only title to the next candidate', () => {
    expect(name({ baseTitle: '  ', title: 'Real' })).toBe('Real');
    expect(name({ baseTitle: '  ', title: '' })).toBe('vault');
    expect(name({ title: '   ' })).toBe('vault');
  });

  it('replaces characters a filesystem will not take', () => {
    expect(name({ title: 'a/b\\c:d*e?f"g<h>i|j' })).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(name({ title: '  spaced   out  ' })).toBe('spaced out');
  });

  it('appends a sequential version label', () => {
    expect(name({ title: 'guide', versionLabel: 'v12' })).toBe('guide-v12');
    expect(name({ title: 'guide', versionLabel: 'V 7' })).toBe('guide-v7');
  });

  /**
   * Local mode has no version history and labels versions with a date. An
   * unanchored match would read "v 6. 8. 2026" as version 6 and stamp the day
   * of the month onto every export.
   */
  it('ignores a date-shaped version label', () => {
    expect(name({ title: 'guide', versionLabel: 'v 6. 8. 2026' })).toBe('guide');
    expect(name({ title: 'guide', versionLabel: '' })).toBe('guide');
    expect(name({ title: 'guide', versionLabel: null })).toBe('guide');
  });

  it('does not repeat a version the title already carries', () => {
    expect(name({ title: 'guide-v3', versionLabel: 'v3' })).toBe('guide-v3');
    expect(name({ title: 'guide_v3', versionLabel: 'v3' })).toBe('guide_v3');
    expect(name({ title: 'guide v3', versionLabel: 'v3' })).toBe('guide v3');
  });

  it('still appends when the title merely contains the token', () => {
    expect(name({ title: 'v3 guide', versionLabel: 'v3' })).toBe('v3 guide-v3');
    expect(name({ title: 'guidev3', versionLabel: 'v3' })).toBe('guidev3-v3');
  });

  /** The editor builds a name and hands it on; applying it again must not grow it. */
  it('is idempotent', () => {
    const once = name({ title: 'my/guide', versionLabel: 'v3' });
    const twice = name({ baseTitle: once, versionLabel: 'v3' });
    expect(twice).toBe(once);
  });
});
