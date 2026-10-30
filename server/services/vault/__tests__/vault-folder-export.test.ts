/** Planning an export preserves the cabinet's selection and refuses partial plans. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planFolderExport } from '../vault-folder-export';

const fixture = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('../vault-seal.service', () => ({
  readSealDocumentRows: vi.fn(async () => fixture.rows),
  VaultSealError: class extends Error {},
}));
vi.mock('../vault-seal-archive', () => ({ readArchiveAuditExtract: vi.fn() }));
vi.mock('../vault-filing.service', async (original) => ({
  ...await original<typeof import('../vault-filing.service')>(),
  resolveVaultView: vi.fn(async () => 'pharma'),
}));

const confirmed = { id: 'doc-confirmed', folder_id: 'module-3', placement_status: 'confirmed', document_title: 'Confirmed specification' };
const suggested = { id: 'doc-suggested', folder_id: 'module-3', placement_status: 'suggested', document_title: 'Suggested stability protocol' };
const unfiled = { id: 'doc-unfiled', folder_id: 'module-3', placement_status: 'unfiled', document_title: 'Unfiled report' };
const input = { organizationId: 17, programId: 'project-17', folderId: 'module-3' };
const database = (files: Array<Record<string, unknown>>) => ({
  query: vi.fn(async (sql: string) => ({ rows: sql.includes('FROM vault.documents') ? files : [{ name: 'Synthetic project' }] })),
});

beforeEach(() => { fixture.rows = [confirmed, suggested, unfiled]; });

describe('folder export planning', () => {
  it('includes confirmed and suggested filings while excluding Unfiled rows with an old folder id', async () => {
    const q = database([confirmed, suggested, unfiled]);
    const plan = await planFolderExport(q, input);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.inFolder.map(({ row }) => row.id)).toEqual(['doc-confirmed', 'doc-suggested']);
    expect(q.query.mock.calls[0][0]).toContain('d.organization_id = $3');
  });

  it('refuses a planned document that disappears instead of silently exporting only the remainder', async () => {
    const plan = await planFolderExport(database([suggested]), input);
    expect(plan).toMatchObject({ ok: false, status: 409, code: 'EXPORT_DOCUMENT_CHANGED' });
    if (plan.ok) throw new Error('A partial export was admitted');
    expect(plan.message).toContain('Confirmed specification');
    expect(plan.message).toContain('Nothing was sent.');
  });

  it('treats an all-Unfiled selection as empty even when folder ids remain', async () => {
    fixture.rows = [unfiled, { ...unfiled, id: 'doc-no-status', placement_status: null }];
    const q = database(fixture.rows);
    const plan = await planFolderExport(q, input);
    expect(plan).toMatchObject({ ok: false, status: 409, code: 'FOLDER_EMPTY' });
    expect(q.query).not.toHaveBeenCalled();
  });
});
