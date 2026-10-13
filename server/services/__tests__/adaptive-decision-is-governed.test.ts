/**
 * An interim decision is a signed act, not a database insert (2026-10-13).
 *
 * ── What it was ──────────────────────────────────────────────────────────────
 * `POST /api/biostat/adaptive/:planId/decision` called
 * `adaptiveTrialOperationsService.recordDecision`, which wrote the row with a
 * Drizzle insert setting `approved_by` to the session's user id and
 * `approved_at` to the wall clock, and built its own `audit_trail` json array.
 * No re-authentication, no signing-authority check, no separation of duties,
 * no signature manifestation, and nothing binding the approval to the data it
 * was taken on.
 *
 * That is to the letter the defect `POST /api/biostat/sap/:id/sign` was
 * REMOVED for on 2026-10-08 (505f71263). It survived here because
 * `ci:sign-ceremony` says in its own header that a Drizzle `.set({
 * approvedBy })` "is not seen at all": the gate watches the sign ledger, and
 * this wrote no ledger row. So the single guard against this regression class
 * is a test, and this is it.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * The ceremony (`signAdaptiveDecision` → `signGovernedAct`) owns the
 * transaction. `writeDecisionOnSignedTransaction` is its `write` callback and
 * takes a `PoolClient`: it CANNOT be called without one, which is the
 * structural half of the fix. By the time it runs, the signer has been
 * re-authenticated, authority-checked and separation-of-duties checked, so
 * `approved_by` and `approved_at` written there are true statements rather
 * than a claim nobody checked.
 *
 * The signature binds the INTERIM SNAPSHOT, not the decision row: an IDMC
 * approves a decision about a specific look at the data. The decision row grew
 * no `signature_id` column, because a second place to keep the link is a
 * second place for it to be wrong — the join is `snapshot_id` →
 * `electronic_signatures.target = 'interim-snapshot:<id>'`.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ADAPTIVE_DECISION_MEANINGS,
  AdaptiveDecisionRefusal,
} from '../adaptive-decision-signature';
import { BINDING_BASIS } from '../part11/signature-persistence';
import { CONTENT_BINDERS } from '../part11/governed-target-binders';
import {
  VALID_ADAPTATION_TYPES,
  adaptiveTrialOperationsService,
} from '../adaptive-trial-operations-service';

const SERVICE_SRC = readFileSync('server/services/adaptive-trial-operations-service.ts', 'utf8');
const ROUTE_SRC = readFileSync('server/routes/biostatPlatform.ts', 'utf8');

/** A PoolClient stub: one look on the plan, then the insert. */
function clientWith(lookRows: unknown[]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    client: {
      query: async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        if (/FROM interim_data_snapshots/.test(sql)) return { rows: lookRows as any[] };
        if (/INSERT INTO adaptation_decisions/.test(sql)) {
          return { rows: [{ id: 77, plan_id: 5, snapshot_id: 9, adaptation_type: 'sample_size_reestimation', decision: 'Increase N to 640', rationale: 'Conditional power 0.42 at the planned N.', parameters: null, approved_by: 3, approved_at: new Date('2026-10-13T10:00:00Z'), created_at: new Date('2026-10-13T10:00:00Z') }] };
        }
        return { rows: [] };
      },
    } as never,
  };
}

const LOOK = {
  id: 9, look_number: 2, information_fraction: 0.5,
  test_statistic: 1.2, conditional_power: 0.42, predictive_power: 0.38,
};

const PARAMS = {
  planId: 5,
  snapshotId: 9,
  adaptationType: 'sample_size_reestimation',
  decision: 'Increase N to 640',
  rationale: 'Conditional power 0.42 at the planned N.',
};

