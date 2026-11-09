/**
 * P-86 (founder, 2026-11-01): a sequence that was never filed may be retired,
 * by signature, freeing its number, only while no production send is bound to
 * it and it is not filed. Design:
 * docs/evidence/RIM/2026-11-08-designs/p86-retire-unfiled-sequence.design.md,
 * with the coordinating session's rulings of 2026-11-09 (check 3 under P-108
 * 2(a); check 3b fails closed; the rules beside the baseline's removal).
 *
 * The real act (retireSequence) over the freeze-gate fixture, on PGlite, with
 * the sequence-removal guard applied: every retirement here also passes the
 * database's own check at COMMIT.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any, afterFirstFacts: null as null | (() => Promise<void>) }));
vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    get db() { return holder.db; },
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
  };
});
// T7: the facts read before the lock are taken as read, then the world changes before the read under it.
vi.mock('../filed-sequence-baseline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../filed-sequence-baseline')>();
  return {
    ...actual,
    readRetirementFacts: async (...args: Parameters<typeof actual.readRetirementFacts>) => {
      const facts = await actual.readRetirementFacts(...args);
      const hook = holder.afterFirstFacts;
      if (hook) { holder.afterFirstFacts = null; await hook(); }
      return facts;
    },
  };
});

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, applySequenceRemovalGuard, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { retireSequence, getSequence, precheckSequenceRetirement } from '../submission-service';
import { retirementStatement } from '../filed-sequence-baseline';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const AUTHOR = 4; // The sequence's creator: never its retirer (separation of duties).
const { sign } = freezeGateHelpers(() => h);
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const REASON = 'The test send found a content defect in Module 3.';

let nextId = 9500;
/** A sequence of a submission of its own: 0000 by default, dispatched with its send pending, created by AUTHOR. */
async function sequenceOf(opts: { number?: string; dispatchStatus?: string | null; status?: string; submissionId?: number } = {}) {
  const id = nextId++;
  const submissionId = opts.submissionId ?? id;
  if (!opts.submissionId) {
    await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
             VALUES ($1, 'P-86 retirement', 'ind', 'biotech', 'fda', ${ORG}, ${AUTHOR}, '${FREEZE_PROGRAM_ID}')`, [submissionId]);
  }
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status)
           VALUES ($1, $2, 'fda', $3, ${ORG}, ${AUTHOR}, $4, $5)`,
  [id, submissionId, opts.number ?? '0000', opts.status ?? 'dispatched', opts.dispatchStatus === undefined ? 'pending' : opts.dispatchStatus]);
  return { id, submissionId };
}
/** A retirement signature as the sign route records it, with the signer's reason. */
async function retireSig(seq: number, opts: { intent?: string; meaning?: string; payload?: Record<string, unknown>; reason?: string | null; number?: string } = {}) {
  const payload = opts.payload ?? { notFiledElsewhere: true, statement: retirementStatement(opts.number ?? '0000') };
  const id = await sign(seq, opts.intent ?? 'retire', opts.meaning ?? 'responsibility', payload);
  if (opts.reason !== null) {
    await q(`UPDATE electronic_signatures SET signature_purpose = $2 WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [id, opts.reason ?? REASON]);
  }
  return id;
}
const bound = (seq: number, env: string | null, signatureActionId: string | null = 'sig-x') =>
  q(`INSERT INTO submission_transmittals (organization_id, region, metadata) VALUES (${ORG}, 'fda', $1)`,
    [JSON.stringify({ ...(env ? { environment: env } : {}), dispatchBinding: { sequenceId: seq, signatureActionId } })]);
const row = async (seq: number) => (await q(`SELECT status, dispatch_status, deleted_at FROM ectd_sequences WHERE id = $1`, [seq])).rows[0];
const retiredRows = async (seq: number) =>
  (await q(`SELECT reason, occurred_at, new_values::jsonb AS v FROM audit_logs WHERE table_name = 'ectd_sequence' AND record_id = $1 AND action = 'ECTD_SEQUENCE_RETIRED'`, [String(seq)])).rows;
const refusedWith = async (seq: number, sentence: string | RegExp) => {
  const err = await outcome(retireSequence({ sequenceId: seq, signatureActionId: await retireSig(seq) }, ctx));
  expect(err).toMatchObject({ code: 'SEQUENCE_NOT_RETIRABLE', message: typeof sentence === 'string' ? expect.stringContaining(sentence) : expect.stringMatching(sentence) });
  expect((await row(seq)).deleted_at).toBeNull();
  expect(await retiredRows(seq)).toEqual([]);
};

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  await h.pglite.exec(`
    ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT now(),
      ADD COLUMN IF NOT EXISTS signature_purpose TEXT;
    -- The real transmittal table's columns the package spine writes (migrations/20260509_submission_gateways.sql).
    ALTER TABLE submission_transmittals ADD COLUMN IF NOT EXISTS package_id INTEGER, ADD COLUMN IF NOT EXISTS program_id UUID,
      ADD COLUMN IF NOT EXISTS status TEXT, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();`);
  // The name a retirement record shows (actor-names.ts reads public.actor_name, a function of the real database).
  await h.pglite.exec(`CREATE OR REPLACE FUNCTION actor_name(p_user_id integer) RETURNS TABLE (name text, email text)
    LANGUAGE sql AS $$ SELECT 'Riley Retirer'::text, 'riley@example.test'::text WHERE p_user_id = ${USER} $$;`);
  await applySequenceRemovalGuard(h.pglite);
}, 120_000);
afterAll(async () => { await h.close(); });
beforeEach(() => { holder.afterFirstFacts = null; });

describe('P-86: a sequence never filed is retired by its signed act, and its number is freed', () => {
  it('retires a dispatched sequence whose only sends were to the test environment; the row is otherwise unchanged', async () => {
    const { id } = await sequenceOf();
    await bound(id, 'staging');
    const sig = await retireSig(id);
    const answer = await retireSequence({ sequenceId: id, signatureActionId: sig }, ctx);
    expect(answer).toMatchObject({ retired: true, sequenceId: id, sequenceNumber: '0000', meaning: 'responsibility', reason: REASON, numberFreed: true });
    const after = await row(id);
    expect(after).toMatchObject({ status: 'dispatched', dispatch_status: 'pending' });
    expect(after.deleted_at).not.toBeNull();
    const [audit] = await retiredRows(id);
    expect(audit.reason).toBe(REASON);
    expect(audit.v).toMatchObject({
      reason: REASON, signatureActionId: sig, meaning: 'responsibility', notFiledElsewhere: true,
      statement: retirementStatement('0000'), numberFreed: true, dispatchStatus: 'pending',
    });
    expect(audit.v.stagingTransmittalIds).toHaveLength(1);
    expect(await outcome(getSequence(id, ctx))).toMatchObject({ code: 'NOT_FOUND' });
  }, 120_000);

  it("records one instant: the answer's retiredAt, the row's deleted_at and the sealed occurred_at", async () => {
    const { id } = await sequenceOf();
    const answer = await retireSequence({ sequenceId: id, signatureActionId: await retireSig(id) }, ctx);
    const deletedAt = new Date((await row(id)).deleted_at).toISOString();
    const occurredAt = new Date((await retiredRows(id))[0].occurred_at).toISOString();
    expect(deletedAt).toBe(answer.retiredAt);
    expect(occurredAt).toBe(answer.retiredAt);
  }, 120_000);

  it('a duplicate live 0000 (a legacy row) is retired, and says the number is not freed', async () => {
    const first = await sequenceOf();
    const twin = await sequenceOf({ submissionId: first.submissionId });
    const answer = await retireSequence({ sequenceId: twin.id, signatureActionId: await retireSig(twin.id) }, ctx);
    expect(answer.numberFreed).toBe(false);
    expect((await row(first.id)).deleted_at).toBeNull();
  }, 120_000);

  it('after a retirement, the same signature is answered "already retired", and it stays in force', async () => {
    const { id } = await sequenceOf();
    const sig = await retireSig(id);
    await retireSequence({ sequenceId: id, signatureActionId: sig }, ctx);
    const again = await outcome(retireSequence({ sequenceId: id, signatureActionId: sig }, ctx));
    expect(again).toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/^Sequence 0000 was retired on \d{4}-\d{2}-\d{2} UTC by Riley Retirer\. Nothing was changed\./) });
    const s = (await q(`SELECT is_valid, verification_status FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [sig])).rows[0];
    expect(s).toEqual({ is_valid: true, verification_status: 'valid' });
  }, 120_000);
});

