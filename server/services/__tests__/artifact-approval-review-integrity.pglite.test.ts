/**
 * Assignment-bound review decisions and fail-closed signed-act preflight.
 * Runs the real service and SQL using PGlite when the repository runner is
 * available. Minimal tables deliberately allow corrupt relationships, so the
 * reader's refusals can be tested; this is not a deployed-schema/RLS test.
 * The fingerprint rule and contradiction engine are explicit dependency doubles.
 *
 * 2026-11-01 (F1, decision P-18): "An author still cannot approve their own
 * document." The artifact and version tables are here too (their authorship
 * columns only), so the shared preflight's separation-of-duties check reads
 * real SQL. Unless a case says otherwise the artifact was written by AUTHOR and
 * is signed by SIGNER, a different user.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import casesJson from './fixtures/artifact-review-quorum-cases.json';

const boundary = vi.hoisted(() => ({ check: vi.fn(), approval: vi.fn() }));
vi.mock('../contradiction-engine-service', () => ({
  contradictionEngineService: { checkPromotionBlocked: boundary.check },
}));
vi.mock('../ectd/package-content-fingerprint', () => ({ artifactApproval: boundary.approval }));

import {
  reviewQuorumVerdict,
  refuseSignedArtifactAct,
  refuseArtifactTransition,
  type ApprovalActQueryable,
} from '../artifact-approval-act';

type FixtureRow = Record<string, string | number | null>;
interface QuorumCase {
  name: string;
  assignments: FixtureRow[];
  decisions: FixtureRow[];
  met: boolean;
  message?: string;
  artifactPk?: number;
  organizationId?: number;
  currentVersion?: number | null;
  error?: 'assignments' | 'decisions';
}
const cases = casesJson as unknown as QuorumCase[];
const clear = { blocked: false, blockingFindings: [], warningFindings: [] };
const finding = { id: 7, title: 'Conflicting endpoint', severity: 'major', contradictionType: 'protocol_sap', authorityState: 'blocking' };
const AUTHOR = 501;
const SIGNER = 777;
const EXTERNAL_ID = 'artifact_review';
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE concept2cure_review_assignments (
      id integer PRIMARY KEY, artifact_id integer NOT NULL, organization_id integer NOT NULL,
      reviewer_id integer NOT NULL, review_round integer NOT NULL, status text NOT NULL
    );
    CREATE TABLE concept2cure_review_decisions (
      id integer PRIMARY KEY, assignment_id integer NOT NULL, artifact_id integer NOT NULL,
      organization_id integer NOT NULL, reviewer_id integer NOT NULL, review_round integer NOT NULL,
      decision text NOT NULL, version_reviewed integer
    );
    CREATE TABLE concept2cure_artifacts (
      id integer PRIMARY KEY, artifact_id text NOT NULL UNIQUE, organization_id integer NOT NULL, created_by_id integer,
      -- P-95 Q2: the quorum reads the two-reviewer floor from these.
      type text NOT NULL DEFAULT 'document', ctd_section text
    );
    CREATE TABLE concept2cure_artifact_versions (
      id serial PRIMARY KEY, artifact_id integer NOT NULL, organization_id integer NOT NULL,
      version integer NOT NULL, created_by_id integer
    );
  `);
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.check.mockResolvedValue(clear);
  boundary.approval.mockReturnValue({ filable: true });
  await pg.exec(`DELETE FROM concept2cure_review_decisions; DELETE FROM concept2cure_review_assignments;
    DELETE FROM concept2cure_artifact_versions; DELETE FROM concept2cure_artifacts;
    INSERT INTO concept2cure_artifacts (id, artifact_id, organization_id, created_by_id) VALUES (4242, '${EXTERNAL_ID}', 99, ${AUTHOR});
    INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, created_by_id) VALUES (4242, 99, 3, ${AUTHOR});`);
});

async function seed(c: QuorumCase) {
  for (const row of c.assignments) {
    await pg.query(`INSERT INTO concept2cure_review_assignments
      (id, artifact_id, organization_id, reviewer_id, review_round, status)
      VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.id, row.artifact_id, row.organization_id, row.reviewer_id, row.review_round, row.status]);
  }
  for (const row of c.decisions) {
    await pg.query(`INSERT INTO concept2cure_review_decisions
      (id, assignment_id, artifact_id, organization_id, reviewer_id, review_round, decision, version_reviewed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [row.id, row.assignment_id, row.artifact_id, row.organization_id, row.reviewer_id, row.review_round, row.decision, row.version_reviewed]);
  }
}
/**
 * A completed round-1 review approving version 3 by `reviewerId`. P-95
 * (2026-11-09): an approval follows a completed review, so the cases that
 * approve to test something else seed one by 701, neither signer nor author.
 */
