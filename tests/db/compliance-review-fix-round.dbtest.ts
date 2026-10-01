/**
 * Fix round for P1-25 and P1-43 (2026-10-01): findings DP-69 and DP-70.
 *
 * ── DP-69 (what the verifier reproduced) ─────────────────────────────────────
 * A signed review read "Current" whatever period it covered, and the check
 * that every privileged account has a decision was made at a period end the
 * reviewer chose. Three probes, each drafted and signed with 201:
 *   (a) an access review of 2000-01-01 with one line, for user 999999 (not a
 *       member), naming an export id that never ran. The status then read
 *       current, next due 2027-01-01.
 *   (b) an audit-trail review of 1999-01-01 with no findings and outcome
 *       'n/a'. The integrity attestation then read Current.
 *   (c) an access review ending yesterday with one line, for a plain member.
 *       The member list was read as of the period end, so administrators who
 *       joined since were not required.
 * Each probe is a case below, as found. Then each rule it broke, on its own,
 * with an otherwise valid review:
 *   - the period: it ended no more than three months ago, and it starts no
 *     later than the day after the last signed review of its kind ended;
 *   - the lines: each names a member of this organisation with the role the
 *     member holds now; a reduce names the role now in effect, and a remove
 *     names an account whose removal was recorded or whose account is
 *     deactivated;
 *   - the run the review names: one this organisation made, of the matching
 *     report, with that data hash;
 *   - completeness: every account that holds a privileged role now;
 *   - the clock: a review is due three months after the end of the period it
 *     covered, so signing a review of an old period does not make it current;
 *   - signing checks all of it again, on the record as it then is.
 *
 * ── DP-70 ────────────────────────────────────────────────────────────────────
 * The tenant purge does not reach compliance_review_records, and a signed row
 * cannot be deleted. The record is retained with the audit trail (DPA §3.5),
 * and the tenant export returns it: shown here on the real export.
 *
 * Stack and posture as compliance-review-fixture.ts describes (app_service,
 * RLS enforcing, the production auth boundary and report router).
 *
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-25-P1-43-review-records/
 * (red/fix-round/, green/fix-round/).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import {
  ORG_A, PASSWORD, REASON, accessDraft, asRuntime, auditTrailDraft, auth, decisionsForA, laySignedReview, owner, people,
  provision, recordRuns, runs, sealedRun, stack, teardown,
} from './compliance-review-fixture';

/* As in compliance-review-records.dbtest.ts: the per-signer attempt limit has
   its own suite, and this file signs often enough to spend its budget. */
vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

let app: express.Express;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const CHANGE = 'Recorded in the administrative changes report (dbcrr).';

beforeAll(async () => {
  await provision();
  app = await stack();
  await recordRuns();
}, 120_000);
afterAll(async () => {
  await teardown();
});

async function draft(body: Record<string, unknown>) {
  return request(app).post('/api/audit/reviews').set(auth(people.reviewer)).send(body);
}
async function sign(id: number) {
  return request(app).post(`/api/audit/reviews/${id}/sign`).set(auth(people.reviewer)).send({ reason: REASON, meaning: 'review', password: PASSWORD });
}
async function status() {
  const res = await request(app).get('/api/audit/reviews').set(auth(people.reviewer));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.status as Record<'access' | 'audit_trail', { state: string; latest: Record<string, unknown> | null }>;
}
async function signaturesOn(id: number) {
  const { rows } = await owner.query('SELECT id FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2', [
    ORG_A,
    `compliance-review:${id}`,
  ]);
  return rows;
}
async function recordStatus(id: number): Promise<string | undefined> {
  const { rows } = await owner.query('SELECT status FROM compliance_review_records WHERE id = $1', [id]);
  return rows[0]?.status;
}
/** The review row of the integrity attestation for the quarter, run through the real report route. */
async function attestationReviewRow(): Promise<Record<string, unknown>> {
  const res = await request(await stack()).get(`/api/audit/reports/audit-trail-integrity?from=2026-07-01&to=${today}`).set(auth(people.reviewer));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const data = JSON.parse(res.body.export.data) as { sections: Array<{ key: string; rows: Record<string, unknown>[] }> };
  return data.sections.find((s) => s.key === 'review')!.rows[0];
}
/** A refusal: its status and its code. */
async function expectRefused(res: request.Response, statusCode: number, code: string) {
  expect(res.status, JSON.stringify(res.body)).toBe(statusCode);
  expect(res.body.error?.code, JSON.stringify(res.body)).toBe(code);
}
const line = (userId: number, role: string, decision: string, more: Record<string, unknown> = {}) => ({ userId, role, decision, ...more });

