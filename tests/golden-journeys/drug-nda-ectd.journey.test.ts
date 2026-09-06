/**
 * Golden journey — DRUG NDA / eCTD: programme intake → canonical spine → leaf
 * placement → validation → the governed freeze that refuses without a signature.
 *
 * The drug path over HTTP against the REAL routers (`/api/c2c/projects`,
 * `/api/submissions/*`, `/api/c2c/actions/sign`), the REAL services behind them
 * (submission-service, the dispatch-readiness assessor, the Part 11 governed
 * ledger + electronic_signatures writer) and the REAL canonical DDL on
 * in-process Postgres (PGlite). Nothing about intake, the spine, the gate or
 * the signature is stubbed.
 *
 * WHAT IT ASSERTS, IN ORDER (every refusal is a first-class outcome):
 *
 *   1. Intake for an NDA creates, IN ONE TRANSACTION: the regulatory programme,
 *      the canonical `submissions` spine (slice 4), the PM-spine project anchor
 *      (slice C1), the scaffolded document outline, and one hash-chained,
 *      HMAC-sealed audit row naming all of them.
 *   2. That transaction is proven atomic: with the audit store unavailable the
 *      whole creation is REFUSED (503 PENDING_STORE) and NO programme, NO
 *      submission and NO anchor survive.
 *   3. Re-running intake for the same product LINKS the existing spine instead
 *      of forking a second one.
 *   4. A sequence is created and a leaf placed through the canonical API; a leaf
 *      pointing at another organization's document is REFUSED.
 *   5. Validation is server-computed: dispatch-readiness reports 0 errors for
 *      the placed leaf, and an EMPTY sequence is reported EMPTY_SEQUENCE with
 *      the gate blocked — the count a client sends is never trusted.
 *   6. The generic transition endpoint REFUSES `frozen` outright (GOVERNED_
 *      REQUIRED): the irreversible states have exactly one door.
 *   7. Governed freeze REFUSES without a recorded `sign` action, REFUSES an
 *      action recorded by a different actor, and REFUSES one recorded against a
 *      different sequence. Only the real, actor-matched, target-matched
 *      signature freezes it — and that signature is bound to a digest of the
 *      sequence's own leaf manifest (§11.70).
 *   8. The dispatch-readiness gate returns its verdict honestly: no licensed
 *      agency validator is configured, so `configured:false, ran:false`, and the
 *      production fail-closed rule (ECTD_REQUIRE_EVALIDATOR) blocks on exactly
 *      that. A never-shadow-reviewed dossier is flagged rather than passed off
 *      as reviewed.
 *   9. A sequence whose leaves cannot resolve is REFUSED at freeze
 *      (DISPATCH_BLOCKED) even with a valid signature — both gates, not one.
 *
 * Output: tests/golden-journeys/__reports__/drug-nda-ectd.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import {
  createJourneyDb,
  extractTableDdl,
  makeRequestDbClient,
  JourneyRecorder,
  type JourneyDb,
  assertNoSchemaGaps,
  assertNoDegradedTenantEnrichment,
} from './harness';
import {
  SUBMISSION_CORE_PGLITE_DDL,
  LEAF_SOURCE_PGLITE_DDL,
} from '../../server/db/pglite-harness';

const T = 180_000;

process.env.AUDIT_HMAC_KEY = randomBytes(32).toString('hex');

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));

// Only the AI PROVIDER is stubbed — every governed path around it stays real:
// the run row is written, findings persist, and the dispatch gate reads that
// persisted review state exactly as it does in production. A clean review is
// returned so the journey proves the CLEARED path; the never-reviewed refusal
// is asserted separately, before this runs.
vi.mock('../../server/services/ai-gateway', () => ({
  getGateway: () => ({
    route: async () => ({
      model: 'stub-model-for-journey',
      content: JSON.stringify({
        rtfRiskScore: 0.05,
        crlRiskScore: 0.05,
        summary: 'Synthetic journey review: no filing-blocking deficiencies identified.',
        findings: [],
      }),
    }),
  }),
}));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../server/db.js', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const ORG = 1;
const OTHER_ORG = 2;
/** The author/creator. */
const USER = 1;
/** A second authorized user in the same org — the signer. */
const SIGNER = 2;
const OUTSIDER = 3;
const PASSWORD = randomBytes(24).toString('base64url');
const WRONG_PASSWORD = randomBytes(24).toString('base64url');

let jdb: JourneyDb;
let app: express.Express;

/** Filled as the journey runs. */
let programId = '';
let submissionId = 0;
let anchorProjectId = 0;
let sequenceId = 0;
let emptySequenceId = 0;
let signatureActionId = '';

const R = new JourneyRecorder(
  'Drug NDA / eCTD — intake spine to the governed freeze',
  'The drug path over HTTP against real canonical DDL: intake writes the programme, the canonical submissions spine and the PM-spine anchor in ONE transaction (proven by refusing the whole creation when the audit store is gone), a leaf is placed through the canonical API, dispatch readiness is computed server-side, and the governed freeze refuses without a recorded, actor-matched, target-matched Part 11 sign action — then succeeds with one and binds it to the sequence leaf manifest.',
  [
    'migrations/0000_sweet_joseph.sql (extractTableDdl)',
    'server/db/pglite-harness.ts#SUBMISSION_CORE_PGLITE_DDL',
    'server/db/pglite-harness.ts#LEAF_SOURCE_PGLITE_DDL',
    'migrations/20260527_mutation_primitives.sql',
    'migrations/20260609_audit_hmac_seal.sql',
    'migrations/20260524_program_workbench_schema.sql',
    'migrations/20260528_phase9_document_schema.sql',
    'migrations/20260529_phase9_backfill.sql',
    'migrations/20260604_shadow_review.sql',
    'db/migrations/20260725_esig_gate_columns_port.sql',
    'migrations/20260813d_esignature_governed_unification.sql',
    'migrations/20260814_projects_regulatory_program_anchor.sql',
  ],
);