async function reviewed(reviewerId = 701) {
  await pg.query(`INSERT INTO concept2cure_review_assignments (id, artifact_id, organization_id, reviewer_id, review_round, status)
    VALUES (1, 4242, 99, $1, 1, 'completed')`, [reviewerId]);
  await pg.query(`INSERT INTO concept2cure_review_decisions (id, assignment_id, artifact_id, organization_id, reviewer_id, review_round, decision, version_reviewed)
    VALUES (11, 1, 4242, 99, $1, 1, 'approve', 3)`, [reviewerId]);
}
async function snapshot() {
  return [
    (await pg.query('SELECT * FROM concept2cure_review_assignments ORDER BY id')).rows,
    (await pg.query('SELECT * FROM concept2cure_review_decisions ORDER BY id')).rows,
  ];
}
function queryable(error?: QuorumCase['error']): ApprovalActQueryable {
  return { query: async (sql, params = []) => {
    expect(sql.trim()).toMatch(/^SELECT\b/i);
    if (error === 'assignments' && sql.includes('concept2cure_review_assignments')) throw new Error('fixture assignments unavailable');
    if (error === 'decisions' && sql.includes('concept2cure_review_decisions')) throw new Error('fixture decisions unavailable');
    return pg.query(sql, params);
  } };
}
function signedInput(q: ApprovalActQueryable, status: 'approved' | 'locked' = 'approved', signerId = SIGNER) {
  return {
    q, organizationId: 99, projectId: 3, signerId,
    artifact: { id: 4242, artifactId: EXTERNAL_ID, version: 3, approvedVersionId: status === 'locked' ? 3 : null, publishedVersionId: null },
    previousStatus: status === 'locked' ? 'approved' : 'review', status,
  };
}

describe('canonical review-quorum integrity', () => {
  it.each(cases)('$name', async c => {
    await seed(c);
    const before = await snapshot();
    const q = queryable(c.error);
    const currentVersion = Object.prototype.hasOwnProperty.call(c, 'currentVersion') ? c.currentVersion : 3;
    const invoke = () => reviewQuorumVerdict(q, c.artifactPk ?? 4242, c.organizationId ?? 99, currentVersion as number);
    if (c.error) {
      await expect(invoke()).rejects.toThrow(/fixture .* unavailable/);
    } else {
      const result = await invoke();
      expect(result.met).toBe(c.met);
      if (c.message && !result.met) expect(result.message).toContain(c.message);
    }
    expect(await snapshot()).toEqual(before);
  });
});

