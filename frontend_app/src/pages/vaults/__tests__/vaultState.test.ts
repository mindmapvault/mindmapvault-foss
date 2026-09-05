import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_VERSIONS,
  buildVaultDrafts,
  deriveVaultState,
  labelsEqual,
  normalizeEncryptionMode,
  normalizeHexColor,
  normalizeSharingMode,
  normalizeVaultLabels,
  sameRenameContext,
  vaultColorStorageKey,
  vaultLabelsStorageKey,
} from '../vaultState';

/**
 * Characterisation tests: these assert what the page does today, so collapsing
 * the two copies of this derivation can be shown to change nothing.
 */

describe('normalizeHexColor', () => {
  it('keeps a six-digit hex colour, in either case', () => {
    expect(normalizeHexColor('#AABBCC')).toBe('#AABBCC');
    expect(normalizeHexColor('#aabbcc')).toBe('#aabbcc');
  });

  it('falls back for anything else', () => {
    for (const bad of [undefined, '', 'red', '#abc', '#gggggg', '#aabbccdd', 'aabbcc']) {
      expect(normalizeHexColor(bad)).toBe('#334155');
    }
  });
});

describe('normalizeSharingMode / normalizeEncryptionMode', () => {
  it('admits exactly one non-default value each', () => {
    expect(normalizeSharingMode('shared')).toBe('shared');
    expect(normalizeEncryptionMode('re-encrypted')).toBe('re-encrypted');
  });

  it('treats everything else as the safe default', () => {
    for (const bad of [undefined, '', 'Shared', 'public', 'private']) {
      expect(normalizeSharingMode(bad)).toBe('private');
    }
    for (const bad of [undefined, '', 'standard', 'reencrypted']) {
      expect(normalizeEncryptionMode(bad)).toBe('standard');
    }
  });
});

describe('normalizeVaultLabels', () => {
  it('trims, lower-cases and de-duplicates, keeping first-seen order', () => {
    expect(normalizeVaultLabels(['  Work ', 'work', 'HOME', 'work'])).toEqual(['work', 'home']);
  });

  it('drops empties and non-strings, and defends against a non-array', () => {
    expect(normalizeVaultLabels(['a', '', '   ', 7 as never, null as never])).toEqual(['a']);
    expect(normalizeVaultLabels(undefined)).toEqual([]);
    expect(normalizeVaultLabels('work' as never)).toEqual([]);
  });

  /** The other repos reserve `__board__`-shaped labels. Nothing is reserved
   *  here, but a label that looks like it must still survive unchanged. */
  it('leaves an underscore-wrapped label alone', () => {
    expect(normalizeVaultLabels(['__board__', 'notes'])).toEqual(['__board__', 'notes']);
  });
});

