/**
 * eCTD compile — :projectIdent resolution (numeric legacy id | program UUID |
 * program code), org-scoped, mirroring the eSTAR meta.ident contract.
 *
 * Pins the id-space unblock: window.C2C_PROJECT.id is a regulatory_programs
 * UUID, and these routes used to 400 anything non-numeric ("Valid project ID
 * required"), dead-ending the whole surface. Now the SERVER resolves the ident:
 *   numeric → the legacy project_sections store (unchanged behavior);
 *   UUID/code → the org's regulatory_programs row — which has NO linked
 *     section store, so readiness/validation/compile run against an honestly
 *     empty section set and every response says WHY (the
 *     SECTION_STORE_UNLINKED finding / blocker), never a silent 0% and never
 *     fabricated sections.
 * An ident that resolves to nothing in the caller's org is a 404 that leaks
 * nothing; a missing org context is a 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { poolQuery, programRows, sectionRows, historyRows } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  programRows: vi.fn<[], unknown[]>(() => []),
  sectionRows: vi.fn<[], unknown[]>(() => []),
  historyRows: vi.fn<[], unknown[]>(() => []),
}));

// The route reads the shared pool; requestDb is mocked alongside (per the
// 510k-device-routes idiom) so nothing falls through to a real client.
vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));

import ectdCompileRoutes from '../../server/routes/ectd-compile';

function getHandler(path: string, method: 'get' | 'post') {
  const layer = (ectdCompileRoutes as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

const UUID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
const PROGRAM = { id: UUID, code: 'BX-204', name: 'BX-204 CGM' };

function makeReq(overrides: Record<string, unknown> = {}) {
  const req = createMockRequest(overrides) as any;
  req.tenantId = 7; // numeric org context (createMockRequest's default is non-numeric)
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM regulatory_programs')) return { rows: programRows() };
    if (sql.includes('FROM project_sections')) return { rows: sectionRows() };
    if (sql.includes('FROM ectd_compilations')) return { rows: historyRows() };
    if (sql.includes('INSERT INTO ectd_compilations')) return { rows: [] };
    return { rows: [] };
  });
});

describe('GET /:projectIdent/status — ident resolution', () => {
  it('keeps the numeric legacy path: sections load by project id, org-scoped', async () => {
    sectionRows.mockReturnValue([
      { section_code: '1.1', title: 'Forms', status: 'approved', module: 'm1', required: true, word_count: 10, updated_at: '2026-01-01T00:00:00Z' },
    ]);
    const req = makeReq({ params: { projectIdent: '42' } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 42, projectIdent: '42', programId: null }),
    );
    const sectionsCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('FROM project_sections'));
    expect(sectionsCall![1]).toEqual([42, 7]);
    // No program lookup happens for a numeric ident.
    expect(poolQuery.mock.calls.some((c) => String(c[0]).includes('FROM regulatory_programs'))).toBe(false);
  });

  it('resolves a program UUID org-scoped and reports the unlinked section store honestly', async () => {
    programRows.mockReturnValue([PROGRAM]);
    const req = makeReq({ params: { projectIdent: UUID } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ projectId: null, projectIdent: UUID, programId: UUID, overallReadiness: 0, submissionReady: false });
    // The blocker names WHY readiness is 0% — no silent empty, no fabrication.
    expect(payload.submissionBlockers.join(' ')).toContain('no linked section-tracking store');
    // The lookup was UUID-keyed and org-scoped.
    const programCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('FROM regulatory_programs'));
    expect(String(programCall![0])).toContain('id = $1');
    expect(programCall![1]).toEqual([UUID, 7]);
    // And no project_sections read is even attempted (integer FK — no store).
    expect(poolQuery.mock.calls.some((c) => String(c[0]).includes('FROM project_sections'))).toBe(false);
  });

  it('resolves a program CODE ident (non-UUID, non-numeric)', async () => {
    programRows.mockReturnValue([PROGRAM]);
    const req = makeReq({ params: { projectIdent: 'BX-204' } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    const programCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('FROM regulatory_programs'));
    expect(String(programCall![0])).toContain('code = $1');
    expect(programCall![1]).toEqual(['BX-204', 7]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ programId: UUID }));
  });

  it('404s an ident outside the caller org without leaking data', async () => {
    programRows.mockReturnValue([]);
    const req = makeReq({ params: { projectIdent: UUID } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('BX-204');
  });

  it('401s without an org context before any resolution', async () => {
    const req = createMockRequest({ params: { projectIdent: UUID } }) as any; // non-numeric org
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

describe('POST /:projectIdent/validate — program idents get the unlinked-store finding', () => {
  it('prepends SECTION_STORE_UNLINKED as a blocking error', async () => {
    programRows.mockReturnValue([PROGRAM]);
    const req = makeReq({ params: { projectIdent: UUID }, body: { region: 'FDA' } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/validate', 'post')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.valid).toBe(false);
    expect(payload.results[0]).toMatchObject({ rule: 'SECTION_STORE_UNLINKED', severity: 'error' });
    expect(payload).toMatchObject({ projectId: null, programId: UUID });
    // The finding explains the unlinked store without naming a schema object —
    // table names must never reach a response body (BP-W0-5).
    expect(JSON.stringify(payload)).not.toContain('project_sections');
  });
});

describe('POST /:projectIdent/compile — program idents compile honestly (failed, with reasons)', () => {
  it('records the compilation under the program label and returns failed + blockers', async () => {
    programRows.mockReturnValue([PROGRAM]);
    const req = makeReq({ params: { projectIdent: UUID }, body: { submissionType: 'initial', region: 'FDA' } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/compile', 'post')(req, res);

    const payload = res.json.mock.calls[0][0];
    // Every required section is genuinely missing → failed, never a fabricated success.
    expect(payload).toMatchObject({ projectId: null, projectIdent: UUID, programId: UUID, status: 'failed', submissionReady: false });
    expect(payload.submissionBlockers.join(' ')).toContain('no linked section-tracking store');
    // The record is keyed by the program label so /history can find it.
    const insertCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO ectd_compilations'));
    expect(insertCall![1][1]).toBe('IND Compilation — Program BX-204');
  });
});

describe('GET /:projectIdent/history — program idents filter by the program label', () => {
  it('reads history org-scoped with the resolved label', async () => {
    programRows.mockReturnValue([PROGRAM]);
    historyRows.mockReturnValue([{ id: 1, compilation_name: 'IND Compilation — Program BX-204', compilation_type: 'initial', status: 'failed', version: '1.0', compiled_at: null, created_at: null }]);
    const req = makeReq({ params: { projectIdent: UUID } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/history', 'get')(req, res);

    const historyCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('FROM ectd_compilations'));
    // The label is matched as a WHOLE TOKEN now, not as a bare substring.
    // '%Program BX-204%' also matched "Program BX-2040", so this endpoint
    // returned OTHER same-org projects' compilations as if they were this
    // one's — a cross-project leak inside the tenant. The boundary pattern
    // still finds the label anywhere in a longer compilation name.
    expect(historyCall![1]).toEqual([7, '(^|[^A-Za-z0-9])Program BX-204($|[^A-Za-z0-9])']);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null, programId: UUID, compilations: expect.any(Array) }),
    );
  });
});
