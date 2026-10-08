/**
 * IND forms — POST /:formId/artifact project-identity resolution.
 *
 * Pins the id-space unblock for "Save to dossier": window.C2C_PROJECT.id is a
 * regulatory_programs UUID, and this route used to demand a numeric projectId,
 * so the panel could never persist a governed record for a program-spine
 * project. Now:
 *   • projectId (numeric) — unchanged governed path: org-scoped project check,
 *     concept2cure_artifacts insert, 201.
 *   • projectIdent (program UUID or code) — resolved org-scoped against
 *     regulatory_programs, then to its project record (the C1 anchor,
 *     projects.regulatory_program_id); with one, the same governed path.
 *   • a program with NO project record is refused 409 PROGRAM_NOT_ANCHORED and
 *     nothing is written (P-20 follow-up, aac603a1b). It used to answer 200
 *     `governed:false, audited:true` over an "unplaced" audit row: a success
 *     status over a save that placed nothing. That branch was removed by
 *     decision; ind-forms.contract.integration.test.ts pins the refusal against
 *     real tables, and this file pins it at the handler.
 *   • the anchor lookup is strict: one that cannot complete is a 500, never read
 *     as "no project record". An unresolvable ident is a 404 that leaks nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockSelectRows, mockInsertReturning, auditLog } = vi.hoisted(() => ({
  mockSelectRows: vi.fn((): unknown[] => []),
  mockInsertReturning: vi.fn(async () => [{ id: 5 }]),
  // logAction resolves an AuditWriteResult (server/services/auditService.ts)
  // and the governed path dereferences it (.persisted / .error), so the mock
  // must resolve the real success shape — resolving undefined makes the route
  // throw a TypeError and 500.
  auditLog: vi.fn(async (): Promise<{ persisted: boolean; chained: boolean; tamperProof: boolean; error?: string }> => ({ persisted: true, chained: true, tamperProof: true })),
}));

// Fake drizzle db, built inside vi.hoisted per the 510k-device-routes idiom.
const { fakeDb } = vi.hoisted(() => ({
  fakeDb: {
    select: vi.fn(),
    insert: vi.fn(),
  } as any,
}));
vi.mock('../../server/db', () => ({ db: fakeDb }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => fakeDb }));

vi.mock('../../server/middleware/auth', () => ({
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../server/services/auditService', () => ({ default: { logAction: auditLog } }));
vi.mock('../../server/services/provenance/artifact-provenance', () => ({
  recordArtifactProvenanceDrizzle: vi.fn(async () => {}),
}));

/*
 * A self-referential chain, so every drizzle builder shape this router uses
 * lands on the same `limit`.
 *
 * The program lookup reads the sponsor from the program's ORGANISATION, so the
 * chain carries a leftJoin between from() and where(). The previous literal
 * offered only `.from().where().limit()`, so `.leftJoin` was undefined, the
 * TypeError was swallowed by `resolveProgramIdent`'s own `catch`, and EVERY
 * program-ident case below resolved to null and 404'd — five assertions,
 * including the fail-closed audit one, were failing against a mock defect
 * rather than against the route.
 *
 * Self-referential rather than a shape-by-shape literal (the other half of this
 * merge) because the failure being repaired is a mock that did not offer a link
 * the builder uses. Enumerating the shapes reproduces that risk every time the
 * query grows a clause; returning the same chain from every link cannot.
 */
fakeDb.select = vi.fn(() => {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => mockSelectRows()),
  };
  return chain;
});
fakeDb.insert = vi.fn(() => ({
  values: vi.fn(() => ({ returning: mockInsertReturning })),
}));

import indFormsRoutes from '../../server/routes/ind-forms.routes';

function artifactHandler() {
  const layer = (indFormsRoutes as any).stack.find(
    (l: any) => l.route?.path === '/:formId/artifact' && l.route?.methods?.post,
  );
  if (!layer) throw new Error('Missing route POST /:formId/artifact');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

function makeReq(body: Record<string, unknown>) {
  const req = createMockRequest({ params: { formId: 'FDA_1571' }, body }) as any;
  req.user = { id: 3, organizationId: 2 };
  req.tenantContext = { organizationId: 2 };
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertReturning.mockResolvedValue([{ id: 5 }]);
});