function asPrincipal(orgId: number, userId: number, role = 'admin') {
  return (req: request.Test) =>
    req
      .set('x-journey-org', String(orgId))
      .set('x-journey-user', String(userId))
      .set('x-journey-role', role);
}

beforeAll(async () => {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations',
    'users',
    'organization_users',
    'client_workspaces',
    'projects',
    'audit_logs',
    'electronic_signatures',
  ]);

  jdb = await createJourneyDb({
    // The canonical submission core comes from the code-derived harness DDL the
    // eCTD export journey already runs on, so the two journeys cannot drift on
    // what a submission/sequence/leaf is.
    prereqSql: `${baseline}\n${SUBMISSION_CORE_PGLITE_DDL}\n${LEAF_SOURCE_PGLITE_DDL}`,
    migrations: [
      // The Part 11 tamper-evident store (ledger L145) — cross-cutting.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260609_audit_hmac_seal.sql',
      'migrations/20260524_program_workbench_schema.sql',
      'migrations/20260528_phase9_document_schema.sql',
      // Seeds the nda/bla/maa/jnda/denovo rule packs the phase-9 schema does not,
      // then supersedes the 5-node nda/fda placeholder with the real 71-section
      // eCTD M1–M5 outline — so the outline this journey scaffolds is the one a
      // customer actually gets.
      'migrations/20260529_phase9_backfill.sql',
      'migrations/20260804_phase9_rule_pack_outlines.sql',
      // shadow_review_runs / shadow_review_findings — a real input to the gate.
      'migrations/20260604_shadow_review.sql',
      // C-17: electronic_signatures.organization_id / bound_payload_digest /
      // superseded_by. D6: signed_target / binding_basis + nullable document
      // anchor, which is what a governed `sign` on an eCTD sequence needs.
      // The C-17 port also widens the orchestrator run-status CHECK, so the
      // store port (C-19) that creates that table has to run first — same pair,
      // same order, as submission-release-signature.journey.test.ts.
      'db/migrations/20260725_submission_orchestrator_store_port.sql',
      'db/migrations/20260725_esig_gate_columns_port.sql',
      'migrations/20260813d_esignature_governed_unification.sql',
      'migrations/20260814_projects_regulatory_program_anchor.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash(PASSWORD, 4);

  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug, tier, max_projects) VALUES
       ($1,'journey-drug-org','journey-drug-org','standard',10),
       ($2,'other-org','other-org','standard',10)`,
    [ORG, OTHER_ORG],
  );
  await jdb.pool.query(
    `INSERT INTO users (id, email, name, password_hash, title) VALUES
       ($1,'author@journey.example','Avery Author',$4,'Regulatory Affairs Manager'),
       ($2,'approver@journey.example','Quinn Approver',$4,'VP Regulatory'),
       ($3,'outsider@other.example','Iris Intruder',$4,'Head of Nothing')`,
    [USER, SIGNER, OUTSIDER, hash],
  );
  await jdb.pool.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES
       ($1,$2,'admin'),
       ($1,$3,'admin'),
       ($4,$5,'admin')`,
    [ORG, USER, SIGNER, OTHER_ORG, OUTSIDER],
  );
  await jdb.pool.query(
    `INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES
       (1,$1,'Journey Workspace','journey-ws'),
       (2,$2,'Other Workspace','other-ws')`,
    [ORG, OTHER_ORG],
  );
  // Leaf targets: one document in each org (the cross-tenant probe needs both).
  await jdb.pool.query(
    `INSERT INTO coauthor_documents (id, organization_id, title, content, module_number) VALUES
       (100,$1,'Clinical Overview','<h1>Clinical Overview</h1><p>Benefit-risk narrative.</p>','2.5'),
       (300,$2,'Other-Tenant Secret','<p>must never be placed</p>','2.5')`,
    [ORG, OTHER_ORG],
  );

  const { default: c2cProjectsRouter } = await import('../../server/routes/c2c/projects');
  const { default: c2cActionsRouter } = await import('../../server/routes/c2c/actions');
  const { default: submissionsRouter } = await import('../../server/routes/submissions');

  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    const orgId = Number(req.headers['x-journey-org']);
    const userId = Number(req.headers['x-journey-user']);
    if (Number.isFinite(orgId) && orgId > 0) {
      const role = String(req.headers['x-journey-role'] ?? 'admin');
      const r = req as unknown as Record<string, unknown>;
      r.user = { id: userId, userId, organizationId: orgId, role, roles: [role] };
      r.userId = userId;
      r.userRole = role;
      r.tenantId = orgId;
      r.tenantContext = { organizationId: orgId };
      r.dbClient = makeRequestDbClient(jdb.pglite);
    }
    next();
  });
  app.use('/api/c2c/projects', c2cProjectsRouter);
  app.use('/api/c2c/actions', c2cActionsRouter);
  app.use('/api/submissions', submissionsRouter);
}, T);

