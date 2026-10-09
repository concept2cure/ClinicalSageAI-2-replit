/**
 * Assignment-bound review decisions and fail-closed signed-act preflight.
 * Runs the real service and SQL using PGlite when the repository runner is
 * available. Minimal tables deliberately allow corrupt relationships, so the
 * reader's refusals can be tested; this is not a deployed-schema/RLS test.
 * The fingerprint rule and contradiction engine are explicit dependency doubles.
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
  `);
}, 30_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.check.mockResolvedValue(clear);
  boundary.approval.mockReturnValue({ filable: true });
  await pg.exec('DELETE FROM concept2cure_review_decisions; DELETE FROM concept2cure_review_assignments;');
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
function signedInput(q: ApprovalActQueryable, status: 'approved' | 'locked' = 'approved') {
  return {
    q, organizationId: 99, projectId: 3,
    artifact: { id: 4242, version: 3, approvedVersionId: status === 'locked' ? 3 : null, publishedVersionId: null },
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
      if (c.message && !result.met) expect(result.message).toMatch(new RegExp(c.message));
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
    it('preserves the explicit-clear/no-review policy', async () => {
      expect(await refuseSignedArtifactAct(signedInput(queryable(), status))).toBeNull();
    });
    it('does not elevate warnings into blocking findings', async () => {
      boundary.check.mockResolvedValue({ ...clear, warningFindings: [{ ...finding, authorityState: 'warning' }] });
      expect(await refuseSignedArtifactAct(signedInput(queryable(), status))).toBeNull();
    });
  });
}

it('shared signed-approval preflight refuses missing decisions', async () => {
  await seed({ name: 'missing', assignments: [{ id: 1, artifact_id: 4242, organization_id: 99, reviewer_id: 701, review_round: 2, status: 'completed' }], decisions: [], met: false });
  expect(await refuseSignedArtifactAct(signedInput(queryable()))).toMatchObject({ httpStatus: 400 });
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
