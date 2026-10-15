/**
 * Approving or locking an artifact through AnA is the same electronic signature
 * the status route takes. PGlite, a real engine; the REAL AnA handler.
 *
 * WHAT WENT WRONG (docs/work-orders/README.md, hand-on item 10, 2026-09-28)
 * `update_artifact_status` was the reason tier: it set an artifact approved or
 * locked from a reason for change alone. No one re-authenticated, no signature
 * was written, no version was recorded and no lock snapshot was taken, yet the
 * artifact then read as approved or locked. It was the one approve/lock door a
 * person could reach: the status route signs both acts but has no client
 * caller, and the governed-action sign-off (GovernedActionSignoff) is the one
 * ceremony the product puts in front of a person.
 *
 * Now approve and lock are the e-signature tier. The governed-action route
 * re-verifies the signer (pinned in routes/ana-ri) and hands the handler a
 * verified sign-off with the declared meaning; the handler applies the status
 * route's own checks and commits through commitSignedArtifactAct, the act the
 * status route commits through. These cases drive the handler with the
 * sign-off that route produces, and judge it by what the act writes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from './governed-action-ledger.fixture';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));

vi.mock('../../../db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { pglitePool } = await import('./pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { pool, getPool: () => pool, db: drizzle(pool.client as never, { schema }) };
});
vi.mock('../../ectd/package-content-change', () => ({
  markPackagesContentChangedForArtifact: vi.fn(async () => ({
    packagesAffected: 0, bundlesInvalidated: 0, failed: false, ledgerWriteFailed: false,
  })),
}));
vi.mock('../../contradiction-engine-service', () => ({
  contradictionEngineService: {
    checkPromotionBlocked: vi.fn(async () => ({ blocked: false, blockingFindings: [], warningFindings: [] })),
  },
}));

import { updateArtifactStatus } from '../command-executor';
import type { CommandContext } from '../command-executor';

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

/** The sign-off the governed-action route builds after it re-verified the signer. */
function signed(meaning: string, over: Partial<NonNullable<CommandContext['signoff']>> = {}): CommandContext {
  return {
    userId: USER,
    organizationId: ORG,
    part11Enforce: true,
    humanConfirmed: true,
    signoff: {
      reasonForChange: 'Reviewed against the protocol; ready for filing.',
      signatureVerified: true,
      signaturePurpose: meaning,
      verifiedAt: new Date(),
      authenticationMethod: 'password',
      secondFactorVerified: false,
      ...over,
    },
  } as CommandContext;
}
/** A reason-tier sign-off: what the route gave this command before it was e-signature tier. */
const reasonOnly: CommandContext = {
  userId: USER,
  organizationId: ORG,
  part11Enforce: true,
  humanConfirmed: true,
  signoff: { reasonForChange: 'Reviewed against the protocol; ready for filing.', signatureVerified: false, signaturePurpose: 'approval' },
} as CommandContext;

const params = (status: 'approved' | 'locked') =>
  ({ projectId: PROJECT, artifactId: ARTIFACT as unknown as number, status });

const run = (sql: string, p: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, p);
const artifactRow = async () =>
  (await run(`SELECT status, approved_version_id, published_version_id FROM concept2cure_artifacts WHERE artifact_id = $1`, [ARTIFACT])).rows[0];
const signatures = async () =>
  (await run(`SELECT signature_type, signature_meaning, signer_name, signer_role, authentication_method FROM concept2cure_signatures ORDER BY signed_at`)).rows;
const ledger = async () => (await run(`SELECT command, target FROM c2c_ana_actions ORDER BY proposed_at`)).rows;
const snapshots = async () => (await run(`SELECT version_id, signature_meaning FROM concept2cure_submission_snapshots`)).rows;
const versions = async () => (await run(`SELECT version FROM concept2cure_artifact_versions`)).rows;