describe('the ungoverned write is gone', () => {
  it('exposes no recordDecision a route could call on its own', () => {
    expect(
      'recordDecision' in adaptiveTrialOperationsService,
      'the ungoverned recordDecision is back on the service',
    ).toBe(false);
  });

  it('builds no audit_trail json of its own', () => {
    /* The ceremony writes the hash-chained, HMAC-sealed audit_logs row and the
       electronic_signatures manifest. A second, unsealed copy in a json column
       is a record that can disagree with the sealed one. */
    expect(SERVICE_SRC).not.toMatch(/auditTrail:\s*\[auditEntry\]/);
    expect(SERVICE_SRC).not.toMatch(/const auditEntry =/);
  });

  it('writes approved_by only on a transaction the ceremony owns', () => {
    // The only INSERT of a decision takes a PoolClient, so there is no path
    // that writes an approval outside the ceremony.
    expect(SERVICE_SRC).toMatch(/writeDecisionOnSignedTransaction\(\s*\n?\s*client: PoolClient/);
    expect(SERVICE_SRC).toMatch(/INSERT INTO adaptation_decisions/);
    // And no Drizzle insert into that table remains.
    expect(SERVICE_SRC).not.toMatch(/\.insert\(adaptationDecisions\)/);
  });

  it('the route runs the ceremony rather than the service directly', () => {
    expect(ROUTE_SRC).toMatch(/signAdaptiveDecision\(/);
    expect(ROUTE_SRC).not.toMatch(/adaptiveTrialOperationsService\.recordDecision/);
    // And the ceremony's refusals reach the signer verbatim, not as a 500.
    expect(ROUTE_SRC).toMatch(/AdaptiveDecisionRefusal/);
  });
});

describe('what the signature binds', () => {
  it('registers a binder for the interim snapshot', () => {
    expect(CONTENT_BINDERS['interim-snapshot'], 'the snapshot has no content binder, so the signature would fall back to the ledger').toBeTypeOf('function');
  });

  it('binds the look’s DATA, and not its timestamps', async () => {
    const calls: Array<{ sql: string }> = [];
    const client = {
      query: async (sql: string) => {
        calls.push({ sql });
        return { rows: [{ plan_id: 5, look_number: 2, information_fraction: 0.5, enrolled_count: 300, summary_statistics: { mean: 1.1 }, test_statistic: 1.2, conditional_power: 0.42, predictive_power: 0.38, boundary: { efficacy: 2.96 } }] };
      },
    } as never;
    const binding = await CONTENT_BINDERS['interim-snapshot'](client, '9', 1, () => { throw new Error('should not fall back'); });

    expect(binding.basis).toBe(BINDING_BASIS.INTERIM_SNAPSHOT_CONTENT);
    expect(binding.digest).toMatch(/^[0-9a-f]{64}$/);
    // A signature taken on this look must re-derive later when no DATA
    // changed, so nothing time-shaped or blinding-shaped is selected.
    expect(calls[0].sql).not.toMatch(/snapshot_date|created_at|is_blinded/);
    expect(binding.note).toMatch(/No snapshot date, blinding flag or row timestamp is bound/);
  });

  it('falls back rather than signing a snapshot it cannot read', async () => {
    const client = { query: async () => ({ rows: [] }) } as never;
    let why = '';
    await CONTENT_BINDERS['interim-snapshot'](client, '9', 1, (reason: string) => {
      why = reason;
      return { digest: 'x'.repeat(64), basis: BINDING_BASIS.INTERIM_SNAPSHOT_CONTENT, note: 'fallback' };
    });
    expect(why).toMatch(/not readable at signing time/);
  });

  it('refuses a malformed pointer rather than querying for it', async () => {
    const client = { query: async () => { throw new Error('should not query'); } } as never;
    let why = '';
    await CONTENT_BINDERS['interim-snapshot'](client, 'not-a-number', 1, (reason: string) => {
      why = reason;
      return { digest: 'x'.repeat(64), basis: BINDING_BASIS.INTERIM_SNAPSHOT_CONTENT, note: 'fallback' };
    });
    expect(why).toMatch(/malformed/);
  });
});

describe('the meanings an interim decision can carry', () => {
  it('is approval or responsibility, and never authorship or review', () => {
    expect([...ADAPTIVE_DECISION_MEANINGS]).toEqual(['approval', 'responsibility']);
    // Nobody authors a decision about observed data, and an IDMC
    // recommendation that stops a trial is not a review of someone's work.
    expect(ADAPTIVE_DECISION_MEANINGS).not.toContain('authorship');
    expect(ADAPTIVE_DECISION_MEANINGS).not.toContain('review');
  });
});

describe('the write, on the ceremony’s transaction', () => {
  it('records the decision and reports what was signed', async () => {
    const { client, queries } = clientWith([LOOK]);
    const out = await adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(client, PARAMS, 1, 3);

    // `act` is what goes on the signature manifest and into the ledger
    // payload, so the signature row says what it signed.
    expect(out.act).toMatchObject({
      decisionId: 77, planId: 5, snapshotId: 9, lookNumber: 2,
      informationFraction: 0.5, adaptationType: 'sample_size_reestimation',
      decision: 'Increase N to 640',
      testStatistic: 1.2, conditionalPower: 0.42, predictivePower: 0.38,
    });
    expect((out.body as any).decision.id).toBe(77);

    // The snapshot is checked against BOTH the plan and the tenant before
    // anything is written: a decision signed against another plan's look
    // would be bound to data it is not about.
    const lookup = queries.find((q) => /FROM interim_data_snapshots/.test(q.sql))!;
    expect(lookup.params).toEqual([9, 5, 1]);
    expect(lookup.sql).toMatch(/JOIN adaptive_trial_plans/);
  });

  it('refuses a look that is not on this plan in this tenant', async () => {
    const { client } = clientWith([]);
    await expect(
      adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(client, PARAMS, 1, 3),
    ).rejects.toThrow(AdaptiveDecisionRefusal);
  });

  it('refuses an adaptation type it does not model, naming the list', async () => {
    const { client } = clientWith([LOOK]);
    await expect(
      adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(
        client, { ...PARAMS, adaptationType: 'unblind_everything' }, 1, 3,
      ),
    ).rejects.toThrow(/must be one of/);
    expect([...VALID_ADAPTATION_TYPES]).toContain('sample_size_reestimation');
  });

  it.each([
    ['', /State the decision/],
    ['   ', /State the decision/],
  ])('refuses an empty decision (%j)', async (decision, pattern) => {
    const { client } = clientWith([LOOK]);
    await expect(
      adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(client, { ...PARAMS, decision }, 1, 3),
    ).rejects.toThrow(pattern);
  });

  it('requires a rationale of real length, because it is the signature’s reason', async () => {
    const { client } = clientWith([LOOK]);
    await expect(
      adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(client, { ...PARAMS, rationale: 'ok' }, 1, 3),
    ).rejects.toThrow(/at least 8 characters/);
  });

  it('writes nothing when it refuses', async () => {
    const { client, queries } = clientWith([LOOK]);
    await expect(
      adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(client, { ...PARAMS, rationale: 'no' }, 1, 3),
    ).rejects.toThrow();
    expect(queries.some((q) => /INSERT/.test(q.sql))).toBe(false);
  });
});
