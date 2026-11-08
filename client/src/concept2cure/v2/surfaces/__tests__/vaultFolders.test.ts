/** The cabinet's folders as the Vault lists them (S6, 2026-11-06). */
import { describe, expect, it } from 'vitest';
import { cabinetFolderOptions, indentedLabel, newFolderParentOf, personFolderOf } from '../vaultFolders';

const cabinet = {
  id: 'cabinet', code: '', label: 'Filing binder',
  children: [
    { id: 'cab-unfiled', code: '', label: 'Unfiled', children: [] },
    { id: 'cab-bn:M5', code: '', label: 'Module 5', children: [
      { id: 'cab-bn:5.3', code: '5.3', label: 'Clinical study reports', children: [
        { id: 'cab-uf:4', code: '', label: 'Pivotal study', kind: 'person', children: [] },
      ] },
    ] },
    { id: 'cab-other-view', code: '', label: 'Other view', children: [] },
  ],
};

describe('vaultFolders', () => {
  it('lists every fileable folder at its depth, never a review queue', () => {
    const opts = cabinetFolderOptions(cabinet as never);
    expect(opts.map((o) => [o.id, o.depth])).toEqual([['bn:M5', 0], ['bn:5.3', 1], ['uf:4', 2]]);
    expect(opts[1].label).toBe('5.3 Clinical study reports');
    expect(indentedLabel(opts[2])).toBe('    Pivotal study');
  });
  it('knows a person’s folder and where a new folder goes', () => {
    expect(personFolderOf('cab-uf:4')).toBe('uf:4');
    expect(personFolderOf('cab-bn:5.3')).toBeNull();
    expect(newFolderParentOf('cab-bn:5.3')).toBe('bn:5.3');
    expect(newFolderParentOf('cab-unfiled')).toBe('');
    expect(newFolderParentOf('sec-doc-1-5.3')).toBe('');
  });
});
