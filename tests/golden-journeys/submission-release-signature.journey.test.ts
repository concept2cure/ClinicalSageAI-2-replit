/**
 * Golden Journey B, phase 2 (WO-01): the 21 CFR Part 11 release-signature gate.
 *
 * `POST /api/submissions/:submissionId/sign-release` is the last thing standing
 * between a validated eCTD package and transmit. Journey B phase 1 ended at a
 * persisted compilation; this picks up at the gate.
 *
 * Route-level over HTTP against the REAL router, with the REAL services behind
 * it — the orchestrator run store, `resolveSignerOrgRole`, the §11.10(g) policy,
 * the platform's signing ceremony (account standing, lockout, bcrypt, second
 * factor), and `part11ComplianceService`'s §11.70 version-content binding all
 * execute. Nothing about the security path is stubbed.
 *
 * The schema is REAL DDL lifted from the migrations that define it
 * (`extractTableDdl`), not hand-mirrored columns — plus
 * db/migrations/20260725_esig_gate_columns_port.sql, the C-17 port whose absence
 * made this gate impassable on every migration-provisioned environment.
 *
 * What it proves, in the order an auditor would ask:
 *   identity → authority → run state → payload binding → credentials →
 *   §11.70 record link → idempotency → tenant isolation.
 *
 * Output: tests/golden-journeys/__reports__/submission-release-signature.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJourneyDb, extractTableDdl, JourneyRecorder, type JourneyDb, assertNoSchemaGaps, assertNoDegradedTenantEnrichment } from './harness';
import {
  computeBoundPayloadDigestFromComponents,
  type BoundDigestValidatorOutcome,
} from '../../server/services/submission-package-orchestrator';
import type { ECTDLeaf } from '../../server/services/ectd/ectd4-validator';

const T = 180_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
// Both specifiers are mocked: this route imports '../db.js', the services it
// calls import '../../db'. vi.mock is hoisted, so the factory must be inline.
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
const SUBMISSION_ID = '4001';
const DOC_ID = 4001; // run.submission_id_fk → the signature's §11.70 document anchor
const RUN_ID = '5b1c2a10-0000-4000-8000-000000000001'; // run_id is UUID in the real DDL
const OTHER_RUN_ID = '5b1c2a10-0000-4000-8000-000000000002';
const RETRY_RUN_ID = '5b1c2a10-0000-4000-8000-000000000003';
const PROGRAM_ID = '5b1c2a10-0000-4000-8000-00000000000a'; // regulatory_programs.id is UUID
/**
 * The frozen release record a suspended run actually carries.
 *
 * PAYLOAD_DIGEST used to be `'a'.repeat(64)` and the seeded package.sign step
 * carried `{ payloadDigest }` and nothing else. verifyAwaitingReleasePayload
 * requires a signedSnapshot with a leaves array, a validatorOutcome and an
 * identity matching the run, and then requires payloadDigest to EQUAL the digest
 * recomputed from that snapshot — so every attempt was refused 409
 * SIGNATURE_SNAPSHOT_INVALID before reverifySigner was ever called, and the
 * account-standing steps below could not reach what they claim to prove.
 *
 * So the record is DERIVED, not invented: the digest comes from the production
 * function the route itself uses, over a snapshot shaped like the one
 * buildSignedSnapshot writes. Shapes mirror the canonical fixture in
 * server/services/__tests__/sign-payload-snapshot.test.ts. The identity tuple
 * matches the run rows seeded below — submissionId, organizationId,
 * applicationNumber, region, submissionType are exactly the five keys
 * sameRunIdentity compares.
 *
 * This strengthens the assertions that read PAYLOAD_DIGEST rather than relaxing
 * them: bound_payload_digest is now the real digest of a real frozen record
 * instead of a row of 'a's.
 */
const VALIDATOR_OUTCOME: BoundDigestValidatorOutcome = {
  gatewayReady: true,
  hardenedScore: 100,
  summary: { errors: 0, warnings: 0, infos: 0, sectionsPresent: 2, sectionsRequired: 2, sectionsMissing: [] as string[] },
};

const LEAF: ECTDLeaf = {
  sectionCode: 'm3.2.S.1',
  title: 'm3.2.S.1',
  checksum: 'a'.repeat(32), // md5 per the eCTD spec
  checksumType: 'md5',
  operation: 'new',
  filePath: 'm3/m3.2.S.1.pdf',
  mimeType: 'application/pdf',
  fileSize: 1024,
};

