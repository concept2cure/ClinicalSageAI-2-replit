/**
 * The review record's draft rules and content hash (P1-25, P1-43). The
 * ceremony, the database guard and the reports are proven on PostgreSQL in
 * tests/db/compliance-review-records.dbtest.ts and
 * tests/db/compliance-review-reports.dbtest.ts; this file pins what a draft
 * may say and how its hash is formed.
 */
import { describe, expect, it } from 'vitest';
import { reviewContentHash, reviewDraftSchema } from '../compliance-reviews';

const RUN = { reportExportId: 'COMPLIANCE-REPORT-1-abc', reportDataHash: 'a'.repeat(64) };
const access = (decisions: unknown[], over: Record<string, unknown> = {}) => ({
  kind: 'access',
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  scope: { description: 'Members, roles and signing authority.', ...RUN },
  outcome: 'Reviewed.',
  decisions,
  ...over,
});
const issues = (body: unknown) => {
  const r = reviewDraftSchema.safeParse(body);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('a review draft', () => {
  it('an access review with a keep, a reduce and a remove, each as the policy asks, is accepted', () => {
    expect(
      issues(
        access([
          { userId: 1, role: 'owner', decision: 'keep' },
          { userId: 2, role: 'admin', decision: 'reduce', reducedTo: 'member', changeReference: 'audit row 81' },
          { userId: 3, role: 'manager', decision: 'remove', changeReference: 'audit row 82' },
        ]),
      ),
    ).toEqual([]);
  });

  it('a reduce names the role it leaves, and a reduce or remove names the change that carried it out', () => {
    expect(issues(access([{ userId: 2, role: 'admin', decision: 'reduce', changeReference: 'x' }]))).toEqual([
      'decisions.0.reducedTo: a reduce names the role it leaves',
    ]);
    expect(issues(access([{ userId: 3, role: 'admin', decision: 'remove' }]))).toEqual([
      'decisions.0.changeReference: a reduce or remove names the change that carried it out',
    ]);
    expect(issues(access([{ userId: 3, role: 'admin', decision: 'keep', reducedTo: 'member' }]))).toEqual([
      'decisions.0.reducedTo: only a reduce names a role',
    ]);
  });

  it('a reduce leaves a different role than the one reviewed (fix round, DP-69)', () => {
    expect(issues(access([{ userId: 2, role: 'admin', decision: 'reduce', reducedTo: 'Admin', changeReference: 'x' }]))).toEqual([
      'decisions.0.reducedTo: a reduce leaves a different role than the one reviewed',
    ]);
  });

  it.each(['access', 'audit_trail'])('a %s review names the report run it read, by export id and data hash (fix round, DP-69)', (kind) => {
    const body = { ...access(kind === 'access' ? [{ userId: 1, role: 'owner', decision: 'keep' }] : []), kind };
    expect(issues({ ...body, scope: { description: 'd' } })).toEqual([
      'scope.reportExportId: a review names the report run it read (its export id)',
      'scope.reportDataHash: a review names the report run it read (its data hash, 64 hex characters)',
    ]);
    expect(issues({ ...body, scope: { description: 'd', reportExportId: 'x', reportDataHash: 'not-a-hash' } })).toEqual([
      'scope.reportDataHash: a review names the report run it read (its data hash, 64 hex characters)',
    ]);
  });

  it('one line per account, at least one line, and no decision outside keep, reduce, remove', () => {
    const line = { userId: 1, role: 'owner', decision: 'keep' };
    expect(issues(access([line, line]))).toContain('decisions: one line per account');
    expect(issues(access([])).join()).toMatch(/decisions/);
    expect(issues(access([{ ...line, decision: 'approve' }])).join()).toMatch(/decisions\.0\.decision/);
  });

  it('a period that ends before it starts, or in the future, or is not a calendar date, is refused', () => {
    const line = [{ userId: 1, role: 'owner', decision: 'keep' }];
    expect(issues(access(line, { periodEnd: '2026-06-30' }))).toContain('periodEnd: the period ends before it starts');
    expect(issues(access(line, { periodEnd: '2999-01-01' }))).toContain('periodEnd: a review covers a period that has happened');
    expect(issues(access(line, { periodStart: '2026-02-30' })).join()).toMatch(/periodStart/);
  });

  it('an audit-trail review carries findings, may carry none, and takes no field it does not define', () => {
    const trail = { ...access([]), kind: 'audit_trail' };
    expect(issues(trail)).toEqual([]);
    expect(issues({ ...trail, decisions: [{ finding: 'Two role changes, both reasoned.', action: 'None required.' }] })).toEqual([]);
    expect(issues({ ...trail, signedAt: '2026-01-01' }).join()).toMatch(/Unrecognized key/);
    expect(issues({ ...trail, kind: 'quality' }).join()).toMatch(/kind/);
  });
});

describe('the content hash', () => {
  const row = {
    id: 7,
    organization_id: 42,
    kind: 'access',
    period_start: '2026-07-01',
    period_end: '2026-09-30',
    scope: { description: 'd', reportExportId: 'CR-1' },
    outcome: 'Reviewed.',
    decisions: [{ userId: 1, role: 'owner', decision: 'keep' }],
    reviewer_user_id: 5,
  };

  it('is sha256 hex, and the same content in any key order hashes the same', () => {
    const h = reviewContentHash(row);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(reviewContentHash({ ...row, scope: { reportExportId: 'CR-1', description: 'd' }, id: '7', reviewer_user_id: '5' })).toBe(h);
  });

  it.each([
    ['the outcome', { outcome: 'Reviewed again.' }],
    ['a decision', { decisions: [{ userId: 1, role: 'owner', decision: 'remove' }] }],
    ['the period', { period_end: '2026-09-29' }],
    ['the reviewer', { reviewer_user_id: 6 }],
    ['the organisation', { organization_id: 43 }],
    ['the record', { id: 8 }],
  ])('changes when %s changes', (_what, change) => {
    expect(reviewContentHash({ ...row, ...change })).not.toBe(reviewContentHash(row));
  });
});