describe('DP-69 (a): an old period, a line for someone who is not a member, a run that never happened', () => {
  it('probe (a) as found is refused, and no access review is recorded', async () => {
    const res = await draft({
      kind: 'access',
      periodStart: '2000-01-01',
      periodEnd: '2000-01-01',
      scope: { description: 'probe (a)', reportExportId: 'exp-that-never-ran' },
      outcome: 'probe (a)',
      decisions: [line(999999, 'admin', 'keep')],
    });
    if (res.status === 201) await sign(Number(res.body.review.id));
    expect(res.status, JSON.stringify(res.body)).not.toBe(201);
    expect((await status()).access).toMatchObject({ state: 'none', latest: null });
  });

  it('a period that ended more than three months ago is refused, naming the date it was due', async () => {
    const res = await draft(accessDraft({ periodStart: '2026-05-01', periodEnd: '2026-06-15' }));
    await expectRefused(res, 409, 'REVIEW_PERIOD_STALE');
    expect(res.body.error.message).toContain('2026-09-15');
  });

  it('a line for an account that is not a member of this organisation is refused', async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(999999, 'member', 'keep')] }));
    await expectRefused(res, 409, 'REVIEW_LINE_MISMATCH');
    expect(res.body.error.lines).toEqual([expect.objectContaining({ userId: 999999, problem: 'not_member' })]);
  });

  it('a line that states a role the account does not hold is refused', async () => {
    const res = await draft(accessDraft({ decisions: [line(people.reviewer.id, 'admin', 'keep'), line(people.admin2.id, 'owner', 'keep')] }));
    await expectRefused(res, 409, 'REVIEW_LINE_MISMATCH');
    expect(res.body.error.lines).toEqual([expect.objectContaining({ userId: people.admin2.id, problem: 'role', holds: 'admin' })]);
  });

  it('an export id this organisation never ran is refused', async () => {
    const res = await draft(accessDraft({ scope: { description: 'probe', reportExportId: 'exp-that-never-ran', reportDataHash: runs.access.reportDataHash } }));
    await expectRefused(res, 409, 'REVIEW_REPORT_NOT_FOUND');
  });

  it('an access review that names a run of the other report is refused', async () => {
    const res = await draft(accessDraft({ scope: { description: 'probe', ...runs.audit_trail } }));
    await expectRefused(res, 409, 'REVIEW_REPORT_NOT_FOUND');
  });

  it("a data hash that is not the run's is refused", async () => {
    const res = await draft(accessDraft({ scope: { description: 'probe', ...runs.access, reportDataHash: 'f'.repeat(64) } }));
    await expectRefused(res, 409, 'REVIEW_REPORT_NOT_FOUND');
  });

  it("another organisation's run is refused", async () => {
    const runB = await sealedRun('access-review', `?to=${today}`, people.reviewerB);
    const res = await draft(accessDraft({ scope: { description: 'probe', ...runB } }));
    await expectRefused(res, 409, 'REVIEW_REPORT_NOT_FOUND');
  });
});

describe('DP-69 (b): an audit-trail review of an old period, naming no run', () => {
  it('probe (b) as found is refused, and the integrity attestation still says none', async () => {
    const res = await draft({
      kind: 'audit_trail',
      periodStart: '1999-01-01',
      periodEnd: '1999-01-01',
      scope: { description: 'probe (b)' },
      outcome: 'n/a',
      decisions: [],
    });
    if (res.status === 201) await sign(Number(res.body.review.id));
    expect(res.status, JSON.stringify(res.body)).not.toBe(201);
    expect((await attestationReviewRow()).review_status).toBe('No audit trail review recorded');
  });

  it('an audit-trail review of the recent quarter that names no report run is refused', async () => {
    const res = await draft(auditTrailDraft({ scope: { description: 'The quarter, with no run named.' } }));
    await expectRefused(res, 400, 'REVIEW_INVALID');
    expect(res.body.error.message).toMatch(/scope\.reportExportId/);
  });
});

describe('DP-69 (c): completeness is decided on current roles and memberships', () => {
  it('probe (c) as found is refused, naming every account that holds a privileged role now', async () => {
    const res = await draft(accessDraft({ periodEnd: yesterday, decisions: [line(people.member.id, 'member', 'keep')] }));
    await expectRefused(res, 409, 'REVIEW_INCOMPLETE');
    expect([...res.body.error.missingUserIds].sort((a: number, b: number) => a - b)).toEqual(
      [people.reviewer.id, people.admin2.id].sort((a, b) => a - b),
    );
  });
});