/** Each run owns its own snapshot: the identity tuple includes the tenant. */
function snapshotFor(organizationId: number) {
  return {
    leaves: [LEAF],
    backboneXml: '<index.xml/>',
    validatorOutcome: VALIDATOR_OUTCOME,
    submissionId: SUBMISSION_ID,
    organizationId,
    applicationNumber: '210001',
    sequenceNumber: '0000',
    region: 'US' as const,
    submissionType: 'original',
    totalSizeBytes: 2048,
    // The recorded applicant the release signature covers (ccd509c0): a US
    // package names its application and applicant from the record, never a
    // placeholder, and FDA application numbers are six bare digits.
    recordedPackageIdentity: { version: 1 as const, identity: {
      programId: PROGRAM_ID, applicationNumber: '210001',
      applicantSponsorId: '5b1c2a10-0000-4000-8000-0000000000b1', applicantName: 'Journey Sponsor Inc',
      applicantId: '123456789', contact: { name: 'Regulatory Contact', phone: '+1 555 0100', email: 'ra@journey.example' },
    } },
  };
}

/** The digest sign-prep and resume both compute, from the snapshot itself. */
function digestFor(snap: ReturnType<typeof snapshotFor>): string {
  return computeBoundPayloadDigestFromComponents({ ...snap, backboneXml: snap.backboneXml || undefined });
}

const SNAPSHOT = snapshotFor(ORG);
const payloadDigest = digestFor(SNAPSHOT);
const PASSWORD = 'Correct-Horse-Battery-42';

/** approver → authorized to sign; member → not (§11.10(g) policy default). */
const APPROVER = { id: 11, name: 'Quinn Approver', email: 'approver@journey.example', role: 'approver' };
const MEMBER = { id: 12, name: 'Morgan Member', email: 'member@journey.example', role: 'member' };
const OUTSIDER = { id: 13, name: 'Iris Intruder', email: 'outsider@other.example', role: 'approver' };

let jdb: JourneyDb;
let app: express.Express;

const R = new JourneyRecorder(
  'Journey B (phase 2) — the Part 11 release-signature gate',
  'The final gate before transmit, over HTTP against real services and real DDL: role authority (§11.10(g)), run-state and payload-digest binding, bcrypt credential re-verification (§11.200), the §11.70 signature/record link, idempotency for a single active release signature, and tenant isolation on every probe.',
);

function asUser(u: { id: number; email: string }) {
  return (req: request.Test) => req.set('x-journey-user', String(u.id)).set('x-journey-email', u.email);
}

