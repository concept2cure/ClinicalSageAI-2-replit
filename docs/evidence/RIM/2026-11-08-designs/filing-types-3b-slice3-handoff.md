From filing types (011Fyq), routed by the coordinator (01JbQU, 23:15 UTC).

**3b slice 3, halves (b) and (c), are yours.** These are the exact edits and red cases. Apply (b) inside your F1 slice 2 hold on submission-service.ts. Apply (c) as one change with the eCTD doors: ectd-compile.ts plus the client 422 handling. I apply nothing in your files.

Half (a), the readiness digest in server/services/report-os/orchestrator.ts, is mine and lands separately. Its cases go in report-os/__tests__/orchestrator-readiness.test.ts.

## What it fixes

Slice 3: a project that is not an application never becomes one. 5ab138ed3 did the first half.

**(b) The creators.**
- createSubmissionTx, the transactional creator that ensureSubmissionSpine uses, calls only refuseForeignProgram, so it writes a submission into a CSR project. refuseDocumentClassProject runs only from createSubmission.
- Neither creator reads a regional device project's program_type. insertSubmissionRow refuses only a regional device application type, so POST /api/submissions anchors an IND to a shonin project. That is reachable: SubmissionCenter.tsx postNewSubmission, with no project open.
- Fix: refuseDocumentClassProject becomes refuseNonApplicationProject. It also refuses a regional device preparation project (DEVICE_PREPARATION_ONLY), and createSubmissionTx calls it too.

**(c) The eCTD doors.**
- refuseRegionalDeviceEctd tests only regionalDeviceApplicationClassOf, so a CSR or PAS project passes all four doors:
  - compile builds a draft backbone against the ICH CTD baseline labelled "not this document's requirement set", and inserts an ectd_compilations row;
  - status, validate and filed-state all answer.
- Fix: it becomes refuseNonApplicationEctd. A filing class gets 422 ECTD_NOT_APPLICABLE with the class sentence (classNotSequencedReason). The regional message is unchanged, and so are the four call sites.

## Package

- **F1.** No narrower package covers submission-service/** and ectd-compile.ts together; S5's paths do not include submission-service.
- **Completes:** server/services/submission-service/submission-service.ts and server/routes/ectd-compile.ts.
- No new route, service, tool, table or screen.
- Neither renamed function is referenced elsewhere (git grep). submission-service.ts already imports regionalDeviceApplicationClassOf and filingDocumentClassOf.

## Apply order

Every old string below occurs exactly once, in order, on the current tree. I checked against trunk b616a56a9 plus my unpushed S5a commits, which touch neither file.

## Red

The test file is below: server/services/submission-service/__tests__/class-project-never-an-application.test.ts.
- Its first describe block, the readiness digest, is mine. Drop it and the computeInitialRun import, or keep it once my orchestrator commit lands.
- With all three blocks, 14 of 17 fail on trunk:
  - 3 creation cases: CSR via createSubmissionTx, and shonin via both creators;
  - 9 eCTD cases: csr and pas × 4 doors, plus validate with an evalidatorReport, which answers 400 VALIDATION instead of 422;
  - my 2 digest cases.
- The controls pass before and after: IND creation and the regional device sentence, plus my US_IND digest.

No existing pin moves:
- regional-device-preparation-creation passes no programId.
- document-class-not-an-application gives the same NOT_AN_APPLICATION sentence.
- In tests/routes/ectd-compile-ident, PROGRAM has no program_type, and its regional block keeps one query and its message.

===== EDIT 1 of 9: server/services/submission-service/submission-service.ts
----- OLD
 * with the add-market sentence.
 */
