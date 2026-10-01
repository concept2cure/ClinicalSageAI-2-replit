#!/usr/bin/env node
/**
 * Self-test for ci:org-path-param-guards (check-org-path-param-guards.mjs).
 *
 * The gate reports 43/43 guarded on the current tree and has no baseline file by
 * decision (WO-4, zero debt), so in normal use its failure branch never fires —
 * and a gate whose failure branch has never been seen has not been tested
 * (CLAUDE.md, working agreement: "verify by making the check fail").
 *
 * This writes fixture route files into a temp tree, runs a patched copy of the
 * gate whose `repoRoot` and `BASELINE` point at that tree, and asserts the
 * verdict on each case. The failing cases are the shapes the gate's header and
 * history describe, not toy strings:
 *
 *   - b3c56f8b (2026-09-29): the retired `DELETE /gdpr/:orgId/data-subject/
 *     :dataSubjectId` in global-compliance.ts answered for ANY org id in the
 *     path — its siblings above and below called enforceOrgScope, it did not.
 *   - The header's mutation-testing note: deleting the guard from tenant-users
 *     `GET /:tenantId` still exited 0 in an earlier revision, because the
 *     handler slice ran to the next ORG-PARAM route and swallowed the
 *     authorizeOrgAccess calls of two unrelated POST handlers in between.
 *   - The same slice regression on the OTHER two slices the gate cuts: a
 *     parse-only `router.param('orgId')` must not borrow the guard of a later
 *     handler (its callback slice ends at the next route, not end-of-file), and a
 *     guarded `router.all(...)` below an unguarded route must end that route's
 *     slice like any verb does. Neither has a router.all/param-on-tenant-id in
 *     server/ today, which is exactly when a regression here would go unseen.
 *   - Every tenant spelling the gate claims (organizationId, orgId,
 *     organization_id, tenantId, tenant_id) on every verb it claims, in every
 *     quote style its ROUTE_RE accepts — single, double, and a backtick template
 *     with an interpolated prefix (server/routes/ind-master-data.routes.ts
 *     declares routes that way; Prettier's singleQuote leaves templates alone) —
 *     in a nested directory (the walk must recurse).
 *   - A `router.param` on the org param that only PARSES the value is not a
 *     guard, and a router-level guard on `:tenantId` does not cover `:orgId`.
 *   - `getOrgIdFromPath(req)` — a helper that reads the very value under
 *     suspicion — is not the `getOrgId` idiom. A substring gate would pass it.
 *
 * The quiet cases are the near-misses a sloppier gate would flag: all ten guard
 * idioms (the review that produced the gate saw four greps each report false
 * "unguarded" routes because they knew too few), `validateTenantId` as
 * route-level middleware with no check in the body, a `router.param` guard
 * covering bodies with none — on EVERY tenant spelling, since the header calls
 * a false positive there "the more corrosive failure" — and unguarded routes
 * whose path params are not tenant ids, plus a __tests__ file.
 *
 * Baseline semantics: an absent baseline is an EMPTY one (the real
 * configuration — fail closed); an exact `file::VERB route` entry suppresses; a
 * stale entry fails; an entry keyed on another verb suppresses nothing.
 *
 * Every case also pins the gate's count line, so a mutant that stops DETECTING
 * org-param routes cannot pass the quiet cases by finding nothing.
 *
 * ── Known gaps: pinned, printed on every run, NOT counted as passes ──────────
 * Each is a real false negative in the gate as written, reproduced by a probe in
 * `knownGaps` below that asserts today's (wrong) verdict. They are gate defects,
 * outside a selftest's power to fix; they are pinned here so they cannot be
 * forgotten, and so that fixing one FAILS this selftest with an instruction to
 * move its probe into `cases` as a failing case — the fix and its case land
 * together. None affects the real tree today (no router.all, no router.param on
 * a tenant id, no baseline file), which is why they are gaps and not findings.
 *
 *   1. router.param callback slice ends at the next ROUTE, not at the next
 *      `router.param(` its own comment promises: a parse-only
 *      `router.param('orgId')` declared just above a guarded
 *      `router.param('tenantId')` is credited with that guard, and an unguarded
 *      `:orgId` route passes. Fix: end the slice at the earlier of the next
 *      route and the next `router.param(` (not the param alone — the route half
 *      is pinned by the router.param slice case in `cases`).
 *   2. The gate never reads a baseline entry's `reason`. `{}` suppresses an
 *      unguarded tenant route exactly as a justified entry does, and so does the
 *      `reason: 'TODO: …'` placeholder that `--write-baseline` itself writes —
 *      so `--write-baseline` followed by a plain run turns any finding green.
 *      check-baseline-justifications covers only tenant-isolation-baseline.json,
 *      not this file. Fix: reject an entry whose reason is missing, empty, or
 *      starts with `TODO`.
 *   3. `router.all('/:orgId/…', handler)` is invisible: ANY_ROUTE_RE ends slices
 *      at `router.all(` but ROUTE_RE does not DETECT it, so an unguarded one is
 *      counted as zero routes — worse than counted as guarded. Fix: add `all` to
 *      ROUTE_RE's verbs.
 *
 * Usage:
 *   node scripts/ci/check-org-path-param-guards.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-org-path-param-guards.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:org-path-param-guards:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-org-path-param-guards.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'org-path-param-guards-selftest-'));
const tree = path.join(tmp, 'tree');
const baselinePath = path.join(tmp, 'baseline.json');

/* ── The patched gate ────────────────────────────────────────────────────── */