for (const status of ['approved', 'locked'] as const) {
  describe(`${status}: contradiction preflight`, () => {
    it('refuses service failures without exposing the failure detail or reading quorum', async () => {
      boundary.check.mockRejectedValue(new Error('fixture private storage failure'));
      const q = { query: vi.fn(async () => { throw new Error('quorum must not run'); }) };
      const result = await refuseSignedArtifactAct(signedInput(q, status));
      expect(result).toMatchObject({ httpStatus: 503, code: 'CONTRADICTION_CHECK_UNAVAILABLE' });
      expect(result?.message).not.toContain('private storage failure');
      expect(q.query).not.toHaveBeenCalled();
      expect(boundary.check).toHaveBeenCalledWith(99, 3, 4242);
    });
    it.each([
      ['missing verdict', undefined], ['null verdict', null], ['missing fields', {}],
      ['string false', { ...clear, blocked: 'false' }], ['numeric zero', { ...clear, blocked: 0 }],
      ['missing finding arrays', { blocked: false }],
      ['null blocking array', { ...clear, blockingFindings: null }],
      ['null warning array', { ...clear, warningFindings: null }],
      ['blocking finding despite clearance', { ...clear, blockingFindings: [finding] }],
      ['blocked with no findings', { ...clear, blocked: true }],
    ])('refuses %s', async (_name, payload) => {
      boundary.check.mockResolvedValue(payload);
      const result = await refuseSignedArtifactAct(signedInput(queryable(), status));
      expect(result).toMatchObject({ httpStatus: 503, code: 'CONTRADICTION_CHECK_UNAVAILABLE' });
    });
    it('preserves a real blocking finding and its 409 refusal', async () => {
      boundary.check.mockResolvedValue({ ...clear, blocked: true, blockingFindings: [finding] });
      const result = await refuseSignedArtifactAct(signedInput(queryable(), status));
      expect(result).toMatchObject({ httpStatus: 409, details: { blockingFindings: [{ id: 7 }] } });
    });
    it('an explicit clearance passes, with the completed review P-95 requires', async () => {
      await reviewed();
      expect(await refuseSignedArtifactAct(signedInput(queryable(), status))).toBeNull();
    });
    it('does not elevate warnings into blocking findings', async () => {
      await reviewed();
      boundary.check.mockResolvedValue({ ...clear, warningFindings: [{ ...finding, authorityState: 'warning' }] });
      expect(await refuseSignedArtifactAct(signedInput(queryable(), status))).toBeNull();
    });
  });
}

/* P-95 (2026-11-09): no review at all is 409 REVIEW_REQUIRED, saying where a
   reviewer is named; every other quorum refusal stays 400 with no code. */
it('shared signed-approval preflight: no reviewer named is 409 REVIEW_REQUIRED', async () => {
  const refusal = await refuseSignedArtifactAct(signedInput(queryable()));
  expect(refusal).toMatchObject({ httpStatus: 409, code: 'REVIEW_REQUIRED' });
  expect(refusal?.message).toMatch(/no one has reviewed this document.*Review section/);
});
it('shared signed-approval preflight: every reviewer withdrawn is 409 REVIEW_REQUIRED', async () => {
  await seed({ name: 'withdrawn', assignments: [{ id: 1, artifact_id: 4242, organization_id: 99, reviewer_id: 701, review_round: 1, status: 'withdrawn' }], decisions: [], met: false });
  expect(await refuseSignedArtifactAct(signedInput(queryable()))).toMatchObject({ httpStatus: 409, code: 'REVIEW_REQUIRED' });
});
it('shared signed-approval preflight: a release reads no review', async () => {
  expect(await refuseSignedArtifactAct(signedInput(queryable(), 'locked'))).toBeNull();
});
it('shared signed-approval preflight refuses missing decisions', async () => {
  await seed({ name: 'missing', assignments: [{ id: 1, artifact_id: 4242, organization_id: 99, reviewer_id: 701, review_round: 2, status: 'completed' }], decisions: [], met: false });
  const refusal = await refuseSignedArtifactAct(signedInput(queryable()));
  expect(refusal).toMatchObject({ httpStatus: 400 });
  expect(refusal?.code).toBeUndefined();
});
it('an uncovered lock remains refused before contradiction lookup', async () => {
  boundary.approval.mockReturnValue({ filable: false, problem: 'not approved', remedy: 'review again', reason: 'no-approved-version' });
  expect(await refuseSignedArtifactAct(signedInput(queryable(), 'locked'))).toMatchObject({ code: 'LOCK_NOT_COVERED_BY_APPROVAL' });
  expect(boundary.check).not.toHaveBeenCalled();
});
it('does not change ordinary draft-to-review or signing role permissions', () => {
  expect(refuseArtifactTransition('draft', 'review', 'author')).toBeNull();
  expect(refuseArtifactTransition('review', 'approved', 'author')).toMatchObject({ httpStatus: 403 });
  expect(refuseArtifactTransition('approved', 'locked', 'reviewer')).toMatchObject({ httpStatus: 403 });
});

/**
 * 2026-11-01 (F1, decision P-18). Both signed-act doors (the status route and
 * AnA's update_artifact_status) ask this preflight before anyone signs, and a
 * user with signing authority could approve or release an artifact they wrote:
 * with no reviewer assigned the quorum is met, and nothing compared the signer
 * with the author. Authorship is the platform's one separation-of-duties check
 * (governance/separation-of-duties.ts, target `artifact:<artifact_id>`).
 */
