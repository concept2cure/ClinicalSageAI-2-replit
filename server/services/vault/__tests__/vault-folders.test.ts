/** The project's folder index (S6, 2026-11-06): binder from the rule pack, presets it replaces, folders people made. */
import { describe, expect, it } from 'vitest';
import { binderNodes, buildFolderIndex, folderNameRefusal } from '../vault-folders';

const pack = [
  { key: 'M3', label: 'Module 3 · Quality', path_order: 1 },
  { key: '3.2.S', label: 'Drug substance', parent_key: 'M3', path_order: 2 },
  { key: '3.2.S.4', label: 'Control of drug substance', parent_key: '3.2.S', path_order: 3, mandatory: true },
  { key: 'M5', label: 'Module 5 · Clinical', path_order: 4 },
  { key: '5.3', label: 'Clinical study reports', parent_key: 'M5', path_order: 5 },
];
const binder = { docType: 'ind', agency: 'fda', version: 'v', label: 'IND × FDA', nodes: binderNodes(pack) };
const person = [{ id: 7, folderId: 'uf:7', name: 'Pivotal study', parentId: null, parentKey: 'bn:5.3', createdBy: 'Ana', createdAt: null, updatedAt: null }];

describe('the folder index', () => {
  const index = buildFolderIndex('pharma', { binder }, person);

  it('replaces the module presets the binder holds, and keeps the others', () => {
    expect(index.presets.map((p) => p.id)).toEqual(['module-1', 'module-2', 'module-4', 'sequences', 'corresp', 'shared']);
  });

  it('admits binder headings, presets and a person’s folders, and nothing else', () => {
    for (const id of ['bn:3.2.S.4', 'bn:M5', 'module-3', 'corresp', 'uf:7']) expect(index.has(id)).toBe(true);
    for (const id of ['bn:9.9', 'uf:8', 'k510', '']) expect(index.has(id)).toBe(false);
  });

  it('shows a module preset’s row at its CTD heading, or at the module when the binder has no deeper one', () => {
    expect(index.treeFolderOf({ folder_id: 'module-3', placement_status: 'suggested', ctd_section: '3.2.S.4.1' })).toBe('bn:3.2.S.4');
    expect(index.treeFolderOf({ folder_id: 'module-3', placement_status: 'confirmed', ctd_section: '3.2.P.1' })).toBe('bn:M3');
    expect(index.treeFolderOf({ folder_id: 'module-3', placement_status: 'unfiled', ctd_section: '3.2.S.4' })).toBeNull();
    expect(index.treeFolderOf({ folder_id: 'uf:7', placement_status: 'confirmed' })).toBe('uf:7');
  });

  it('names a heading by number, and records a CTD section only for a CTD-numbered heading', () => {
    expect(index.label('bn:3.2.S.4')).toBe('3.2.S.4 Control of drug substance');
    expect(index.label('uf:7')).toBe('Pivotal study');
    expect(index.ctdSectionOf('bn:3.2.S.4')).toBe('3.2.S.4');
    expect(index.ctdSectionOf('bn:M3')).toBeNull();
    expect(index.ctdSectionOf('uf:7')).toBeNull();
  });

  it('without a binder, is the view’s presets as before', () => {
    const plain = buildFolderIndex('pharma', { binder: null, reason: 'none' }, []);
    expect(plain.presets.map((p) => p.id)).toContain('module-3');
    expect(plain.treeFolderOf({ folder_id: 'module-3', placement_status: 'confirmed', ctd_section: '3.2.S.4' })).toBe('module-3');
    expect(plain.binderMissing).toBe('none');
  });
});

describe('a folder name', () => {
  it('is required, bounded and has no path separator', () => {
    expect(folderNameRefusal('  Pivotal   study ')).toEqual({ name: 'Pivotal study' });
    expect(folderNameRefusal('')).toHaveProperty('refusal');
    expect(folderNameRefusal('a/b')).toHaveProperty('refusal');
    expect(folderNameRefusal('x'.repeat(121))).toHaveProperty('refusal');
  });
});
