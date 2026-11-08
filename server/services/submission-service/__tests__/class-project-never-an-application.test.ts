/**
 * A project that is not an application never becomes one (3b slice 3,
 * 2026-11-01). The first half, 5ab138ed3 (document-class-not-an-application
 * .pglite.test.ts), refused POST /api/submissions in a filing document class
 * project. Still open on the committed code:
 *   - the readiness digest judged a clinical study report project's registry
 *     entry as an application's submission readiness, with gaps, a package
 *     manifest and a score;
 *   - createSubmissionTx, the transactional creator, wrote a submission into a
 *     CSR project, and both creators wrote an IND into a regional device
 *     preparation project: insertSubmissionRow refuses only a regional device
 *     application TYPE;
 *   - the eCTD compile, status, validate and filed-state doors refused only a
 *     regional device project, so a CSR or a PAS project compiled a draft
 *     backbone and was measured against the ICH CTD baseline.
 * Replaced: the database, as orchestrator-readiness.test.ts and
 * tests/routes/ectd-compile-ident.test.ts replace it, and the audit-row writer
 * (recordAuditRow), as regional-device-preparation-creation.test.ts does.
 * This file holds half (b), the creators. Half (a), the readiness digest,
 * landed as 9c05a6ac8 (report-os/__tests__/orchestrator-readiness.test.ts);
 * half (c), the eCTD doors, follows in its own commit. Written by the filing
 * types session (011Fyq) and applied by the RIM session inside its hold on
 * submission-service.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn(), insert: vi.fn(), audit: vi.fn(), selects: [] as unknown[][],
  /** P-97: the sequence of the project that was dispatched, or none. */
  dispatched: null as null | { id: number; submissionId: number },
  /** The filed state the fold answers for a submission. */
  fold: vi.fn(),
}));
vi.mock('../../../db', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'groupBy', 'limit', 'orderBy', 'innerJoin']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve().then(() => h.selects.shift() ?? []).then(ok, ko);
    return c;
  };
  return { db: { insert: h.insert, select: () => chain() }, pool: { query: h.query }, getPool: () => ({ query: h.query }), getDb: () => ({}) };
});
vi.mock('../../ectd/prior-sequence-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ectd/prior-sequence-loader')>()),
  loadFiledStateBySubmission: h.fold,
}));
vi.mock('../../audit/audit-write-outcome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../audit/audit-write-outcome')>()),
  recordAuditRow: h.audit,
}));

import { createSubmission, createSubmissionTx } from '../submission-service';
import ectdCompileRoutes from '../../../routes/ectd-compile';

const ORG = 7;
const ctx = { organizationId: ORG, userId: 3 };
const CSR = '11111111-2222-4333-8444-0000000000c5';
const PAS = '11111111-2222-4333-8444-0000000000a5';
const SHONIN = '11111111-2222-4333-8444-0000000000d7';
const IND = '11111111-2222-4333-8444-0000000000d1';
const PROGRAM_TYPE: Record<string, string> = { [CSR]: 'csr', [PAS]: 'pas', [SHONIN]: 'shonin', [IND]: 'ind' };

const sqlOf = (statement: unknown) => (typeof statement === 'string' ? statement : String((statement as { text?: unknown } | null)?.text ?? ''));
const inserted = () => h.query.mock.calls.some(([statement]) => /^\s*insert\b/i.test(sqlOf(statement)));

beforeEach(() => {
  h.query.mockReset(); h.insert.mockReset(); h.audit.mockReset(); h.fold.mockReset();
  h.selects.length = 0;
  h.dispatched = null;
  h.insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: 7 }] }) });
  h.audit.mockResolvedValue({ persisted: true });
  // One project row for any read of regulatory_programs: the ownership check,
  // the project-type check and the eCTD anchor all read it by (id, organization).
  h.query.mockImplementation(async (statement: unknown, params?: unknown[]) => {
    const text = sqlOf(statement);
    // P-97: the project's dispatched sequence, and the spine of that sequence.
    if (/status = 'dispatched'/.test(text)) return { rows: h.dispatched ? [{ id: h.dispatched.id }] : [], rowCount: h.dispatched ? 1 : 0 };
    if (/FROM ectd_sequences q/.test(text) && h.dispatched) {
      return { rows: [{ id: h.dispatched.id, sequence_number: '0000', region: 'fda', submission_id: h.dispatched.submissionId, application_type: 'ind', primary_region: 'fda' }], rowCount: 1 };
    }
    if (/FROM submission_leaves/.test(text)) return { rows: [{ n: 1 }], rowCount: 1 };
    const id = String(params?.[0] ?? '');
    const type = PROGRAM_TYPE[id];
    if (!type || !sqlOf(statement).includes('FROM regulatory_programs')) return { rows: [], rowCount: 0 };
    return { rows: [{ id, code: `P-${type}`, name: 'LMN-201', product_name: 'LMN-201', program_type: type, primary_agency: 'FDA', application_number: null }], rowCount: 1 };
  });
});

