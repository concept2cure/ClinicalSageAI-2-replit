import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ require: vi.fn(), actor: vi.fn() }));
vi.mock('../../c2c/current-program-access', async importOriginal => ({
  ...await importOriginal<typeof import('../../c2c/current-program-access')>(),
  requireCurrentProgramAccess: access.require,
  readCurrentProgramActor: access.actor,
}));

import { loadDocumentForOrg } from '../document-catalog.service';
import { ProgramReadAccessError } from '../../c2c/current-program-access';

const ORG = 27;
const USER = 73;
const ID = '00d800b2-306a-4381-8ca1-9658ca05c223';
const PROGRAM = '036a52a4-fb2d-4355-b7a9-b82801499c46';
const PRIVATE = { id: ID, program_id: PROGRAM, document_title: 'Private clinical source',
  document_code: 'CSR-PRIVATE', file_name: 'private.pdf', document_type: 'CSR',
  content_hash: 'd'.repeat(64), extracted_text: 'Private stored scientific prose.', catalog_status: 'extracted',
  char_count: 31, catalog_content_hash: 'd'.repeat(64), mime_type: null, disposition: null, original_file_available: true,
  folder_id: null, evidence_kind: null, ctd_section: null, placement_status: 'unfiled',
  extraction_method: null, extraction_confidence: null, extraction_error: null, word_count: null, page_count: null,
  document_kind: null, purpose: null, summary: null, key_data: null, cataloged_at: null, catalog_state: null, proposed_model: null };

function executor() {
  return { query: vi.fn(async (sql: string, _values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> => {
    if (/SELECT d\.id::text, d\.program_id::text/.test(sql)) return { rows: [{ id: ID, program_id: PROGRAM, organization_id: ORG }] };
    return { rows: [PRIVATE] };
  }) };
}

beforeEach(() => {
  access.require.mockReset().mockResolvedValue({ actor: { userId: USER, role: 'viewer' }, programId: PROGRAM, projectId: 41, clientWorkspaceId: null });
  access.actor.mockReset().mockResolvedValue({ userId: USER, role: 'viewer' });
});

describe('public catalogue admission cannot be omitted', () => {
  it('rejects an omitted actor property before reading private source data', async () => {
    const db = executor();
    db.query.mockResolvedValue({ rows: [{ ...PRIVATE, organization_id: ORG, is_current: true }] });
    access.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Current actor is required.'));
    await expect(Reflect.apply(loadDocumentForOrg, undefined, [ID, ORG, { executor: db, includeText: true }]))
      .rejects.toMatchObject({ code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('requires a request executor before actor admission or source SQL', async () => {
    await expect(Reflect.apply(loadDocumentForOrg, undefined, [ID, ORG, { userId: USER, includeText: true }]))
      .rejects.toMatchObject({ code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    expect(access.actor).not.toHaveBeenCalled();
  });
});

describe('interactive catalogue reads require current source-parent access', () => {
  it('refuses a private source before any title, catalog or text query', async () => {
    const db = executor();
    access.require.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Current project access does not permit this operation.'));
    const opts = { executor: db, userId: USER, includeText: true };
    await expect(loadDocumentForOrg(ID, ORG, opts)).rejects.toMatchObject({ code: 'PROJECT_PERMISSION_DENIED' });
    expect(db.query.mock.calls.every(([sql]) => !sql.includes('d.document_title') && !sql.includes('d.extracted_text'))).toBe(true);
  });

  it('allows a fresh viewer after source-parent admission on the same executor', async () => {
    const db = executor();
    const opts = { executor: db, userId: USER, includeText: true };
    expect(await loadDocumentForOrg(ID, ORG, opts)).toMatchObject({ id: ID, extractedText: PRIVATE.extracted_text });
    expect(access.require).toHaveBeenCalledWith(db, expect.objectContaining({ organizationId: ORG, userId: USER, programId: PROGRAM }));
  });

  it('refuses a missing actor rather than falling back to tenant-wide access', async () => {
    const db = executor();
    access.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Current actor is required.'));
    const opts = { executor: db, userId: undefined, includeText: true };
    await expect(loadDocumentForOrg(ID, ORG, opts)).rejects.toMatchObject({ code: 'PROJECT_ACTOR_ACCESS_DENIED' });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses an unavailable sharing check before content instead of returning an empty source', async () => {
    const db = executor();
    access.require.mockRejectedValue(new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current access cannot be verified.'));
    const opts = { executor: db, userId: USER, includeText: true };
    await expect(loadDocumentForOrg(ID, ORG, opts)).rejects.toMatchObject({ status: 503 });
    expect(db.query.mock.calls.every(([sql]) => !sql.includes('d.extracted_text'))).toBe(true);
  });
  it('does not query source content for a different requested programme', async () => {
    const db = executor();
    expect(await loadDocumentForOrg(ID, ORG, { executor: db, userId: USER, includeText: true, programId: ID })).toBeNull();
    expect(access.require).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('refuses a permission change observed after reading, before returning private content', async () => {
    const db = executor();
    access.require.mockResolvedValueOnce({ actor: { userId: USER, role: 'viewer' }, programId: PROGRAM })
      .mockRejectedValueOnce(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Access was revoked.'));
    await expect(loadDocumentForOrg(ID, ORG, { executor: db, userId: USER, includeText: true })).rejects.toMatchObject({ code: 'PROJECT_PERMISSION_DENIED' });
    expect(access.require).toHaveBeenCalledTimes(2);
  });

  it('binds content to the admitted programme and retains current-only eligibility predicates', async () => {
    const db = executor();
    await loadDocumentForOrg(ID, ORG, { executor: db, userId: USER, currentOnly: true });
    const [sql, values] = db.query.mock.calls[1];
    expect(sql).toContain('d.program_id = $3::uuid');
    expect(sql).toContain('d.organization_id = $2');
    expect(sql).toContain('NULL::text AS extracted_text');
    expect(values).toEqual([ID, ORG, PROGRAM]);
  });

  it('requires reconciliation for an unassigned recorded tenant only after current parent admission', async () => {
    const db = executor();
    db.query.mockResolvedValueOnce({ rows: [{ id: ID, program_id: PROGRAM, organization_id: null }] });
    await expect(loadDocumentForOrg(ID, ORG, { executor: db, userId: USER })).rejects.toMatchObject({ status: 409, code: 'VAULT_TENANT_RECONCILIATION_REQUIRED' });
    expect(access.require).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('does not disclose tenant reconciliation for a private source parent', async () => {
    const db = executor();
    db.query.mockResolvedValueOnce({ rows: [{ id: ID, program_id: PROGRAM, organization_id: null }] });
    access.require.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Current project access does not permit this operation.'));
    await expect(loadDocumentForOrg(ID, ORG, { executor: db, userId: USER })).rejects.toMatchObject({ status: 403, code: 'PROJECT_PERMISSION_DENIED' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

});