describe('DP-69: a reduce or remove is recorded once it has been carried out', () => {
  beforeAll(async () => {
    // leaver: removed by an administrator in the product (member_removed, services/tenant/membership-change.ts).
    const { removeMember } = await import('../../server/services/tenant/membership-change');
    await asRuntime(ORG_A, (c) => removeMember(c, { userId: people.reviewer.id, ipAddress: null }, { organizationId: ORG_A, userId: people.leaver.id, reason: 'dbcrr: left' }));
    // scimLeaver: removed by SCIM provisioning, as routes/scim.ts removeMembership records it.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [ORG_A, people.scimLeaver.id]);
      await c.query(
        `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role, reason, metadata, regulatory_significant, gxp_relevant)
         VALUES ($1, 'scim.user.deactivated', 'scim_user', $2, NULL, 'SCIM Provisioning', 'system', 'dbcrr: SCIM replace set active=false', $3::json, false, true)`,
        [ORG_A, people.scimLeaver.id, JSON.stringify({ membershipRemoved: true })],
      );
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }
    // deactivated: still a member, account deactivated platform-wide (the single-organisation SCIM path).
    await owner.query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [people.deactivated.id]);
  });

  it('a reduce that has not been carried out is refused', async () => {
    const res = await draft(accessDraft({
      decisions: [line(people.reviewer.id, 'admin', 'keep'), line(people.admin2.id, 'admin', 'reduce', { reducedTo: 'member', changeReference: CHANGE })],
    }));
    await expectRefused(res, 409, 'REVIEW_LINE_MISMATCH');
    expect(res.body.error.lines).toEqual([expect.objectContaining({ userId: people.admin2.id, problem: 'reduce_not_carried_out', holds: 'admin' })]);
  });

  it('a reduce whose new role is in effect is accepted', async () => {
    const { changeMemberRole } = await import('../../server/services/tenant/membership-change');
    await asRuntime(ORG_A, (c) =>
      changeMemberRole(c, { userId: people.reviewer.id, ipAddress: null }, { organizationId: ORG_A, userId: people.admin2.id, role: 'member', reason: 'dbcrr: reduce' }),
    );
    try {
      const res = await draft(accessDraft({
        decisions: [line(people.reviewer.id, 'admin', 'keep'), line(people.admin2.id, 'admin', 'reduce', { reducedTo: 'member', changeReference: CHANGE })],
      }));
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    } finally {
      await owner.query(`UPDATE organization_users SET role = 'admin' WHERE organization_id = $1 AND user_id = $2`, [ORG_A, people.admin2.id]);
    }
  });

  it('a remove of an active member is refused', async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(people.member.id, 'member', 'remove', { changeReference: CHANGE })] }));
    await expectRefused(res, 409, 'REVIEW_LINE_MISMATCH');
    expect(res.body.error.lines).toEqual([expect.objectContaining({ userId: people.member.id, problem: 'remove_not_carried_out' })]);
  });

  it('a remove the product recorded (member_removed) is accepted', async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(people.leaver.id, 'member', 'remove', { changeReference: CHANGE })] }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it("a remove whose recorded role is not the line's role is refused", async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(people.leaver.id, 'admin', 'remove', { changeReference: CHANGE })] }));
    await expectRefused(res, 409, 'REVIEW_LINE_MISMATCH');
    expect(res.body.error.lines).toEqual([expect.objectContaining({ userId: people.leaver.id, problem: 'removal_role', held: 'member' })]);
  });

  it('a remove SCIM provisioning recorded (scim.user.deactivated) is accepted', async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(people.scimLeaver.id, 'member', 'remove', { changeReference: CHANGE })] }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('a remove of a member whose account is deactivated is accepted', async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(people.deactivated.id, 'member', 'remove', { changeReference: CHANGE })] }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('a remove of an account this organisation has no recorded removal of is refused', async () => {
    const res = await draft(accessDraft({ decisions: [...decisionsForA(), line(people.reviewerB.id, 'admin', 'remove', { changeReference: CHANGE })] }));
    await expectRefused(res, 409, 'REVIEW_LINE_MISMATCH');
    expect(res.body.error.lines).toEqual([expect.objectContaining({ userId: people.reviewerB.id, problem: 'not_member' })]);
  });
});