beforeAll(async () => {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations',
    'users',
    'organization_users',
    'documents',
    'document_versions',
    'electronic_signatures',
    // part11ComplianceService writes a device_audit_trail row as part of
    // creating a signature; this one IS in the baseline.
    'device_audit_trail',
    // …and, since ledger L138, the route's own `release_signature_created`
    // event is written on the SAME transaction rather than after it. This
    // journey exists to prove the §11.10(e) claim, and it was proving it
    // without an audit_logs table in the database at all — the audit half of
    // the gate had nothing to land in and nothing noticed.
    'audit_logs',
  ]);

  jdb = await createJourneyDb({
    // `submissions` is an FK target of the orchestrator port.
    // The chain columns audit_logs carries in production come from two later
    // migrations (20260527_mutation_primitives for the chain/actor fields,
    // 20260129_add_org_industry_stripe_audit_logs for the value fields), not
    // from the baseline. writeChainedAuditRow reads sha256_chain to
    // link the new row to the previous one, so without them the §11.10(e)
    // write cannot happen — which, since L138, correctly refuses the signature.
    prereqSql: [
      baseline,
      // deleted_at: readLegacyReleaseInputs filters on it
      // (`WHERE organization_id = $1 AND deleted_at IS NULL`), so without the
      // column that read threw 42703 and the release gate was refused for a
      // missing column. program_id is added by the real anchor migration below,
      // not declared here.
      'CREATE TABLE IF NOT EXISTS submissions (id SERIAL PRIMARY KEY, organization_id INTEGER, deleted_at timestamptz);',
      `ALTER TABLE audit_logs
         ADD COLUMN IF NOT EXISTS table_name    TEXT,
         ADD COLUMN IF NOT EXISTS record_id     TEXT,
         ADD COLUMN IF NOT EXISTS old_values    JSONB,
         ADD COLUMN IF NOT EXISTS new_values    JSONB,
         ADD COLUMN IF NOT EXISTS actor_id      INTEGER,
         ADD COLUMN IF NOT EXISTS target        TEXT,
         ADD COLUMN IF NOT EXISTS target_type   TEXT,
         ADD COLUMN IF NOT EXISTS target_id     TEXT,
         ADD COLUMN IF NOT EXISTS reason        TEXT,
         ADD COLUMN IF NOT EXISTS payload_hash  TEXT,
         ADD COLUMN IF NOT EXISTS ana_action_id TEXT,
         ADD COLUMN IF NOT EXISTS sha256_chain  TEXT,
         ADD COLUMN IF NOT EXISTS occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
         ADD COLUMN IF NOT EXISTS hmac_seal     TEXT;`,
    ].join('\n'),
    // The C-17 port is what makes organization_id / bound_payload_digest /
    // superseded_by exist at all. Without it this journey cannot get past the
    // signature-binding step — which is precisely the defect it guards.
    // Both ports, in manifest order. The orchestrator store port (C-19) creates
    // the run table at all; the e-sig port (C-17) adds the binding columns and
    // widens the status CHECK so a run can be parked in 'awaiting-signature'.
    migrations: [
      // The Part 11 tamper-evident store (ledger L145) — cross-cutting.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      // The chain's ORDER KEY and its BEFORE INSERT trigger. Without this file
      // writeChainedAuditRow still writes, but chain_seq does not exist, so
      // chain.ts falls back to the pre-fix (occurred_at, id) walk it announces
      // on stderr — and this journey, which drives governed writes through the
      // real writer, claimed coverage of a chain recipe production no longer
      // uses. assertNoSchemaGaps is what refused to let it; the gap was
      // otherwise visible only as a log line. The fix itself is proven in
      // server/services/audit/__tests__/chain-order.pglite.test.ts, which
      // applies this same file.
      'migrations/20260921_audit_logs_chain_seq.sql',
      'db/migrations/20260725_submission_orchestrator_store_port.sql',
      'db/migrations/20260725_esig_gate_columns_port.sql',
      // regulatory_programs, which the continuation store below FKs. Built from
      // its own migration, as the IND journey does, rather than hand-mirrored.
      'migrations/20260524_program_workbench_schema.sql',
      // AFTER program_workbench above: this file is guarded on
      // to_regclass('public.regulatory_programs') and silently RETURNs without it,
      // which is how it first appeared to do nothing here.
      // submissions.program_id. With no continuation-inputs row for the seeded
      // run, readContinuationInputs falls back to readLegacyReleaseInputs, which
      // SELECTs program_id FROM submissions — a column the journey's minimal
      // submissions table did not have, so the read threw 42703 and the step was
      // refused for a missing column rather than by the account check it names.
      'migrations/20260925b_submissions_program_anchor.sql',
      // The continuation store prepareOrchestratorRelease reads before the
      // signing ceremony. Without it that read threw and the route answered 503
      // release_record_verification_unavailable for every attempt after the
      // first — fail-closed and correct, but it meant the locked-account and
      // suspended-account steps below were "blocked" by an absent relation
      // rather than by the account checks they exist to prove.
      'db/migrations/20261014_orchestrator_continuation_inputs.sql',
      // Without this, the signing ceremony's lockout read of users.locked_until
      // throws and every signature attempt — correct password or not — is
      // refused (ledger C-20, which found it in the route's former verifier).
      'db/migrations/20260725_users_signing_lockout_columns.sql',
      // The account standing every authenticator and the signer re-verify read
      // gained users.sessions_ended_at (P0-4b); without it every signature is
      // refused REAUTH_ACCOUNT_STATE_UNKNOWN, fail-closed.
      'migrations/20261001_users_sessions_ended_at.sql',
      // Run-ledger hardening: getRun now SELECTs workflow_version +
      // dependency_graph_digest (schema-shape errors are fatal by design), and
      // this also puts the RESTRICT FK + append-only step trigger under the
      // journey so the gate runs against the hardened schema.
      'db/migrations/20260730_orchestrator_run_ledger_hardening.sql',
      // D6 (single e-signature write path): signed_target/binding_basis columns
      // + nullable document anchor. part11ComplianceService's Drizzle insert
      // enumerates every declared column, so the journey schema must carry the
      // D6 shape or the release-gate insert 42703s.
      'migrations/20260813d_esignature_governed_unification.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash(PASSWORD, 4);

  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1,$2,$3), ($4,$5,$6)`,
    [ORG, 'journey-org', 'journey-org', OTHER_ORG, 'other-org', 'other-org'],
  );
  for (const u of [APPROVER, MEMBER, OUTSIDER]) {
    await jdb.pool.query(
      `INSERT INTO users (id, name, email, password_hash, status) VALUES ($1,$2,$3,$4,'active')`,
      [u.id, u.name, u.email, hash],
    );
    await jdb.pool.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1,$2,$3)`,
      [u === OUTSIDER ? OTHER_ORG : ORG, u.id, u.role],
    );
  }

  // The program scope the release gate resolves before it asks anyone to sign.
  // readLegacyReleaseInputs reads submissions.program_id and then
  // requireOrchestratorProgramAccess → canMutateProgram, which for a role
  // outside ORG_MANAGE_ROLES allows only the program's LEAD. The approver is
  // that lead, so the gate reaches the signing ceremony instead of refusing
  // 403 PROGRAM_WRITE_ACCESS_DENIED first.
  await jdb.pool.query(
    // Every NOT NULL column with no default, from the real table — the program
    // this release belongs to, not a stub that would need the schema loosened.
    `INSERT INTO regulatory_programs
       (id, organization_id, name, code, program_type, product_name, product_type, primary_agency, lead_user_id)
     VALUES ($1,$2,$3,$4,'nda','Journey Drug Substance','small_molecule','FDA',$5)`,
    [PROGRAM_ID, ORG, 'NDA 210001 programme', 'NDA-210001', APPROVER.id],
  );

  // submission_orchestrator_runs.submission_id_fk is a real FK to submissions(id).
  await jdb.pool.query(
    `INSERT INTO submissions (id, organization_id, program_id) VALUES ($1,$2,$3)`,
    [DOC_ID, ORG, PROGRAM_ID],
  );

  // The §11.70 anchor: a document with stored version content. The service binds
  // the signature to a digest of that content and FAILS CLOSED without it.
  await jdb.pool.query(
    `INSERT INTO documents
       (id, organization_id, client_workspace_id, document_code, title,
        document_type, owner_id, created_by_id)
     VALUES ($1,$2,1,'NDA-210001','NDA 210001 release package','submission',$3,$3)`,
    [DOC_ID, ORG, APPROVER.id],
  );
  await jdb.pool.query(
    `INSERT INTO document_versions
       (document_id, version_number, content, created_by_id, created_at)
     VALUES ($1,'1',$2,$3, NOW())`,
    [DOC_ID, 'Release package manifest content', APPROVER.id],
  );

  // Synthetic release content qualifies this signing/continuation gate, not
  // package validity. Derive its digest and server seal with the real writers;
  // retain the frozen dependency graph and immutable continuation inputs.
  const { sealSignPayloadDigest } = await import('../../server/services/ectd/sign-payload-seal');
  const { captureOrchestratorInputs } = await import('../../server/services/submission-orchestrator-inputs');
  const stepsFor = (snap: ReturnType<typeof snapshotFor>) => {
    const digest = digestFor(snap);
    return JSON.stringify([
      { key: 'package.validate', status: 'complete', inputHash: 'fixture-validation', dependsOn: [] },
      {
        key: 'package.sign', status: 'awaiting-signature', inputHash: 'fixture-signing', dependsOn: ['package.validate'],
        outputRef: JSON.stringify({ payloadDigest: digest, payloadSeal: sealSignPayloadDigest(digest, snap.organizationId), signedSnapshot: snap }),
      },
    ]);
  };
  const steps = stepsFor(SNAPSHOT);
  await jdb.pool.query(
    `INSERT INTO submission_orchestrator_runs
       (run_id, organization_id, submission_id, submission_id_fk, application_number,
        region, submission_type, started_at, status, steps)
     VALUES ($1,$2,$3,$4,$5,'US','original',NOW(),'awaiting-signature',$6::jsonb)`,
    [RUN_ID, ORG, SUBMISSION_ID, DOC_ID, '210001', steps],
  );
  // A second run owned by the OTHER organization, same shape.
  await jdb.pool.query(
    `INSERT INTO submission_orchestrator_runs
       (run_id, organization_id, submission_id, submission_id_fk, application_number,
        region, submission_type, started_at, status, steps)
     VALUES ($1,$2,$3,$4,$5,'US','original',NOW(),'awaiting-signature',$6::jsonb)`,
    // Its OWN snapshot, so the cross-tenant refusal below is proven by the
    // run lookup's organization scope and not by a record that would have
    // failed identity anyway.
    [OTHER_RUN_ID, OTHER_ORG, SUBMISSION_ID, DOC_ID, '210001', stepsFor(snapshotFor(OTHER_ORG))],
  );
  // A second pending run contains the same frozen package. Its active-signature
  // hit must still require current credentials; completing the first run does
  // not authorize another request and no prior history is reset or deleted.
  await jdb.pool.query(`INSERT INTO submission_orchestrator_runs
    (run_id, organization_id, submission_id, submission_id_fk, application_number,
     region, submission_type, started_at, status, steps)
    VALUES ($1,$2,$3,$4,'210001','US','original',NOW(),'awaiting-signature',$5::jsonb)`,
  [RETRY_RUN_ID, ORG, SUBMISSION_ID, DOC_ID, steps]);
  for (const runId of [RUN_ID, RETRY_RUN_ID]) {
    await captureOrchestratorInputs(runId, {
      organizationId: ORG, programId: PROGRAM_ID, userId: APPROVER.id,
      submissionId: SUBMISSION_ID, submissionFk: DOC_ID, applicationNumber: '210001',
      sequenceNumber: '0000', region: 'US', submissionType: 'original',
      cmcSources: [], csrInputs: [], clinicalStudyData: [], nonclinicalStudies: [],
    });
  }

  const { default: signReleaseRouter } = await import('../../server/routes/submission-sign-release');
  app = express();
  app.use(express.json());
  // Stands in for the app's auth + tenant middleware: the route reads req.user
  // and the tenant from verified context, never from the body.
  app.use((req, _res, next) => {
    // A raw (non-integer) subject header attaches user.id VERBATIM — models a
    // surface that issued a UUID token subject reaching the route, so the
    // route's OWN numeric-identity guard is what's under test (not the stub's).
    const raw = req.headers['x-journey-user-raw'];
    if (typeof raw === 'string' && raw) {
      (req as any).user = { id: raw, userId: raw, email: 'uuid@journey.example', organizationId: ORG };
      (req as any).tenantId = ORG;
      return next();
    }
    const id = Number(req.headers['x-journey-user']);
    if (Number.isFinite(id) && id > 0) {
      (req as any).user = {
        id,
        userId: id,
        email: String(req.headers['x-journey-email'] ?? ''),
        organizationId: id === OUTSIDER.id ? OTHER_ORG : ORG,
      };
      (req as any).tenantId = id === OUTSIDER.id ? OTHER_ORG : ORG;
    }
    next();
  });
  app.use('/api/submissions', signReleaseRouter);
}, T);

