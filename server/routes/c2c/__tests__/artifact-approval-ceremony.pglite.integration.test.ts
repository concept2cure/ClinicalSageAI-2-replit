/**
 * Approving or locking an artifact through the status route is an electronic
 * signature: the signer re-authenticates, the meaning is the act's own, and the
 * status change, the signature and the ledger pair commit together or not at
 * all. PGlite, a real engine; the REAL status route is mounted.
 *
 * WHAT WENT WRONG (docs/work-orders/README.md, "Found by the vault re-baseline",
 * → …01Wcyqbq, handed on 2026-09-24 and not taken up)
 * PUT /projects/:projectId/artifacts/:artifactId/status, review → approved and
 * approved → locked, wrote a Part 11 'approval' / 'publish' signature to
 * concept2cure_signatures from the session alone. Nothing re-verified the signer
 * (§11.200): `authentication_method` said 'session_jwt'. The meaning was any
 * text. The printed name fell back to 'unknown'. The status change committed
 * first, and the signature after it on its own, so a failed signature left an
 * approved artifact with no signature. When no version row existed the
 * signature was skipped silently, and the approval stood unsigned.
 *
 * Only the re-authentication dependencies and services unrelated to the act are
 * stubbed. The review quorum, the signer lookup, the ledger writer and every
 * table the act writes are the production code over one PGlite connection.
 *
 * 2026-11-01 (F1, decision P-18): the seeded artifact names its author (AUTHOR,
 * a second user), so the signer is not its author unless a case says so.
 * Before this it named none, and nothing compared the signer with the author;
 * the separation-of-duties cases are at the end.
 *
 * 2026-11-02 (F1, the review round advances): the REAL reviewer-assignment and
 * review-decision routes are driven here too, as reviewers, against the review
 * tables' own migration; the cases are the last three describes. The
 * assignment's row lock is proved on a real server
 * (tests/db/artifact-review-round-lock.dbtest.ts): PGlite is one connection.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from '../../../services/ana-ri/__tests__/governed-action-ledger.fixture';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({
  pg: null as unknown as import('@electric-sql/pglite').PGlite,
  /** Whether the signer is enrolled in TOTP; '123456' is their current code. */
  mfa: false,
  /** Runs while the signer re-authenticates: after the route's preflight, before the signing transaction. */
  duringReauth: null as null | (() => Promise<unknown>),
}));
const PASSWORD = 'correct-horse-battery';

vi.mock('../../../db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { pglitePool } = await import('../../../services/ana-ri/__tests__/pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { pool, getPool: () => pool, db: drizzle(pool.client as never, { schema }) };
});
/* §11.200: the password check itself is pinned in services/part11; here the
   deps answer for one known password so the ROUTE's use of it is what is tested. */
vi.mock('../../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string, hash: string) => {
      await holder.duringReauth?.();
      return plain === PASSWORD && hash === 'stored-hash';
    },
    isMfaEnabled: async () => holder.mfa,
    verifyMfaToken: async (_userId: number, token: string) => token === '123456',
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
  loadPasswordHash: async () => 'stored-hash',
}));
vi.mock('../../../services/ectd/package-content-change', () => ({
  markPackagesContentChangedForArtifact: vi.fn(async () => ({
    packagesAffected: 0, bundlesInvalidated: 0, failed: false, ledgerWriteFailed: false,
  })),
}));
vi.mock('../../../services/contradiction-engine-service', () => ({
  contradictionEngineService: {
    checkPromotionBlocked: vi.fn(async () => ({ blocked: false, blockingFindings: [], warningFindings: [] })),
  },
}));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../services/cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: vi.fn(async (_org: number, raw: string) =>
    /^\d+$/.test(raw)
      ? { state: 'linked', artifactProjectId: Number(raw), via: 'numeric' }
      : { state: 'unaddressable', artifactProjectId: null, detail: 'not a project' },
  ),
}));
vi.mock('../project-access', async () => {
  const verifyProjectAccess = vi.fn(async () => true);
  // The router's admission, decided by the same stub (c2c/__tests__/support/admission-double.ts).
  const { admissionDecidedBy } = await import('./support/admission-double');
  return { verifyProjectAccess, getActorRole: () => 'admin', projectAdmissionMiddleware: admissionDecidedBy(verifyProjectAccess) };
});
vi.mock('../../../services/concept2cure/governedDocumentContractService', () => ({
  resolveGovernedContext: () => ({
    validation: { valid: true, errors: [], warnings: [] },
    resolved: {},
    contract: {
      clientTrack: 'x', submissionProgram: 'x', persona: 'x', regulatorScope: 'x',
      documentClass: 'x', readinessGate: 'x', workspaceTarget: 'x', originSurface: 'x',
      recommendationSource: 'x', regulatorIntent: 'x',
      exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'ok' },
    },
  }),
}));
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({
  interceptArtifactChange: vi.fn(),
  interceptFeedback: vi.fn(),
}));

import artifactRouter from '../artifacts';
import { db } from '../../../db';
import {
  ArtifactActConflictError,
  ArtifactActContractError,
  commitSignedArtifactAct,
} from '../../../services/artifact-signed-act';
import { artifactStatusUpdate, reviewQuorumVerdict } from '../../../services/artifact-approval-act';
import { concept2cureArtifacts, concept2cureArtifactVersions } from '../../../../shared/schema';
import { eq } from 'drizzle-orm';

