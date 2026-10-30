/**
 * A manifest for the Vault upload list (gap 7, "manifest/CSV mapping into
 * Vault"). A line gives a file its fields only when every value is one the
 * Vault has; a blank cell leaves the field; a column the manifest does not
 * know refuses the manifest. Nothing is uploaded by applying one.
 */
import { describe, expect, it } from 'vitest';
import { applyManifest, manifestNote, manifestOf, parseManifest } from '../surfaces/vaultUploadManifest';
import type { StagedFile } from '../surfaces/VaultUploadStaging';

const FOLDERS = [
  { id: 'module-3', label: 'Module 3 · Quality' },
  { id: 'module-5', label: 'Module 5 · Clinical' },
];

function row(key: string, path: string, over: Partial<StagedFile> = {}): StagedFile {
  const name = path.split('/').pop()!;
  return {
    key, path, file: new File(['x'], name), title: name.replace(/\.[^.]+$/, ''), documentType: 'OTHER',
    classification: '', folderId: '', evidenceKind: '', ctdSection: '', status: null, ...over,
  };
}

const ROWS = () => [
  row('a', 'library/quality/spec-dp.pdf'),
  row('b', 'library/clinical/csr-101.pdf'),
  row('c', 'library/clinical/protocol-101.pdf'),
];

const lines = (csv: string) => {
  const parsed = parseManifest(csv);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.lines;
};

describe('reading a manifest', () => {
  it('takes its columns by heading, in any order and case, and skips blank lines', () => {
    const parsed = parseManifest('﻿folder,FILE,Document Type\r\nModule 3 · Quality,spec-dp.pdf,Report\r\n\r\n');
    expect(parsed).toEqual({ ok: true, lines: [{ line: 2, values: { folder: 'Module 3 · Quality', file: 'spec-dp.pdf', documentType: 'Report' } }] });
  });

  it('refuses a column it does not know, naming it, so a misspelt Folder cannot leave every file Unfiled', () => {
    const parsed = parseManifest('File,Folderr\nspec-dp.pdf,Module 3 · Quality\n');
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toContain('Its column "Folderr" is not a column the Vault takes.');
  });

  it('refuses a manifest with no File column, and one with a column twice', () => {
    expect(parseManifest('Title,Folder\nA,module-3\n')).toEqual({ ok: false, reason: 'It has no File column, so no line can be matched to a file.' });
    expect(parseManifest('File,Type,Document type\na.pdf,Report,Report\n')).toEqual({ ok: false, reason: 'It has two Document type columns.' });
  });

  it('says when the text is not CSV', () => {
    const parsed = parseManifest('File,Title\n"unclosed,quote\n');
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toMatch(/^It could not be read as CSV: /);
  });
});

