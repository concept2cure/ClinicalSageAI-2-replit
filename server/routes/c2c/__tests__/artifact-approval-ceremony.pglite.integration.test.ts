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
    comparePassword: async (plain: string, hash: string) => plain === PASSWORD && hash === 'stored-hash',
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
vi.mock('../project-access', () => ({
  verifyProjectAccess: vi.fn(async () => true),
  getActorRole: () => 'admin',
}));
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
import { commitSignedArtifactAct } from '../../../services/artifact-signed-act';

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
const PROJECT = 3;
const ARTIFACT = 'artifact_abc';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req as object, {
      userId: USER, userEmail: 'signer@example.com', userRole: 'admin',
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

async function seed(status: 'review' | 'approved', opts: { versionRow?: boolean } = {}) {
  await run(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, organization_id, project_id, type, category, title, content, content_hash, version, status, approved_version_id)
     VALUES ($1, $2, $3, 'document', 'document', 'Clinical overview', 'body', 'sha-v2', 2, $4, $5)`,
    [ARTIFACT, ORG, PROJECT, status, status === 'approved' ? 2 : null],
  );
  if (opts.versionRow !== false) {
    await run(
      `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash)
       SELECT id, organization_id, 2, 'body', 'sha-v2' FROM concept2cure_artifacts WHERE artifact_id = $1`,
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
    `INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'signer@example.com', 'Dana Reviewer', 'x')`,
  );
  await holder.pg.exec(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${USER}, 'admin')`,
  );
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  holder.mfa = false;
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
    expect(snap, 'the snapshot binds the hash the signature binds').toEqual({ approved_version_id: 2, content_hash: 'sha-v2' });
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
        artifact: {
          ...read,
          artifactId: read.artifact_id,
          approvedVersionId: read.approved_version_id,
          contentHash: read.content_hash,
          createdById: read.created_by_id,
        } as never,
        version: { ...version, contentHash: version.content_hash } as never,
        status,
        previousStatus,
        updateData: status === 'approved' ? { status, approvedVersionId: read.version } : { status, publishedVersionId: read.version },
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
    (await run(`SELECT * FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows[0];
  const readVersion = async () => (await run(`SELECT * FROM concept2cure_artifact_versions`)).rows[0];

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
});
