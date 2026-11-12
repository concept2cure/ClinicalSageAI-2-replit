/**
 * The Vault's documents in the data catalog (S2, 2026-11-11): graded by the same engine from the Vault's own
 * facts, read only for the caller's verified projects, merged into the catalog's facets, and checked before use.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../vault/vault-filing.service.js', () => ({
  folderLabel: (view: string, folder: string) => (view === 'biotech' && folder === 'module-5' ? 'Module 5 · Clinical' : ''),
  resolveVaultView: async (programId: string) => (programId === P ? 'biotech' : 'device'),
}));

import { gradeCapture } from '../data-room-grade';
import { listVaultForCatalog, mergeCatalogFacets, vaultDocumentForUse, vaultGradeFacts } from '../data-room-vault';

const P = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', program_id: P, project_name: 'Open project', document_title: 'Protocol v3',
  file_name: 'protocol.pdf', mime_type: 'application/pdf', file_size: '2048', version: '3.0', content_hash: 'a'.repeat(64),
  created_by: 9, created_at: '2026-11-01T00:00:00Z', folder_id: 'module-5', ctd_section: '5.3.5.1', evidence_kind: 'protocol',
  placement_status: 'confirmed', processing_status: 'COMPLETED', text_available: true, original_file_available: true,
  catalog_state: null, verdict: null, ...over,
});
const answer = (documents: unknown[], facets: unknown[] = []) => ({ rows: [{ total: documents.length, documents, facets }] });

describe('a Vault document\'s grade', () => {
  it('is the catalog\'s one engine over the Vault\'s own facts', () => {
    const g = gradeCapture(vaultGradeFacts(row()));
    expect(g).toMatchObject({ grade: 'B', score: 82, engine: 'data-room-grade v1', cap: null });
    expect(g.basis.find((b) => b.criterion === 'integrity')).toMatchObject({ points: 15 });
    // Said in the Vault's words: it was added and filed, not captured.
    expect(g.basis.map((b) => b.detail).slice(0, 3)).toEqual([
      'SHA-256 recorded when it was added to Vault; who added it is recorded; filed in Vault.',
      'original bytes held; held under the Vault’s controls; fixity not yet checked.',
      'Current: no later version replaced it.',
    ]);
    // Confirmed by a person, and its fixity proven: the facts move the grade, nothing else does.
    expect(gradeCapture(vaultGradeFacts(row({ catalog_state: 'confirmed', verdict: 'verified' })))).toMatchObject({ grade: 'A', score: 100 });
  });

  it('says a dataset file\'s structure was not read, instead of calling it not a dataset', () => {
    const line = gradeCapture(vaultGradeFacts(row({ file_name: 'adlbc.xpt' }))).basis.find((b) => b.criterion === 'conformance');
    expect(line).toMatchObject({ points: 0, max: 15 });
    expect(line?.detail).toMatch(/structure has not been read here/);
    expect(gradeCapture(vaultGradeFacts(row())).basis.find((b) => b.criterion === 'conformance')?.points).toBeNull();
  });

  it('grades a failed fixity check D whatever else is recorded', () => {
    expect(gradeCapture(vaultGradeFacts(row({ verdict: 'mismatch' }))).grade).toBe('D');
  });
});

describe('listVaultForCatalog', () => {
  it('reads only the caller\'s projects, binds every narrowing, and names a folder in the project\'s own Vault view', async () => {
    const query = vi.fn(async () => answer([row()], [{ facet: 'folder', value: 'module-5', label: null, n: 1 }, { facet: 'project', value: P, label: 'Open project', n: 1 }]));
    const page = await listVaultForCatalog(7, { programId: P, programIds: [P, OTHER.toUpperCase()], kind: 'protocol', ctd: '5.3', q: 'dose' }, { query });
    const [sql, args] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(args).toEqual([7, [P, OTHER], null, 'protocol', '5.3', null, null, null, 'dose', 200, 0]);
    // The catalog's own page: its limit (never more than 200) and offset.
    await listVaultForCatalog(7, { programId: P, programIds: [P], limit: 50, offset: 100 }, { query });
    expect((query.mock.calls[1] as unknown as [string, unknown[]])[1].slice(-2)).toEqual([50, 100]);
    expect(sql).not.toMatch(/protocol|dose/);
    expect(page.total).toBe(1);
    expect(page.documents[0]).toMatchObject({ documentId: row().id, projectId: P, title: 'Protocol v3', folder: 'module-5', folderLabel: 'Module 5 · Clinical',
      fileSize: 2048, grade: { grade: 'B', score: 82 } });
    expect(page.facets.folder).toEqual([{ value: 'module-5', label: 'Module 5 · Clinical', count: 1 }]);
  });

  it('matches no Vault document for a narrowing a Vault document cannot answer, and reads nothing', async () => {
    const query = vi.fn();
    expect(await listVaultForCatalog(7, { programId: P, programIds: [P], study: 4 }, { query })).toMatchObject({ total: 0, documents: [] });
    expect(await listVaultForCatalog(7, { programId: P, programIds: [P], status: 'extracted' }, { query })).toMatchObject({ total: 0 });
    expect(await listVaultForCatalog(7, { programId: P }, { query })).toMatchObject({ total: 0 });
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a read that answers a document outside the admitted projects', async () => {
    const query = vi.fn(async () => answer([row({ program_id: OTHER })]));
    await expect(listVaultForCatalog(7, { programId: P, programIds: [P] }, { query })).rejects.toThrow(/outside its admitted projects/);
  });
});

describe('mergeCatalogFacets', () => {
  it('counts a value once across captures and Vault documents, and leaves the study facet as the captures have it', () => {
    const merged = mergeCatalogFacets(
      { project: [], study: [{ value: '4', label: 'S-4', count: 2 }], kind: [{ value: 'protocol', label: 'protocol', count: 1 }], ctd: [], folder: [] },
      { project: [], kind: [{ value: 'protocol', label: 'protocol', count: 3 }, { value: 'report', label: 'report', count: 5 }], ctd: [], folder: [] },
    );
    expect(merged.kind).toEqual([{ value: 'report', label: 'report', count: 5 }, { value: 'protocol', label: 'protocol', count: 4 }]);
    expect(merged.study).toEqual([{ value: '4', label: 'S-4', count: 2 }]);
  });
});

describe('vaultDocumentForUse', () => {
  it('answers the document\'s own title for a current document of the caller\'s catalog', async () => {
    const query = vi.fn(async () => ({ rows: [{ title: 'Protocol v3', superseded: false }] }));
    expect(await vaultDocumentForUse(7, [P], row().id, { query })).toEqual({ ok: true, title: 'Protocol v3' });
    expect((query.mock.calls[0] as unknown as [string, unknown[]])[1]).toEqual([row().id, 7, [P]]);
  });
  it('gives one answer for absent and inaccessible, and refuses a replaced version', async () => {
    expect(await vaultDocumentForUse(7, [P], row().id, { query: async () => ({ rows: [] }) })).toMatchObject({ ok: false, status: 404, code: 'DOCUMENT_NOT_FOUND' });
    expect(await vaultDocumentForUse(7, [P], row().id, { query: async () => ({ rows: [{ title: 't', superseded: true }] }) })).toMatchObject({ ok: false, status: 409, code: 'DOCUMENT_SUPERSEDED' });
  });
});