async function seed(status: 'review' | 'approved') {
  await run(
    `INSERT INTO concept2cure_artifacts
       (artifact_id, organization_id, project_id, type, category, title, content, content_hash, version, status, approved_version_id)
     VALUES ($1, $2, $3, 'document', 'document', 'Clinical overview', 'body', '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5', 2, $4, $5)`,
    [ARTIFACT, ORG, PROJECT, status, status === 'approved' ? 2 : null],
  );
  await run(
    `INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, content, content_hash)
     SELECT id, organization_id, 2, 'body', '230d8358dc8e8890b4c58deeb62912ee2f20357ae92a5cc861b98e68fe31acb5' FROM concept2cure_artifacts WHERE artifact_id = $1`,
    [ARTIFACT],
  );
}
const setRole = (role: string) =>
  run(`UPDATE organization_users SET role = $1 WHERE organization_id = $2 AND user_id = $3`, [role, ORG, USER]);

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  await holder.pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Sponsor')`);
  await holder.pg.exec(
    `INSERT INTO users (id, email, name, password_hash) VALUES (${USER}, 'signer@example.com', 'Dana Reviewer', 'x')`,
  );
  await holder.pg.exec(`INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${USER}, 'admin')`);
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await setRole('admin');
  await holder.pg.exec(`
    DELETE FROM concept2cure_signatures; DELETE FROM concept2cure_submission_snapshots;
    DELETE FROM concept2cure_provenance_events; DELETE FROM concept2cure_artifact_versions;
    DELETE FROM concept2cure_artifacts; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;
    DELETE FROM regulatory_audit_logs; DELETE FROM concept2cure_review_decisions; DELETE FROM concept2cure_review_assignments;`);
});

describe('AnA approving an artifact is an electronic signature', () => {
  it('with a reason only (no verified signature): refused, and nothing is written', async () => {
    await seed('review');
    const result = await updateArtifactStatus(reasonOnly, params('approved'));

    expect(result.success, result.message).toBe(false);
    expect(await artifactRow(), 'approved from a reason for change alone').toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
    expect(await ledger()).toEqual([]);
  });

  it('signed with the meaning approval: approved at the version, one signature, its ledger row', async () => {
    await seed('review');
    const result = await updateArtifactStatus(signed('approval'), params('approved'));

    expect(result.success, result.message).toBe(true);
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 2 });
    expect(await signatures()).toEqual([
      {
        signature_type: 'approval',
        signature_meaning: 'approval',
        signer_name: 'Dana Reviewer',
        signer_role: 'admin',
        authentication_method: 'password',
      },
    ]);
    expect(await ledger()).toEqual([{ command: 'approve', target: `artifact:${ARTIFACT}` }]);
  });

  it.each([['release'], ['authorship'], ['review']])(
    'signed with the meaning %s: refused, nothing written — the act fixes its meaning',
    async meaning => {
      await seed('review');
      const result = await updateArtifactStatus(signed(meaning), params('approved'));

      expect(result.success, result.message).toBe(false);
      expect(result.message).toContain('approval');
      expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
      expect(await signatures()).toEqual([]);
    },
  );

  it.each([['member'], ['manager'], ['author']])(
    'a %s, whom the status route does not let approve: refused, nothing written',
    async role => {
      await seed('review');
      await setRole(role);
      const result = await updateArtifactStatus(signed('approval'), params('approved'));

      expect(result.success, result.message).toBe(false);
      expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
      expect(await signatures()).toEqual([]);
    },
  );
});

