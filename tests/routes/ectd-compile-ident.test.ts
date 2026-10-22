/**
 * eCTD compile — :projectIdent resolution (program UUID | program code |
 * legacy numeric anchor), org-scoped.
 *
 * Every ident compiles a PROGRAM:
 *   UUID/code → the org's regulatory_programs row — which has NO linked
 *     section store, so readiness/validation/compile run against an honestly
 *     empty section set and every response says WHY (the
 *     SECTION_STORE_UNLINKED finding / blocker), never a silent 0% and never
 *     fabricated sections;
 *   numeric → the program its `projects` anchor names
 *     (projects.regulatory_program_id, resolveOpenProgram), else 404. The
 *     numeric branch that read the legacy project_sections store was removed
 *     2026-10-17 (DOCUMENT_STORE_CONSOLIDATION.md step 7); no read of that
 *     store is ever made.
 * An ident that resolves to nothing in the caller's org is a 404 that leaks
 * nothing; a missing org context is a 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { poolQuery, programRows, sectionRows, anchorRows, historyRows } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  programRows: vi.fn<[], unknown[]>(() => []),
  sectionRows: vi.fn<[], unknown[]>(() => []),
  anchorRows: vi.fn<[], unknown[]>(() => []),
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
    if (sql.includes('FROM projects')) return { rows: anchorRows() };
    if (sql.includes('FROM project_sections')) return { rows: sectionRows() };
    if (sql.includes('FROM ectd_compilations')) return { rows: historyRows() };
    if (sql.includes('INSERT INTO ectd_compilations')) return { rows: [] };
    return { rows: [] };
  });
});

describe('GET /:projectIdent/status — ident resolution', () => {
  it('resolves a numeric ident through its anchor to the program, org-scoped, and never reads project_sections', async () => {
    // A legacy section row exists for project 42; compile must not see it.
    sectionRows.mockReturnValue([
      { section_code: '1.1', title: 'Forms', status: 'approved', module: 'm1', required: true, word_count: 10, updated_at: '2026-01-01T00:00:00Z' },
    ]);
    anchorRows.mockReturnValue([{ regulatory_program_id: UUID }]);
    programRows.mockReturnValue([PROGRAM]);
    const req = makeReq({ params: { projectIdent: '42' } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ projectIdent: '42', programId: UUID, overallReadiness: 0 });
    expect(payload).not.toHaveProperty('projectId');
    expect(payload.submissionBlockers.join(' ')).toContain('no linked section-tracking store');
    const anchorCall = poolQuery.mock.calls.find((c) => String(c[0]).includes('FROM projects'));
    expect(anchorCall![1]).toEqual([42, 7]);
    const programCall = poolQuery.mock.calls.filter((c) => String(c[0]).includes('FROM regulatory_programs')).at(-1);
    expect(programCall![1]).toEqual([UUID, 7]);
    expect(poolQuery.mock.calls.some((c) => String(c[0]).includes('FROM project_sections'))).toBe(false);
  });

  it('404s a numeric ident that anchors no program in the caller org', async () => {
    anchorRows.mockReturnValue([]);
    programRows.mockReturnValue([PROGRAM]);
    for (const path of ['/:projectIdent/status', '/:projectIdent/history'] as const) {
      const res = createMockResponse() as any;
      await getHandler(path, 'get')(makeReq({ params: { projectIdent: '42' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    }
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(makeReq({ params: { projectIdent: '42' }, body: { region: 'FDA' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(poolQuery.mock.calls.some((c) => String(c[0]).includes('FROM project_sections'))).toBe(false);
    expect(poolQuery.mock.calls.some((c) => String(c[0]).includes('INSERT INTO ectd_compilations'))).toBe(false);
  });

  it('resolves a program UUID org-scoped and reports the unlinked section store honestly', async () => {
    programRows.mockReturnValue([PROGRAM]);
    const req = makeReq({ params: { projectIdent: UUID } });
    const res = createMockResponse() as any;

    await getHandler('/:projectIdent/status', 'get')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({ projectIdent: UUID, programId: UUID, overallReadiness: 0, submissionReady: false });
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
    expect(payload).toMatchObject({ programId: UUID });
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
    expect(payload).toMatchObject({ projectIdent: UUID, programId: UUID, status: 'failed', submissionReady: false });
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
      expect.objectContaining({ programId: UUID, compilations: expect.any(Array) }),
    );
  });
});

/* ── The draft backbone's application reference ─────────────────────────────
   `applicationRef` is written into `<ectd:application-number>`. Two things were
   wrong with what reached it. A program with a RECORDED agency number was
   ignored in favour of the sponsor's internal code, and a legacy numeric
   project got `IND-<id>` — a string shaped exactly like an agency IND number,
   synthesised from a row id, for an application the agency has never seen.
   "Recorded identity we actually hold", which is what the code claimed to be
   doing, is the number when there is one and a handle that says unassigned
   when there is not. 2026-10-08 (QA j6): the program code is not an agency
   number and no longer stands in for one. */
describe('POST /:projectIdent/compile — the draft backbone names the application honestly', () => {
  const backboneOf = (res: any) => String(res.json.mock.calls[0][0].xmlBackbone ?? '');
  const appNumber = (xml: string) => /<ectd:application-number>([^<]*)<\/ectd:application-number>/.exec(xml)?.[1] ?? null;

  it('uses the recorded agency number when the program has one', async () => {
    programRows.mockReturnValue([{ ...PROGRAM, application_number: '000512' }]);
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(
      makeReq({ params: { projectIdent: UUID }, body: { submissionType: 'initial', region: 'FDA' } }), res,
    );
    expect(appNumber(backboneOf(res))).toBe('000512');
  });

  it('with no number recorded, says it is unassigned — never the program code', async () => {
    programRows.mockReturnValue([PROGRAM]);
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(
      makeReq({ params: { projectIdent: UUID }, body: { submissionType: 'initial', region: 'FDA' } }), res,
    );
    expect(appNumber(backboneOf(res))).toBe('UNASSIGNED-PROGRAM');
    expect(appNumber(backboneOf(res))).not.toBe('BX-204');
  });

  it('a legacy numeric project does not get an IND-shaped number invented for it', async () => {
    anchorRows.mockReturnValue([{ regulatory_program_id: UUID }]);
    programRows.mockReturnValue([PROGRAM]);
    const res = createMockResponse() as any;
    await getHandler('/:projectIdent/compile', 'post')(
      makeReq({ params: { projectIdent: '7' }, body: { submissionType: 'initial', region: 'FDA' } }), res,
    );
    const ref = appNumber(backboneOf(res));
    // `IND-7` reads as an agency identifier and is not one.
    expect(ref).not.toBe('IND-7');
    expect(ref).not.toMatch(/^IND-\d+$/);
    expect(ref).toMatch(/UNASSIGNED/);
  });
});