afterAll(async () => {
  // A journey that ran against a database missing a table its subject writes
  // to proves less than it claims (ledger L145). The one 42P01 this journey
  // provokes on purpose — the rollback probe hides audit_logs for a single
  // request — is captured and asserted inside that step, so no allowlist here.
  // Ordered BEFORE the schema-gap check on purpose: a degraded membership is
  // usually CAUSED by a missing column, and the gap check would otherwise
  // throw first and report the symptom while hiding which claims were
  // proven without an org context (ledger L148).
  await assertNoDegradedTenantEnrichment();
  assertNoSchemaGaps(jdb);
  const { jsonPath, mdPath } = R.write('drug-nda-ectd');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

/** Record a governed Part 11 `sign` action on a typed target, as `userId`. */
async function signTarget(target: string, userId: number, reason: string, intent: 'freeze' | 'dispatch' | 'transmit' = 'freeze') {
  return asPrincipal(ORG, userId)(request(app).post('/api/c2c/actions/sign')).send({
    target,
    reason,
    // The meaning of the signature names the step it authorizes (11.50); the
    // server refuses a sign action whose intent is another step.
    payload: { intent, meaning: 'approval' },
    reauth: { password: PASSWORD },
  });
}

describe('golden journey — drug NDA / eCTD', () => {
  it('runs the drug NDA journey', async () => {
    // ── 1. Intake: programme + canonical spine + anchor, one transaction ────
    const created = await R.step('intake-creates-programme-submission-spine-and-anchor-together', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/c2c/projects')).send({
        name: 'Examplinib NDA',
        productName: 'Examplinib',
        programType: 'nda',
        primaryAgency: 'FDA',
        indication: 'Advanced solid tumours',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      programId = res.body.data.id;
      submissionId = res.body.meta.submissionId;
      anchorProjectId = res.body.meta.projectAnchorId;
      return {
        programId,
        submissionId,
        submissionCreated: res.body.meta.submissionCreated,
        anchorProjectId,
        anchorCreated: res.body.meta.projectAnchorCreated,
        documentId: res.body.meta.documentId,
        scaffoldedSections: res.body.meta.scaffoldedSections,
      };
    });
    expect(created.submissionCreated).toBe(true);
    expect(created.anchorCreated).toBe(true);
    // The real nda × FDA outline (eCTD M1–M5), not a placeholder stub.
    expect(created.scaffoldedSections).toBe(71);
    expect(submissionId).toBeGreaterThan(0);
    expect(anchorProjectId).toBeGreaterThan(0);

    await R.step('every-row-the-intake-transaction-wrote-is-durable-and-consistent', async () => {
      const sub = await jdb.pool.query(
        `SELECT title, product_name, application_type, client_type, primary_region, organization_id, created_by
           FROM submissions WHERE id = $1`,
        [submissionId],
      );
      expect(sub.rows).toHaveLength(1);
      const s = sub.rows[0] as Record<string, unknown>;
      // The identity keys the checklist assembler matches programme ↔ submission on.
      expect(s.title).toBe('Examplinib NDA');
      expect(s.product_name).toBe('Examplinib');
      expect(s.application_type).toBe('nda');
      expect(s.client_type).toBe('pharma');
      expect(s.primary_region).toBe('fda');
      expect(s.organization_id).toBe(ORG);

      const proj = await jdb.pool.query(
        `SELECT regulatory_program_id, organization_id, type FROM projects WHERE id = $1`,
        [anchorProjectId],
      );
      expect((proj.rows[0] as { regulatory_program_id: string }).regulatory_program_id).toBe(programId);

      // ONE audit row covering the whole creation: chained, sealed, and naming
      // both the spine and the anchor.
      const audit = await jdb.pool.query(
        `SELECT sha256_chain, hmac_seal, new_values FROM audit_logs
          WHERE action = 'c2c.project.create' AND target = $1`,
        [`regulatory_program:${programId}`],
      );
      expect(audit.rows).toHaveLength(1);
      const a = audit.rows[0] as {
        sha256_chain: string;
        hmac_seal: string;
        new_values: {
          submission_id: number;
          submission_created: boolean;
          submission_application_type: string;
          project_anchor_id: number;
        };
      };
      expect(a.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
      expect(a.hmac_seal).toMatch(/^[0-9a-f]{64}$/);
      expect(a.new_values.submission_id).toBe(submissionId);
      expect(a.new_values.submission_created).toBe(true);
      expect(a.new_values.submission_application_type).toBe('nda');
      expect(a.new_values.project_anchor_id).toBe(anchorProjectId);
      return {
        submission: s.application_type,
        anchoredProgram: programId,
        auditChained: true,
        auditSealed: true,
      };
    });

    // ── 2. KNOWN-BAD: the transaction is ATOMIC, proven by breaking it ──────
    await R.expectBlocked('a-failed-audit-write-rolls-back-the-programme-and-its-spine', async () => {
      const before = await jdb.pool.query(
        `SELECT (SELECT count(*)::int FROM regulatory_programs) AS g,
                (SELECT count(*)::int FROM submissions) AS s,
                (SELECT count(*)::int FROM projects) AS p`,
      );
      // Make the audit store unavailable for exactly one request. The audit row
      // is written LAST, after the programme, the scaffold, the spine and the
      // anchor — so anything that survives proves the transaction was not one.
      await jdb.pool.query(`ALTER TABLE audit_logs RENAME TO audit_logs_journey_hidden`);
      // The recorder (L145) sees the audit write fail with 42P01 inside this
      // window. That is the step working, not a schema gap: capture it here,
      // prove the hidden store was actually written to, and take it out of the
      // journey's gap list so afterAll needs no allowlist (ledger L146).
      const gapsBefore = jdb.schemaGaps.length;
      let res;
      try {
        res = await asPrincipal(ORG, USER)(request(app).post('/api/c2c/projects')).send({
          name: 'Rollback Probe NDA',
          productName: 'Rollbackinib',
          programType: 'nda',
          primaryAgency: 'FDA',
        });
      } finally {
        await jdb.pool.query(`ALTER TABLE audit_logs_journey_hidden RENAME TO audit_logs`);
      }
      // A probe blocked for any other reason proves nothing about the audit
      // write, so "the hidden store was reached" is part of the verdict, not a
      // throw — inside expectBlocked a throw reads as the block itself.
      //
      // Only the gap this probe CAUSED leaves the journey's list. Any other
      // relation the request found missing inside the window is a real gap,
      // and is put back for afterAll to report — taking the whole window out
      // would have let the probe hide it.
      const isHiddenAuditStore = (g: { code: string; message: string }) =>
        g.code === '42P01' && g.message.includes('"audit_logs"');
      const inWindow = jdb.schemaGaps.splice(gapsBefore);
      jdb.schemaGaps.push(...inWindow.filter((g) => !isHiddenAuditStore(g)));
      const auditStoreReached = inWindow.some(isHiddenAuditStore);
      const after = await jdb.pool.query(
        `SELECT (SELECT count(*)::int FROM regulatory_programs) AS g,
                (SELECT count(*)::int FROM submissions) AS s,
                (SELECT count(*)::int FROM projects) AS p`,
      );
      const b = before.rows[0] as { g: number; s: number; p: number };
      const a = after.rows[0] as { g: number; s: number; p: number };
      return {
        blocked:
          auditStoreReached &&
          res.status === 503 &&
          res.body.error === 'PENDING_STORE' &&
          b.g === a.g &&
          b.s === a.s &&
          b.p === a.p,
        auditStoreReached,
        status: res.status,
        error: res.body?.error,
        programsBefore: b.g,
        programsAfter: a.g,
        submissionsBefore: b.s,
        submissionsAfter: a.s,
        anchorsBefore: b.p,
        anchorsAfter: a.p,
      };
    });

    // ── 3. Re-intake links the existing spine instead of forking one ────────
    await R.step('re-intake-for-the-same-product-links-the-existing-spine', async () => {
      const res = await asPrincipal(ORG, USER)(request(app).post('/api/c2c/projects')).send({
        name: 'Examplinib NDA',
        productName: 'Examplinib',
        programType: 'nda',
        primaryAgency: 'FDA',
      });
      expect(res.status).toBe(201);
      expect(res.body.meta.submissionId).toBe(submissionId);
      expect(res.body.meta.submissionCreated).toBe(false);
      const n = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM submissions WHERE organization_id = $1`,
        [ORG],
      );
      expect((n.rows[0] as { n: number }).n).toBe(1);
      return { linkedSubmissionId: res.body.meta.submissionId, submissionsInOrg: 1 };
    });

    // ── 4. The canonical spine: sequence + leaf placement ───────────────────
    await R.step('create-the-original-sequence-on-the-canonical-spine', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/${submissionId}/sequences`),
      ).send({ region: 'fda', sequenceNumber: '0000', type: 'original' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      sequenceId = res.body.id;
      expect(res.body.status).toBe('draft');
      return { sequenceId, region: res.body.region, sequenceNumber: res.body.sequence_number ?? res.body.sequenceNumber };
    });

    await R.step('place-a-leaf-through-the-canonical-api', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`),
      ).send({
        sectionCode: '2.5',
        title: 'Clinical Overview',
        lifecycleOp: 'new',
        documentTable: 'coauthor_documents',
        documentId: 100,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const listed = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/leaves`),
      );
      expect(listed.body).toHaveLength(1);
      return { leafId: res.body.id, sectionCode: res.body.section_code ?? res.body.sectionCode };
    });

    await R.expectBlocked('a-leaf-pointing-at-another-tenants-document-is-refused', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`),
      ).send({
        sectionCode: '5.3.5',
        title: 'Cross-Tenant Study Report',
        lifecycleOp: 'new',
        documentTable: 'coauthor_documents',
        documentId: 300, // belongs to OTHER_ORG
      });
      const listed = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/leaves`),
      );
      return {
        blocked: res.status === 403 && listed.body.length === 1,
        status: res.status,
        code: res.body?.error?.code,
        leavesAfter: listed.body.length,
      };
    });

    await R.expectBlocked('another-tenant-cannot-read-or-place-into-this-sequence', async () => {
      const read = await asPrincipal(OTHER_ORG, OUTSIDER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/leaves`),
      );
      const write = await asPrincipal(OTHER_ORG, OUTSIDER)(
        request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`),
      ).send({ sectionCode: '2.5', title: 'Intruder', lifecycleOp: 'new' });
      return {
        blocked: read.status === 404 && write.status === 404,
        readStatus: read.status,
        writeStatus: write.status,
      };
    });

    // ── 5. Validation, computed server-side ────────────────────────────────
    await R.step('transition-draft-to-assembling-to-validated', async () => {
      const a = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/transition`),
      ).send({ status: 'assembling' });
      expect(a.status, JSON.stringify(a.body)).toBe(200);
      const v = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/transition`),
      ).send({ status: 'validated' });
      expect(v.status, JSON.stringify(v.body)).toBe(200);
      expect(v.body.status).toBe('validated');
      return { status: v.body.status };
    });

    await R.step('dispatch-gate-refuses-a-never-reviewed-dossier', async () => {
      // Fail-closed proof: before any review exists the gate must NOT clear,
      // and must say why. A sequence with zero completed Shadow Review runs
      // has zero open criticals for the same reason an unread document has
      // zero findings — nothing ran to produce any. This step and the cleared
      // assertion further down used to be one step asserting `cleared: true`
      // ALONGSIDE `shadowReviewMissing: true`: contradictory, and it encoded
      // the behaviour where a never-adversarially-reviewed dossier was
      // dispatched to the agency as cleared. The blocker is matched by name so
      // this cannot pass on some unrelated blocker appearing.
      const res = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/dispatch-readiness`),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.gate.cleared).toBe(false);
      expect(JSON.stringify(res.body.gate.blockers)).toMatch(/Shadow Review/i);
      return { blockers: res.body.gate.blockers.length };
    });

    await R.step('shadow-review-runs-before-any-dispatch-readiness-claim', async () => {
      // The dispatch gate refuses to clear a never-reviewed dossier (an unread
      // dossier has zero open criticals for the same reason an unopened book
      // has no typos). The journey therefore has to actually run the review —
      // asserting a cleared gate without one was asserting a state the product
      // now correctly refuses to reach.
      const run = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/shadow-review`),
      ).send({ lens: 'fda_filing' });
      expect(run.status, JSON.stringify(run.body)).toBe(200);

      const runs = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/shadow-review`),
      );
      expect(runs.status, JSON.stringify(runs.body)).toBe(200);
      const list = Array.isArray(runs.body) ? runs.body : (runs.body.runs ?? []);
      expect(list.length).toBeGreaterThan(0);
      return { reviewRuns: list.length };
    });

    await R.step('dispatch-readiness-is-computed-from-server-state', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/dispatch-readiness`),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.validationErrors).toBe(0);
      expect(res.body.leafCount).toBe(1);
      expect(res.body.gate.cleared, JSON.stringify(res.body.gate)).toBe(true);
      // No agency-grade validator is licensed in this environment, and the
      // assessment says so rather than implying a clean external run.
      expect(res.body.externalValidation.configured).toBe(false);
      expect(res.body.externalValidation.ran).toBe(false);
      // The review the step above ran is what the gate consulted to clear —
      // the count and the missing-flag are read back from persisted state, not
      // from anything this assertion supplies.
      expect(res.body.shadowReviewRunCount).toBeGreaterThan(0);
      expect(res.body.shadowReviewMissing).toBe(false);
      // Module-1 completeness is a WARNING, never a fabricated hard error.
      const warnings = (res.body.readiness.findings as Array<{ severity: string; code: string }>)
        .filter((f) => f.severity === 'warning');
      expect(warnings.some((w) => w.code === 'MISSING_REQUIRED_SECTION')).toBe(true);
      return {
        validationErrors: res.body.validationErrors,
        gateCleared: res.body.gate.cleared,
        gateBlockers: res.body.gate.blockers,
        externalValidation: res.body.externalValidation,
        shadowReviewMissing: res.body.shadowReviewMissing,
        warnings: warnings.length,
      };
    });

    await R.expectBlocked('an-empty-sequence-is-reported-empty-and-the-gate-blocks', async () => {
      const seq = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/${submissionId}/sequences`),
      ).send({ region: 'fda', sequenceNumber: '0001', type: 'original' });
      emptySequenceId = seq.body.id;
      const res = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${emptySequenceId}/dispatch-readiness`),
      );
      const findings: Array<{ severity: string; code: string }> = res.body?.readiness?.findings ?? [];
      return {
        blocked:
          res.status === 200 &&
          res.body.gate.cleared === false &&
          res.body.validationErrors >= 1 &&
          findings.some((f) => f.code === 'EMPTY_SEQUENCE' && f.severity === 'error'),
        gateCleared: res.body?.gate?.cleared,
        validationErrors: res.body?.validationErrors,
        blockers: res.body?.gate?.blockers,
      };
    });

    await R.expectBlocked('a-production-dispatch-without-a-licensed-evalidator-is-blocked', async () => {
      // The gate function the assessor composes, evaluated for the production
      // posture: the licence is a procurement artifact, so the honest outcome is
      // a blocker naming it — not a silent pass.
      const { evaluateExternalValidationGate } = await import(
        '../../server/services/ectd/external-validator'
      );
      const gate = evaluateExternalValidationGate({
        report: null,
        configured: false,
        requireEvalidator: true,
        environment: 'production',
      });
      return {
        blocked: gate.cleared === false && gate.blockers.some((b) => /eValidator/i.test(b)),
        blockers: gate.blockers,
      };
    });

    // ── 6. KNOWN-BAD: the irreversible states have exactly one door ─────────
    await R.expectBlocked('the-generic-transition-endpoint-refuses-frozen', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/transition`),
      ).send({ status: 'frozen' });
      return {
        blocked: res.status === 403 && res.body?.error?.code === 'GOVERNED_REQUIRED',
        status: res.status,
        code: res.body?.error?.code,
        message: res.body?.error?.message,
      };
    });

    // ── 7. KNOWN-BAD: freeze refuses without a recorded sign action ─────────
    await R.expectBlocked('freeze-refuses-without-a-recorded-sign-action', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/freeze`),
      ).send({ signatureActionId: 'act_00000000000000000000000000000000' });
      const seq = await jdb.pool.query(`SELECT status, frozen_at FROM ectd_sequences WHERE id = $1`, [
        sequenceId,
      ]);
      const s = seq.rows[0] as { status: string; frozen_at: string | null } | undefined;
      return {
        blocked:
          res.status === 403 &&
          res.body?.error?.code === 'GOVERNED_REQUIRED' &&
          s?.status === 'validated' &&
          s?.frozen_at === null,
        status: res.status,
        code: res.body?.error?.code,
        sequenceStatus: s?.status,
      };
    });

    // The signature itself: a real governed action with re-authentication.
    const signed = await R.step('record-the-part-11-sign-action-on-this-sequence', async () => {
      const res = await signTarget(
        `ectd-sequence:${sequenceId}`,
        SIGNER,
        'Approved for freeze: NDA 0000 original sequence reviewed and complete.',
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      signatureActionId = res.body.actionId;
      expect(res.body.state).toBe('executed');

      // The ledger pair and the §11.70 signature row land together.
      const action = await jdb.pool.query(
        `SELECT command, target, state, proposed_by, org_id FROM c2c_ana_actions WHERE id = $1`,
        [signatureActionId],
      );
      const act = action.rows[0] as Record<string, unknown>;
      expect(act.command).toBe('sign');
      expect(act.target).toBe(`ectd-sequence:${sequenceId}`);
      expect(act.state).toBe('executed');
      expect(act.proposed_by).toBe(SIGNER);

      const sig = await jdb.pool.query(
        `SELECT signed_target, binding_basis, bound_payload_digest, organization_id,
                signer_id, signer_name, authentication_method, second_factor_verified,
                document_id, version_id
           FROM electronic_signatures WHERE signed_target = $1`,
        [`ectd-sequence:${sequenceId}`],
      );
      expect(sig.rows).toHaveLength(1);
      const g = sig.rows[0] as Record<string, unknown>;
      // §11.70: the signature is bound to a digest of THIS sequence's own leaf
      // manifest, not to a bare action id.
      expect(g.binding_basis).toBe('ectd-sequence-leaf-manifest-sha256');
      expect(String(g.bound_payload_digest)).toMatch(/^[0-9a-f]{64}$/);
      expect(g.organization_id).toBe(ORG);
      expect(g.signer_id).toBe(SIGNER);
      expect(g.signer_name).toBe('Quinn Approver');
      // Re-authentication actually happened, and only what happened is claimed.
      expect(g.authentication_method).toBe('password');
      expect(g.second_factor_verified).toBe(false);
      // A governed target anchor, not a fabricated document/version pair.
      expect(g.document_id).toBeNull();
      expect(g.version_id).toBeNull();
      return {
        actionId: signatureActionId,
        bindingBasis: g.binding_basis,
        boundDigest: String(g.bound_payload_digest).slice(0, 16),
        signerId: g.signer_id,
      };
    });
    void signed;

    await R.expectBlocked('a-wrong-password-cannot-record-a-signature', async () => {
      const before = await jdb.pool.query(
        `SELECT count(*)::int AS n FROM electronic_signatures`,
      );
      const res = await asPrincipal(ORG, SIGNER)(request(app).post('/api/c2c/actions/sign')).send({
        target: `ectd-sequence:${sequenceId}`,
        reason: 'Attempting to sign without knowing the password.',
        reauth: { password: WRONG_PASSWORD },
      });
      const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM electronic_signatures`);
      return {
        blocked:
          res.status === 401 &&
          (before.rows[0] as { n: number }).n === (after.rows[0] as { n: number }).n,
        status: res.status,
        error: res.body?.error,
      };
    });

    await R.expectBlocked('freeze-refuses-a-signature-recorded-by-a-different-actor', async () => {
      // The signature above was recorded by SIGNER; USER cannot spend it.
      const res = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/freeze`),
      ).send({ signatureActionId });
      const seq = await jdb.pool.query(`SELECT status FROM ectd_sequences WHERE id = $1`, [sequenceId]);
      return {
        blocked:
          res.status === 403 &&
          res.body?.error?.code === 'GOVERNED_REQUIRED' &&
          (seq.rows[0] as { status: string } | undefined)?.status === 'validated',
        status: res.status,
        code: res.body?.error?.code,
      };
    });

    await R.expectBlocked('freeze-refuses-a-signature-recorded-against-another-sequence', async () => {
      const otherSign = await signTarget(
        `ectd-sequence:${emptySequenceId}`,
        SIGNER,
        'Signature deliberately recorded against a different sequence.',
      );
      const res = await asPrincipal(ORG, SIGNER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/freeze`),
      ).send({ signatureActionId: otherSign.body.actionId });
      return {
        blocked: res.status === 403 && res.body?.error?.code === 'GOVERNED_REQUIRED',
        status: res.status,
        code: res.body?.error?.code,
        signedTarget: `ectd-sequence:${emptySequenceId}`,
      };
    });

    // ── Shadow Review has run, because the gate requires it ────────────────
    await R.step('shadow-review-runs-and-the-presence-gate-clears', async () => {
      // The dispatch gate blocks a never-adversarially-reviewed dossier: zero
      // completed runs is UNASSESSED, not clean, so it must not clear. The
      // journey used to freeze and dispatch without one ever having run — which
      // is exactly what that rule exists to stop — so it now satisfies the rule
      // rather than asserting around it.
      //
      // The run is SEEDED rather than driven through
      // POST /sequences/:id/shadow-review, because that endpoint calls a model
      // and returns 502 INVALID_AI_RESPONSE with no provider reachable. What
      // this step exists to prove is the GATE's response to a completed run
      // existing, which is a database fact; the reviewer's AI behaviour is
      // covered by its own tests. Seeding the row the gate actually counts —
      // status 'complete', same org, not deleted — keeps the journey honest
      // about which half it is exercising.
      await jdb.pool.query(
        `INSERT INTO shadow_review_runs
           (sequence_id, organization_id, region, lens, status, summary, created_by)
         VALUES ($1, $2, 'fda', 'fda_filing', 'complete', 'Journey-seeded completed run', $3)`,
        [sequenceId, ORG, USER],
      );

      const res = await asPrincipal(ORG, USER)(
        request(app).get(`/api/submissions/sequences/${sequenceId}/dispatch-readiness`),
      );
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.shadowReviewRunCount).toBeGreaterThan(0);
      expect(res.body.shadowReviewMissing).toBe(false);
      // The blocker that was present before is gone, and named specifically so
      // this cannot pass merely because the blocker list changed shape.
      expect(
        (res.body.gate.blockers as string[]).some((b) => /Shadow Review/i.test(b)),
      ).toBe(false);
      return {
        shadowReviewRunCount: res.body.shadowReviewRunCount,
        gateCleared: res.body.gate.cleared,
        blockers: res.body.gate.blockers,
      };
    });

    // ── 11.70: the signature is bound to the leaf manifest it signed ────────
    await R.expectBlocked('a-leaf-placed-after-signing-invalidates-the-signature', async () => {
      // The digest was persisted at sign time and never consulted, so a leaf
      // edited after signing was frozen under a signature applied to other bytes.
      const placed = await asPrincipal(ORG, USER)(
        request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`),
      ).send({ sectionCode: '2.7', title: 'Clinical Summary', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 100 });
      expect(placed.status, JSON.stringify(placed.body)).toBe(200);
      const res = await asPrincipal(ORG, SIGNER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/freeze`),
      ).send({ signatureActionId });
      const seq = await jdb.pool.query(`SELECT status FROM ectd_sequences WHERE id = $1`, [sequenceId]);
      return {
        blocked:
          res.status === 403 &&
          res.body?.error?.code === 'GOVERNED_REQUIRED' &&
          /changed after it was signed/.test(String(res.body?.error?.message)) &&
          (seq.rows[0] as { status: string } | undefined)?.status === 'validated',
        status: res.status,
        code: res.body?.error?.code,
        message: res.body?.error?.message,
      };
    });

    await R.step('re-sign-the-current-leaf-manifest', async () => {
      const res = await signTarget(`ectd-sequence:${sequenceId}`, SIGNER, 'Approved for freeze: re-signed after the 2.7 leaf was placed.');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      signatureActionId = res.body.actionId;
      return { actionId: signatureActionId };
    });

    await R.expectBlocked('a-signature-whose-intent-is-dispatch-does-not-freeze', async () => {
      // 11.50: the meaning of the signature is the step it authorizes.
      const dispatchSign = await signTarget(`ectd-sequence:${sequenceId}`, SIGNER, 'Approved for dispatch.', 'dispatch');
      expect(dispatchSign.status, JSON.stringify(dispatchSign.body)).toBe(200);
      const res = await asPrincipal(ORG, SIGNER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/freeze`),
      ).send({ signatureActionId: dispatchSign.body.actionId });
      return {
        blocked: res.status === 403 && res.body?.error?.code === 'GOVERNED_REQUIRED' && /intent 'dispatch', not 'freeze'/.test(String(res.body?.error?.message)),
        status: res.status,
        message: res.body?.error?.message,
      };
    });

    // ── The freeze that is actually authorized ─────────────────────────────
    await R.step('the-matching-signature-freezes-the-sequence', async () => {
      const res = await asPrincipal(ORG, SIGNER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/freeze`),
      ).send({ signatureActionId });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe('frozen');
      const seq = await jdb.pool.query(
        `SELECT status, frozen_at FROM ectd_sequences WHERE id = $1`,
        [sequenceId],
      );
      const s = seq.rows[0] as { status: string; frozen_at: string | null };
      expect(s.status).toBe('frozen');
      expect(s.frozen_at).toBeTruthy();
      // The freeze is itself audited with the gate inputs it was decided on.
      const audit = await jdb.pool.query(
        `SELECT new_values FROM audit_logs
          WHERE action = 'SEQUENCE_FROZEN' AND record_id = $1
          ORDER BY occurred_at DESC LIMIT 1`,
        [String(sequenceId)],
      );
      const a = audit.rows[0] as {
        new_values: { signatureActionId: string; validationErrors: number };
      };
      expect(a.new_values.signatureActionId).toBe(signatureActionId);
      expect(a.new_values.validationErrors).toBe(0);
      return { status: s.status, frozenAt: !!s.frozen_at, auditedSignature: a.new_values.signatureActionId };
    });

    await R.expectBlocked('the-spent-freeze-signature-does-not-authorize-dispatch', async () => {
      // One sign used to authorize freeze, dispatch and transmit alike: a
      // replay of the freeze-time actionId dispatched the sequence.
      const res = await asPrincipal(ORG, SIGNER)(
        request(app).post(`/api/submissions/sequences/${sequenceId}/dispatch`),
      ).send({ signatureActionId });
      const seq = await jdb.pool.query(`SELECT status FROM ectd_sequences WHERE id = $1`, [sequenceId]);
      return {
        blocked:
          res.status === 403 &&
          res.body?.error?.code === 'GOVERNED_REQUIRED' &&
          (seq.rows[0] as { status: string } | undefined)?.status === 'frozen',
        status: res.status,
        code: res.body?.error?.code,
        message: res.body?.error?.message,
      };
    });

    await R.expectBlocked('a-frozen-sequences-leaves-are-immutable', async () => {
      const res = await asPrincipal(ORG, USER)(
        request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`),
      ).send({ sectionCode: '2.7', title: 'Late addition', lifecycleOp: 'new' });
      return {
        blocked: res.status === 409 && res.body?.error?.code === 'INVALID_STATE',
        status: res.status,
        code: res.body?.error?.code,
        message: res.body?.error?.message,
      };
    });

    // ── 9. KNOWN-BAD: a valid signature does NOT beat the dispatch gate ─────
    await R.expectBlocked('a-blocked-gate-refuses-the-freeze-even-with-a-valid-signature', async () => {
      // The empty sequence has a real, actor-matched, target-matched signature
      // (recorded above) — and still cannot be frozen, because gate 2 blocks.
      const a = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${emptySequenceId}/transition`),
      ).send({ status: 'assembling' });
      const v = await asPrincipal(ORG, USER)(
        request(app).post(`/api/submissions/sequences/${emptySequenceId}/transition`),
      ).send({ status: 'validated' });
      const sign = await signTarget(
        `ectd-sequence:${emptySequenceId}`,
        SIGNER,
        'Signature for the empty sequence — the gate must still refuse.',
      );
      const res = await asPrincipal(ORG, SIGNER)(
        request(app).post(`/api/submissions/sequences/${emptySequenceId}/freeze`),
      ).send({ signatureActionId: sign.body.actionId });
      const seq = await jdb.pool.query(`SELECT status FROM ectd_sequences WHERE id = $1`, [
        emptySequenceId,
      ]);
      return {
        blocked:
          a.status === 200 &&
          v.status === 200 &&
          res.status === 422 &&
          res.body?.error?.code === 'DISPATCH_BLOCKED' &&
          (seq.rows[0] as { status: string } | undefined)?.status === 'validated',
        status: res.status,
        code: res.body?.error?.code,
        message: res.body?.error?.message,
        sequenceStatus: (seq.rows[0] as { status: string } | undefined)?.status,
      };
    });

    R.observations.push(
      'Intake atomicity is proven by DESTRUCTION, not by inspection: with audit_logs renamed away the ' +
        'whole creation is refused 503 PENDING_STORE and the programme, the submissions spine, the ' +
        'scaffolded document and the PM-spine anchor all roll back together. The audit row is written LAST ' +
        'in that transaction, so a surviving programme would have proved the "one transaction" claim false.',
      'The governed freeze applies BOTH gates and neither can substitute for the other: a valid, ' +
        'actor-matched, target-matched Part 11 signature does not clear a blocked dispatch gate ' +
        '(DISPATCH_BLOCKED on the empty sequence), and a clear gate does not freeze without a signature ' +
        '(GOVERNED_REQUIRED). Each refusal is asserted with the sequence still unfrozen.',
      'The §11.70 binding is a digest of the sequence row plus its ordered submission_leaves manifest, ' +
        'computed on the signing transaction\'s own client (binding_basis = ' +
        "'ectd-sequence-leaf-manifest-sha256'). The signature therefore commits to the dossier as it stood " +
        'at signing time, not merely to the action id.',
    );
    R.limitations.push(
      'No licensed agency-grade eValidator (LORENZ) is configured in this environment, so the external ' +
        'validation gate reports configured:false / ran:false. That honest state is asserted through the ' +
        'route, and the production fail-closed rule (ECTD_REQUIRE_EVALIDATOR) is asserted through the pure ' +
        'gate function rather than by mutating NODE_ENV mid-journey. The licensed engine itself CANNOT be ' +
        'exercised here — it is a procurement artifact.',
      'Assembly to eCTD bytes and transmission to the FDA ESG are deliberately out of scope: the export ' +
        'generator has its own journey (submission-export-package) and transmission needs a live gateway ' +
        'account. This journey ends at a frozen, signature-bound sequence.',
      'eCTD DTD validation is not exercised — the DTD bundle is a vendored external asset, and the ' +
        'structural validator that consumes it runs against produced package bytes (covered by the export ' +
        'journey), not against the canonical spine this journey drives.',
      'authMiddleware/requireRole run against a verified-principal middleware standing in for the platform ' +
        "auth boundary (see the 510(k) journey); the routers' own org scoping, role gates and Part 11 " +
        're-authentication all execute for real.',
      'Separation of duties degrades to log-and-allow for `ectd-sequence` targets (resolveTargetOwnerId ' +
        'models no owner column for them), so the journey signs as a SECOND user by convention rather than ' +
        'by enforcement. That degradation is the real behaviour and is recorded here rather than papered over.',
      "auditService's second sink (audit.tamper_proof_log) is not provisioned here; the chained audit_logs " +
        'rows this journey asserts are written first and independently.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(9);
  }, T);
});