describe('applying a manifest to the list', () => {
  it("gives each named file its fields, by the reader's names or the Vault's codes", () => {
    const out = applyManifest(ROWS(), lines([
      'File,Title,Document type,Classification,Folder,Evidence kind,CTD section',
      'library/quality/spec-dp.pdf,Drug product specification,Report,Controlled,Module 3 · Quality,Specification,3.2.P.5.1',
      'csr-101.pdf,CSR study 101,csr,confidential,module-5,csr,5.3.5.1',
    ].join('\n')), FOLDERS);
    expect(out.refused).toEqual([]);
    expect(Object.fromEntries(out.patches)).toEqual({
      a: { title: 'Drug product specification', documentType: 'REPORT', classification: 'CONTROLLED', folderId: 'module-3', evidenceKind: 'spec', ctdSection: '3.2.P.5.1' },
      b: { title: 'CSR study 101', documentType: 'CSR', classification: 'CONFIDENTIAL', folderId: 'module-5', evidenceKind: 'csr', ctdSection: '5.3.5.1' },
    });
    expect(out.unnamed).toEqual(['library/clinical/protocol-101.pdf']);
  });

  it('applies no part of a line with any value the Vault does not have, and says which', () => {
    const out = applyManifest(ROWS(), lines([
      'File,Title,Document type,Folder',
      'spec-dp.pdf,Specification,Synopsis,Module 3 · Quality',
      'csr-101.pdf,CSR,CSR,Module 9 · Archive',
    ].join('\n')), FOLDERS);
    expect(out.patches.size).toBe(0);
    expect(out.refused).toEqual([
      { line: 2, file: 'spec-dp.pdf', reason: '"Synopsis" is not a Vault document type' },
      { line: 3, file: 'csr-101.pdf', reason: '"Module 9 · Archive" is not a folder in this project\'s Vault' },
    ]);
  });

  it('leaves a field as it is when its cell is blank', () => {
    const rows = [row('a', 'spec-dp.pdf', { title: 'Kept title', folderId: 'module-3' })];
    const out = applyManifest(rows, lines('File,Title,Folder,CTD section\nspec-dp.pdf,,,3.2.P.5.1\n'), FOLDERS);
    expect(out.patches.get('a')).toEqual({ ctdSection: '3.2.P.5.1' });
  });

  it('refuses an evidence kind or CTD section with no folder, as the row itself offers them only with one', () => {
    const out = applyManifest(ROWS(), lines('File,CTD section\nspec-dp.pdf,3.2.P.5.1\n'), FOLDERS);
    expect(out.refused[0].reason).toBe('an evidence kind or CTD section is recorded only with a folder, and neither this line nor the row gives one');
  });

  it('refuses a file the list does not have, a name two files share, a file named twice, and one already recorded', () => {
    const rows = [
      row('a', 'site-1/consent.pdf'), row('b', 'site-2/consent.pdf'), row('c', 'ib.pdf'),
      row('d', 'stored.pdf', { status: { state: 'stored', version: '1.0', folderLabel: null, placement: 'unfiled', already: false } }),
    ];
    const out = applyManifest(rows, lines([
      'File,Title', 'missing.pdf,X', 'consent.pdf,Y', 'site-2/consent.pdf,Consent site 2', 'ib.pdf,IB', 'ib.pdf,IB again', 'stored.pdf,Z',
    ].join('\n')), FOLDERS);
    expect(out.refused.map((r) => [r.line, r.reason])).toEqual([
      [2, 'missing.pdf is not in the list'],
      [3, 'more than one file in the list is named consent.pdf; give its path as the list shows it'],
      [6, 'line 5 already names this file'],
      [7, 'it is already recorded; its fields are changed with Edit details or Move'],
    ]);
    expect(Object.fromEntries(out.patches)).toEqual({ b: { title: 'Consent site 2' }, c: { title: 'IB' } });
    expect(out.unnamed).toEqual(['site-1/consent.pdf']);
  });

  it('says what it did in one paragraph, naming the CSV, and that nothing was uploaded', () => {
    const out = applyManifest(ROWS(), lines('File,Document type\nspec-dp.pdf,Report\ncsr-101.pdf,Synopsis\n'), FOLDERS);
    expect(manifestNote(out, 'library.csv')).toBe('library.csv: 1 of 2 lines applied. Nothing has been uploaded; check the rows, then upload. '
      + '1 line not applied: line 3 (csr-101.pdf): "Synopsis" is not a Vault document type. '
      + '1 file in the list is not in the CSV and keeps its fields: library/clinical/protocol-101.pdf.');
  });

  it('does not call a CSV applied when no line of it was, and refuses a line that sets nothing', () => {
    const out = applyManifest(ROWS(), lines('File,Document type\nspec-dp.pdf,Synopsis\ncsr-101.pdf,\n'), FOLDERS);
    expect(out.refused.map((r) => r.reason)).toEqual(['"Synopsis" is not a Vault document type', 'it gives no field to set']);
    expect(manifestNote(out, 'library.csv')).toMatch(/^library\.csv was not applied: no line could be applied\. Nothing in the list changed\. 2 lines not applied: /);
  });

  it('names at most five, and how many more, in a CSV of many files', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(`r${i}`, `f${i}.pdf`));
    const out = applyManifest(rows, lines('File,Title\nf0.pdf,First\n'), FOLDERS);
    expect(manifestNote(out, 'x.csv')).toContain('7 files in the list are not in the CSV and keep their fields: f1.pdf, f2.pdf, f3.pdf, f4.pdf, f5.pdf, and 2 more files.');
  });
});

describe('downloading the list as a manifest', () => {
  it('writes every file not yet recorded with its fields, and reads back to the same fields', () => {
    const rows = [
      row('a', 'library/quality/spec-dp.pdf', { title: 'Spec, drug product', documentType: 'REPORT', classification: 'CONTROLLED', folderId: 'module-3', evidenceKind: 'spec', ctdSection: '3.2.P.5.1' }),
      row('b', 'library/clinical/csr-101.pdf'),
    ];
    const csv = manifestOf(rows, FOLDERS);
    // The byte-order mark makes a spreadsheet read "·" as written.
    expect(csv.split('\r\n')[0]).toBe('\uFEFFFile,Title,Document type,Classification,Folder,Evidence kind,CTD section');
    expect(csv).toContain('"Spec, drug product"');
    const back = applyManifest(rows.map((r) => ({ ...r, title: '', documentType: 'OTHER' as const, classification: '' as const, folderId: '', evidenceKind: '', ctdSection: '' })), lines(csv), FOLDERS);
    expect(back.refused).toEqual([]);
    expect(back.patches.get('a')).toEqual({ title: 'Spec, drug product', documentType: 'REPORT', classification: 'CONTROLLED', folderId: 'module-3', evidenceKind: 'spec', ctdSection: '3.2.P.5.1' });
  });

  it('guards a cell a spreadsheet would run as a formula, and reads it back as written', () => {
    const rows = [row('a', '=HYPERLINK.pdf', { title: '=1+1' })];
    const csv = manifestOf(rows, FOLDERS);
    expect(csv.split('\r\n')[1].startsWith("'=HYPERLINK.pdf,'=1+1,")).toBe(true);
    expect(applyManifest(rows, lines(csv), FOLDERS).patches.get('a')).toMatchObject({ title: '=1+1' });
  });
});