describe('P-18: an author cannot approve or release their own artifact', () => {
  for (const status of ['approved', 'locked'] as const) {
    it(`${status}: the creator signing, no reviewer assigned, is refused 403 SEPARATION_OF_DUTIES`, async () => {
      const result = await refuseSignedArtifactAct(signedInput(queryable(), status, AUTHOR));
      expect(result).toMatchObject({ httpStatus: 403, code: 'SEPARATION_OF_DUTIES' });
      expect(result?.message).toMatch(/you are an author of this record \(artifact creator, artifact version ledger\)/);
    });
  }
  it('anyone who wrote a version is an author too, not only the creator', async () => {
    await pg.exec(`INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, created_by_id) VALUES (4242, 99, 2, ${SIGNER})`);
    expect(await refuseSignedArtifactAct(signedInput(queryable()))).toMatchObject({ httpStatus: 403, code: 'SEPARATION_OF_DUTIES' });
  });
  it('a version written in another organization is not read as authorship of this one', async () => {
    await pg.exec(`INSERT INTO concept2cure_artifact_versions (artifact_id, organization_id, version, created_by_id) VALUES (4242, 98, 2, ${SIGNER})`);
    await reviewed();
    expect(await refuseSignedArtifactAct(signedInput(queryable()))).toBeNull();
  });
  for (const status of ['approved', 'locked'] as const) {
    it(`${status}: a different user signing, after another user's completed review, passes`, async () => {
      await reviewed();
      expect(await refuseSignedArtifactAct(signedInput(queryable(), status))).toBeNull();
    });
  }
  it('the author is told so before the quorum: not that a review is still open', async () => {
    await seed({ name: 'pending', assignments: [{ id: 1, artifact_id: 4242, organization_id: 99, reviewer_id: 701, review_round: 1, status: 'pending' }], decisions: [], met: false });
    expect(await refuseSignedArtifactAct(signedInput(queryable(), 'approved', AUTHOR))).toMatchObject({ code: 'SEPARATION_OF_DUTIES' });
  });
  it('an artifact with no recorded author is refused 409: independence cannot be shown', async () => {
    await pg.exec('UPDATE concept2cure_artifacts SET created_by_id = NULL; UPDATE concept2cure_artifact_versions SET created_by_id = NULL;');
    expect(await refuseSignedArtifactAct(signedInput(queryable()))).toMatchObject({
      httpStatus: 409, code: 'SEPARATION_OF_DUTIES_AUTHOR_UNRESOLVED',
    });
  });
  it('an authorship read that fails is refused 503 and names no cause, and the quorum is not read', async () => {
    const reads: string[] = [];
    const q: ApprovalActQueryable = { query: async (sql, params = []) => {
      reads.push(sql);
      if (sql.includes('concept2cure_artifacts')) throw new Error('fixture private authorship failure');
      return pg.query(sql, params);
    } };
    const result = await refuseSignedArtifactAct(signedInput(q));
    expect(result).toMatchObject({ httpStatus: 503, code: 'SEPARATION_OF_DUTIES_UNVERIFIED' });
    expect(result?.message).not.toContain('private authorship failure');
    expect(reads.some(sql => sql.includes('concept2cure_review_assignments'))).toBe(false);
  });
});

/* 2026-11-09 (F1, P-95 Q1, under the founder's delegation): what counts as a
   review. The reviewer is neither the approving signer nor an author (read as
   P-18 reads authors), so an approver who reviewed in the latest round cannot
   sign that version's approval. Asked by the preflight both doors share. */
describe('P-95 Q1: the approval is signed by someone who did not review it', () => {
  it('the signer reviewed this version: refused', async () => {
    await reviewed(SIGNER);
    const refusal = await refuseSignedArtifactAct(signedInput(queryable()));
    expect(refusal).toMatchObject({ httpStatus: 400 });
    expect(refusal?.message).toMatch(/you reviewed this version in review round 1/);
  });

  it('another reviewer approved this version: the signer may approve', async () => {
    await reviewed(701);
    expect(await refuseSignedArtifactAct(signedInput(queryable()))).toBeNull();
  });
});

