/**
 * The Vault's documents in the data catalog (S2, 2026-11-11): graded by the same engine from the Vault's own
 * facts, read only for the caller's verified projects, merged into the catalog's facets, and checked before use.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ pool: { query: vi.fn() } }));
const h = vi.hoisted(() => ({ readBytes: vi.fn() }));
vi.mock('../../../routes/c2c/project-vault.js', () => ({ readVerifiedVaultBytes: h.readBytes }));
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
beforeEach(() => { h.readBytes.mockReset(); });
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

describe('a dataset filed in the Vault', () => {
  const advs = (over: Record<string, unknown> = {}) => row({ file_name: 'advs.csv', mime_type: 'text/csv', file_size: '120', cataloged: true, dataset_profile: null,
    storage_version_id: 'v1', storage_provider: 'local', s3_key: 'k', ...over });
  const CSV = Buffer.from('STUDYID,SITEID,USUBJID,TRTP,TRTA,PARAMCD,PARAM,ADT,AVISIT,AVAL,BASE,CHG\nS1,701,S1-001,Drug,Drug,SYSBP,Systolic,2014-01-02,Week 2,120,118,2\n');

  it('is profiled once from the Vault\'s verified bytes, stored on its catalog record, and graded for conformance', async () => {
    h.readBytes.mockResolvedValue({ ok: true, bytes: CSV });
    const query = vi.fn(async (sql: string) => (/^UPDATE vault\.document_catalog/.test(sql) ? { rows: [] } : answer([advs()])));
    const page = await listVaultForCatalog(7, { programId: P, programIds: [P] }, { query });
    expect(h.readBytes).toHaveBeenCalledWith({ storageVersionId: 'v1', storageKey: 'k', organizationId: 7, storageProvider: 'local' }, 'a'.repeat(64), row().id);
    const update = query.mock.calls.find(c => /^UPDATE vault\.document_catalog/.test(String(c[0]))) as unknown as [string, unknown[]];
    expect(update[1].slice(1)).toEqual([row().id, 'a'.repeat(64), 7]);
    expect(JSON.parse(String(update[1][0]))).toMatchObject({ format: 'csv', tables: [{ cdisc: { standard: 'ADaM', domain: 'BDS' } }] });
    expect(page.documents[0].grade.basis.find(b => b.criterion === 'conformance'))
      .toMatchObject({ points: 15, detail: expect.stringMatching(/^1 of 1 table pass the ADaM validator/) });
    expect(page.documents[0].dataset).toEqual({ format: 'csv', tableCount: 1, tables: [{ name: 'advs.csv', standard: 'ADaM', domain: 'BDS', columns: 12, rows: 1 }] });
  });

  it('reads no bytes for a document already profiled, not a dataset format, with no catalog record, or too large', async () => {
    const profiled = { format: 'csv', tables: [{ name: 'advs.csv', columns: [{ name: 'USUBJID', type: 'text' }], cdisc: { standard: null, domain: null } }], tableCount: 1 };
    const query = vi.fn(async () => answer([advs({ dataset_profile: profiled }), advs({ id: 'b', file_name: 'protocol.pdf', mime_type: 'application/pdf' }),
      advs({ id: 'c', cataloged: false }), advs({ id: 'd', file_size: String(200 * 1024 * 1024) })]));
    await listVaultForCatalog(7, { programId: P, programIds: [P] }, { query });
    expect(h.readBytes).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('profiles at most two per read, and a file whose bytes cannot be read stays listed as not read', async () => {
    h.readBytes.mockResolvedValue({ ok: false, status: 404, error: 'gone' });
    const query = vi.fn(async () => answer([advs({ id: 'a1', file_name: 'a.xpt' }), advs({ id: 'a2', file_name: 'b.xpt' }), advs({ id: 'a3', file_name: 'c.xpt' })]));
    const page = await listVaultForCatalog(7, { programId: P, programIds: [P] }, { query });
    expect(h.readBytes).toHaveBeenCalledTimes(2);
    expect(page.documents).toHaveLength(3);
    expect(page.documents[0].grade.basis.find(b => b.criterion === 'conformance')?.detail).toMatch(/structure has not been read here/);
  });

  it('remembers bytes that are not a dataset, so they are read once', async () => {
    h.readBytes.mockResolvedValue({ ok: true, bytes: Buffer.from('{"title":"a manifest, not a dataset"}') });
    const query = vi.fn(async (sql: string) => (/^UPDATE/.test(sql) ? { rows: [] } : answer([advs({ file_name: 'bundle.json', mime_type: 'application/json' })])));
    const page = await listVaultForCatalog(7, { programId: P, programIds: [P] }, { query });
    const update = query.mock.calls.find(c => /^UPDATE/.test(String(c[0]))) as unknown as [string, unknown[]];
    expect(JSON.parse(String(update[1][0]))).toMatchObject({ format: null, tables: [] });
    expect(page.documents[0].grade.basis.find(b => b.criterion === 'conformance')).toMatchObject({ points: null });
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