describe('no creator writes a submission into a project that is not an application', () => {
  const ind = (programId: string) => ({ title: 'LMN-201', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', programId });

  it('the transactional creator refuses a clinical study report project, as the standalone one does', async () => {
    await expect(createSubmissionTx({ query: h.query } as never, ind(CSR), ctx)).rejects.toMatchObject({
      code: 'NOT_AN_APPLICATION',
      message: expect.stringMatching(/^No submission is created in this project: it is a clinical study report\./),
    });
    expect(inserted()).toBe(false);
  });

  it.each(['standalone', 'transactional'])('the %s creator refuses a regional device preparation project', async (mode) => {
    const creation = mode === 'standalone'
      ? createSubmission(ind(SHONIN), ctx)
      : createSubmissionTx({ query: h.query } as never, ind(SHONIN), ctx);
    await expect(creation).rejects.toMatchObject({
      code: 'DEVICE_PREPARATION_ONLY',
      message: expect.stringMatching(/^No submission is created in this project: it is a regional device preparation project/),
    });
    expect(h.insert).not.toHaveBeenCalled();
    expect(inserted()).toBe(false);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('the IND project still takes its IND', async () => {
    await expect(createSubmission(ind(IND), ctx)).resolves.toMatchObject({ id: 7 });
    expect(h.insert).toHaveBeenCalledOnce();
  });
});

function handler(path: string, method: 'get' | 'post') {
  const layer = (ectdCompileRoutes as any).stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
const requestFor = (projectIdent: string, body: Record<string, unknown> = {}) =>
  ({ params: { projectIdent }, body, query: {}, headers: {}, tenantId: ORG }) as any;
function response() {
  const res: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['status', 'json', 'send', 'setHeader', 'end']) res[m] = vi.fn(() => res);
  return res as any;
}
const classes = [
  { label: 'csr', id: CSR, sentence: /^This project is a clinical study report, authored here and not compiled as an eCTD sequence\. The clinical study report is a harmonised \(ICH\) document filed in an application's sequence\. Author it in that application's project/ },
  { label: 'pas', id: PAS, sentence: /^This project is a Prior Approval Supplement, authored here and not compiled as an eCTD sequence\. An FDA supplement is not built as a sequence yet/ },
];

/* (c), under founder decision P-97 (2026-11-02, "Keep filed state regardless"):
   compile, status and validate refuse a filing document class or regional
   device project with 422 ECTD_NOT_APPLICABLE; the filed state is refused only
   to a project with no dispatched sequence. */
describe('a filing document class project is not compiled as an eCTD sequence', () => {
  const doors = [
    { action: 'compile', method: 'post' as const },
    { action: 'status', method: 'get' as const },
    { action: 'validate', method: 'post' as const },
  ];

  it.each(classes.flatMap((c) => doors.map((d) => ({ ...c, ...d }))))('$label/$action is refused with the class sentence after the anchor read alone', async ({ id, sentence, action, method }) => {
    const res = response();
    await handler(`/:projectIdent/${action}`, method)(requestFor(id, { region: 'FDA', submissionType: 'initial' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'ECTD_NOT_APPLICABLE', message: expect.stringMatching(sentence) } });
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(sqlOf(h.query.mock.calls[0][0])).toContain('FROM regulatory_programs');
  });

  it('an imported validator report does not reach a class project either', async () => {
    const res = response();
    await handler('/:projectIdent/validate', 'post')(requestFor(CSR, { evalidatorReport: { invented: true } }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error.code).toBe('ECTD_NOT_APPLICABLE');
    expect(h.query).toHaveBeenCalledTimes(1);
  });

  it('a regional device project keeps its own sentence', async () => {
    const res = response();
    await handler('/:projectIdent/status', 'get')(requestFor(SHONIN), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error.message).toMatch(/^Device preparation projects are not eCTD applications\./);
  });
});

describe('a project that already filed keeps its filed state (P-97)', () => {
  it.each(classes)('$label with no dispatched sequence: the filed state is refused with the class sentence', async ({ id, sentence }) => {
    const res = response();
    await handler('/:projectIdent/filed-state', 'get')(requestFor(id), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'ECTD_NOT_APPLICABLE', message: expect.stringMatching(sentence) } });
    expect(h.fold).not.toHaveBeenCalled();
  });

  it.each([...classes, { label: 'shonin', id: SHONIN }])('$label with a dispatched sequence: what is on file is read, from the submission that holds it', async ({ id }) => {
    h.dispatched = { id: 501, submissionId: 77 };
    h.fold.mockResolvedValue({ throughSequence: '0000', sequences: [{ sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit' }], leaves: [] });
    const res = response();
    await handler('/:projectIdent/filed-state', 'get')(requestFor(id), res);
    expect(res.status).not.toHaveBeenCalled();
    expect(h.fold).toHaveBeenCalledWith(expect.anything(), { organizationId: ORG, submissionId: 77 });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ submissionId: 77, throughSequence: '0000' }));
  });

  it('a failed read of whether the project filed is a failure, never a refusal or an empty answer', async () => {
    const base = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (statement: unknown, params?: unknown[]) => {
      if (/status = 'dispatched'/.test(sqlOf(statement))) throw new Error('connection reset');
      return base(statement, params);
    });
    const res = response();
    await handler('/:projectIdent/filed-state', 'get')(requestFor(CSR), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].error.code).toBe('FILED_STATE_UNAVAILABLE');
  });
});
