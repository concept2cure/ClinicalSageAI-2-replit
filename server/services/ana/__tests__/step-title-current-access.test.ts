import { beforeEach, describe, expect, it, vi } from 'vitest';
const access = vi.hoisted(() => ({ scope: vi.fn(), current: vi.fn(), sourceCurrent: vi.fn() }));
vi.mock('../catalog-scope', () => ({ catalogScope: access.scope }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: access.current }));
// This suite checks composition, request identity and both final guards. Real
// canonical actor/anchor SQL remains in the PGlite and native access suites.
vi.mock('../source-read-scope', () => ({ revalidateAnaSourceReadScope: access.sourceCurrent }));
import { resolveStepDocumentTitles } from '../step-presentation';
const ID = 'e65c8f60-de71-4498-a4aa-ec0d54d0ce40';
const PROGRAM = '00acfd34-a751-410d-bf26-3085d79ad624';
const calls = [{ name: 'read_project_document', input: { document_id: ID } }];
const scope = { programId: null,
  admittedScope: { organizationId: 3, userId: 7, role: 'viewer', projectId: null, programId: null, accessibleProgramIds: [PROGRAM], actorFiltered: true },
  accessibleScope: { scope: 'verified-accessible-programs', actor: { userId: 7, role: 'viewer' }, programIds: [PROGRAM], reconciliationRequired: false } };
beforeEach(() => {
  access.scope.mockReset(); access.current.mockReset().mockResolvedValue(undefined);
  access.sourceCurrent.mockReset().mockResolvedValue(scope.admittedScope);
});
describe('step titles use the current actor accessible programme set', () => {
  it('binds evaluated IDs before resolving a library title and rechecks before returning', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: ID, document_title: 'Accessible CSR', organization_id: 3, program_id: PROGRAM }] }) };
    access.scope.mockResolvedValue({ ...scope, executor: db });
    const ctx = { organizationId: 3, userId: 7, sqlClient: db };
    expect((await resolveStepDocumentTitles(calls, ctx)).get(ID)).toBe('Accessible CSR');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('d.program_id = ANY($3::uuid[])'), [[ID], 3, [PROGRAM]]);
    expect(access.current).toHaveBeenCalledWith(db, { organizationId: 3, userId: 7, programId: null }, scope.accessibleScope);
    expect(access.sourceCurrent).toHaveBeenCalledTimes(2);
    expect(access.sourceCurrent).toHaveBeenLastCalledWith(db, scope.admittedScope);
  });
  it('keeps a title generic if current access changes after the title query', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: ID, document_title: 'Formerly accessible CSR', organization_id: 3, program_id: PROGRAM }] }) };
    access.scope.mockResolvedValue({ ...scope, executor: db });
    access.current.mockRejectedValue(new Error('Permission changed'));
    expect((await resolveStepDocumentTitles(calls, { organizationId: 3, userId: 7, sqlClient: db })).size).toBe(0);
    expect(access.current).toHaveBeenCalledTimes(1);
  });
  it('performs no title lookup without the request database context', async () => {
    access.scope.mockResolvedValue({ error: 'Request context is required.', code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    expect((await resolveStepDocumentTitles(calls, { organizationId: 3, userId: 7 })).size).toBe(0);
  });
  it('refuses upstream scope without the stricter canonical source pin', async () => {
    const db = { query: vi.fn() };
    access.scope.mockResolvedValue({ programId: null, executor: db, accessibleScope: scope.accessibleScope });
    expect((await resolveStepDocumentTitles(calls, { organizationId: 3, userId: 7, sqlClient: db })).size).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
  });
  it('withdraws the title when canonical source access changes after the title query', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: ID, document_title: 'Formerly accessible CSR', organization_id: 3, program_id: PROGRAM }] }) };
    access.scope.mockResolvedValue({ ...scope, executor: db });
    access.sourceCurrent.mockResolvedValueOnce(scope.admittedScope).mockRejectedValueOnce(new Error('Source permission changed'));
    expect((await resolveStepDocumentTitles(calls, { organizationId: 3, userId: 7, sqlClient: db })).size).toBe(0);
    expect(access.current).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