describe('labelsEqual', () => {
  it('is order-sensitive, because the list is a sequence the user arranges', () => {
    expect(labelsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(labelsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(labelsEqual(['a'], ['a', 'b'])).toBe(false);
    expect(labelsEqual([], [])).toBe(true);
  });
});

describe('vaultColorStorageKey', () => {
  /** Persisted in localStorage: changing the shape resets everyone's colours. */
  it('is the key existing installs already hold', () => {
    expect(vaultColorStorageKey('abc')).toBe('vault-color-abc');
  });
});

describe('deriveVaultState', () => {
  const vault = (over: Partial<Parameters<typeof deriveVaultState>[0]> = {}) =>
    ({ id: 'v1', ...over });

  it('routes a vault to the editor', () => {
    expect(deriveVaultState(vault(), 0).path).toBe('/vaults/v1');
  });

  it('reads shared from the record', () => {
    expect(deriveVaultState(vault({ vault_sharing_mode: 'shared' }), 0).isShared).toBe(true);
  });

  /**
   * The case the two copies existed to get right: a vault whose record still
   * says private but which has live shares is shared.
   */
  it('lets a live share outrank a private record', () => {
    const state = deriveVaultState(vault({ vault_sharing_mode: 'private' }), 2);
    expect(state.persistedSharingMode).toBe('private');
    expect(state.isShared).toBe(true);
  });

  it('is private with no shares and nothing on the record', () => {
    expect(deriveVaultState(vault(), 0).isShared).toBe(false);
  });
});

describe('sameRenameContext', () => {
  const ctx = (over: Partial<Parameters<typeof sameRenameContext>[0]> = {}) => ({
    map: { id: 'v1' },
    renamingId: null as string | null,
    renameValue: '',
    renaming: false,
    ...over,
  });

  it('ignores the draft text for a vault that is not being renamed', () => {
    const prev = ctx({ renamingId: 'other', renameValue: 'a' });
    const next = ctx({ renamingId: 'other', renameValue: 'ab' });
    // Typing in another vault's name must not re-render this one.
    expect(sameRenameContext(prev, next)).toBe(true);
  });

  it('follows the draft text for the vault being renamed', () => {
    const prev = ctx({ renamingId: 'v1', renameValue: 'a' });
    const next = ctx({ renamingId: 'v1', renameValue: 'ab' });
    expect(sameRenameContext(prev, next)).toBe(false);
  });

  it('notices a rename starting or finishing on this vault', () => {
    expect(sameRenameContext(ctx({ renamingId: null }), ctx({ renamingId: 'v1' }))).toBe(false);
    expect(sameRenameContext(ctx({ renamingId: 'v1' }), ctx({ renamingId: null }))).toBe(false);
  });

  it('follows the in-flight flag while this vault is being renamed', () => {
    const prev = ctx({ renamingId: 'v1', renaming: false });
    const next = ctx({ renamingId: 'v1', renaming: true });
    expect(sameRenameContext(prev, next)).toBe(false);
  });
});

describe('vaultLabelsStorageKey', () => {
  /** Persisted in localStorage, like the colour key. */
  it('is the key existing local-mode installs already hold', () => {
    expect(vaultLabelsStorageKey('abc')).toBe('vault-labels-abc');
  });
});

describe('buildVaultDrafts', () => {
  const drafts = (record = {}, options = {}) =>
    buildVaultDrafts(record, { title: 'T', note: '', color: '#334155', ...options });

  it('seeds the draft note from the saved note, so an edit has something to revert to', () => {
    const d = drafts({}, { note: 'hello' });
    expect(d.vaultNote).toBe('hello');
    expect(d.draftNote).toBe('hello');
  });

  it('carries the title through, including the no-keys case', () => {
    expect(drafts({}, { title: 'Roadmap' }).title).toBe('Roadmap');
    expect(drafts({}, { title: null }).title).toBeNull();
  });

  it('normalises the labels it was given', () => {
    expect(drafts({ vault_labels: [' Work ', 'work'] }).draftLabels).toEqual(['work']);
  });

  it('falls back to this device\'s labels only when the record has none', () => {
    expect(drafts({ vault_labels: ['server'] }, { localLabels: ['local'] }).draftLabels).toEqual(['server']);
    expect(drafts({}, { localLabels: ['local'] }).draftLabels).toEqual(['local']);
    expect(drafts({}).draftLabels).toEqual([]);
  });

  it('normalises the modes the record reports', () => {
    expect(drafts({ vault_sharing_mode: 'shared' }).draftSharingMode).toBe('shared');
    expect(drafts({ vault_sharing_mode: 'nonsense' }).draftSharingMode).toBe('private');
    expect(drafts({ vault_encryption_mode: 're-encrypted' }).draftEncryptionMode).toBe('re-encrypted');
  });

  it('keeps at least one version, whatever the record says', () => {
    expect(drafts({ max_versions: 12 }).draftMaxVersions).toBe(12);
    expect(drafts({}).draftMaxVersions).toBe(DEFAULT_MAX_VERSIONS);
    expect(drafts({ max_versions: 0 }).draftMaxVersions).toBe(1);
    expect(drafts({ max_versions: -5 }).draftMaxVersions).toBe(1);
  });

  it('starts with no save in flight', () => {
    expect(drafts().metaSaving).toBe(false);
  });
});