const ROOT_DECL = /const repoRoot = [^;]+;/g;
const BASELINE_DECL = /const BASELINE = [^;]+;/g;

function abort(msg) {
  console.error(`${TAG} FAIL — ${msg}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const gateSrc = fs.readFileSync(GATE, 'utf8');
/* Both constants must be found exactly once. If either were missed, the copy
   would judge some other tree — or `--write-baseline` would write the real
   docs/reports path — so refuse to run anything rather than run it wrong. */
const rootHits = gateSrc.match(ROOT_DECL)?.length ?? 0;
const baseHits = gateSrc.match(BASELINE_DECL)?.length ?? 0;
if (rootHits !== 1 || baseHits !== 1) {
  abort(
    `cannot patch ${path.relative(repoRoot, GATE)}: expected one \`const repoRoot = …;\` ` +
      `and one \`const BASELINE = …;\`, found ${rootHits} and ${baseHits}.`,
  );
}
const gatePath = path.join(tmp, 'gate.mjs');
fs.writeFileSync(
  gatePath,
  gateSrc
    .replace(ROOT_DECL, `const repoRoot = ${JSON.stringify(tree)};`)
    .replace(BASELINE_DECL, `const BASELINE = ${JSON.stringify(baselinePath)};`),
);

/* ── Harness ─────────────────────────────────────────────────────────────── */