describe('the status is read the one way, by the tier and by the handler', () => {
  it.each([['Approved'], [' approved '], ['APPROVED']])('unsigned %j: refused as needing a signature, nothing written', async status => {
    await seed('review');
    const result = await updateArtifactStatus(reasonOnly, { ...params('approved'), status } as never);

    expect(result.success, result.message).toBe(false);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
  });

  it('signed "Approved": approved at the version, recorded as approved', async () => {
    await seed('review');
    const result = await updateArtifactStatus(signed('approval'), { ...params('approved'), status: 'Approved' } as never);

    expect(result.success, result.message).toBe(true);
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 2 });
  });

  it.each([['archived'], ['effective'], ['published']])('unsigned %j: not a status this command writes; nothing changed', async status => {
    await seed('review');
    const result = await updateArtifactStatus(reasonOnly, { ...params('approved'), status } as never);

    expect(result.success, result.message).toBe(false);
    expect((await artifactRow()).status).toBe('review');
  });

  it('the ledger row names the door the act was taken through, and the signature the moment the signer was verified', async () => {
    await seed('review');
    const verifiedAt = new Date('2026-10-01T09:00:00.000Z');
    await updateArtifactStatus(signed('approval', { verifiedAt }), params('approved'));

    expect((await run(`SELECT surface FROM c2c_ana_actions`)).rows).toEqual([{ surface: 'ana-governed-action' }]);
    const [sig] = (await run(`SELECT authentication_timestamp FROM concept2cure_signatures`)).rows;
    expect(new Date(sig.authentication_timestamp).toISOString()).toBe(verifiedAt.toISOString());
  });
});

/**
 * The status route's checks before a signed act apply here too
 * (artifact-approval-act.ts refuseSignedArtifactAct). Pinned for this door as
 * they were pinned for authoring-actions approve-artifact / lock-artifact,
 * whose suite went with them (2026-10-01).
 */
describe('what the status route checks before a signed act, AnA checks too', () => {
  it('a lock over an edit made after the approval: refused, nothing written', async () => {
    await seed('approved');
    await run(`UPDATE concept2cure_artifacts SET version = 3 WHERE artifact_id = $1`, [ARTIFACT]);
    const result = await updateArtifactStatus(signed('release'), params('locked'));

    expect(result.success, result.message).toBe(false);
    expect(result.message).toMatch(/Cannot lock/);
    expect(await artifactRow()).toMatchObject({ status: 'approved', published_version_id: null });
    expect(await snapshots()).toEqual([]);
  });

  it('an approval with an assigned reviewer still pending: refused, nothing written', async () => {
    await seed('review');
    await run(
      `INSERT INTO concept2cure_review_assignments (assignment_id, artifact_id, organization_id, reviewer_id, assigned_by_id, status)
       SELECT 'asg_1', id, organization_id, $2, $2, 'pending' FROM concept2cure_artifacts WHERE artifact_id = $1`,
      [ARTIFACT, USER],
    );
    const result = await updateArtifactStatus(signed('approval'), params('approved'));

    expect(result.success, result.message).toBe(false);
    expect(result.message).toMatch(/have not yet submitted their decision/);
    expect(await artifactRow()).toMatchObject({ status: 'review', approved_version_id: null });
    expect(await signatures()).toEqual([]);
  });
});

describe('the review quorum decides on the version that would be approved', () => {
  /** One completed assignment, and its reviewer's decision on `versionReviewed`. */
  async function reviewed(decision: string, versionReviewed: number) {
    await run(
      `INSERT INTO concept2cure_review_assignments (assignment_id, artifact_id, organization_id, reviewer_id, assigned_by_id, status)
       SELECT 'asg_1', id, organization_id, $2, $2, 'completed' FROM concept2cure_artifacts WHERE artifact_id = $1`,
      [ARTIFACT, USER],
    );
    await run(
      `INSERT INTO concept2cure_review_decisions
         (decision_id, assignment_id, artifact_id, organization_id, reviewer_id, review_round, decision, version_reviewed)
       SELECT 'dec_1', a.id, a.artifact_id, a.organization_id, a.reviewer_id, 1, $1, $2
         FROM concept2cure_review_assignments a WHERE a.assignment_id = 'asg_1'`,
      [decision, versionReviewed],
    );
  }

  it('a decision recorded against an earlier version: refused, nothing written', async () => {
    await seed('review'); // version 2
    await reviewed('approve', 1);
    const result = await updateArtifactStatus(signed('approval'), params('approved'));

    expect(result.success, result.message).toBe(false);
    expect(result.message).toMatch(/recorded against version 1; the artifact is now version 2/);
    expect(await signatures()).toEqual([]);
  });

  it('a reviewer who did not approve: refused', async () => {
    await seed('review');
    await reviewed('reject', 2);
    const result = await updateArtifactStatus(signed('approval'), params('approved'));

    expect(result.success, result.message).toBe(false);
    expect(result.message).toMatch(/did not approve/);
  });

  it('every reviewer approving the current version: approved and signed at that version', async () => {
    await seed('review');
    await reviewed('approve', 2);
    const result = await updateArtifactStatus(signed('approval'), params('approved'));

    expect(result.success, result.message).toBe(true);
    expect(await artifactRow()).toMatchObject({ status: 'approved', approved_version_id: 2 });
  });
});