describe('DP-69: the clock runs from the end of the period reviewed', () => {
  let laid = 0;
  beforeAll(async () => {
    // An audit-trail review of March to May, signed just now.
    laid = await laySignedReview({ kind: 'audit_trail', periodStart: '2026-03-01', periodEnd: '2026-05-31', signedAgo: '0 seconds' });
  });

  it('a review signed today of a period that ended four months ago is overdue today', async () => {
    const { audit_trail } = await status();
    expect(audit_trail).toMatchObject({ state: 'overdue', latest: { id: laid, periodEnd: '2026-05-31', nextDue: '2026-08-31' } });
    expect(await attestationReviewRow()).toMatchObject({ review_status: 'Overdue', review_id: laid, next_due: '2026-08-31' });
  });

  it('a period that leaves days unreviewed after the last signed review is refused, naming the day to start from', async () => {
    const res = await draft(auditTrailDraft({ periodStart: '2026-07-01' }));
    await expectRefused(res, 409, 'REVIEW_PERIOD_GAP');
    expect(res.body.error.message).toContain('2026-06-01');
  });

  it('a period starting the day after it is accepted, signed, and current until three months after it ends', async () => {
    const res = await draft(auditTrailDraft({ periodStart: '2026-06-01' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = Number(res.body.review.id);
    const signed = await sign(id);
    expect(signed.status, JSON.stringify(signed.body)).toBe(201);
    const { rows } = await owner.query(`SELECT to_char(((now() AT TIME ZONE 'UTC')::date + interval '3 months')::date, 'YYYY-MM-DD') AS due`);
    expect((await status()).audit_trail).toMatchObject({ state: 'current', latest: { id, periodEnd: today, nextDue: rows[0].due } });
  });
});

describe('DP-69: signing checks the record again, as it then is', () => {
  it('a role changed after the draft refuses the signature, and nothing is signed', async () => {
    const res = await draft(accessDraft());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = Number(res.body.review.id);
    await owner.query(`UPDATE organization_users SET role = 'manager' WHERE organization_id = $1 AND user_id = $2`, [ORG_A, people.admin2.id]);
    try {
      const signed = await sign(id);
      await expectRefused(signed, 409, 'REVIEW_LINE_MISMATCH');
      expect(signed.body.error.message).toContain(`user ${people.admin2.id}`);
      expect(await recordStatus(id)).toBe('draft');
      expect(await signaturesOn(id)).toEqual([]);
    } finally {
      await owner.query(`UPDATE organization_users SET role = 'admin' WHERE organization_id = $1 AND user_id = $2`, [ORG_A, people.admin2.id]);
    }
  });

  it('a draft whose period is stale when it is signed is refused, and nothing is signed', async () => {
    const res = await draft(accessDraft());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = Number(res.body.review.id);
    // A draft is a working record and may change until it is signed; this one now covers a period long past.
    await owner.query(`UPDATE compliance_review_records SET period_start = DATE '2026-01-01', period_end = DATE '2026-05-31' WHERE id = $1`, [id]);
    const signed = await sign(id);
    await expectRefused(signed, 409, 'REVIEW_PERIOD_STALE');
    expect(await recordStatus(id)).toBe('draft');
    expect(await signaturesOn(id)).toEqual([]);
  });

  it('a draft that no longer meets the draft rules is refused at signing, and nothing is signed', async () => {
    const res = await draft(accessDraft());
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = Number(res.body.review.id);
    // The run reference is taken out of the stored draft: the signature would name no run.
    await owner.query(`UPDATE compliance_review_records SET scope = '{"description": "no run named"}'::jsonb WHERE id = $1`, [id]);
    const signed = await sign(id);
    await expectRefused(signed, 409, 'REVIEW_RECORD_INVALID');
    expect(signed.body.error.message).toMatch(/scope\.reportExportId/);
    expect(await recordStatus(id)).toBe('draft');
    expect(await signaturesOn(id)).toEqual([]);
  });
});

describe('DP-70: the review records are retained at offboarding, and the tenant export returns them', () => {
  it("the tenant export carries the organisation's review records, signed ones included", async () => {
    const { exportTenantFull } = await import('../../server/services/tenant-export/tenant-full-export.service');
    const out = await exportTenantFull(owner, ORG_A);
    const table = out.tables.find((t) => t.table === 'compliance_review_records');
    expect(table, 'the export has no compliance_review_records table').toBeTruthy();
    const { rows } = await owner.query('SELECT id, status FROM compliance_review_records WHERE organization_id = $1 ORDER BY id', [ORG_A]);
    expect(rows.some((r) => r.status === 'signed')).toBe(true);
    expect(table!.rows.map((r) => Number(r.id)).sort((a, b) => a - b)).toEqual(rows.map((r) => Number(r.id)));
    expect(table!.rows.every((r) => Number(r.organization_id) === ORG_A)).toBe(true);
  }, 120_000);
});