function setTree(files) {
  fs.rmSync(tree, { recursive: true, force: true });
  fs.mkdirSync(path.join(tree, 'server'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tree, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** `entries` → write { entries }; `null` → no baseline file at all (the real configuration). */
function setBaseline(entries) {
  fs.rmSync(baselinePath, { force: true });
  if (entries !== null) fs.writeFileSync(baselinePath, JSON.stringify({ entries }, null, 2));
}

function runGate(args = []) {
  const r = spawnSync(process.execPath, [gatePath, ...args], { encoding: 'utf8', cwd: tmp });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** The gate's count line, so every case also proves what was DETECTED. */
const counts = (total, guarded, not, baseline = 0) =>
  `[ci:org-path-param-guards] ${total} route(s) take an org/tenant id from the path; ` +
  `${guarded} guarded, ${not} not (baseline ${baseline}).`;

/** How the gate names an unguarded route: verb + path, then the file on the next line. */
const flagged = (verb, route, file) => `  ${verb} ${route}\n      ${file}`;

const OK = '[ci:org-path-param-guards] OK — every org path param is checked against the caller.';
const UNGUARDED = 'route(s) with an UNGUARDED org path param';
const STALE = 'baseline entr(ies) now guarded — remove them';

/* ── Fixtures ────────────────────────────────────────────────────────────── */

/** b3c56f8b's pre-fix global-compliance.ts: guarded siblings either side of the unguarded DELETE. */
const GLOBAL_COMPLIANCE = `
const router = Router();

/**
 * GET /gdpr/:orgId/data-subject/:dataSubjectId/export
 */
router.get('/gdpr/:orgId/data-subject/:dataSubjectId/export', async (req: Request, res: Response) => {
  const orgId = parseInt(String(req.params.orgId), 10);
  if (!enforceOrgScope(req, res, orgId)) return;
  const rows = await exportSubject(orgId, req.params.dataSubjectId);
  res.json(rows);
});

/**
 * DELETE /gdpr/:orgId/data-subject/:dataSubjectId — retired 2026-09-28; erases nothing.
 */
router.delete('/gdpr/:orgId/data-subject/:dataSubjectId', (_req: Request, res: Response) => {
  return res.status(410).json({
    error: 'ERASURE_IS_A_GOVERNED_ACTION',
    message: 'Nothing was erased.',
  });
});

/**
 * POST /gdpr/:orgId/transfer-assessment
 */
router.post('/gdpr/:orgId/transfer-assessment', async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(String(req.params.orgId), 10);
    if (!enforceOrgScope(req, res, orgId)) return;
    res.status(201).json(await createTransferAssessment(orgId, req.body));
  } catch (e) {
    res.status(500).json({ error: 'TRANSFER_ASSESSMENT_FAILED' });
  }
});

export default router;
`;

/** tenant-users.ts with the GET guard deleted; two non-org POSTs between it and the next org route DO guard. */
const TENANT_USERS_GUARD_DELETED = `
const router = Router();

router.get('/:tenantId', async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  const members = await db.select().from(organizationUsers)
    .where(eq(organizationUsers.organizationId, tenantId));
  res.json(members);
});

router.post('/', async (req, res) => {
  const orgId = Number(req.body.organizationId);
  if (!(await authorizeOrgAccess(req, res, orgId))) return;
  res.status(201).json(await inviteMember(orgId, req.body));
});

router.post('/invitations/:invitationId/resend', async (req, res) => {
  const invitation = await loadInvitation(req.params.invitationId);
  if (!(await authorizeOrgAccess(req, res, invitation.organizationId))) return;
  res.json(await resendInvitation(invitation));
});

router.patch('/:organizationId/:userId', async (req, res) => {
  const orgId = parseInt(req.params.organizationId, 10);
  if (!(await authorizeOrgAccess(req, res, orgId))) return;
  res.json(await updateMemberRole(orgId, req.params.userId, req.body.role));
});

export default router;
`;

/**
 * One route per tenant spelling, one verb each, plus the two other quote styles
 * ROUTE_RE accepts — none checks the id against the caller. The backtick route
 * interpolates a prefix, the way ind-master-data.routes.ts declares `/${base}/:id`.
 */
const EVERY_SPELLING_UNGUARDED = `
const router = Router();
const BILLING_V2 = '/billing/v2';

router.get(\`\${BILLING_V2}/:orgId/usage\`, async (req, res) => {
  res.json(await usageFor(Number(req.params.orgId)));
});

router.post("/exports/:tenantId", async (req, res) => {
  res.status(202).json(await queueTenantExport(req.params.tenantId));
});

router.get('/billing/:organizationId/budgets', async (req, res) => {
  res.json(await db.select().from(billingBudgets).where(eq(billingBudgets.organizationId, Number(req.params.organizationId))));
});

router.post('/keys/:orgId', async (req, res) => {
  res.status(201).json(await createApiKey(Number(req.params.orgId), req.body.label));
});

router.put('/alerts/:organization_id', async (req, res) => {
  res.json(await upsertBillingAlert(Number(req.params.organization_id), req.body));
});

router.patch('/residency/:tenantId', async (req, res) => {
  res.json(await setResidency(req.params.tenantId, req.body.region));
});

router.delete('/members/:tenant_id/:userId', async (req, res) => {
  await removeMember(req.params.tenant_id, req.params.userId);
  res.status(204).end();
});

export default router;
`;

/** All ten guard idioms, each used as the codebase uses it. */
const EVERY_IDIOM = `
const router = Router();

router.get('/a/:tenantId', async (req, res) => {
  if (!(await authorizeOrgAccess(req, res, Number(req.params.tenantId)))) return;
  res.json([]);
});

router.get('/b/:orgId/frameworks', async (req, res) => {
  if (!enforceOrgScope(req, res, parseInt(String(req.params.orgId), 10))) return;
  res.json([]);
});

router.get('/c/:organizationId/branding', async (req, res) => {
  const orgId = requireAuthedOrgId(req, res, req.params.organizationId);
  if (orgId === null) return;
  res.json({});
});

router.get('/d/:tenantId/assessments', async (req, res) => {
  if (!assertTenantMatchesAuth(req, res, req.params.tenantId)) return;
  res.json([]);
});

router.put('/e/:tenantId/config', async (req, res) => {
  const ctx = requireOrganizationContext(req, res);
  if (!ctx || String(ctx.organizationId) !== req.params.tenantId) return res.status(403).end();
  res.json({});
});

router.get('/f/data-residency/:tenantId', validateTenantId, asyncHandler(async (req, res) => {
  res.json(await residencyFor(req.params.tenantId));
}));

router.get('/g/:organizationId/reports', async (req, res) => {
  // SECURITY: the path id is ignored; the token's org wins.
  const scope = orgScope(req);
  res.json(await listReports(scope));
});

router.get('/h/:orgId/imports', async (req, res) => {
  // SECURITY: the path id is ignored; the token's org wins.
  const orgId = getOrgId(req);
  res.json(await listImports(orgId));
});

router.patch('/i/:organization_id/settings', async (req, res) => {
  const orgId = authedOrgId(req);
  if (orgId !== Number(req.params.organization_id)) return res.status(403).end();
  res.json({});
});

router.get('/j/:tenant_id/subjects/:subjectId', async (req, res) => {
  if (!(await enforceSubjectAccess(req, res, req.params.tenant_id, req.params.subjectId))) return;
  res.json({});
});

export default router;
`;

/** One router.param guard, three bodies with none — projectRoutes.ts's shape, on a tenant param. */
const PARAM_GUARDED = `
const router = Router();

router.param('tenantId', (req, res, next, raw) => {
  const orgId = requireAuthedOrgId(req, res, raw);
  if (orgId === null) return;
  next();
});

router.get('/:tenantId/users', async (req, res) => {
  res.json(await listUsers(req.params.tenantId));
});

router.post('/:tenantId/users', async (req, res) => {
  res.status(201).json(await addUser(req.params.tenantId, req.body));
});

router.delete('/:tenantId/users/:userId', async (req, res) => {
  await removeUser(req.params.tenantId, req.params.userId);
  res.status(204).end();
});

export default router;
`;

/**
 * The same router-level shape on the four OTHER tenant spellings, one router per
 * file as the codebase writes them, each callback guarding with a different
 * idiom. Not one handler body checks anything: every route here is guarded only
 * if the gate recognises router.param on that spelling.
 */
const PARAM_GUARDED_EVERY_OTHER_SPELLING = {
  'server/routes/org-members.ts': `
const router = Router();

router.param('orgId', (req, res, next, raw) => {
  const orgId = requireAuthedOrgId(req, res, raw);
  if (orgId === null) return;
  (req as any).orgIdNum = orgId;
  next();
});

router.get('/:orgId/members', async (req, res) => {
  res.json(await listMembers((req as any).orgIdNum));
});

router.delete('/:orgId/members/:userId', async (req, res) => {
  await removeMember((req as any).orgIdNum, req.params.userId);
  res.status(204).end();
});

export default router;
`,
  'server/routes/org-invoices.ts': `
const router = Router();

router.param('organizationId', async (req, res, next, raw) => {
  if (!(await authorizeOrgAccess(req, res, Number(raw)))) return;
  next();
});

router.get('/:organizationId/invoices', async (req, res) => {
  res.json(await listInvoices(Number(req.params.organizationId)));
});

router.post('/:organizationId/invoices', async (req, res) => {
  res.status(201).json(await draftInvoice(Number(req.params.organizationId), req.body));
});

export default router;
`,
  'server/routes/legacy/org-exports.ts': `
const router = Router();

router.param('organization_id', (req, res, next, raw) => {
  if (!enforceOrgScope(req, res, parseInt(raw, 10))) return;
  next();
});

router.get('/legacy/:organization_id/exports', async (req, res) => {
  res.json(await listLegacyExports(parseInt(req.params.organization_id, 10)));
});

export default router;
`,
  'server/routes/legacy/tenant-quota.ts': `
const router = Router();

router.param('tenant_id', (req, res, next, raw) => {
  if (!assertTenantMatchesAuth(req, res, raw)) return;
  next();
});

router.put('/legacy/:tenant_id/quota', async (req, res) => {
  res.json(await setQuota(req.params.tenant_id, req.body.limit));
});

export default router;
`,
};

/**
 * router.param that only PARSES, then a guarded handler, then an unguarded one.
 * The param callback must end at the first route: if its slice ran on to the end
 * of the file it would take the GET's authorizeOrgAccess as its own, mark
 * `:orgId` guarded router-wide, and clear the PUT — the header's slice
 * regression, moved from the handler slice to the router.param slice.
 */
const PARAM_PARSE_ONLY_THEN_MIXED = `
const router = Router();

router.param('orgId', (req, _res, next, raw) => {
  (req as any).orgIdNum = parseInt(raw, 10);
  next();
});

router.get('/:orgId/retention', async (req, res) => {
  if (!(await authorizeOrgAccess(req, res, (req as any).orgIdNum))) return;
  res.json(await loadRetentionPolicy((req as any).orgIdNum));
});

router.put('/:orgId/retention', async (req, res) => {
  res.json(await saveRetentionPolicy((req as any).orgIdNum, req.body));
});

export default router;
`;

/**
 * An unguarded org route whose only guarded neighbour below is a router.all —
 * blanket middleware for an admin sub-tree. `router.all(` must end the GET's
 * slice like any verb; if it did not, the GET would run on to the PATCH and
 * borrow the router.all's requireOrganizationContext.
 */
const ROUTER_ALL_BELOW_UNGUARDED = `
const router = Router();

router.get('/:tenantId', async (req, res) => {
  const tenantId = parseInt(req.params.tenantId, 10);
  res.json(await listMembers(tenantId));
});

router.all('/admin/*', (req, res, next) => {
  const ctx = requireOrganizationContext(req, res);
  if (!ctx) return;
  next();
});

router.patch('/:organizationId/:userId', async (req, res) => {
  const orgId = parseInt(req.params.organizationId, 10);
  if (!(await authorizeOrgAccess(req, res, orgId))) return;
  res.json(await updateMemberRole(orgId, req.params.userId, req.body.role));
});

export default router;
`;

/* ── Cases ───────────────────────────────────────────────────────────────── */

const cases = [
  /* ---- the defect shapes: must FAIL and name the site ---- */
  {
    name: 'FAILS on b3c56f8b — the retired DELETE erasure route answered for any org id in the path',
    files: { 'server/routes/global-compliance.ts': GLOBAL_COMPLIANCE },
    baseline: null,
    expectExit: 1,
    expectIn: [
      counts(3, 2, 1),
      UNGUARDED,
      flagged('DELETE', '/gdpr/:orgId/data-subject/:dataSubjectId', 'server/routes/global-compliance.ts'),
    ],
    // The guarded siblings either side must not be named — the POST's guard
    // below must not have been credited to the DELETE, nor the GET's above.
    expectNotIn: ['POST /gdpr/:orgId/transfer-assessment', 'GET /gdpr/:orgId/data-subject', OK],
  },
  {
    name: 'FAILS when the guard is deleted from GET /:tenantId and unrelated POSTs below it still guard (the slice regression)',
    files: { 'server/routes/tenant-users.ts': TENANT_USERS_GUARD_DELETED },
    baseline: null,
    expectExit: 1,
    expectIn: [counts(2, 1, 1), flagged('GET', '/:tenantId', 'server/routes/tenant-users.ts')],
    expectNotIn: ['PATCH /:organizationId/:userId', OK],
  },
  {
    name: 'FAILS when a parse-only router.param precedes a guarded handler and an unguarded one (the slice regression, router.param slice)',
    files: { 'server/routes/org-retention.ts': PARAM_PARSE_ONLY_THEN_MIXED },
    baseline: null,
    expectExit: 1,
    // 1 guarded (the GET, by its own body), 1 not: the param hook guards nothing.
    expectIn: [counts(2, 1, 1), flagged('PUT', '/:orgId/retention', 'server/routes/org-retention.ts')],
    expectNotIn: ['GET /:orgId/retention', OK],
  },
  {
    name: 'FAILS when the only guard below an unguarded org route is a router.all (the slice regression, router.all boundary)',
    files: { 'server/routes/tenant-users.ts': ROUTER_ALL_BELOW_UNGUARDED },
    baseline: null,
    expectExit: 1,
    expectIn: [counts(2, 1, 1), flagged('GET', '/:tenantId', 'server/routes/tenant-users.ts')],
    expectNotIn: ['PATCH /:organizationId/:userId', OK],
  },
  {
    name: 'FAILS on every tenant spelling, every verb and every quote style (\', ", `), in a nested directory',
    files: { 'server/api/billing/v2/tenant-billing.ts': EVERY_SPELLING_UNGUARDED },
    baseline: null,
    expectExit: 1,
    expectIn: [
      counts(7, 0, 7),
      // A route the gate cannot SEE is worse than one it calls guarded: drop a
      // quote style from ROUTE_RE and these two vanish from the count entirely.
      flagged('GET', '${BILLING_V2}/:orgId/usage', 'server/api/billing/v2/tenant-billing.ts'),
      flagged('POST', '/exports/:tenantId', 'server/api/billing/v2/tenant-billing.ts'),
      flagged('GET', '/billing/:organizationId/budgets', 'server/api/billing/v2/tenant-billing.ts'),
      flagged('POST', '/keys/:orgId', 'server/api/billing/v2/tenant-billing.ts'),
      flagged('PUT', '/alerts/:organization_id', 'server/api/billing/v2/tenant-billing.ts'),
      flagged('PATCH', '/residency/:tenantId', 'server/api/billing/v2/tenant-billing.ts'),
      flagged('DELETE', '/members/:tenant_id/:userId', 'server/api/billing/v2/tenant-billing.ts'),
    ],
    expectNotIn: [OK],
  },
  {
    name: 'FAILS when router.param on the org id only parses it — a param hook is not a guard by being one',
    files: {
      'server/routes/org-settings.ts': `
const router = Router();

router.param('orgId', (req, _res, next, raw) => {
  (req as any).orgIdNum = parseInt(raw, 10);
  next();
});

router.get('/:orgId/settings', async (req, res) => {
  res.json(await loadSettings((req as any).orgIdNum));
});

router.put('/:orgId/settings', async (req, res) => {
  res.json(await saveSettings((req as any).orgIdNum, req.body));
});

export default router;
`,
    },
    baseline: null,
    expectExit: 1,
    expectIn: [
      counts(2, 0, 2),
      flagged('GET', '/:orgId/settings', 'server/routes/org-settings.ts'),
      flagged('PUT', '/:orgId/settings', 'server/routes/org-settings.ts'),
    ],
  },
  {
    name: 'FAILS on a :orgId route beside a router.param guard that covers only :tenantId',
    files: {
      'server/routes/tenant-admin.ts': PARAM_GUARDED.replace(
        'export default router;',
        `router.get('/orgs/:orgId/audit', async (req, res) => {
  res.json(await auditFor(Number(req.params.orgId)));
});

export default router;`,
      ),
    },
    baseline: null,
    expectExit: 1,
    expectIn: [counts(4, 3, 1), flagged('GET', '/orgs/:orgId/audit', 'server/routes/tenant-admin.ts')],
    expectNotIn: ['GET /:tenantId/users', 'POST /:tenantId/users', 'DELETE /:tenantId/users/:userId'],
  },
  {
    name: 'FAILS on getOrgIdFromPath(req) — reads the suspect value; a substring match would take it for getOrgId',
    files: {
      'server/routes/org-exports.ts': `
const router = Router();

/** Reads the org id the CALLER chose — the value this gate exists to distrust. */
function getOrgIdFromPath(req: Request): number {
  return Number(req.params.orgId);
}

router.get('/exports/:orgId', async (req, res) => {
  const orgId = getOrgIdFromPath(req);
  const orgScopeLabel = \`org-\${orgId}\`;
  res.json(await listExports(orgId, orgScopeLabel));
});

export default router;
`,
    },
    baseline: null,
    expectExit: 1,
    expectIn: [counts(1, 0, 1), flagged('GET', '/exports/:orgId', 'server/routes/org-exports.ts')],
  },

  /* ---- the near-misses: must stay QUIET, and still count what they detected ---- */
  {
    name: 'quiet — all ten guard idioms, including validateTenantId as route-level middleware',
    files: { 'server/routes/idioms.ts': EVERY_IDIOM },
    baseline: null,
    expectExit: 0,
    expectIn: [counts(10, 10, 0), OK],
    expectNotIn: [UNGUARDED],
  },
  {
    name: 'quiet — one router.param guard covers three handlers whose bodies have no check',
    files: { 'server/routes/tenant-users-admin.ts': PARAM_GUARDED },
    baseline: null,
    expectExit: 0,
    expectIn: [counts(3, 3, 0), OK],
    expectNotIn: [UNGUARDED],
  },
  {
    name: 'quiet — router.param guards on orgId, organizationId, organization_id and tenant_id each cover bodies with no check',
    files: PARAM_GUARDED_EVERY_OTHER_SPELLING,
    baseline: null,
    expectExit: 0,
    expectIn: [counts(6, 6, 0), OK],
    expectNotIn: [UNGUARDED],
  },
  {
    name: 'quiet — unguarded routes whose params are not tenant ids, and a __tests__ fixture router',
    files: {
      'server/routes/projects.ts': `
const router = Router();

router.get('/projects/:projectId', async (req, res) => {
  res.json(await loadProject(req.params.projectId));
});

router.delete('/projects/:projectId/members/:userId', async (req, res) => {
  await removeProjectMember(req.params.projectId, req.params.userId);
  res.status(204).end();
});

router.get('/organizations/:slug/public-profile', async (req, res) => {
  res.json(await publicProfile(req.params.slug));
});

export default router;
`,
      'server/routes/__tests__/tenant-users.route.test.ts': `
const router = Router();
router.get('/:tenantId', (_req, res) => res.json([{ id: 1 }]));
`,
    },
    baseline: null,
    expectExit: 0,
    expectIn: [counts(0, 0, 0), OK],
    expectNotIn: [UNGUARDED, '__tests__'],
  },

  /* ---- baseline semantics ---- */
  {
    // Suppression is all this proves. The gate does not read `reason`, so a
    // reasonless or TODO entry suppresses too — known gap 2, probed below.
    name: 'quiet — an exact baseline entry suppresses that one route (reason not enforced: known gap 2)',
    files: { 'server/routes/global-compliance.ts': GLOBAL_COMPLIANCE },
    baseline: {
      'server/routes/global-compliance.ts::DELETE /gdpr/:orgId/data-subject/:dataSubjectId': {
        reason: 'selftest: retired route answering 410 for every caller; tracked for removal.',
      },
    },
    expectExit: 0,
    expectIn: [counts(3, 2, 1, 1), OK],
    expectNotIn: [UNGUARDED, STALE],
  },
  {
    name: 'FAILS on a stale baseline entry — the route is guarded now, so the entry must go',
    files: { 'server/routes/idioms.ts': EVERY_IDIOM },
    baseline: {
      'server/routes/idioms.ts::GET /a/:tenantId': { reason: 'selftest: was unguarded before the fix.' },
    },
    expectExit: 1,
    expectIn: [counts(10, 10, 0, 1), STALE, 'server/routes/idioms.ts::GET /a/:tenantId'],
    expectNotIn: [UNGUARDED, OK],
  },
  {
    name: 'FAILS when the baseline entry names another verb — it suppresses nothing, and is itself stale',
    files: { 'server/routes/global-compliance.ts': GLOBAL_COMPLIANCE },
    baseline: {
      'server/routes/global-compliance.ts::GET /gdpr/:orgId/data-subject/:dataSubjectId': {
        reason: 'selftest: right path, wrong verb.',
      },
    },
    expectExit: 1,
    expectIn: [
      counts(3, 2, 1, 1),
      flagged('DELETE', '/gdpr/:orgId/data-subject/:dataSubjectId', 'server/routes/global-compliance.ts'),
      STALE,
      'server/routes/global-compliance.ts::GET /gdpr/:orgId/data-subject/:dataSubjectId',
    ],
    expectNotIn: [OK],
  },
  {
    name: 'FAILS when the baseline entry names another file — suppression is per file, not per path',
    files: { 'server/routes/global-compliance.ts': GLOBAL_COMPLIANCE },
    baseline: {
      'server/routes/global-compliance-v1.ts::DELETE /gdpr/:orgId/data-subject/:dataSubjectId': {
        reason: 'selftest: same route, another router.',
      },
    },
    expectExit: 1,
    expectIn: [
      counts(3, 2, 1, 1),
      flagged('DELETE', '/gdpr/:orgId/data-subject/:dataSubjectId', 'server/routes/global-compliance.ts'),
      STALE,
    ],
    expectNotIn: [OK],
  },
];

/* ── Known gaps (header, "Known gaps") ───────────────────────────────────── */

/*
 * Each probe asserts the gate's CURRENT, WRONG verdict on a real false negative.
 * While it reproduces, the run prints it with `!` and it is not counted as a
 * pass. When it stops reproducing, the selftest FAILS and says to promote the
 * probe into `cases` with `correct` as its expectation — so a gate fix cannot
 * land without the case that proves it.
 */
const UNGUARDED_ORG_ROUTE = `
const router = Router();

router.get('/:orgId/retention', async (req, res) => {
  res.json(await loadRetentionPolicy(Number(req.params.orgId)));
});

export default router;
`;

const knownGaps = [
  {
    gap: 1,
    name: "router.param('orgId') that only parses is credited with the guard of a router.param('tenantId') below it",
    files: {
      'server/routes/org-retention.ts': `
const router = Router();

router.param('orgId', (req, _res, next, raw) => {
  (req as any).orgIdNum = parseInt(raw, 10);
  next();
});

router.param('tenantId', (req, res, next, raw) => {
  if (requireAuthedOrgId(req, res, raw) === null) return;
  next();
});

router.put('/:orgId/retention', async (req, res) => {
  res.json(await saveRetentionPolicy((req as any).orgIdNum, req.body));
});

export default router;
`,
    },
    baseline: null,
    expectExit: 0,
    expectIn: [counts(1, 1, 0), OK],
    correct: "exit 1, counts(1, 0, 1), flagged('PUT', '/:orgId/retention', …)",
  },
  {
    gap: 2,
    name: 'a baseline entry with no reason at all ({}) suppresses an unguarded tenant route',
    files: { 'server/routes/org-retention.ts': UNGUARDED_ORG_ROUTE },
    baseline: { 'server/routes/org-retention.ts::GET /:orgId/retention': {} },
    expectExit: 0,
    expectIn: [counts(1, 0, 1, 1), OK],
    correct: 'exit 1, naming the entry as having no reason',
  },
  {
    gap: 2,
    name: "--write-baseline's own 'TODO:' placeholder suppresses the finding it was written for",
    files: { 'server/routes/org-retention.ts': UNGUARDED_ORG_ROUTE },
    baseline: null,
    writeBaselineFirst: true,
    expectBaselineIn: ['server/routes/org-retention.ts::GET /:orgId/retention', '"reason": "TODO:'],
    expectExit: 0,
    expectIn: [counts(1, 0, 1, 1), OK],
    correct: 'exit 1, naming the TODO entry',
  },
  {
    gap: 3,
    name: "an unguarded router.all('/:orgId/…') is not detected at all — zero routes counted",
    files: {
      'server/routes/org-proxy.ts': `
const router = Router();

router.all('/:orgId/proxy/*', async (req, res) => {
  res.json(await forwardToOrgService(Number(req.params.orgId), req.method, req.path, req.body));
});

export default router;
`,
    },
    baseline: null,
    expectExit: 0,
    expectIn: [counts(0, 0, 0), OK],
    correct: "exit 1, counts(1, 0, 1), flagged('ALL', '/:orgId/proxy/*', …)",
  },
];

/* ── Run ─────────────────────────────────────────────────────────────────── */

if (process.env.SELFTEST_GATE_PATH) console.log(`${TAG} testing ${GATE} (SELFTEST_GATE_PATH)`);

/** Run one case or probe; return the ways the gate's verdict differed from it. */
function check(c) {
  setTree(c.files);
  setBaseline(c.baseline);
  const problems = [];
  if (c.writeBaselineFirst) {
    const w = runGate(['--write-baseline']);
    if (w.code !== 0) problems.push(`--write-baseline exited ${w.code}`);
    const written = fs.existsSync(baselinePath) ? fs.readFileSync(baselinePath, 'utf8') : '';
    for (const s of c.expectBaselineIn ?? []) {
      if (!written.includes(s)) problems.push(`written baseline lacked: ${JSON.stringify(s)}`);
    }
  }
  const { code, out } = runGate();
  if (code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${code}`);
  for (const s of c.expectIn ?? []) if (!out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
  for (const s of c.expectNotIn ?? []) if (out.includes(s)) problems.push(`output should not contain: ${JSON.stringify(s)}`);
  return { problems, out };
}

function explain(problems, out) {
  for (const p of problems) console.log(`      ${p}`);
  console.log(out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n'));
}

let failed = 0;
for (const c of cases) {
  const { problems, out } = check(c);
  console.log(`  ${problems.length ? '✗' : '✓'} ${c.name}`);
  if (problems.length) {
    failed++;
    explain(problems, out);
  }
}

console.log('\n  Known gaps in the gate (pinned, not passed — see the header):');
let gapsOpen = 0;
for (const g of knownGaps) {
  const { problems, out } = check(g);
  if (!problems.length) {
    gapsOpen++;
    console.log(`  ! gap ${g.gap}, still open: ${g.name}`);
    continue;
  }
  failed++;
  console.log(`  ✗ gap ${g.gap} no longer reproduces: ${g.name}`);
  console.log(
    `      If the gate was fixed, move this probe into \`cases\` as a failing case (${g.correct}) ` +
      `and strike gap ${g.gap} from the header. If not, the gate's behaviour changed unrecorded.`,
  );
  explain(problems, out);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length + knownGaps.length} case(s) and gap probe(s) did not hold.`);
  process.exit(1);
}
console.log(`\n${TAG} ${gapsOpen} known gap probe(s) still reproduce — gate defects, recorded above and in the header.`);
console.log(`${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