const BASELINE = 'migrations/0000_sweet_joseph.sql';
const DDL = [
  `CREATE TABLE organizations (id serial PRIMARY KEY, name text);`,
  extractTableDdl(BASELINE, [
    'users', 'organization_users', 'concept2cure_artifacts', 'concept2cure_artifact_versions',
    'concept2cure_signatures', 'concept2cure_submission_snapshots', 'concept2cure_provenance_events',
    'regulatory_audit_logs',
  ]),
  ...[
    'db/migrations/20260508_artifact_citations.sql',
    'db/migrations/20260629_ana_artifact_thread_lookup.sql',
    'db/migrations/20260828_artifact_versions_updated_at.sql',
    'db/migrations/20260828_align_written_columns_with_migrations.sql',
    'db/migrations/20260314_phase12_multi_user_review.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

const ORG = 99;
const USER = 777;
/** Who wrote the seeded artifact and its version: not the signer. */
const AUTHOR = 778;
const PROJECT = 3;
const ARTIFACT = 'artifact_abc';

/** Who sends the request: the signer unless a case says so (2026-11-02, F1: the review-round cases act as reviewers). */
type Identity = { userId: number; userEmail: string; userRole: string };
const SIGNER: Identity = { userId: USER, userEmail: 'signer@example.com', userRole: 'admin' };
function app(as: Identity = SIGNER) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req as object, {
      userId: as.userId, userEmail: as.userEmail, userRole: as.userRole,
      tenantContext: { organizationId: ORG }, tenantId: ORG,
    });
    next();
  });
  a.use('/api/c2c', artifactRouter);
  return a;
}
const putStatus = (body: Record<string, unknown>) =>
  request(app()).put(`/api/c2c/projects/${PROJECT}/artifacts/${ARTIFACT}/status`).send(body);
const APPROVE = {
  status: 'approved',
  reason: 'Reviewed against the protocol; approved for filing.',
  attestation: { meaning: 'approval', attestationText: 'I approve this document as reviewed.' },
  reauth: { password: PASSWORD },
};
const LOCK = {
  status: 'locked',
  reason: 'Approved version released for the submission.',
  attestation: { meaning: 'release', attestationText: 'I release this approved version.' },
  reauth: { password: PASSWORD },
};

