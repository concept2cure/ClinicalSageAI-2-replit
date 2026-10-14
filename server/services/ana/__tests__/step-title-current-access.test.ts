import { beforeEach, describe, expect, it, vi } from 'vitest';
const access = vi.hoisted(() => ({ scope: vi.fn(), current: vi.fn() }));
vi.mock('../catalog-scope', () => ({ catalogScope: access.scope }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: access.current }));
import { resolveStepDocumentTitles } from '../step-presentation';
const ID = 'e65c8f60-de71-4498-a4aa-ec0d54d0ce40';
const PROGRAM = '00acfd34-a751-410d-bf26-3085d79ad624';
const calls = [{ name: 'read_project_document', input: { document_id: ID } }];
const scope = { programId: null, accessibleScope: { scope: 'verified-accessible-programs', actor: { userId: 7, role: 'viewer' }, programIds: [PROGRAM], reconciliationRequired: false } };
beforeEach(() => { access.scope.mockReset(); access.current.mockReset().mockResolvedValue(undefined); });
describe('step titles use the current actor accessible programme set', () => {
  it('binds evaluated IDs before resolving a library title and rechecks before returning', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: ID, document_title: 'Accessible CSR' }] }) };
    access.scope.mockResolvedValue({ ...scope, executor: db });
    const ctx = { organizationId: 3, userId: 7, sqlClient: db };
    expect((await resolveStepDocumentTitles(calls, ctx)).get(ID)).toBe('Accessible CSR');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('d.program_id = ANY($3::uuid[])'), [[ID], 3, [PROGRAM]]);
    expect(access.current).toHaveBeenCalledWith(db, { organizationId: 3, userId: 7, programId: null }, scope.accessibleScope);
  });
  it('keeps a title generic if current access changes after the title query', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: ID, document_title: 'Formerly accessible CSR' }] }) };
    access.scope.mockResolvedValue({ ...scope, executor: db });
    access.current.mockRejectedValue(new Error('Permission changed'));
    expect((await resolveStepDocumentTitles(calls, { organizationId: 3, userId: 7, sqlClient: db })).size).toBe(0);
    expect(access.current).toHaveBeenCalledTimes(1);
  });
  it('performs no title lookup without the request database context', async () => {
    access.scope.mockResolvedValue({ error: 'Request context is required.', code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    expect((await resolveStepDocumentTitles(calls, { organizationId: 3, userId: 7 })).size).toBe(0);
  });
});