async function refuseDocumentClassProject(
  q: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  programId: string,
  organizationId: number,
): Promise<void> {
  const row = (await q.query(
    'SELECT program_type FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [programId, organizationId],
  )).rows[0] as { program_type?: unknown } | undefined;
  const own = typeof row?.program_type === 'string' ? filingDocumentClassOf(row.program_type) : null;
  if (own) {
----- NEW
 * with the add-market sentence.
 *
 * A regional device preparation project is no application either
 * (add-project-market.ts DEVICE_PROGRAM), and an IND was anchored to one the
 * same way: insertSubmissionRow refuses only a regional device application
 * type. Both creators ask, so neither refusal rests on their callers
 * (2026-11-01, 3b slice 3).
 */
async function refuseNonApplicationProject(
  q: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  programId: string,
  organizationId: number,
): Promise<void> {
  const row = (await q.query(
    'SELECT program_type FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [programId, organizationId],
  )).rows[0] as { program_type?: unknown } | undefined;
  const programType = typeof row?.program_type === 'string' ? row.program_type : null;
  if (regionalDeviceApplicationClassOf(programType)) {
    throw new SubmissionError('DEVICE_PREPARATION_ONLY',
      'No submission is created in this project: it is a regional device preparation project, whose outline does not support canonical submission creation yet. Nothing was created.');
  }
  const own = filingDocumentClassOf(programType);
  if (own) {

===== EDIT 2 of 9: server/services/submission-service/submission-service.ts
----- OLD
  if (input.programId != null) await refuseDocumentClassProject(pool, input.programId, ctx.organizationId);
----- NEW
  if (input.programId != null) await refuseNonApplicationProject(pool, input.programId, ctx.organizationId);

===== EDIT 3 of 9: server/services/submission-service/submission-service.ts
----- OLD
  // On the caller's client, so a project inserted earlier in the same
  // uncommitted transaction (intake) is seen.
  await refuseForeignProgram(client, input.programId, ctx.organizationId);
  return insertSubmissionRow(drizzle(client), input, ctx);
----- NEW
  // On the caller's client, so a project inserted earlier in the same
  // uncommitted transaction (intake) is seen. Intake and Add a market create
  // no spine in a class or regional device project; this creator refuses one
  // itself, as createSubmission does, rather than rest on them.
  await refuseForeignProgram(client, input.programId, ctx.organizationId);
  if (input.programId != null) await refuseNonApplicationProject(client, input.programId, ctx.organizationId);
  return insertSubmissionRow(drizzle(client), input, ctx);

===== EDIT 4 of 9: server/routes/ectd-compile.ts
----- OLD
import { regionalDeviceApplicationClassOf } from '../../shared/regulatory/filing-catalog';
----- NEW
import { regionalDeviceApplicationClassOf } from '../../shared/regulatory/filing-catalog';
import { classNotSequencedReason, filingDocumentClassOf, filingTypeInSentence } from '../../shared/regulatory/filing-document-classes';

===== EDIT 5 of 9: server/routes/ectd-compile.ts
----- OLD
/** Regional working documents cannot enter medicinal compilation or validation. */
function refuseRegionalDeviceEctd(res: Response, anchor: CompileAnchor): boolean {
  if (!regionalDeviceApplicationClassOf(anchor.programType)) return false;
  res.status(422).json({ error: {
    code: 'ECTD_NOT_APPLICABLE',
    message: 'Device preparation projects are not eCTD applications. No submission package is built or transmitted for this preparation pathway.',
  } });
  return true;
}
----- NEW
/**
 * Only an application enters medicinal compilation, readiness, validation or
 * the filed state. A regional device working document is not one, and neither
 * is a filing document class (a CSR, a supplement, a meeting package): it is
 * authored here and filed in an application's sequence, or sent by no sequence
 * this platform builds (shared/regulatory/filing-document-classes.ts). Until
 * 2026-11-01 (3b slice 3) a class project compiled a draft backbone here and
 * was measured against the ICH CTD baseline, while createSubmission and
 * add-project-market.ts already refused it a submission and a market with the
 * same classNotSequencedReason sentence.
 */
function refuseNonApplicationEctd(res: Response, anchor: CompileAnchor): boolean {
  if (regionalDeviceApplicationClassOf(anchor.programType)) {
    res.status(422).json({ error: {
      code: 'ECTD_NOT_APPLICABLE',
      message: 'Device preparation projects are not eCTD applications. No submission package is built or transmitted for this preparation pathway.',
    } });
    return true;
  }
  const documentClass = filingDocumentClassOf(anchor.programType);
  if (!documentClass) return false;
  res.status(422).json({ error: {
    code: 'ECTD_NOT_APPLICABLE',
    message: `This project is ${filingTypeInSentence(documentClass.docType, true)}, authored here and not compiled as an eCTD sequence. ${classNotSequencedReason(documentClass)}`,
  } });
  return true;
}

===== EDIT 6 of 9: server/routes/ectd-compile.ts
----- OLD
  if (refuseRegionalDeviceEctd(res, anchor)) return;

  try {
    const { modules: targetModules
----- NEW
  if (refuseNonApplicationEctd(res, anchor)) return;

  try {
    const { modules: targetModules

===== EDIT 7 of 9: server/routes/ectd-compile.ts
----- OLD
  if (refuseRegionalDeviceEctd(res, anchor)) return;

  try {
    // Get project sections
----- NEW
  if (refuseNonApplicationEctd(res, anchor)) return;

  try {
    // Get project sections

===== EDIT 8 of 9: server/routes/ectd-compile.ts
----- OLD
  if (refuseRegionalDeviceEctd(res, anchor)) return;
  try {
----- NEW
  if (refuseNonApplicationEctd(res, anchor)) return;
  try {

===== EDIT 9 of 9: server/routes/ectd-compile.ts
----- OLD
  if (refuseRegionalDeviceEctd(res, anchor)) return;

  // An agency-validator report
----- NEW
  if (refuseNonApplicationEctd(res, anchor)) return;

  // An agency-validator report

===== RED TEST: server/services/submission-service/__tests__/class-project-never-an-application.test.ts
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
 * On the committed code 14 of the 17 cases fail; the US IND digest, the IND
 * creation and the regional device sentence pass before and after.
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
import { computeInitialRun } from '../../report-os/orchestrator';
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

describe('the readiness digest does not judge a document as an application', () => {
  it.each([
    { registryId: 'ICH_CSR', words: 'a clinical study report' },
    { registryId: 'US_NDA_SUPP', words: 'a Prior Approval Supplement' },
  ])('$registryId: submission readiness is not computed, and the digest says why', async ({ registryId, words }) => {
    h.selects.push([{ status: 'approved', count: 2 }], [{ metadata: { registryId } }]);
    const run = await computeInitialRun(ORG, 'project', '11');
    const readiness = run.providers.filter((p) => p.provider === 'submission_readiness');
    expect(readiness).toHaveLength(1);
    expect(readiness[0].status).toBe('missing');
    expect(readiness[0].blocker).toBe(
      `Submission readiness not computed: ${words} is a document rather than an application; its completion is the approved or locked share of its governed outline, on its project's dossier.`,
    );
    expect(run.providers.map((p) => p.provider)).not.toContain('regional_package_manifest');
    expect(run.summary.regulatory).toBeUndefined();
  });

  it('an IND project is still evaluated against its registry entry', async () => {
    h.selects.push([], [{ metadata: { registryId: 'US_IND' } }], [], []);
    const run = await computeInitialRun(ORG, 'project', '11');
    expect(run.summary.regulatory).toMatchObject({ registryId: 'US_IND' });
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

describe('a filing document class project is not compiled as an eCTD sequence', () => {
  const doors = [
    { action: 'compile', method: 'post' as const },
    { action: 'status', method: 'get' as const },
    { action: 'validate', method: 'post' as const },
    { action: 'filed-state', method: 'get' as const },
  ];
  const classes = [
    { label: 'csr', id: CSR, sentence: /^This project is a clinical study report, authored here and not compiled as an eCTD sequence\. The clinical study report is a harmonised \(ICH\) document filed in an application's sequence\. Author it in that application's project/ },
    { label: 'pas', id: PAS, sentence: /^This project is a Prior Approval Supplement, authored here and not compiled as an eCTD sequence\. An FDA supplement is not built as a sequence yet/ },
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

===== CLIENT HALF OF (c)

Behaviour only. It must land in the same change; layout goes through the coordinator.
- **EctdCompile.tsx loadStatus (~L999-1007):** on a 422 whose body.error.code is 'ECTD_NOT_APPLICABLE', set statusState 'not_applicable' and keep body.error.message.
- **EctdModuleReadiness.tsx (~L124-131, L171):** add 'not_applicable' to the state union. Render it as EmptyState "Not compiled as an eCTD sequence", with the server message as the hint. This also corrects regional device projects, which today show "Compilation readiness could not be read … Sign in to your tenant and retry".
- **EctdFiledState.tsx (~L105-110, L156-158):** show that reason, not "What is on file didn't respond".
- **EctdCompile.tsx doValidate (~L1052-1056):** show body.error.message on a 422. Today it shows a toast, "Validation didn't run (HTTP 422)".
- **A client test (ectdModuleReadiness.test.tsx):** not_applicable shows the reason, and never "could not be read".

===== RISKS THE CRITIC NAMED

**The filed state.** From the filed-state edit on, /filed-state refuses every class project. A class or regional project whose submission was anchored through POST /api/submissions before 5ab138ed3, and that has a dispatched sequence, would stop showing what is on file: a 422, not an empty result. Per the coordinator, the deployed-DB check is with the founder:
```sql
SELECT s.id, s.application_type, r.program_type
FROM submissions s
JOIN regulatory_programs r ON r.id = s.program_id AND r.organization_id = s.organization_id
WHERE s.deleted_at IS NULL AND r.deleted_at IS NULL
  AND lower(r.program_type) = ANY(<filing class types ∪ regional device types>)
```

**Not covered:**
- Submissions already anchored to a class project keep their sequences. Assemble, freeze, dispatch and transmit key on the submission.
- assertMayAnchorTo still admits a legacy 'csr'-typed submission into a CSR project.
- GET /history is not refused.
- Non-regional device projects (510k, PMA) are still not refused a drug submission.

**Cost.** Intake and add-market each get one extra indexed SELECT per spine creation. Neither reaches the new refusal: intake makes spines only for drug application types, and add-project-market refuses DEVICE_PROGRAM and NOT_AN_APPLICATION first.

**Re-run after applying:**
- tests/routes/ectd-*.test.ts
- server/routes/__tests__/submissions-*.test.ts
- server/services/c2c/__tests__/*.pglite.test.ts
- regional-device-preparation-creation.test.ts
- document-class-not-an-application.pglite.test.ts
- required-sections.test.ts: its CSR pin stays, because resolveRequiredSections is unchanged
- the golden journeys

Ask me anything about it here. I keep the planner's and the critic's full records.