afterAll(async () => {
  // A journey that ran against a database missing a table its subject writes
  // to proves less than it claims (ledger L145).
  // Ordered BEFORE the schema-gap check on purpose: a degraded membership is
  // usually CAUSED by a missing column, and the gap check would otherwise
  // throw first and report the symptom while hiding which claims were
  // proven without an org context (ledger L148).
  await assertNoDegradedTenantEnrichment();
  assertNoSchemaGaps(jdb);
  const { jsonPath, mdPath } = R.write('submission-release-signature');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

const signBody = (over: Record<string, unknown> = {}) => ({
  runId: RUN_ID,
  password: PASSWORD,
  signatureMeaning: 'approval',
  reason: 'Approved for transmit to FDA',
  ...over,
});

describe('Journey B phase 2 — the Part 11 release-signature gate', () => {
  it('runs the release gate', async () => {
    // ── KNOWN-BAD: no authenticated principal ───────────────────────────────
    await R.expectBlocked('unauthenticated-cannot-sign', async () => {
      const res = await request(app)
        .post(`/api/submissions/${SUBMISSION_ID}/sign-release`)
        .send(signBody());
      return { blocked: res.status === 401 || res.status === 403, status: res.status };
    });

    // ── KNOWN-BAD: identity is not authority (§11.10(g)) ────────────────────
    await R.expectBlocked('member-role-lacks-signing-authority', async () => {
      const res = await asUser(MEMBER)(
        request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
      ).send(signBody());
      return {
        blocked: res.status === 403 && res.body.code === 'ESIGNATURE_NO_AUTHORITY',
        status: res.status,
        code: res.body.code,
      };
    });

    // ── KNOWN-BAD: another tenant's run is not found, not forbidden ─────────
    await R.expectBlocked('cross-tenant-run-collapses-to-404', async () => {
      const res = await asUser(APPROVER)(
        request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
      ).send(signBody({ runId: OTHER_RUN_ID }));
      // 404 rather than 403: a distinguishable response would confirm the run
      // exists in another organization.
      return { blocked: res.status === 404, status: res.status, error: res.body.error };
    });

    // ── KNOWN-BAD: a run from one submission cannot sign another ────────────
    await R.expectBlocked('run-submission-mismatch-is-404', async () => {
      const res = await asUser(APPROVER)(
        request(app).post('/api/submissions/9999/sign-release'),
      ).send(signBody());
      return { blocked: res.status === 404, status: res.status };
    });

    // ── KNOWN-BAD: locked account cannot sign, even with the right password ─
    // (negative-journey follow-ups from the 2026-07-30 auth/e-sig audit)
    //
    await R.expectBlocked('locked-account-cannot-sign', async () => {
      await jdb.pool.query(
        `UPDATE users SET locked_until = NOW() + interval '1 hour' WHERE id = $1`,
        [APPROVER.id],
      );
      try {
        const res = await asUser(APPROVER)(
          request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
        ).send(signBody());
        // Correct password, locked account → §11.300(d): refused before the
        // password is compared, and said to be locked — the sign-in's answer
        // (423), which the account holder already has (VSR-001 F-27).
        return {
          blocked: res.status === 423 && res.body.code === 'ACCOUNT_LOCKED',
          status: res.status,
          code: res.body.code,
        };
      } finally {
        await jdb.pool.query(`UPDATE users SET locked_until = NULL WHERE id = $1`, [APPROVER.id]);
      }
    });

    // ── KNOWN-BAD: suspended account cannot sign ────────────────────────────
    await R.expectBlocked('suspended-account-cannot-sign', async () => {
      await jdb.pool.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [APPROVER.id]);
      try {
        const res = await asUser(APPROVER)(
          request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
        ).send(signBody());
        // Refused on ACCOUNT STANDING, by whichever layer sees it first.
        //
        // 2026-10-19: suspension revokes active membership, and the release gate
        // resolves the program scope before the signing ceremony — so
        // readCsrProjectActor, reached through requireOrchestratorProgramAccess,
        // now refuses 403 CSR_PROJECT_ACCESS_DENIED ("no longer an active member
        // of this organization") before reverifySigner can answer 401
        // ACCOUNT_INACTIVE. This step was written when this route's own check was
        // the only one (F-28), and it still asserts the thing that matters: a
        // suspended account cannot sign, and no signature row is written.
        //
        // The ceremony's own answer is not taken on trust either — it is
        // asserted directly, on the same reverifySigner this route calls, at
        // server/services/part11/__tests__/reverify-signer.test.ts:234 (401 /
        // ACCOUNT_INACTIVE). Both codes are listed rather than one broadened
        // away, so a refusal for any OTHER reason still fails this step.
        const standing =
          (res.status === 401 && res.body.code === 'ACCOUNT_INACTIVE') ||
          (res.status === 403 && res.body.error === 'CSR_PROJECT_ACCESS_DENIED');
        return { blocked: standing, status: res.status, code: res.body.code ?? res.body.error };
      } finally {
        await jdb.pool.query(`UPDATE users SET status = 'active' WHERE id = $1`, [APPROVER.id]);
      }
    });

    // ── KNOWN-BAD: revoked membership loses signing authority ───────────────
    // The role is resolved from the LIVE membership row (never the token), so
    // deleting the row revokes authority immediately — §11.10(g).
    await R.expectBlocked('revoked-membership-cannot-sign', async () => {
      await jdb.pool.query(
        `DELETE FROM organization_users WHERE user_id = $1 AND organization_id = $2`,
        [APPROVER.id, ORG],
      );
      try {
        const res = await asUser(APPROVER)(
          request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
        ).send(signBody());
        return { blocked: res.status === 403, status: res.status, code: res.body.code };
      } finally {
        await jdb.pool.query(
          `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)`,
          [ORG, APPROVER.id, APPROVER.role],
        );
      }
    });

    // ── KNOWN-BAD: a UUID token subject cannot sign ─────────────────────────
    // The route derives signerId from req.user.id and requires a positive
    // integer (Number(uuid) is NaN). A UUID subject that reached the route —
    // the C-21 identity-worlds hazard — is refused before any run/credential
    // work, so it can never be mangled into a wrong integer user.
    await R.expectBlocked('uuid-subject-cannot-sign', async () => {
      const res = await request(app)
        .post(`/api/submissions/${SUBMISSION_ID}/sign-release`)
        .set('x-journey-user-raw', '3f1c2a10-0000-4000-8000-000000000009')
        .send(signBody());
      return { blocked: res.status === 401, status: res.status, error: res.body.error };
    });

    // ── KNOWN-BAD: wrong password (§11.200 two-factor) ──────────────────────
    await R.expectBlocked('wrong-password-is-401', async () => {
      const res = await asUser(APPROVER)(
        request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
      ).send(signBody({ password: 'not-the-password' }));
      const leaked = JSON.stringify(res.body);
      return {
        blocked: res.status === 401,
        status: res.status,
        // The response must not echo the password or the bound digest.
        leaksNothing: !leaked.includes('not-the-password') && !leaked.includes(payloadDigest),
      };
    });

    // ── 1. The signature is applied ─────────────────────────────────────────
    const signed = await R.step('approver-signs-the-release', async () => {
      const res = await asUser(APPROVER)(
        request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
      ).send(signBody());
      expect(res.status).toBe(200);
      expect(res.body.signatureId).toBeTruthy();
      expect(res.body.continuation).toBe('advanced');
      expect(res.body.runStatus).toBe('complete');
      return { status: res.status, signatureId: res.body.signatureId, signedAt: res.body.signedAt };
    });

    // ── 2. The row is durable, tenant-scoped, and payload-bound (C-17) ──────
    await R.step('signature-row-is-bound-to-the-payload-digest', async () => {
      const rows = await jdb.pool.query(
        `SELECT id, organization_id, bound_payload_digest, superseded_by,
                document_id, version_id, signer_id, signature_meaning
           FROM electronic_signatures ORDER BY id`,
      );
      expect(rows.rows).toHaveLength(1);
      const rec = rows.rows[0] as {
        organization_id: number; bound_payload_digest: string; superseded_by: number | null;
        document_id: number; version_id: number; signer_id: number;
      };
      // These three columns exist ONLY because of the C-17 port; before it the
      // route's binding UPDATE threw and returned 500 signature_binding_failed.
      expect(rec.organization_id).toBe(ORG);
      expect(rec.bound_payload_digest).toBe(payloadDigest);
      expect(rec.superseded_by).toBeNull();
      // §11.70 record link: bound to the document AND the specific version.
      expect(rec.document_id).toBe(DOC_ID);
      expect(rec.version_id).toBeTruthy();
      expect(rec.signer_id).toBe(APPROVER.id);
      return {
        organizationId: rec.organization_id,
        boundToDigest: rec.bound_payload_digest === payloadDigest,
        documentId: rec.document_id,
        versionId: rec.version_id,
      };
    });

    // An existing signature cannot authorize a freshly locked/inactive actor
    // to continue another pending run. Keep both evidence stores unchanged.
    const priorSignatures = await jdb.pool.query('SELECT * FROM electronic_signatures ORDER BY id');
    const priorAudit = await jdb.pool.query('SELECT * FROM audit_logs ORDER BY id');
    const priorSteps = await jdb.pool.query('SELECT * FROM submission_orchestrator_steps ORDER BY id');
    for (const state of ['locked', 'inactive', 'wrong-password'] as const) {
      await R.expectBlocked(`already-signed-release-refuses-${state}-actor`, async () => {
        if (state === 'locked') await jdb.pool.query(`UPDATE users SET locked_until=NOW()+interval '1 hour' WHERE id=$1`, [APPROVER.id]);
        if (state === 'inactive') await jdb.pool.query(`UPDATE users SET status='suspended' WHERE id=$1`, [APPROVER.id]);
        try {
          const res = await asUser(APPROVER)(request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`))
            .send(signBody({ runId: RETRY_RUN_ID, ...(state === 'wrong-password' ? { password: 'not-the-password' } : {}) }));
          expect((await jdb.pool.query('SELECT * FROM electronic_signatures ORDER BY id')).rows).toEqual(priorSignatures.rows);
          expect((await jdb.pool.query('SELECT * FROM audit_logs ORDER BY id')).rows).toEqual(priorAudit.rows);
          expect((await jdb.pool.query('SELECT * FROM submission_orchestrator_steps ORDER BY id')).rows).toEqual(priorSteps.rows);
          expect(res.body.signatureId).toBeUndefined();
          const code = state === 'locked' ? 'ACCOUNT_LOCKED' : state === 'inactive' ? 'ACCOUNT_INACTIVE' : 'PASSWORD_VERIFICATION_FAILED';
          return { blocked: res.status === (state === 'locked' ? 423 : 401) && res.body.code === code, status: res.status, code: res.body.code, priorHistoryPreserved: true };
        } finally {
          if (state === 'locked') await jdb.pool.query('UPDATE users SET locked_until=NULL WHERE id=$1', [APPROVER.id]);
          if (state === 'inactive') await jdb.pool.query(`UPDATE users SET status='active' WHERE id=$1`, [APPROVER.id]);
        }
      });
    }

    // ── 3. One active signature per release (OQ-3 / OQ-4) ───────────────────
    await R.step('re-signing-is-idempotent-not-duplicated', async () => {
      const res = await asUser(APPROVER)(
        request(app).post(`/api/submissions/${SUBMISSION_ID}/sign-release`),
      ).send(signBody({ runId: RETRY_RUN_ID }));
      expect(res.status).toBe(200);
      expect(res.body.already_signed).toBe(true);
      expect(res.body.signatureId).toBe(signed.signatureId);
      expect(res.body.continuation).toBe('advanced');
      expect(res.body.runStatus).toBe('complete');

      const count = await jdb.pool.query(`SELECT count(*)::int AS n FROM electronic_signatures`);
      expect((count.rows[0] as { n: number }).n).toBe(1);
      return { alreadySigned: res.body.already_signed, rows: 1 };
    });

    await R.step('completed-runs-retain-parseable-timestamps-and-step-history', async () => {
      const { getRun, getRunAudit } = await import('../../server/services/submission-package-orchestrator');
      for (const runId of [RUN_ID, RETRY_RUN_ID]) {
        const run = await getRun(runId, ORG);
        expect(run?.status).toBe('complete');
        expect(run?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(run?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        const audit = await getRunAudit(runId, ORG);
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ stepKey: 'package.sign', eventType: 'complete' });
      }
      expect((await jdb.pool.query('SELECT * FROM electronic_signatures ORDER BY id')).rows).toEqual(priorSignatures.rows);
      expect((await jdb.pool.query('SELECT * FROM audit_logs ORDER BY id')).rows).toEqual(priorAudit.rows);
      return { completedRuns: 2, signatureRows: 1, completedStepEvents: 2, priorSignatureAndAuditPreserved: true };
    });

    // ── 4. The resume-path lookup finds it, scoped to the tenant ────────────
    await R.step('orchestrator-resume-lookup-finds-the-active-signature', async () => {
      const mine = await jdb.pool.query(
        `SELECT id FROM electronic_signatures
          WHERE organization_id = $1 AND bound_payload_digest = $2 AND superseded_by IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [ORG, payloadDigest],
      );
      expect(mine.rows).toHaveLength(1);

      // OQ-7: knowing the digest is not enough — the other tenant sees nothing.
      const theirs = await jdb.pool.query(
        `SELECT id FROM electronic_signatures
          WHERE organization_id = $1 AND bound_payload_digest = $2 AND superseded_by IS NULL`,
        [OTHER_ORG, payloadDigest],
      );
      expect(theirs.rows).toHaveLength(0);
      return { foundForOwner: 1, foundForOtherTenant: 0 };
    });

    R.observations.push(
      'This journey is the route-level acceptance proof for C-17. Its signature-binding step writes organization_id and bound_payload_digest — columns that existed only in shared/schema.ts until the port, because the migration adding them was filed in the root lineage, which is not journaled and is in no apply script. On every migration-provisioned environment the route returned 500 signature_binding_failed and the release gate could not be passed.',
      'The route reads well under test: signerId comes from the verified principal and the body cannot override it; missing run and cross-tenant run both collapse to 404 so a probe cannot confirm existence; the wrong-password response echoes neither the password nor the bound digest; and §11.10(g) authority is resolved from the persisted organization_users membership rather than from any request-supplied role.',
      'part11ComplianceService binds the signature to the latest document VERSION content and fails closed when no version exists — so a signature can never be applied to content that is not there.',
    );
    R.limitations.push(
      'Schema comes from extractTableDdl against the real migrations (0000_sweet_joseph for the baseline tables, 0018_submission_orchestrator for the run store) plus the C-17 port. FK constraints, which that baseline applies via separate ALTER statements, are not extracted — this journey seeds only the tables it needs.',
      'run.submission_id_fk is seeded to the documents.id used as the §11.70 anchor, which is what the route consumes. The loadSubmissionFkBySubmissionIdText fallback path (and the public.submissions table) is therefore not exercised here.',
      'The frozen release record is synthetic; this proves signing and real continuation of that record, not scientific validity, export delivery, or agency acceptance.',
      'No journey account has an authenticator enrolled, so the second factor the route now requires of one (the platform signing ceremony, services/part11/reverify-signer.ts) is exercised by tests/unit/submission-sign-release-route.test.ts, not here.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(5);
  }, T);
});