const run = (sql: string, params: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, params);
const artifactRow = async () =>
  (await run(`SELECT status, approved_version_id, published_version_id FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows[0];
const signatures = async () =>
  (await run(`SELECT signature_type, signature_meaning, signer_name, authentication_method, second_factor_verified FROM concept2cure_signatures ORDER BY signed_at`)).rows;
const ledger = async () =>
  (await run(`SELECT command, target FROM c2c_ana_actions ORDER BY proposed_at`)).rows;
/** The audit_logs half of the governed ledger pair. */
const auditHalf = async () => (await run(`SELECT target FROM audit_logs`)).rows;
const provenance = async () =>
  (await run(`SELECT event_action FROM concept2cure_provenance_events`)).rows;
const versions = async () =>
  (await run(`SELECT id, version, content_hash, change_description FROM concept2cure_artifact_versions`)).rows;
const snapshots = async () => (await run(`SELECT version_id FROM concept2cure_submission_snapshots`)).rows;

/**
 * P-95 (2026-11-09): an artifact is approved only after its review. A completed
 * round-1 review approving `version`, by a reviewer who is neither the signer
 * nor an author (Q1), for the cases that approve to test something else.
 */
async function reviewed(version = 2, reviewer = ADA) {
  await run(
    `WITH a AS (
       INSERT INTO concept2cure_review_assignments (assignment_id, artifact_id, organization_id, reviewer_id, assigned_by_id, review_round, status)
       SELECT 'asgn_reviewed', id, organization_id, $2::int, $3::int, 1, 'completed' FROM concept2cure_artifacts WHERE artifact_id = $1
       RETURNING id, artifact_id, organization_id)
     INSERT INTO concept2cure_review_decisions (decision_id, assignment_id, artifact_id, organization_id, reviewer_id, review_round, decision, version_reviewed)
     SELECT 'dec_reviewed', a.id, a.artifact_id, a.organization_id, $2::int, 1, 'approve', $4::int FROM a`,
    [ARTIFACT, reviewer, USER, version],
  );
}

async function seed(status: 'review' | 'approved', opts: { versionRow?: boolean; author?: number } = {}) {
  await run(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, organization_id, project_id, type, category, title, content, content_hash, version, status, approved_version_id, created_by_id)
     VALUES ($1, $2, $3, 'document', 'document', 'Clinical overview', 'body', '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5', 2, $4, $5, $6)`,
    [ARTIFACT, ORG, PROJECT, status, status === 'approved' ? 2 : null, opts.author ?? AUTHOR],
  );
  if (opts.versionRow !== false) {
    await run(
      `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash, created_by_id)
       SELECT id, organization_id, 2, 'body', '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5', created_by_id FROM concept2cure_artifacts WHERE artifact_id = $1`,
      [ARTIFACT],
    );
  }
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  await holder.pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Sponsor')`);
  await holder.pg.exec(
    `INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'signer@example.com', 'Dana Reviewer', 'x'),
       (${AUTHOR}, 'author@example.com', 'Ari Author', 'x')`,
  );
  await holder.pg.exec(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${USER}, 'admin')`,
  );
  await addReviewers();
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  holder.mfa = false;
  holder.duringReauth = null;
  await holder.pg.exec(`
    DELETE FROM concept2cure_signatures; DELETE FROM concept2cure_submission_snapshots;
    DELETE FROM concept2cure_provenance_events; DELETE FROM concept2cure_artifact_versions;
    DELETE FROM concept2cure_artifacts; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;
    DELETE FROM regulatory_audit_logs;`);
});

describe('approving an artifact is an electronic signature', () => {
  it.each([
    ['no re-authentication', { reauth: undefined }],
    ['a wrong password', { reauth: { password: 'not-it' } }],
  ])('%s: refused 401, and the artifact, the signatures and the ledger are untouched', async (_label, over) => {
    await seed('review');
    await reviewed();
    const res = await putStatus({ ...APPROVE, ...over });

    expect(res.status, JSON.stringify(res.body)).toBe(401);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures(), 'a signature was written for a signer nobody re-verified').toEqual([]);
    expect(await ledger()).toEqual([]);
  });

  it.each([
    ['no meaning', { meaning: undefined }],
    ['free text', { meaning: 'Approved' }],
    ['another act’s meaning', { meaning: 'release' }],
  ])('%s: refused 400 before the password is checked, nothing written', async (_label, meaning) => {
    await seed('review');
    // A wrong password too: a 400 (not 401) shows the meaning is checked first.
    const res = await putStatus({
      ...APPROVE,
      attestation: { ...APPROVE.attestation, ...meaning },
      reauth: { password: 'not-it' },
    });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toContain('approval');
    expect(await artifactRow()).toMatchObject({ status: 'review' });
    expect(await signatures()).toEqual([]);
  });

  it('re-authenticated: approved at the version, one signature naming the verified signer and how, and its ledger row', async () => {
    await seed('review');
    await reviewed();
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 2 });
    expect(await signatures()).toEqual([
      {
        signature_type: 'approval',
        signature_meaning: 'approval',
        signer_name: 'Dana Reviewer',
        authentication_method: 'password',
        second_factor_verified: false,
      },
    ]);
    expect(await ledger()).toEqual([{ command: 'approve', target: `artifact:${ARTIFACT}` }]);
    expect(await auditHalf(), 'the audit_logs half of the ledger pair').toEqual([{ target: `artifact:${ARTIFACT}` }]);
    expect(await provenance()).toEqual([{ event_action: 'status_approved' }]);
  });

});

describe('approving: what the signature binds, and what goes back with it', () => {
  it('enrolled in TOTP: signed with password and a verified code; without the code, refused', async () => {
    holder.mfa = true;
    await seed('review');
    await reviewed();

    const noCode = await putStatus(APPROVE);
    expect(noCode.status, JSON.stringify(noCode.body)).toBe(401);
    expect(await signatures()).toEqual([]);

    const res = await putStatus({ ...APPROVE, reauth: { password: PASSWORD, totp: '123456' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await signatures()).toEqual([
      expect.objectContaining({ authentication_method: 'password+totp', second_factor_verified: true }),
    ]);
  });

  it('no stored row for the version: the act records it from the content and signs that — never approved unsigned', async () => {
    await seed('review', { versionRow: false });
    await reviewed();
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const recorded = await versions();
    expect(recorded).toEqual([
      expect.objectContaining({
        version: 2,
        content_hash: createHash('sha256').update('body').digest('hex'),
        change_description: expect.stringMatching(/signed/),
      }),
    ]);
    const [sig] = (await run(`SELECT artifact_version_id FROM concept2cure_signatures`)).rows;
    expect(sig, 'approved with no signature').toBeDefined();
    expect(sig.artifact_version_id).toBe(recorded[0].id);
  });

  it('a provenance event that cannot be written takes the whole act back', async () => {
    await seed('review');
    await reviewed();
    await holder.pg.exec('ALTER TABLE concept2cure_provenance_events RENAME TO concept2cure_provenance_events_away');
    let res: request.Response;
    try {
      res = await putStatus(APPROVE);
    } finally {
      await holder.pg.exec('ALTER TABLE concept2cure_provenance_events_away RENAME TO concept2cure_provenance_events');
    }

    expect(res.status).toBe(500);
    expect(await artifactRow(), 'answered 500 over a committed approval').toMatchObject({ status: 'review' });
    expect(await signatures()).toEqual([]);
    expect(await auditHalf()).toEqual([]);
  });

  it('a signature that cannot be written takes the approval back with it', async () => {
    await seed('review');
    await reviewed();
    await holder.pg.exec('ALTER TABLE concept2cure_signatures RENAME TO concept2cure_signatures_away');
    let res: request.Response;
    try {
      res = await putStatus(APPROVE);
    } finally {
      await holder.pg.exec('ALTER TABLE concept2cure_signatures_away RENAME TO concept2cure_signatures');
    }

    expect(res.status).toBe(500);
    expect(await artifactRow(), 'the approval committed while its signature did not').toMatchObject({
      status: 'review', approved_version_id: null,
    });
    expect(await ledger(), 'a ledger row for an act that did not happen').toEqual([]);
    expect(await auditHalf()).toEqual([]);
  });
});

describe('a status change that is not a signature commits with its provenance event', () => {
  // 2026-10-18 (D5): the unsigned branch wrote the status, then the provenance
  // event, as two autocommitted statements.
  const RETURN = { reason: 'Returned for rework of section 2.' };
  it.each([
    ['review → draft', 'review', 'draft'],
    ['approved → review', 'approved', 'review'],
  ] as const)('%s: changed, with one provenance event naming it', async (_label, from, to) => {
    await seed(from);
    const res = await putStatus({ status: to, ...RETURN });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await artifactRow()).toMatchObject({ status: to });
    expect(await provenance()).toEqual([{ event_action: `status_${to}` }]);
  });

  it.each([
    ['review → draft', 'review', 'draft'],
    ['approved → review', 'approved', 'review'],
  ] as const)('%s: a provenance event that cannot be written takes the change back', async (_label, from, to) => {
    await seed(from);
    await holder.pg.exec('ALTER TABLE concept2cure_provenance_events RENAME TO concept2cure_provenance_events_away');
    let res: request.Response;
    try {
      res = await putStatus({ status: to, ...RETURN });
    } finally {
      await holder.pg.exec('ALTER TABLE concept2cure_provenance_events_away RENAME TO concept2cure_provenance_events');
    }

    expect(res.status).toBe(500);
    expect(await artifactRow(), 'answered 500 over a committed status change with no provenance').toMatchObject({
      status: from,
    });
    expect(await provenance()).toEqual([]);
  });
});

describe('locking an approved artifact is an electronic signature', () => {
  it('without re-authentication: refused 401, not locked, no snapshot', async () => {
    await seed('approved');
    const res = await putStatus({ ...LOCK, reauth: undefined });

    expect(res.status, JSON.stringify(res.body)).toBe(401);
    expect(await artifactRow()).toMatchObject({ status: 'approved', published_version_id: null });
    expect(await snapshots()).toEqual([]);
    expect(await signatures()).toEqual([]);
  });

  it('re-authenticated with the meaning release: locked at the version, with its snapshot, signature and ledger row', async () => {
    await seed('approved');
    const res = await putStatus(LOCK);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await artifactRow()).toMatchObject({ status: 'locked', published_version_id: 2 });
    expect(await snapshots()).toEqual([{ version_id: 2 }]);
    expect(await signatures()).toEqual([
      expect.objectContaining({ signature_type: 'publish', signature_meaning: 'release', signer_name: 'Dana Reviewer', authentication_method: 'password' }),
    ]);
    expect(await ledger()).toEqual([{ command: 'lock', target: `artifact:${ARTIFACT}` }]);
    const [snap] = (await run(`SELECT approved_version_id, content_hash FROM concept2cure_submission_snapshots`)).rows;
    expect(snap, 'the snapshot binds the hash the signature binds').toEqual({ approved_version_id: 2, content_hash: '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5' });
  });
});

describe('the signed act commits only from the state the signer was shown', () => {
  const commitAs = async (
    status: 'approved' | 'locked',
    previousStatus: string,
    read: Record<string, any>,
    version: Record<string, any>,
  ) =>
    db.transaction(tx =>
      commitSignedArtifactAct(tx, {
        artifact: read as never,
        version: version as never,
        status,
        previousStatus,
        updateData: artifactStatusUpdate({ version: read.version }, previousStatus, status, USER),
        organizationId: ORG,
        userId: USER,
        userRole: 'admin',
        attestationText: 'I sign this.',
        reason: null,
        secondFactorVerified: false,
        ipAddress: null,
      }),
    );
  const readArtifact = async () =>
    (await db.select().from(concept2cureArtifacts).where(eq(concept2cureArtifacts.artifactId, ARTIFACT)).limit(1))[0];
  const readVersion = async () => (await db.select().from(concept2cureArtifactVersions).limit(1))[0];

  it.each([
    ['approved in between (a second approval racing the first)', 'review', 'approved', `UPDATE concept2cure_artifacts SET status = 'approved', approved_version_id = 2 WHERE artifact_id = '${ARTIFACT}'`],
    ['edited in between (a new version)', 'review', 'approved', `UPDATE concept2cure_artifacts SET version = 3 WHERE artifact_id = '${ARTIFACT}'`],
    ['re-approved in between with no version recorded (the lock would cover nothing)', 'approved', 'locked', `UPDATE concept2cure_artifacts SET approved_version_id = NULL WHERE artifact_id = '${ARTIFACT}'`],
  ] as const)('%s: not signed, nothing written', async (_label, from, to, change) => {
    await seed(from as 'review' | 'approved');
    const read = await readArtifact();
    const version = await readVersion();
    await run(change);

    await expect(commitAs(to, from, read, version)).rejects.toMatchObject({ code: 'ARTIFACT_CHANGED' });
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
    expect(await snapshots()).toEqual([]);
  });

  // 2026-11-01 (F1, decision P-18): the act itself refuses the author, whatever its caller checked first.
  it.each([['review', 'approved'], ['approved', 'locked']] as const)('%s → %s by the author: not signed, nothing written', async (from, to) => {
    await seed(from, { author: USER });
    await expect(commitAs(to, from, await readArtifact(), await readVersion())).rejects.toMatchObject({ code: 'SEPARATION_OF_DUTIES' });
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
    expect(await snapshots()).toEqual([]);
  });
});

/**
 * The act writes exactly the canonical approval/lock columns. A caller that
 * hands it any other set is the server disagreeing with itself, and must never
 * be reported to a signer as "the document changed".
 *
 * 2026-10-11: the status route added one extra key (`metadata`) to that set and
 * every approve and lock answered 409 ARTIFACT_CHANGED — a sentence that was
 * not true, shown to users, for a mismatch between two of our own modules. The
 * metadata is now its own input, and a wrong column set is a contract error.
 */
describe('the column set the signed act accepts', () => {
  const act = async (over: Record<string, unknown>) => {
    const [artifact] = (await run(`SELECT * FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows;
    const [version] = (await run(`SELECT * FROM concept2cure_artifact_versions`)).rows;
    const read = {
      ...artifact,
      artifactId: artifact.artifact_id,
      approvedVersionId: artifact.approved_version_id,
      contentHash: artifact.content_hash,
      createdById: artifact.created_by_id,
      projectId: artifact.project_id,
      organizationId: artifact.organization_id,
      updatedAt: artifact.updated_at,
    };
    return db.transaction(tx =>
      commitSignedArtifactAct(tx, {
        artifact: read as never,
        version: { ...version, contentHash: version.content_hash } as never,
        status: 'approved',
        previousStatus: 'review',
        updateData: artifactStatusUpdate(read as never, 'review', 'approved', USER) as never,
        organizationId: ORG,
        userId: USER,
        userRole: 'admin',
        attestationText: 'I approve this document as reviewed.',
        reason: null,
        secondFactorVerified: false,
        ipAddress: null,
        ...over,
      }),
    );
  };

  it('the harness metadata the route republishes is written by the act, through the route', async () => {
    await seed('review');
    await reviewed();
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { metadata } = (await run(`SELECT metadata FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows[0];
    expect(metadata?.harness, 'the status change did not republish the harness block').toBeTruthy();
    expect(await signatures()).toHaveLength(1);
  });

  it.each([
    ['an extra column', { metadata: { a: 1 } }],
    ['a column it must write, removed', {}],
  ])('%s is a contract error, never "the document changed", and nothing is written', async (_label, extra) => {
    await seed('review');
    const [artifact] = (await run(`SELECT * FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows;
    const canonical = artifactStatusUpdate({ version: artifact.version } as never, 'review', 'approved', USER);
    const updateData = 'metadata' in extra ? { ...canonical, ...extra } : Object.fromEntries(Object.entries(canonical).slice(1));

    const err = await act({ updateData: updateData as never }).catch((e: unknown) => e);

    expect(err, 'a wrong column set was reported as a conflict').toBeInstanceOf(ArtifactActContractError);
    expect(err).not.toBeInstanceOf(ArtifactActConflictError);
    expect(String((err as Error).message)).not.toMatch(/document changed/i);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
  });
});

