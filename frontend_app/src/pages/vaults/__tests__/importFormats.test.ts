import { describe, expect, it } from 'vitest';
import { IMPORT_FORMATS, IMPORT_MENU_ITEMS, vaultTitleFromFileName, type ImportFormatId } from '../importFormats';

/**
 * The title derivation was written out four times with four different regexes,
 * which is exactly where a format quietly stops stripping its own extension.
 */

describe('vaultTitleFromFileName', () => {
  const strip = (name: string, id: ImportFormatId) =>
    vaultTitleFromFileName(name, IMPORT_FORMATS.find((f) => f.id === id)!.extensions);

  it('names the vault after the file, without its extension', () => {
    expect(strip('Roadmap.md', 'md')).toBe('Roadmap');
    expect(strip('Roadmap.mm', 'mm')).toBe('Roadmap');
    expect(strip('Roadmap.wxml', 'wxml')).toBe('Roadmap');
    expect(strip('Roadmap.xmind', 'xmind')).toBe('Roadmap');
  });

  it('matches the extension case-insensitively', () => {
    expect(strip('Roadmap.MD', 'md')).toBe('Roadmap');
    expect(strip('Roadmap.XMind', 'xmind')).toBe('Roadmap');
  });

  it('accepts either extension WiseMapping exports under', () => {
    expect(strip('Plan.wxml', 'wxml')).toBe('Plan');
    expect(strip('Plan.xml', 'wxml')).toBe('Plan');
  });

  it('strips only the final extension', () => {
    expect(strip('notes.md.md', 'md')).toBe('notes.md');
    expect(strip('v1.2.mm', 'mm')).toBe('v1.2');
  });

  it('leaves a name that does not carry the extension alone', () => {
    expect(strip('Roadmap.txt', 'md')).toBe('Roadmap.txt');
  });

  it('falls back when the file is nothing but its extension', () => {
    expect(strip('.md', 'md')).toBe('Imported vault');
    expect(strip('', 'md')).toBe('Imported vault');
  });
});

describe('IMPORT_FORMATS', () => {
  it('has a unique id per format', () => {
    const ids = IMPORT_FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every format its own failure wording', () => {
    const labels = IMPORT_FORMATS.map((f) => f.errorLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('IMPORT_MENU_ITEMS', () => {
  /**
   * The menu is deliberately not one-to-one with the formats: FreeMind and
   * FreePlane are two names people look for and one `.mm` reader. Collapsing
   * the menu onto the format list would silently drop an entry.
   */
  it('lists five entries for four formats', () => {
    expect(IMPORT_MENU_ITEMS).toHaveLength(5);
    expect(new Set(IMPORT_MENU_ITEMS.map((i) => i.format)).size).toBe(IMPORT_FORMATS.length);
  });

  it('sends FreeMind and FreePlane to the same reader', () => {
    const mm = IMPORT_MENU_ITEMS.filter((i) => i.format === 'mm').map((i) => i.label);
    expect(mm).toEqual(['FreeMind', 'FreePlane']);
  });

  it('points every entry at a format that exists', () => {
    const ids = new Set(IMPORT_FORMATS.map((f) => f.id));
    for (const item of IMPORT_MENU_ITEMS) expect(ids.has(item.format)).toBe(true);
  });
});
