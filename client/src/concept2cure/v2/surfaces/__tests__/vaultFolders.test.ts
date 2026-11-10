/** The cabinet's folders as the Vault lists them (S6, 2026-11-06). */
import { describe, expect, it } from 'vitest';
import { binderFolderFor, cabinetFolderOptions, folderParentOf, openFolderMatches, indentedLabel, newFolderParentOf, personFolderOf, planTasksForFolder } from '../vaultFolders';

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

describe('the plan in the Vault (S6 step 3)', () => {
  const tasks = [
    { id: 'ds', name: 'Draft drug substance', ctd: ['3.2.S'] },
    { id: 'mfg', name: 'Manufacturing', ctd: ['3.2.S.2', '3.2.P.3'] },
    { id: 'tox', name: 'Toxicology', ctd: ['4.2.3'] },
  ];
  it('lists the tasks bound at or below a binder heading, with their status', () => {
    expect(planTasksForFolder('cab-bn:3.2.S', tasks, { ds: 'done' })).toEqual([
      { id: 'ds', name: 'Draft drug substance', status: 'done', codes: ['3.2.S'] },
      { id: 'mfg', name: 'Manufacturing', status: 'todo', codes: ['3.2.S.2'] },
    ]);
    expect(planTasksForFolder('cab-bn:M4', tasks).map((t) => t.id)).toEqual(['tox']);
    expect(planTasksForFolder('cab-uf:4', tasks)).toEqual([]);
  });
  it('opens a code at its own heading, or the nearest above it the binder holds', () => {
    const tree = new Set(['cab-bn:3.2.S', 'cab-bn:M3', 'cab-bn:M5']);
    const has = (id: string) => tree.has(id);
    expect(binderFolderFor('3.2.S', has)).toBe('cab-bn:3.2.S');
    expect(binderFolderFor('3.2.S.4.1', has)).toBe('cab-bn:3.2.S');
    expect(binderFolderFor('3.2.P.1', has)).toBe('cab-bn:M3');
    expect(binderFolderFor('4.2.3', has)).toBeNull();
  });
});

describe('where a folder sits, and which one an action opens', () => {
  it('names the folder a cabinet folder is in', () => {
    expect(folderParentOf(cabinet as never, 'cab-uf:4')).toBe('bn:5.3');
    expect(folderParentOf(cabinet as never, 'cab-bn:M5')).toBe('');
    expect(folderParentOf(cabinet as never, 'cab-uf:99')).toBe('');
  });
  it('an exact id never falls back to a name match', () => {
    const found = [{ folder: { id: 'cab-bn:5.3', label: 'Clinical study reports' } }, { folder: { id: 'cab-uf:4', label: '5.3 notes' } }];
    expect(openFolderMatches(found, 'bn:5.3.5', '5.3').map((f) => f.folder.id)).toEqual(['cab-bn:5.3']);
    expect(openFolderMatches(found, 'bn:4.2', '5.3')).toEqual([]);
    expect(openFolderMatches(found, '', '5.3 notes').map((f) => f.folder.id)).toEqual(['cab-uf:4']);
  });
});
