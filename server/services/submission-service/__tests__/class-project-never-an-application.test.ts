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

const h = vi.hoisted(() => ({ query: vi.fn(), insert: vi.fn(), audit: vi.fn(), selects: [] as unknown[][] }));
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
vi.mock('../../audit/audit-write-outcome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../audit/audit-write-outcome')>()),
  recordAuditRow: h.audit,
}));

import { createSubmission, createSubmissionTx } from '../submission-service';

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
  h.query.mockReset(); h.insert.mockReset(); h.audit.mockReset();
  h.selects.length = 0;
  h.insert.mockReturnValue({ values: () => ({ returning: async () => [{ id: 7 }] }) });
  h.audit.mockResolvedValue({ persisted: true });
  // One project row for any read of regulatory_programs: the ownership check,
  // the project-type check and the eCTD anchor all read it by (id, organization).
  h.query.mockImplementation(async (statement: unknown, params?: unknown[]) => {
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