describe('POST /:formId/artifact — numeric legacy path (unchanged)', () => {
  it('persists a governed artifact for a numeric projectId', async () => {
    mockSelectRows.mockReturnValue([{ id: 7 }]); // the org-scoped projects row
    const req = makeReq({ projectId: 7, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ formId: 'FDA_1571', projectId: 7 });
    expect(String(payload.artifactId)).toMatch(/^artifact_indform_1571_/);
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
  });

  it('a numeric projectIdent string takes the same governed path', async () => {
    mockSelectRows.mockReturnValue([{ id: 7 }]);
    const req = makeReq({ projectIdent: '7', sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
  });
});

describe('POST /:formId/artifact — program-spine ident (anchored, or refused)', () => {
  it('refuses 409 PROGRAM_NOT_ANCHORED for a program with no project record — nothing inserted, no "unplaced" audit row', async () => {
    // The program resolves in the caller's org; its anchor lookup finds no
    // projects row (a non-integer id is not an anchor). Before aac603a1b this
    // answered 200 governed:false over an "ind_form.artifact.unplaced" audit row.
    mockSelectRows.mockReturnValue([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }]);
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error.code).toBe('PROGRAM_NOT_ANCHORED');
    expect(payload.error.message).toMatch(/Nothing was saved/);
    expect(payload).not.toHaveProperty('governed');
    expect(payload).not.toHaveProperty('audited');
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('registers a GOVERNED artifact when the program HAS a C1 project anchor', async () => {
    // Document Identity Contract slice C1 gives a uuid program a numeric
    // `projects` row through `projects.regulatory_program_id`. Three selects run
    // now: the program lookup, the anchor lookup, then the org re-check on the
    // anchored project.
    mockSelectRows
      .mockReturnValueOnce([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }])
      .mockReturnValueOnce([{ id: 4242 }])
      .mockReturnValueOnce([{ id: 4242 }]);

    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    // This is the Module-1 form a pilot user actually saves: the v2 wizard hands
    // out program idents, so before C1 was wired in EVERY such save landed
    // unregistered. It must now be a real governed artifact row.
    expect(res.status).toHaveBeenCalledWith(201);
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ formId: 'FDA_1571', projectId: 4242 });
    expect(String(payload.artifactId)).toMatch(/^artifact_indform_1571_/);
    // And it must NOT also claim the registry placement is pending.
    expect(auditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ind_form.artifact.unplaced' }),
    );
  });

  it('a program whose anchor lookup answers "none" is refused, not saved unplaced', async () => {
    // A program with no anchored project row is a fact about the data. It has
    // no dossier, so the save is refused — the governed:false branch is gone.
    mockSelectRows
      .mockReturnValueOnce([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }])
      .mockReturnValueOnce([]);

    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('PROGRAM_NOT_ANCHORED');
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('an anchor lookup that cannot complete is a 500 — never read as "no project record", never a save', async () => {
    mockSelectRows
      .mockReturnValueOnce([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }])
      .mockImplementationOnce(() => {
        throw new Error('connection reset');
      });
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('PROGRAM_NOT_ANCHORED');
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('404s an ident that resolves to nothing in the caller org', async () => {
    mockSelectRows.mockReturnValue([]);
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it.each([
    ['rejects', () => auditLog.mockRejectedValueOnce(new Error('audit store down'))],
    ['resolves unpersisted', () => auditLog.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: 'audit store down' })],
  ])('the refusal claims nothing when the audit store %s — no audited:true, no write', async (_label, arrange) => {
    // The two fail-closed cases the unplaced branch had. With that branch gone
    // the refusal writes no audit row at all, so whatever the audit store does
    // cannot turn it into a claimed save.
    arrange();
    mockSelectRows.mockReturnValue([{ id: UUID, code: 'BX-204', name: 'BX-204 CGM' }]);
    const req = makeReq({ projectIdent: UUID, sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('"audited":true');
    expect(fakeDb.insert).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('400s when neither projectId nor projectIdent is supplied', async () => {
    const req = makeReq({ sponsorName: 'Acme Bio' });
    const res = createMockResponse() as any;

    await artifactHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.message).toContain('projectIdent');
  });
});