describe('P-86: what keeps a sequence (the agency may hold it, or its number)', () => {
  it.each([['sent'], ['acknowledged']])('refuses a sequence that is %s, the agency holds it', async (status) => {
    const { id } = await sequenceOf({ dispatchStatus: status });
    await refusedWith(id, `Sequence 0000 is on file with the agency (dispatch status '${status}'), so it cannot be retired.`);
  }, 120_000);

  it('refuses a sequence whose send is in flight', async () => {
    const { id } = await sequenceOf({ dispatchStatus: 'transmitting' });
    await refusedWith(id, 'A send of sequence 0000 is in flight and not yet settled, so it cannot be retired now.');
  }, 120_000);

  it('refuses a sequence with a production send bound to it, and one bound with no environment named', async () => {
    const prod = await sequenceOf();
    await bound(prod.id, 'production');
    await refusedWith(prod.id, /^A send of sequence 0000 to the agency's production environment is recorded on \d{4}-\d{2}-\d{2} UTC, so it cannot be retired\./);
    const unnamed = await sequenceOf();
    await bound(unnamed.id, null);
    await refusedWith(unnamed.id, /recorded on \d{4}-\d{2}-\d{2} UTC with no environment named, so it is treated as a production send/);
  }, 120_000);

  it('P-108 2(a): a production attempt the sequence records as blocked before any connection does not keep it', async () => {
    const { id } = await sequenceOf();
    await bound(id, 'production', 'sig-blocked');
    await q(`INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, new_values) VALUES (gen_random_uuid(), ${ORG}, 'TRANSMIT_BLOCKED', 'ectd_sequence', $1, $2)`,
      [String(id), JSON.stringify({ signatureActionId: 'sig-blocked', transmitted: false })]);
    const answer = await retireSequence({ sequenceId: id, signatureActionId: await retireSig(id) }, ctx);
    expect(answer.retired).toBe(true);
  }, 120_000);

  it('P-108 2(a): a blocked record that names no signature proves nothing, so the attempt still keeps it', async () => {
    const { id } = await sequenceOf();
    await bound(id, 'production', null);
    await q(`INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, new_values) VALUES (gen_random_uuid(), ${ORG}, 'TRANSMIT_BLOCKED', 'ectd_sequence', $1, $2)`,
      [String(id), JSON.stringify({ signatureActionId: null, transmitted: false })]);
    await refusedWith(id, "to the agency's production environment is recorded on");
  }, 120_000);

  it('refuses a sequence recorded as transmitted to production before sends carried a binding', async () => {
    const { id } = await sequenceOf();
    await q(`INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, occurred_at, new_values) VALUES (gen_random_uuid(), ${ORG}, 'ECTD_TRANSMITTED', 'ectd_sequence', $1, '2026-10-01T12:00:00Z', $2)`,
      [String(id), JSON.stringify({ environment: 'production' })]);
    await refusedWith(id, "A send of sequence 0000 to the agency's production environment is recorded on 2026-10-01 UTC");
  }, 120_000);

  it('3b fails closed: its number sent to production as a package for this application keeps it', async () => {
    const PKG = "Sequence 0000 was sent to the agency's production gateway in a package, and nothing records that the agency did not receive it, so it is not retired.";
    const byProgram = await sequenceOf();
    await q(`INSERT INTO submission_transmittals (organization_id, region, package_id, program_id, metadata) VALUES (${ORG}, 'fda', 1, '${FREEZE_PROGRAM_ID}', $1)`,
      [JSON.stringify({ sequence: '0000', environment: 'production' })]);
    await refusedWith(byProgram.id, PKG);
    await q(`DELETE FROM submission_transmittals WHERE package_id IS NOT NULL`);
    const byNumber = await sequenceOf();
    await q(`INSERT INTO submission_transmittals (organization_id, region, package_id, metadata) VALUES (${ORG}, 'fda', 2, $1)`,
      [JSON.stringify({ sequence: '0000', applicationId: '123456' })]); // no environment named: treated as production
    await refusedWith(byNumber.id, PKG);
    await q(`DELETE FROM submission_transmittals WHERE package_id IS NOT NULL`);
  }, 120_000);

  it('3b admits a package sent to the test environment, one of another application, and one of another region', async () => {
    await q(`INSERT INTO submission_transmittals (organization_id, region, package_id, program_id, metadata) VALUES
      (${ORG}, 'fda', 3, '${FREEZE_PROGRAM_ID}', '{"sequence":"0000","environment":"staging"}'),
      (${ORG}, 'fda', 4, NULL, '{"sequence":"0000","environment":"production","applicationId":"999999"}'),
      (${ORG}, 'ema', 5, '${FREEZE_PROGRAM_ID}', '{"sequence":"0000","environment":"production"}')`);
    const { id } = await sequenceOf();
    expect((await retireSequence({ sequenceId: id, signatureActionId: await retireSig(id) }, ctx)).retired).toBe(true);
    await q(`DELETE FROM submission_transmittals WHERE package_id IS NOT NULL`);
  }, 120_000);

  it('a later sequence still in use is retired first; one the agency may hold keeps the number for good', async () => {
    const base = await sequenceOf();
    const later = await sequenceOf({ number: '0001', submissionId: base.submissionId });
    await refusedWith(base.id, 'Sequence 0001, numbered after 0000 in this submission, is still in use. Retire 0001 first: a number is freed only from the highest down.');
    await q(`UPDATE ectd_sequences SET dispatch_status = 'sent' WHERE id = $1`, [later.id]);
    await refusedWith(base.id, "Sequence 0001, numbered after 0000, is kept (it is on file with the agency), so 0000's number cannot be freed.");
  }, 120_000);

  it('5b: a filed twin of the same number read from compiles keeps it', async () => {
    const mine = await sequenceOf();
    await sequenceOf({ submissionId: mine.submissionId, dispatchStatus: 'sent' });
    await q(`INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest) VALUES (${ORG}, $1, 'initial', '0000', '[]')`, [mine.submissionId]);
    await refusedWith(mine.id, 'Another sequence 0000 of this submission is on file with the agency, and what it filed is read from the compiles numbered 0000.');
  }, 120_000);

  it('refuses a sequence that holds an IND record recorded as filed in it', async () => {
    const { id, submissionId } = await sequenceOf();
    await q(`INSERT INTO ind_amendments (organization_id, submission_id, ind_number, plan, status, sequence_id) VALUES (${ORG}, $1, '123456', '{}', 'filed', $2)`, [submissionId, id]);
    await refusedWith(id, '1 IND record is recorded as filed in sequence 0000 (an amendment).');
  }, 120_000);
});

describe('P-86: the signature, and what a refusal does to it', () => {
  it('refuses a signature for another act, of another meaning, without the statement, or with it changed by one character', async () => {
    const { id } = await sequenceOf();
    const st = retirementStatement('0000');
    for (const sig of [
      await retireSig(id, { intent: 'freeze' }),
      await retireSig(id, { meaning: 'approval' }),
      await retireSig(id, { payload: { notFiledElsewhere: true } }),
      await retireSig(id, { payload: { statement: st } }),
      await retireSig(id, { payload: { notFiledElsewhere: true, statement: st.replace('courier', 'couriers') } }),
    ]) {
      expect(await outcome(retireSequence({ sequenceId: id, signatureActionId: sig }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    }
    expect((await row(id)).deleted_at).toBeNull();
  }, 120_000);

  it("refuses the sequence's creator, and a signature with no reason", async () => {
    const { id } = await sequenceOf();
    const own = await retireSig(id);
    expect(await outcome(retireSequence({ sequenceId: id, signatureActionId: own }, { organizationId: ORG, userId: AUTHOR })))
      .toMatchObject({ code: expect.stringMatching(/FORBIDDEN|GOVERNED_REQUIRED/) });
    const noReason = await retireSig(id, { reason: null });
    expect(await outcome(retireSequence({ sequenceId: id, signatureActionId: noReason }, ctx)))
      .toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringContaining('The signature records no reason, so sequence 0000 was not retired') });
    expect((await row(id)).deleted_at).toBeNull();
  }, 120_000);

  it('P-23: a refused retirement voids its signature, and that signature is then refused as void', async () => {
    const { id } = await sequenceOf({ dispatchStatus: 'sent' });
    const sig = await retireSig(id);
    const err = await outcome(retireSequence({ sequenceId: id, signatureActionId: sig }, ctx));
    expect(err.message).toContain('The signature given for this retirement is now void; sign again for a new attempt.');
    await q(`UPDATE ectd_sequences SET dispatch_status = 'pending' WHERE id = $1`, [id]);
    expect(await outcome(retireSequence({ sequenceId: id, signatureActionId: sig }, ctx))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
  }, 120_000);

  it('a fact that cannot be read is "could not be checked", never a pass', async () => {
    const { id } = await sequenceOf();
    await q(`ALTER TABLE ind_amendments RENAME TO ind_amendments_away`);
    try {
      const err = await outcome(retireSequence({ sequenceId: id, signatureActionId: await retireSig(id) }, ctx));
      expect(err).toMatchObject({ code: 'INVALID_STATE', message: expect.stringContaining('Whether sequence 0000 can be retired could not be checked, so it was not retired.') });
    } finally {
      await q(`ALTER TABLE ind_amendments_away RENAME TO ind_amendments`);
    }
    expect((await row(id)).deleted_at).toBeNull();
  }, 120_000);

  it('the facts are judged again under the lock: a production send recorded after the first read refuses it', async () => {
    const { id } = await sequenceOf();
    const sig = await retireSig(id);
    holder.afterFirstFacts = async () => { await bound(id, 'production'); };
    await refusedWithSig(id, sig);
  }, 120_000);
});

describe('P-86: the precheck asks the retirement rule before anyone signs (C2)', () => {
  it('a retirable sequence: cleared, its test sends by UTC day, its number freed, the statement to sign; nothing changes', async () => {
    const { id } = await sequenceOf();
    for (const at of ['2026-11-02T23:30:00-05:00', '2026-11-04T09:00:00Z']) {
      await q(`INSERT INTO submission_transmittals (organization_id, region, metadata, created_at) VALUES (${ORG}, 'fda', $1, $2)`,
        [JSON.stringify({ environment: 'staging', dispatchBinding: { sequenceId: id, signatureActionId: 'sig-x' } }), at]);
    }
    const before = await row(id);
    expect(await precheckSequenceRetirement(id, ctx)).toEqual({
      step: 'retire', cleared: true, refusal: null,
      retirement: { sequenceNumber: '0000', stagingSends: [{ sentOn: '2026-11-03' }, { sentOn: '2026-11-04' }], numberFreed: true, statement: retirementStatement('0000') },
    });
    expect(await row(id)).toEqual(before);
    expect(await retiredRows(id)).toEqual([]);
  }, 120_000);

  it("the sequence's creator is told another person signs it", async () => {
    const { id } = await sequenceOf();
    expect(await precheckSequenceRetirement(id, { organizationId: ORG, userId: AUTHOR })).toMatchObject({
      step: 'retire', cleared: false,
      refusal: 'You created sequence 0000, so you cannot sign its retirement. Another person with signing authority signs it.',
      retirement: { sequenceNumber: '0000', statement: retirementStatement('0000') },
    });
  }, 120_000);

  it('a sequence something keeps is refused in the words the act refuses it with, before the creator rule', async () => {
    const { id } = await sequenceOf();
    await bound(id, 'production');
    const answer = await precheckSequenceRetirement(id, { organizationId: ORG, userId: AUTHOR });
    const act = await outcome(retireSequence({ sequenceId: id, signatureActionId: await retireSig(id) }, ctx));
    expect(answer).toMatchObject({ step: 'retire', cleared: false, retirement: { numberFreed: true } });
    expect(answer.refusal).toMatch(/^A send of sequence 0000 to the agency's production environment is recorded on \d{4}-\d{2}-\d{2} UTC/);
    expect(act.message.startsWith(answer.refusal as string), act.message).toBe(true);
  }, 120_000);

  it('a legacy duplicate is answered with its number not freed', async () => {
    const first = await sequenceOf();
    const twin = await sequenceOf({ submissionId: first.submissionId });
    expect((await precheckSequenceRetirement(twin.id, ctx)).retirement).toMatchObject({ numberFreed: false });
  }, 120_000);

  it('a retired sequence is answered with when and by whom it was retired', async () => {
    const { id } = await sequenceOf();
    await retireSequence({ sequenceId: id, signatureActionId: await retireSig(id) }, ctx);
    expect(await outcome(precheckSequenceRetirement(id, ctx))).toMatchObject({
      code: 'INVALID_STATE', message: expect.stringMatching(/^Sequence 0000 was retired on \d{4}-\d{2}-\d{2} UTC by Riley Retirer\. Nothing was changed\.$/),
    });
  }, 120_000);
});

async function refusedWithSig(id: number, sig: string) {
  const err = await outcome(retireSequence({ sequenceId: id, signatureActionId: sig }, ctx));
  expect(err).toMatchObject({ code: 'SEQUENCE_NOT_RETIRABLE', message: expect.stringContaining("to the agency's production environment is recorded on") });
  expect((await row(id)).deleted_at).toBeNull();
  expect(await retiredRows(id)).toEqual([]);
}