/**
 * 2026-11-01 (F1, decision P-18): "An author still cannot approve their own
 * document." A user with signing authority wrote an artifact, sent it to review
 * with no reviewer assigned (so the quorum was met), and approved it with their
 * own password: nothing compared the signer with the author. The check is the
 * platform's one separation-of-duties check, asked by the preflight both doors
 * share and again on the signing transaction (pinned for the act itself above,
 * with the other states the act refuses). Every other case in this file signs
 * as USER over an artifact AUTHOR wrote, so a non-author still signs.
 */
describe('P-18: the author cannot approve or release their own artifact', () => {
  it.each([
    ['approving', 'review', APPROVE, { status: 'review', approved_version_id: null }],
    ['releasing (locking)', 'approved', LOCK, { status: 'approved', published_version_id: null }],
  ] as const)('%s what you wrote, no reviewer assigned: refused 403 SEPARATION_OF_DUTIES before the password is verified, nothing written', async (_label, from, body, unchanged) => {
    await seed(from, { author: USER });
    let reauthAsked = false;
    holder.duringReauth = async () => { reauthAsked = true; };
    const res = await putStatus(body);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(JSON.stringify(res.body)).toContain('SEPARATION_OF_DUTIES');
    expect(JSON.stringify(res.body)).toMatch(/you are an author of this record/);
    expect(reauthAsked, 'the password was verified for an act that cannot be signed').toBe(false);
    expect(await artifactRow()).toMatchObject(unchanged);
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
    expect(await provenance()).toEqual([]);
    expect(await snapshots()).toEqual([]);
  });

  it('becoming an author after the preflight (a version written while signing): refused 403 on the signing transaction, nothing written', async () => {
    await seed('review');
    await reviewed();
    holder.duringReauth = () =>
      run(
        `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash, created_by_id)
         SELECT id, organization_id, 1, 'draft', 'h1', $2 FROM concept2cure_artifacts WHERE artifact_id = $1`,
        [ARTIFACT, USER],
      );
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(JSON.stringify(res.body)).toContain('SEPARATION_OF_DUTIES');
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
    expect(await auditHalf()).toEqual([]);
  });

});