describe('a signature does not make an unlawful step lawful', () => {
  it.each([
    ['draft', 'approved', 'approval'],
    ['draft', 'locked', 'release'],
    ['review', 'locked', 'release'],
  ] as const)('signed %s → %s: refused by the status route\'s transitions, nothing written', async (from, to, meaning) => {
    await seed('review');
    await run(`UPDATE concept2cure_artifacts SET status = $1 WHERE artifact_id = $2`, [from, ARTIFACT]);
    const result = await updateArtifactStatus(signed(meaning), params(to));

    expect(result.success, result.message).toBe(false);
    expect(result.message).toMatch(/not permitted to perform transition|Invalid transition/);
    expect((await artifactRow()).status).toBe(from);
    expect(await signatures()).toEqual([]);
  });
});

describe('AnA locking an approved artifact is an electronic signature', () => {
  it('with a reason only: refused, not locked, no snapshot', async () => {
    await seed('approved');
    const result = await updateArtifactStatus(reasonOnly, params('locked'));

    expect(result.success, result.message).toBe(false);
    expect(await artifactRow()).toMatchObject({ status: 'approved', published_version_id: null });
    expect(await snapshots()).toEqual([]);
    expect(await signatures()).toEqual([]);
  });

  it('signed with the meaning release: locked at the version, with its snapshot, signature and ledger row', async () => {
    await seed('approved');
    const result = await updateArtifactStatus(signed('release'), params('locked'));

    expect(result.success, result.message).toBe(true);
    expect(await artifactRow()).toMatchObject({ status: 'locked', approved_version_id: 2, published_version_id: 2 });
    expect(await signatures()).toEqual([
      expect.objectContaining({ signature_type: 'publish', signature_meaning: 'release', signer_name: 'Dana Reviewer' }),
    ]);
    expect(await snapshots()).toEqual([{ version_id: 2, signature_meaning: 'release' }]);
    expect(await ledger()).toEqual([{ command: 'lock', target: `artifact:${ARTIFACT}` }]);
    expect(await versions()).toEqual([{ version: 2 }]);
  });

  it('signed with the meaning approval: refused, not locked', async () => {
    await seed('approved');
    const result = await updateArtifactStatus(signed('approval'), params('locked'));

    expect(result.success, result.message).toBe(false);
    expect(result.message).toContain('release');
    expect(await artifactRow()).toMatchObject({ status: 'approved', published_version_id: null });
    expect(await snapshots()).toEqual([]);
  });

  it('a reviewer, whom the status route lets approve but not lock: refused', async () => {
    await seed('approved');
    await setRole('reviewer');
    const result = await updateArtifactStatus(signed('release'), params('locked'));

    expect(result.success, result.message).toBe(false);
    expect(await artifactRow()).toMatchObject({ status: 'approved', published_version_id: null });
    expect(await signatures()).toEqual([]);
  });
});
