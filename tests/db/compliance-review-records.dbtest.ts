/**
 * P1-25 (audit-trail review; Annex 11 §9, FDA data-integrity guidance 2018 Q7,
 * finding DP-21) and P1-43 (access review; POLICY-AC-002 §4a, ADR-0014 §8):
 * a periodic review is one governed record, signed through the ceremony, and
 * fixed once signed.
 *
 * ── What was wrong (reproduced 2026-10-01, before the change) ────────────────
 * The product kept no review record of either kind. The access-review report
 * said so in its own words ("This report records no review decision, reviewer
 * or sign-off"); POLICY-AC-002 §4a pointed at Markdown files under
 * docs/evidence; nothing recorded an audit-trail review at all.
 *
 * ── What this proves, on PostgreSQL as the runtime role with RLS enforcing ────
 *   1. a review written through the ceremony: draft, then sign with password,
 *      meaning `review` and reason; the record, its electronic signature and
 *      the ledger pair commit in one transaction, the signature is bound to
 *      the record's content hash, and the hash re-derives from the stored row;
 *   2. signing without the ceremony is refused: by the route (no credentials,
 *      another meaning, another reviewer, an incomplete access review) and by
 *      the database (a bare UPDATE or INSERT to `signed` fails at COMMIT);
 *   3. a signed row cannot be updated or deleted, by the runtime role or the
 *      table owner, and the table cannot be truncated.
 *
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-25-P1-43-review-records/.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { sha256CanonicalJson } from '../../server/services/part11/signature-persistence';
import {
  ORG_A, PASSWORD, REASON, accessDraft, asRuntime, auth, auditTrailDraft, owner, people, provision, recordRuns, stack, teardown,
} from './compliance-review-fixture';

/* The per-signer attempt limit has its own suite; this file's sign requests
   from one signer would spend its budget across reruns. A pass-through that
   records the scope keeps the mounting proven. */
const attempts = vi.hoisted(() => ({ seen: [] as string[] }));
vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: (scope: string) => (req: { originalUrl: string }, _res: unknown, next: () => void) => {
    attempts.seen.push(`${scope} ${req.originalUrl}`);
    next();
  },
}));

let app: express.Express;

beforeAll(async () => {
  await provision();
  app = await stack();
  await recordRuns();
}, 120_000);
afterAll(async () => {
  await teardown();
});
beforeEach(async () => {
  attempts.seen.length = 0;
  await owner.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ANY($1::int[])', [
    [people.reviewer.id, people.admin2.id],
  ]);
});

async function draft(body: Record<string, unknown>, who = people.reviewer) {
  return request(app).post('/api/audit/reviews').set(auth(who)).send(body);
}
async function sign(id: number, body: Record<string, unknown>, who = people.reviewer) {
  return request(app).post(`/api/audit/reviews/${id}/sign`).set(auth(who)).send({ reason: REASON, ...body });
}

