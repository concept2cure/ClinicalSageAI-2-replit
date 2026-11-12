/**
 * AnA over the data catalog (S2 step 4): list_project_documents with catalog:true reads the same catalog, scope and
 * grade as Vault → Data catalog; file_chat_upload_to_vault's source_id files through the data room's own filing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  searchDataRoom: vi.fn(), catalogProgramIds: vi.fn(), gradeSources: vi.fn(), fileDataRoomSources: vi.fn(), listVaultForCatalog: vi.fn(),
}));
vi.mock('../../clinical-regulatory-evidence/data-room-vault.js', () => ({ listVaultForCatalog: h.listVaultForCatalog }));
vi.mock('../../clinical-regulatory-evidence/data-room-search.js', async (original) => ({
  ...(await original<typeof import('../../clinical-regulatory-evidence/data-room-search.js')>()),
  searchDataRoom: h.searchDataRoom, catalogProgramIds: h.catalogProgramIds,
}));
vi.mock('../../clinical-regulatory-evidence/data-room-grade.js', () => ({ gradeSources: h.gradeSources }));
vi.mock('../../vault/vault-data-room-filing.js', () => ({ fileDataRoomSources: h.fileDataRoomSources }));

import { fileDataRoomSourceForAna, listDataCatalogForAna, orDataCatalog, orDataRoomFiling } from '../document-catalog-data-room';

const OPEN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const pins = vi.fn();
const executor = { query: pins } as never;
const scope = { programId: OPEN, userId: 3, orgId: 7, executor };
const source = (id: number, programId: string, extra: Record<string, unknown> = {}) => ({
  id, organizationId: 7, clientProgramId: programId, title: `s${id}`, isCurrent: true, version: '1.0', previousVersionId: null,
  projectName: programId === OPEN ? 'Open project' : 'Other project', studyName: null,
  metadata: { dossier: { evidenceKind: 'protocol', ctdSection: '5.3.5', suggestedFolder: 'module-5' } },
  provenance: { fileUploadId: `file_${id}` }, ...extra,
});
const grade = { grade: 'C', score: 71, cap: null, engine: 'data-room-grade v1', gradedAt: '2026-11-10T00:00:00.000Z',
  basis: [{ criterion: 'currency', points: 15, max: 15, detail: 'Current: no later capture replaced it.' }] };

beforeEach(() => {
  vi.clearAllMocks();
  h.catalogProgramIds.mockResolvedValue([OPEN, OTHER]);
  h.searchDataRoom.mockResolvedValue({ total: 2, currentTotal: 2, sources: [source(1, OPEN), source(2, OTHER)], facets: { project: [] } });
  h.gradeSources.mockResolvedValue(new Map([[1, grade], [2, grade]]));
  pins.mockResolvedValue({ rows: [{ evidence_ref: '2' }] });
  h.listVaultForCatalog.mockResolvedValue({ total: 0, documents: [], facets: { project: [], kind: [], ctd: [], folder: [] } });
});

describe('list_project_documents with catalog:true', () => {
  it('reads the projects the server resolves for this person, never ones the model names', async () => {
    const out = JSON.parse(await listDataCatalogForAna({ catalog: true, program_ids: [OTHER] }, scope));
    expect(h.catalogProgramIds).toHaveBeenCalledWith({ organizationId: 7, userId: 3 }, OPEN);
    expect(h.searchDataRoom.mock.calls[0][1]).toMatchObject({ programIds: [OPEN, OTHER] });
    expect(h.searchDataRoom.mock.calls[0][2]).toEqual({ userId: 3 });
    expect(out).toMatchObject({ ok: true, scope: { catalog: true, projects: 2 }, total: 2 });
  });

  it('reports the engine\'s grade and basis, which captures this project uses, and which it can file', async () => {
    const out = JSON.parse(await listDataCatalogForAna({ catalog: true }, scope));
    expect(out.items[0]).toMatchObject({ sourceId: 1, grade: { grade: 'C', score: 71, basis: ['currency 15/15: Current: no later capture replaced it.'] },
      usedInThisProject: false, fileable: true, ctdSection: '5.3.5', proposedFolder: 'module-5' });
    // Another project's capture is used here, and is filed from its own project, not this one.
    expect(out.items[1]).toMatchObject({ sourceId: 2, usedInThisProject: true, fileable: false, project: 'Other project' });
    expect(out.message).toMatch(/never set or change one/);
    expect(out.message).toMatch(/"Use in this project"/);
  });

  it('lists the Vault\'s documents of the same projects with the engine\'s grade, as the screen does', async () => {
    h.listVaultForCatalog.mockResolvedValue({ total: 1, facets: { project: [], kind: [], ctd: [], folder: [] }, documents: [{
      documentId: 'd1', title: 'Protocol v3', projectName: 'Other project', projectId: OTHER, evidenceKind: 'protocol', ctdSection: '5.3.5.1',
      folder: 'module-5', folderLabel: 'Module 5 · Clinical', placementStatus: 'confirmed', version: '3.0', grade }] });
    const out = JSON.parse(await listDataCatalogForAna({ catalog: true }, scope));
    expect(h.listVaultForCatalog.mock.calls[0]).toMatchObject([7, { programIds: [OPEN, OTHER] }]);
    expect(out).toMatchObject({ vaultTotal: 1, vaultDocuments: [{ documentId: 'd1', folder: 'Module 5 · Clinical', project: 'Other project', grade: { grade: 'C', score: 71 } }] });
    expect(out.message).toMatch(/2 captured file\(s\) and 1 Vault document\(s\)/);
    // A failed Vault read is said; the captures are still answered.
    h.listVaultForCatalog.mockRejectedValue(new Error('down'));
    const failed = JSON.parse(await listDataCatalogForAna({ catalog: true }, scope));
    expect(failed).toMatchObject({ ok: true, total: 2 });
    expect(failed.vaultUnavailable).toMatch(/could not be listed/);
    expect(failed.vaultDocuments).toBeUndefined();
  });

  it('refuses a narrowing to a project outside the person\'s catalog, and reads nothing', async () => {
    h.catalogProgramIds.mockResolvedValue([OPEN]);
    const out = JSON.parse(await listDataCatalogForAna({ catalog: true, project: OTHER }, scope));
    expect(out).toMatchObject({ ok: false, code: 'PROJECT_NOT_IN_CATALOG' });
    expect(h.searchDataRoom).not.toHaveBeenCalled();
  });

  it('needs an open project: the catalog spans its sponsor', async () => {
    const out = JSON.parse(await listDataCatalogForAna({ catalog: true }, { ...scope, programId: null }));
    expect(out).toMatchObject({ ok: false, code: 'NO_PROJECT' });
  });
});

describe('file_chat_upload_to_vault with source_id', () => {
  const p = { organizationId: 7, userId: 3, programId: OPEN };

  it('files through the data room\'s own filing, and says it awaits a person', async () => {
    h.fileDataRoomSources.mockResolvedValue({ ok: true, complete: true, items: [{ sourceId: 1, outcome: 'filed', documentId: 'd1', version: '1.0', placementStatus: 'suggested', folderLabel: 'Module 5', needsReview: false }] });
    const out = JSON.parse(await fileDataRoomSourceForAna(1, p));
    expect(h.fileDataRoomSources).toHaveBeenCalledWith({ ...p, sourceIds: [1] });
    expect(out).toMatchObject({ ok: true, documentId: 'd1', filing: { placementStatus: 'suggested' } });
    expect(out.message).toMatch(/awaiting a person.*not confirmed/);
  });

  it('passes on the filing\'s refusal as itself', async () => {
    h.fileDataRoomSources.mockResolvedValue({ ok: true, complete: false, items: [{ sourceId: 1, outcome: 'refused', code: 'SOURCE_SUPERSEDED', message: 'A later capture replaced this file. File the current one.' }] });
    expect(JSON.parse(await fileDataRoomSourceForAna(1, p))).toMatchObject({ ok: false, refused: true, code: 'SOURCE_SUPERSEDED' });
  });

  it('refuses a source id that is not one, before anything is filed', async () => {
    expect(JSON.parse(await fileDataRoomSourceForAna('file_9', p))).toMatchObject({ ok: false, code: 'INVALID_SOURCE' });
    expect(h.fileDataRoomSources).not.toHaveBeenCalled();
  });
});

describe('the two tools without the new inputs', () => {
  it('list_project_documents and file_chat_upload_to_vault answer exactly as before', async () => {
    const list = vi.fn(async () => 'documents'), file = vi.fn(async () => 'filed');
    expect(await orDataCatalog(list)({ limit: 5 })).toBe('documents');
    expect(await orDataCatalog(list)({ catalog: false })).toBe('documents');
    expect(await orDataRoomFiling(file)({ file_id: 'file_1', document_title: 't', document_type: 'OTHER' })).toBe('filed');
    expect(list).toHaveBeenCalledTimes(2);
    expect(file).toHaveBeenCalledTimes(1);
    expect(h.searchDataRoom).not.toHaveBeenCalled();
    expect(h.fileDataRoomSources).not.toHaveBeenCalled();
  });
});