/**
 * 2026-11-02 (F1, the review round advances). POST …/reviewers assigned into the
 * latest review round whatever its state, and the review tables allow one
 * assignment per reviewer per round (c2c_review_assign_unique). The quorum reads
 * only the latest round, and its refusals say "Route this document for review
 * again". That was impossible once any reviewer had decided: re-assigning them
 * answered 'already_assigned', a reviewer added to the round left the old
 * decision in it, a completed assignment cannot be withdrawn, and a second
 * decision is refused 409. So one request for changes, one rejection, or one
 * edit after a decision left the artifact unapprovable for good.
 *
 * An assignment now joins the latest round while any assignment in it is
 * neither completed nor withdrawn (the round is open), and opens the next round
 * once every assignment in it is (the round is closed). A new round holds only
 * the reviewers assigned to it: earlier decisions stay in the record and are not
 * counted, so a reviewer who asked for changes is not carried forward (the
 * founder's open question; nothing here carries anyone forward). A new round is
 * not opened over an objection to the current version, and a latest round whose
 * reviewers were all withdrawn is no review; both are pinned in their own
 * describe.
 *
 * Everything is driven through the real routes as the users who act: the
 * signer assigns and withdraws, each reviewer submits their own decision, and
 * the quorum is the production reader over the same tables.
 */
const ADA = 779;
const BEN = 780;
const CAM = 781;
const asReviewer = (userId: number): Identity => ({ userId, userEmail: `reviewer-${userId}@example.com`, userRole: 'reviewer' });
const REVIEW_PATH = `/api/c2c/projects/${PROJECT}/artifacts/${ARTIFACT}`;
const assign = (reviewerIds: number[]) => request(app()).post(`${REVIEW_PATH}/reviewers`).send({ reviewerIds });
const decide = (userId: number, decision: 'approve' | 'request_changes' | 'reject') =>
  request(app(asReviewer(userId))).post(`${REVIEW_PATH}/reviews/submit`).send({ decision, comment: `Recorded: ${decision}.` });
const withdraw = (assignmentId: string) => request(app()).delete(`${REVIEW_PATH}/reviewers/${assignmentId}`);
const ok = (res: request.Response) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
};
const assignmentRows = async () =>
  (await run(`SELECT reviewer_id, review_round, status FROM concept2cure_review_assignments ORDER BY review_round, reviewer_id`)).rows;
const decisionRows = async () =>
  (await run(`SELECT reviewer_id, review_round, decision, version_reviewed FROM concept2cure_review_decisions ORDER BY review_round, reviewer_id`)).rows;
const lastAssignmentEvent = async () =>
  (await run(`SELECT source_description, details FROM concept2cure_provenance_events WHERE event_action = 'reviewer_assigned' ORDER BY id DESC LIMIT 1`)).rows[0];