async function recordRow(id: number) {
  const { rows } = await owner.query(
    `SELECT id, organization_id, kind, period_start::text AS period_start, period_end::text AS period_end, scope, outcome,
            decisions, reviewer_user_id, status, signature_id, content_hash, signed_at, xmin::text AS xmin
       FROM compliance_review_records WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
async function signaturesOn(id: number) {
  const { rows } = await owner.query(
    `SELECT id, signer_id, signature_meaning, signature_manifest, binding_basis, signature_purpose, xmin::text AS xmin
       FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2`,
    [ORG_A, `compliance-review:${id}`],
  );
  return rows;
}
async function ledgerOn(id: number) {
  const { rows } = await owner.query(
    `SELECT a.id, a.payload, l.id AS audit_id, a.xmin::text AS xmin FROM c2c_ana_actions a
       LEFT JOIN audit_logs l ON l.ana_action_id = a.id
      WHERE a.org_id = $1 AND a.target = $2 AND a.command = 'sign'`,
    [ORG_A, `compliance-review:${id}`],
  );
  return rows;
}
/** The documented recipe (services/audit/compliance-reviews.ts reviewContentHash), restated here to re-derive it. */
function rederive(row: Record<string, unknown>): string {
  return sha256CanonicalJson({
    version: 1,
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    kind: row.kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    scope: row.scope,
    outcome: row.outcome,
    decisions: row.decisions,
    reviewerUserId: Number(row.reviewer_user_id),
  });
}
async function newDraft(body = accessDraft()): Promise<number> {
  const res = await draft(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return Number(res.body.review.id);
}

describe('a review written through the ceremony', () => {
  it('drafts, then signs: record, signature and ledger pair in one transaction, bound to the content hash', async () => {
    const id = await newDraft();
    expect((await recordRow(id))?.status).toBe('draft');
    const res = await sign(id, { meaning: 'review', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = await recordRow(id);
    const [sig] = await signaturesOn(id);
    const [ledger] = await ledgerOn(id);
    expect(row).toMatchObject({ status: 'signed', reviewer_user_id: people.reviewer.id, signature_id: sig.id });
    expect(row.signed_at).toBeTruthy();
    expect(row.content_hash).toBe(rederive(row));
    expect(sig).toMatchObject({ signer_id: people.reviewer.id, signature_meaning: 'review', signature_purpose: REASON });
    expect(sig.signature_manifest.act).toMatchObject({ reviewId: id, kind: 'access', contentHash: row.content_hash });
    // The content hash is bound through the manifest the signature hash covers (and the database guard
    // checks it). bound_payload_digest is still the ledger chain hash, with that basis named: no
    // compliance-review derivation exists in signature-persistence.ts yet (README, what remains).
    expect(sig.binding_basis).toBe('governed-action-sha256-chain');
    expect(ledger.payload).toMatchObject({ contentHash: row.content_hash, meaning: 'review' });
    expect(ledger.audit_id).toBeTruthy();
    expect(new Set([row.xmin, sig.xmin, ledger.xmin]).size, 'rows from more than one transaction').toBe(1);
    expect(res.body).toMatchObject({ signatureId: sig.id, meaning: 'review', review: { id, status: 'signed', contentHash: row.content_hash } });
    expect(attempts.seen).toContain(`governed-signed-act /api/audit/reviews/${id}/sign`);
  });

  it('an audit-trail review is the same record, of the other kind', async () => {
    const id = await newDraft(auditTrailDraft());
    const res = await sign(id, { meaning: 'review', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = await recordRow(id);
    expect(row).toMatchObject({ kind: 'audit_trail', status: 'signed' });
    expect(row.content_hash).toBe(rederive(row));
  });
});

describe('signing without the ceremony is refused', () => {
  it('no password, no meaning: 400, the record stays a draft, nothing is signed', async () => {
    const id = await newDraft();
    const res = await sign(id, {});
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('ESIGNATURE_COMPONENT_MISSING');
    expect((await recordRow(id))?.status).toBe('draft');
    expect(await signaturesOn(id)).toEqual([]);
    expect(await ledgerOn(id)).toEqual([]);
  });

  it('a meaning other than review is refused before the password is checked', async () => {
    const id = await newDraft();
    const res = await sign(id, { meaning: 'approval', password: 'not-the-password' });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('SIGNATURE_MEANING_NOT_REVIEW');
    const { rows } = await owner.query('SELECT failed_login_attempts FROM users WHERE id = $1', [people.reviewer.id]);
    expect(Number(rows[0].failed_login_attempts ?? 0)).toBe(0);
    expect(await signaturesOn(id)).toEqual([]);
  });

  it('a wrong password is refused, and nothing is written', async () => {
    const id = await newDraft();
    const res = await sign(id, { meaning: 'review', password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect((await recordRow(id))?.status).toBe('draft');
    expect(await signaturesOn(id)).toEqual([]);
  });

  it('only the reviewer who drafted it signs it', async () => {
    const id = await newDraft();
    const res = await sign(id, { meaning: 'review', password: PASSWORD }, people.admin2);
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error?.code).toBe('REVIEW_NOT_REVIEWER');
    expect(await signaturesOn(id)).toEqual([]);
    expect(await ledgerOn(id)).toEqual([]);
  });

  it('an access review that leaves a privileged account without a decision is refused', async () => {
    const res = await draft(accessDraft({ decisions: [{ userId: people.reviewer.id, role: 'admin', decision: 'keep' }] }));
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error?.code).toBe('REVIEW_INCOMPLETE');
    expect(res.body.error?.missingUserIds).toEqual([people.admin2.id]);
  });

  it('a member who is not an audit reader cannot draft one', async () => {
    const res = await draft(accessDraft(), people.viewer);
    expect(res.status).toBe(403);
  });

  it('as the runtime role, a bare UPDATE to signed is refused at COMMIT', async () => {
    const id = await newDraft();
    await expect(
      asRuntime(ORG_A, (c) =>
        c.query(`UPDATE compliance_review_records SET status = 'signed', content_hash = repeat('a', 64), signed_at = now() WHERE id = $1`, [id]),
      ),
    ).rejects.toThrow(/COMPLIANCE_REVIEW_SIGNATURE_REQUIRED/);
    expect((await recordRow(id))?.status).toBe('draft');
  });

  it('as the runtime role, a bare INSERT of a signed row is refused at COMMIT', async () => {
    await expect(
      asRuntime(ORG_A, (c) =>
        c.query(
          `INSERT INTO compliance_review_records
             (organization_id, kind, period_start, period_end, scope, outcome, decisions, reviewer_user_id, status, content_hash, signed_at)
           VALUES ($1, 'access', DATE '2026-07-01', DATE '2026-09-30', '{}'::jsonb, 'bare insert', '[]'::jsonb, $2, 'signed', repeat('b', 64), now())`,
          [ORG_A, people.reviewer.id],
        ),
      ),
    ).rejects.toThrow(/COMPLIANCE_REVIEW_SIGNATURE_REQUIRED/);
    const { rows } = await owner.query(`SELECT count(*)::int AS n FROM compliance_review_records WHERE outcome = 'bare insert'`);
    expect(rows[0].n).toBe(0);
  });
});

describe('a signed row cannot be updated or deleted', () => {
  let id = 0;
  let before: Record<string, unknown> | null = null;
  beforeAll(async () => {
    id = await newDraft();
    const res = await sign(id, { meaning: 'review', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    before = await recordRow(id);
  });

  it.each([
    ['its outcome', `UPDATE compliance_review_records SET outcome = 'rewritten' WHERE id = $1`],
    ['its decisions', `UPDATE compliance_review_records SET decisions = '[]'::jsonb WHERE id = $1`],
    ['its signature', 'UPDATE compliance_review_records SET signature_id = NULL WHERE id = $1'],
    ['back to draft', `UPDATE compliance_review_records SET status = 'draft' WHERE id = $1`],
    ['a delete', 'DELETE FROM compliance_review_records WHERE id = $1'],
  ])('as the runtime role: %s is refused', async (_what, sql) => {
    await expect(asRuntime(ORG_A, (c) => c.query(sql, [id]))).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await recordRow(id)).toEqual(before);
  });

  it('as the table owner: an update, a delete and a truncate are refused', async () => {
    await expect(owner.query(`UPDATE compliance_review_records SET outcome = 'owner rewrite' WHERE id = $1`, [id])).rejects.toThrow(
      /IMMUTABILITY_VIOLATION/,
    );
    await expect(owner.query('DELETE FROM compliance_review_records WHERE id = $1', [id])).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(owner.query('TRUNCATE compliance_review_records')).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    expect(await recordRow(id)).toEqual(before);
  });

  it('a second signature on the same record is refused', async () => {
    const res = await sign(id, { meaning: 'review', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('REVIEW_ALREADY_SIGNED');
    expect(await signaturesOn(id)).toHaveLength(1);
  });
});
