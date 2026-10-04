/**
 * P1-43 and P1-25 (ADR-0014 §8): the compliance reports name the latest signed
 * review, and say when it is overdue.
 *
 * The user access review names the latest signed access review on or before
 * its date: the one covering the most recent period. It flags it overdue once
 * more than a quarter (three months) has passed between the end of the period
 * that review covered and the end of the report's date (DP-69: the clock runs
 * from the period reviewed, not from the day it was signed). The audit trail
 * integrity attestation does the same for the latest audit-trail review. With
 * none, each says "No … review recorded" and carries no date at all: a date is
 * never made up.
 *
 * Real stack and posture as compliance-review-fixture.ts describes: the auth
 * boundary, the report router on the runtime pool (app_service, RLS enforcing),
 * sealed reports. The one record written as the owner is a review signed four
 * months ago — the ceremony stamps the time it runs, so an old review can only
 * be laid down by hand (fixture laySignedReview), the way the ceremony writes
 * one: the record and its `review` signature on one transaction, which the
 * database guard checks at COMMIT exactly as it checks the ceremony's.
 *
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-25-P1-43-review-records/.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  PASSWORD, REASON, accessDraft, auditTrailDraft, auth, laySignedReview, people, provision, recordRuns, stack, teardown, type Person,
} from './compliance-review-fixture';

type Section = { key: string; rows: Record<string, unknown>[] };
type Report = { organizationId: number; sections: Section[] };
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await provision();
  await recordRuns();
}, 120_000);
afterAll(async () => {
  await teardown();
});

/** A fresh stack per run: each gets the report run allowance (run-limits.ts) to itself. */
async function report(id: string, query: string, who: Person = people.reviewer): Promise<Report> {
  const res = await request(await stack()).get(`/api/audit/reports/${id}${query}`).set(auth(who));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return JSON.parse(res.body.export.data) as Report;
}
function reviewRow(data: Report): Record<string, unknown> {
  const s = data.sections.find((x) => x.key === 'review');
  expect(s, 'the report has no review section').toBeTruthy();
  expect(s!.rows).toHaveLength(1);
  return s!.rows[0];
}
async function signedThroughCeremony(body: Record<string, unknown>): Promise<{ id: number; signatureId: number }> {
  const app = await stack();
  const drafted = await request(app).post('/api/audit/reviews').set(auth(people.reviewer)).send(body);
  expect(drafted.status, JSON.stringify(drafted.body)).toBe(201);
  const id = Number(drafted.body.review.id);
  const signed = await request(app)
    .post(`/api/audit/reviews/${id}/sign`)
    .set(auth(people.reviewer))
    .send({ reason: REASON, meaning: 'review', password: PASSWORD });
  expect(signed.status, JSON.stringify(signed.body)).toBe(201);
  return { id, signatureId: Number(signed.body.signatureId) };
}

/** An access review of April and May, signed four months ago (fixture laySignedReview). */
function historicAccessReview(): Promise<number> {
  return laySignedReview({ kind: 'access', periodStart: '2026-04-01', periodEnd: '2026-05-31', signedAgo: '4 months' });
}

describe('with no review recorded, each report says so and gives no date', () => {
  it('the user access review: "No access review recorded"', async () => {
    const row = reviewRow(await report('access-review', `?to=${today}`));
    expect(row.review_status).toBe('No access review recorded');
    for (const k of ['review_id', 'period_start', 'period_end', 'signed_at', 'signature_id', 'content_hash', 'next_due']) {
      expect(row[k], k).toBeNull();
    }
  });

  it('the audit trail integrity attestation: "No audit trail review recorded"', async () => {
    const row = reviewRow(await report('audit-trail-integrity', `?from=${today}&to=${today}`));
    expect(row.review_status).toBe('No audit trail review recorded');
    expect(row.signed_at).toBeNull();
    expect(row.next_due).toBeNull();
  });

  it('the review list says none for each kind', async () => {
    const res = await request(await stack()).get('/api/audit/reviews').set(auth(people.reviewer));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.status.access).toMatchObject({ state: 'none', latest: null });
    expect(res.body.status.audit_trail).toMatchObject({ state: 'none', latest: null });
  });
});

describe('after signed reviews, the reports name the latest and flag an overdue one', () => {
  let historic = 0;
  let access = { id: 0, signatureId: 0 };
  let auditTrail = { id: 0, signatureId: 0 };
  beforeAll(async () => {
    historic = await historicAccessReview();
    // It starts the day after the historic review's period ended: a review leaves no days unreviewed (DP-69).
    access = await signedThroughCeremony(accessDraft({ periodStart: '2026-06-01' }));
    auditTrail = await signedThroughCeremony(auditTrailDraft());
  }, 60_000);

  it('the user access review as of today names the review signed today, current', async () => {
    const row = reviewRow(await report('access-review', `?to=${today}`));
    expect(row).toMatchObject({
      review_status: 'Current',
      review_id: access.id,
      signature_id: access.signatureId,
      reviewer_user_id: people.reviewer.id,
      period_end: today,
      decision_count: 2,
    });
    expect(row.signed_at).toMatch(ISO_UTC);
    expect(row.next_due).toMatch(DATE);
    expect(String(row.next_due) > today).toBe(true);
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('as of yesterday the latest is the one signed four months ago, and it is overdue', async () => {
    const row = reviewRow(await report('access-review', `?to=${yesterday}`));
    expect(row).toMatchObject({ review_status: 'Overdue', review_id: historic, period_end: '2026-05-31' });
    expect(String(row.next_due) <= yesterday).toBe(true);
  });

  it('the audit trail integrity attestation names the audit-trail review, not the access review', async () => {
    const row = reviewRow(await report('audit-trail-integrity', `?from=${today}&to=${today}`));
    expect(row).toMatchObject({ review_status: 'Current', review_id: auditTrail.id, signature_id: auditTrail.signatureId });
  });

  it("organisation B's reports and list see none of A's reviews", async () => {
    const row = reviewRow(await report('access-review', `?to=${today}`, people.reviewerB));
    expect(row.review_status).toBe('No access review recorded');
    const res = await request(await stack()).get('/api/audit/reviews').set(auth(people.reviewerB));
    expect(res.body.reviews).toEqual([]);
  });

  it("the review list names A's records and the status of each kind", async () => {
    const res = await request(await stack()).get('/api/audit/reviews').set(auth(people.reviewer));
    expect(res.status).toBe(200);
    expect(res.body.reviews.map((r: { id: number }) => r.id)).toEqual(expect.arrayContaining([historic, access.id, auditTrail.id]));
    expect(res.body.status.access).toMatchObject({ state: 'current', latest: { id: access.id, signatureId: access.signatureId } });
    expect(res.body.status.audit_trail).toMatchObject({ state: 'current', latest: { id: auditTrail.id } });
    const one = await request(await stack()).get(`/api/audit/reviews/${access.id}`).set(auth(people.reviewer));
    expect(one.status).toBe(200);
    expect(one.body.review.decisions).toHaveLength(2);
    const foreign = await request(await stack()).get(`/api/audit/reviews/${access.id}`).set(auth(people.reviewerB));
    expect(foreign.status).toBe(404);
  });
});