/** The production quorum, read as both approval doors read it, optionally for a signer (P-95 Q1). */
const quorum = async (currentVersion: number, signerId?: number) => {
  const [{ id }] = (await run(`SELECT id FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows;
  return reviewQuorumVerdict({ query: (text, params) => run(text, params ?? []) }, id, ORG, currentVersion, signerId);
};
/** The author revises the document under review: a new version, as the race case above edits it. */
const editToVersion = (version: number) => run(`UPDATE concept2cure_artifacts SET version = $2 WHERE artifact_id = $1`, [ARTIFACT, version]);
const addReviewers = () =>
  holder.pg.exec(
    `INSERT INTO users (id, email, name, password_hash) VALUES
       (${ADA}, 'reviewer-${ADA}@example.com', 'Ada Reviewer', 'x'),
       (${BEN}, 'reviewer-${BEN}@example.com', 'Ben Reviewer', 'x'),
       (${CAM}, 'reviewer-${CAM}@example.com', 'Cam Reviewer', 'x')
     ON CONFLICT (id) DO NOTHING;
     INSERT INTO organization_users (organization_id, user_id, role) VALUES
       (${ORG}, ${ADA}, 'reviewer'), (${ORG}, ${BEN}, 'reviewer'), (${ORG}, ${CAM}, 'reviewer')
     ON CONFLICT DO NOTHING;`,
  );

describe('F1: the latest review round is closed, so routing the document again opens the next round', () => {
  beforeAll(addReviewers);

  it.each([
    ['Ada asked for changes', 'request_changes', /did not approve \(decisions: request_changes\)/],
    ['Ada rejected', 'reject', /did not approve \(decisions: reject\)/],
    ['Ada approved, and the document was edited after', 'approve', /recorded against version 2; the artifact is now version 3/],
  ] as const)('%s; routed to Ada again: round 2 opens, her approval of the new version meets the quorum, and the document is approved', async (_label, first, refusal) => {
    await seed('review');
    expect(ok(await assign([ADA]))).toMatchObject({ reviewRound: 1, assignments: [{ reviewerId: ADA, status: 'pending', reviewRound: 1 }] });
    ok(await decide(ADA, first));
    await editToVersion(3);
    expect(await quorum(3)).toMatchObject({ met: false, message: expect.stringMatching(refusal) });

    const again = ok(await assign([ADA]));
    expect(again, 'routing again answered already_assigned in the closed round').toMatchObject({
      reviewRound: 2,
      previousRound: 1,
      assignments: [{ reviewerId: ADA, status: 'pending', reviewRound: 2 }],
    });
    expect(await assignmentRows()).toEqual([
      { reviewer_id: ADA, review_round: 1, status: 'completed' },
      { reviewer_id: ADA, review_round: 2, status: 'pending' },
    ]);
    const opened = await lastAssignmentEvent();
    expect(opened.details, 'the provenance event does not record that a round was opened').toMatchObject({ reviewerIds: [ADA], reviewRound: 2, previousRound: 1 });
    expect(opened.source_description).toBe('Assigned 1 reviewer(s) for round 2');

    expect(ok(await decide(ADA, 'approve'))).toMatchObject({ reviewRound: 2, versionReviewed: 3, roundSummary: { readyForApproval: true } });
    expect(await quorum(3)).toEqual({ met: true });
    expect(await decisionRows(), 'the first decision stays in the record').toEqual([
      { reviewer_id: ADA, review_round: 1, decision: first, version_reviewed: 2 },
      { reviewer_id: ADA, review_round: 2, decision: 'approve', version_reviewed: 3 },
    ]);
    ok(await putStatus(APPROVE));
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 3 });
  });

  it('Ada asked for changes twice: the third routing opens round 3 after round 2, and her approval of version 4 meets the quorum', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'request_changes'));
    await editToVersion(3);
    expect(ok(await assign([ADA]))).toMatchObject({ reviewRound: 2, previousRound: 1 });
    ok(await decide(ADA, 'request_changes'));
    await editToVersion(4);
    expect(await quorum(4)).toMatchObject({ met: false, message: expect.stringMatching(/did not approve \(decisions: request_changes\)/) });

    // The latest round is round 2, not round 1: read wrongly, Ada answers already_assigned in round 2 and the deadlock returns.
    expect(ok(await assign([ADA])), 'the third routing did not open the round after the latest').toMatchObject({
      reviewRound: 3,
      previousRound: 2,
      assignments: [{ reviewerId: ADA, status: 'pending', reviewRound: 3 }],
    });
    expect(await assignmentRows()).toEqual([
      { reviewer_id: ADA, review_round: 1, status: 'completed' },
      { reviewer_id: ADA, review_round: 2, status: 'completed' },
      { reviewer_id: ADA, review_round: 3, status: 'pending' },
    ]);
    expect((await lastAssignmentEvent()).details).toMatchObject({ reviewRound: 3, previousRound: 2 });

    expect(ok(await decide(ADA, 'approve'))).toMatchObject({ reviewRound: 3, versionReviewed: 4 });
    expect(await quorum(4)).toEqual({ met: true });
    ok(await putStatus(APPROVE));
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 4 });
  });

  it('every reviewer was withdrawn: the round is closed, and the same reviewer is assigned again in round 2', async () => {
    await seed('review');
    const [first] = ok(await assign([ADA])).assignments;
    ok(await withdraw(first.assignmentId));

    expect(ok(await assign([ADA])), 'the withdrawn reviewer answered already_assigned').toMatchObject({
      reviewRound: 2,
      previousRound: 1,
      assignments: [{ reviewerId: ADA, status: 'pending', reviewRound: 2 }],
    });
    ok(await decide(ADA, 'approve'));
    expect(await quorum(2)).toEqual({ met: true });
  });

  it('the round is chosen from the rows the quorum reads: another organization’s pending row on the artifact does not hold a closed round open', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'approve'));
    // RLS is off here, as in every environment but production, so the route sees this row unless it scopes it out.
    await run(`INSERT INTO organizations (id, name) VALUES (100, 'Other sponsor') ON CONFLICT (id) DO NOTHING`);
    await run(
      `INSERT INTO concept2cure_review_assignments (assignment_id, artifact_id, organization_id, reviewer_id, assigned_by_id, review_round, status)
       SELECT 'asgn_other_org', id, 100, $2, $3, 1, 'pending' FROM concept2cure_artifacts WHERE artifact_id = $1`,
      [ARTIFACT, CAM, USER],
    );
    expect(await quorum(2), 'the quorum does not count the other organization’s row').toEqual({ met: true });

    expect(ok(await assign([BEN]))).toMatchObject({ reviewRound: 2, previousRound: 1 });
  });
});

describe('F1: a new round holds only the reviewers assigned to it', () => {
  beforeAll(addReviewers);

  /* 2026-11-02 (F1; the adversarial review of the round repair). Once a closed
     round opens the next one, two paths set a request for changes aside with
     no approval of the document as it stands: assigning a reviewer into a new
     round and withdrawing them (an all-withdrawn round met the quorum), and a
     co-reviewer assigning themselves into a new round with the document
     unchanged. Before F1 both were refused only because the artifact was
     deadlocked. Now a new round is not opened over an objection to the current
     version (objectionToCurrentVersion), and an all-withdrawn latest round is
     no review (reviewQuorumVerdict, P-95). */
  it('Ada asked for changes to version 2: with the document unchanged, assigning Ben does not open round 2 (409), and nothing is written', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'request_changes'));

    const refused = await assign([BEN]);
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(JSON.stringify(refused.body)).toMatch(/1 reviewer\(s\) in round 1 asked for changes to version 2, and the document has not changed since\. Edit the document, then route it for review again\./);
    expect(await assignmentRows()).toEqual([{ reviewer_id: ADA, review_round: 1, status: 'completed' }]);
    expect(await quorum(2)).toMatchObject({ met: false, message: expect.stringMatching(/decisions: request_changes/) });
  });

  it('a co-reviewer who approved cannot assign themselves into a new round over Ada’s request for changes (409)', async () => {
    await seed('review');
    ok(await assign([ADA, BEN]));
    ok(await decide(ADA, 'request_changes'));
    ok(await decide(BEN, 'approve'));

    const self = await request(app(asReviewer(BEN))).post(`${REVIEW_PATH}/reviewers`).send({ reviewerIds: [BEN] });
    expect(self.status, JSON.stringify(self.body)).toBe(409);
    expect(await assignmentRows()).toEqual([
      { reviewer_id: ADA, review_round: 1, status: 'completed' },
      { reviewer_id: BEN, review_round: 1, status: 'completed' },
    ]);
    const signed = await putStatus(APPROVE);
    expect(signed.status, 'the request for changes was set aside').not.toBe(200);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
  });

  it('Ada asked for changes; the document is edited; Ben is assigned (round 2) and withdrawn: the quorum refuses an all-withdrawn round, and the approval is refused', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'request_changes'));
    await editToVersion(3);

    const [ben] = ok(await assign([BEN])).assignments;
    expect(ben).toMatchObject({ reviewerId: BEN, status: 'pending', reviewRound: 2 });
    ok(await withdraw(ben.assignmentId));

    expect(await quorum(3)).toMatchObject({ met: false, message: expect.stringMatching(/every reviewer in the latest review round was withdrawn/) });
    const signed = await putStatus(APPROVE);
    expect(signed.status, 'approved with no approval on record').not.toBe(200);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });

    // The remedy works: assigning again opens round 3 (round 2 holds no objection), and an approval of version 3 meets the quorum.
    expect(ok(await assign([BEN]))).toMatchObject({ reviewRound: 3, previousRound: 2 });
    ok(await decide(BEN, 'approve'));
    expect(await quorum(3)).toEqual({ met: true });
  });

  it('round 1 closed with an approval (quorum met): assigning Ben opens round 2, and the quorum then waits for Ben alone', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'approve'));
    expect(await quorum(2)).toEqual({ met: true });

    expect(ok(await assign([BEN]))).toMatchObject({
      reviewRound: 2,
      previousRound: 1,
      assignments: [{ reviewerId: BEN, status: 'pending', reviewRound: 2 }],
    });
    // The consequence: a new round holds only the reviewers assigned to it.
    // Ada's approval stays in round 1's record and is not counted in round 2,
    // so the approval now waits for Ben, and Ben's approval alone will meet it.
    expect(await quorum(2)).toMatchObject({ met: false, message: expect.stringMatching(/1 of 1 reviewers have not yet submitted/) });
    const refused = await putStatus(APPROVE);
    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });

    ok(await decide(BEN, 'approve'));
    expect(await quorum(2)).toEqual({ met: true });
    expect(await decisionRows()).toEqual([
      { reviewer_id: ADA, review_round: 1, decision: 'approve', version_reviewed: 2 },
      { reviewer_id: BEN, review_round: 2, decision: 'approve', version_reviewed: 2 },
    ]);
  });
});

describe('F1: the latest review round is open, so an assignment joins it and the round is not split', () => {
  beforeAll(addReviewers);

  it.each([
    ['pending', async () => undefined],
    ['in progress', async () => run(`UPDATE concept2cure_review_assignments SET status = 'in_progress' WHERE reviewer_id = $1`, [ADA])],
  ])('Ada is %s: Ben joins round 1, and the quorum waits for both', async (_label, setState) => {
    await seed('review');
    ok(await assign([ADA]));
    await setState();

    const added = ok(await assign([BEN]));
    expect(added).toMatchObject({ reviewRound: 1, assignments: [{ reviewerId: BEN, status: 'pending', reviewRound: 1 }] });
    expect(added, 'no round was opened').not.toHaveProperty('previousRound');
    expect(ok(await assign([ADA])).assignments, 'a reviewer already in the open round').toEqual([
      { reviewerId: ADA, status: 'already_assigned', reviewRound: 1 },
    ]);
    ok(await decide(ADA, 'approve'));
    expect(await quorum(2)).toMatchObject({ met: false, message: expect.stringMatching(/1 of 2 reviewers have not yet submitted/) });
    ok(await decide(BEN, 'approve'));
    expect(await quorum(2)).toEqual({ met: true });
  });

  it('round 2 is open (Ada pending in it): Ben joins round 2, and no round is opened', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'request_changes'));
    await editToVersion(3);
    expect(ok(await assign([ADA]))).toMatchObject({ reviewRound: 2, previousRound: 1 });

    // The latest round is round 2, and it is open. Read as round 1 (closed), the answer and the provenance would claim a round was opened.
    const added = ok(await assign([BEN]));
    expect(added).toMatchObject({ reviewRound: 2, assignments: [{ reviewerId: BEN, status: 'pending', reviewRound: 2 }] });
    expect(added, 'no round was opened').not.toHaveProperty('previousRound');
    expect((await lastAssignmentEvent()).details, 'the provenance records a round that was not opened').not.toHaveProperty('previousRound');
    expect(await assignmentRows()).toEqual([
      { reviewer_id: ADA, review_round: 1, status: 'completed' },
      { reviewer_id: ADA, review_round: 2, status: 'pending' },
      { reviewer_id: BEN, review_round: 2, status: 'pending' },
    ]);
    expect(await quorum(3)).toMatchObject({ met: false, message: expect.stringMatching(/2 of 2 reviewers have not yet submitted/) });
  });

  it('the round stays open while any reviewer has not decided: Ada asked for changes, Ben is pending, and Cam joins round 1', async () => {
    await seed('review');
    ok(await assign([ADA, BEN]));
    ok(await decide(ADA, 'request_changes'));

    expect(ok(await assign([CAM]))).toMatchObject({ reviewRound: 1, assignments: [{ reviewerId: CAM, status: 'pending', reviewRound: 1 }] });
    expect(await assignmentRows()).toEqual([
      { reviewer_id: ADA, review_round: 1, status: 'completed' },
      { reviewer_id: BEN, review_round: 1, status: 'pending' },
      { reviewer_id: CAM, review_round: 1, status: 'pending' },
    ]);
  });
});

/**
 * 2026-11-09 (F1, P-95 Q1, under the founder's delegation): what counts as a
 * review. The reviewer is neither the approving signer nor an author, read as
 * P-18 reads authors (the artifact's creator and every version's writer). An
 * approver who recorded a decision on a version, in any round, cannot sign that
 * version's approval. The routes refused only the creator as a reviewer, and
 * nothing compared the reviewer with the signer.
 */
/**
 * P-95 (2026-11-09): review is mandatory before a regulated document is
 * approved, and every artifact counts as regulated. Until then no assignment at
 * all met the quorum. The refusal is 409 REVIEW_REQUIRED before the password, as
 * the editor's door answers its own, and the signing transaction reads it again.
 */
describe('P-95: an artifact is approved only after its review', () => {
  it('no reviewer named: refused 409 REVIEW_REQUIRED before the password is verified, nothing written', async () => {
    await seed('review');
    let reauthAsked = false;
    holder.duringReauth = async () => { reauthAsked = true; };
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(JSON.stringify(res.body)).toContain('REVIEW_REQUIRED');
    expect(JSON.stringify(res.body)).toMatch(/no one has reviewed this document.*Review section/);
    expect(reauthAsked, 'the password was verified for an act that cannot be signed').toBe(false);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
  });

  it('the review is gone by the time it is signed: refused on the signing transaction, nothing written', async () => {
    await seed('review');
    await reviewed();
    holder.duringReauth = () => run(`DELETE FROM concept2cure_review_assignments`);
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).not.toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/no one has reviewed this document/);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
  });

  it('an independent reviewer approved this version: approved', async () => {
    await seed('review');
    await reviewed();
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 2 });
  });
});

describe('P-95 Q1: the reviewer is neither the approving signer nor an author', () => {
  beforeAll(addReviewers);
  /** Makes `userId` a version writer: a version row numbered by their id, so it never collides. The current version is unchanged. */
  const writeVersionAs = (userId: number) =>
    run(
      `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash, created_by_id)
       SELECT id, organization_id, $2::int, 'draft', 'h-' || $2::text, $2::int FROM concept2cure_artifacts WHERE artifact_id = $1`,
      [ARTIFACT, userId],
    );

  it('the signer reviewed and approved this version: their approval is refused before the password is verified, nothing written', async () => {
    await seed('review');
    ok(await assign([USER]));
    ok(await decide(USER, 'approve'));
    let reauthAsked = false;
    holder.duringReauth = async () => { reauthAsked = true; };
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/you reviewed this version in review round 1/);
    expect(reauthAsked, 'the password was verified for an act that cannot be signed').toBe(false);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
  });

  it('the signer reviewed this version in a closed round, and a colleague in a new one: still refused', async () => {
    await seed('review');
    ok(await assign([USER]));
    ok(await decide(USER, 'approve'));
    expect(ok(await assign([ADA])), 'the assignment opened round 2').toMatchObject({ reviewRound: 2, previousRound: 1 });
    ok(await decide(ADA, 'approve'));
    expect(await quorum(2, USER)).toMatchObject({ met: false, message: expect.stringMatching(/you reviewed this version in review round 1/) });

    const res = await putStatus(APPROVE);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
  });

  it('the signer becomes a reviewer of the round while signing: refused on the signing transaction, nothing written', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'approve'));
    holder.duringReauth = () =>
      run(
        `WITH a AS (
           INSERT INTO concept2cure_review_assignments (assignment_id, artifact_id, organization_id, reviewer_id, assigned_by_id, review_round, status)
           SELECT 'asgn_signer', id, organization_id, $2, $2, 1, 'completed' FROM concept2cure_artifacts WHERE artifact_id = $1
           RETURNING id, artifact_id, organization_id)
         INSERT INTO concept2cure_review_decisions (decision_id, assignment_id, artifact_id, organization_id, reviewer_id, review_round, decision, version_reviewed)
         SELECT 'dec_signer', a.id, a.artifact_id, a.organization_id, $2, 1, 'approve', 2 FROM a`,
        [ARTIFACT, USER],
      );
    const res = await putStatus(APPROVE);

    expect(res.status, JSON.stringify(res.body)).not.toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/you reviewed this version in review round 1/);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
  });

  it('a reviewer who wrote a version is not assigned (400), and cannot decide once they have written one (403)', async () => {
    await seed('review');
    await writeVersionAs(ADA);
    const assigned = await assign([ADA]);
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(400);
    expect(JSON.stringify(assigned.body)).toMatch(/wrote this document/);

    ok(await assign([BEN]));
    await writeVersionAs(BEN);
    const decided = await decide(BEN, 'approve');
    expect(decided.status, JSON.stringify(decided.body)).toBe(403);
    expect(await decisionRows()).toEqual([]);
  });

  it('a decision by someone who is now an author does not meet the quorum', async () => {
    await seed('review');
    ok(await assign([ADA]));
    ok(await decide(ADA, 'approve'));
    expect(await quorum(2)).toEqual({ met: true });
    await writeVersionAs(ADA);
    expect(await quorum(2)).toMatchObject({ met: false, message: expect.stringMatching(/wrote this document/) });
    expect((await putStatus(APPROVE)).status).not.toBe(200);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
  });
});
