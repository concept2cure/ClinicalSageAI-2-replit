/**
 * The save door's governed-write verdict, at the unit (AnA reasoning round 15,
 * SEC-A-7 door 1). The door's own behaviour is pinned over HTTP in
 * server/routes/__tests__/authoring-save-governed-write.pglite.test.ts; this
 * file pins the decisions that door delegates.
 *
 * Three of them are easy to get wrong and expensive to get wrong:
 *
 *   1. A record naming NO model is not approval. `[].some(m => !m.qualified)`
 *      is false, so a rule written only as "no unqualified model" admits a
 *      turn whose record names nothing at all.
 *   2. A deployment WITHOUT the turn-record store can verify nothing. Asking
 *      it to raises 42P01 out of `loadTurnRecord` and answers 500 to a save
 *      that is otherwise fine; and refusing such a save for an unadmitted
 *      model would refuse it for a model nobody read.
 *   3. A record the rule refuses must not raise the duplicate cap. Two claims
 *      of one sentence, one from an admitted turn and one from a refused turn,
 *      would otherwise let a lineage gate credit the sentence twice on the
 *      word of a single record.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { openTurnRecorder, writeTurnRecordSafely } from '../../ana/turn-record';
import { MAX_TURN_RECORDS_PER_CHECK } from '../machine-claim-verify';
import {
  contributorsOf,
  creditMachineClaims,
  governedSaveRefusal,
  machineClaimDisclosure,
  machineClaimReport,
  recordMayVouch,
  refusedForModel,
} from '../governed-machine-claims';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const ORG = 83;

const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };
const ANSWER = 'The primary endpoint was met: ORR 42% in the 10 mg arm. Exposure was dose-proportional.';
const CLAIM = 'The primary endpoint was met: ORR 42% in the 10 mg arm.';

let pg: PGlite;
const q = {
  query: (sql: string, params?: unknown[]) => pg.query(sql, params as unknown[]) as Promise<{ rows: any[] }>,
};
const pool = { connect: async () => ({ ...q, release: () => undefined }) };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260926_ana_turn_records.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });

/** A filed turn answering `answer`, served by `served` in order. */
async function filedTurn(answer: string, served: Array<{ provider: string; model: string }>): Promise<string> {
  const r = openTurnRecorder({ orgId: ORG, userId: 7, typed: 'Draft the efficacy overview for 2.5.4' })!;
  r.setAnswer({ streamed: answer, stored: answer });
  if (served[0]) r.setModel(served[0]);
  served.forEach((s, i) => r.addServed(i + 1, s));
  const status = await writeTurnRecordSafely(pool, r, 'answered');
  if (status.status !== 'recorded') throw new Error('the fixture turn was not filed: ' + status.status);
  return status.id;
}

const claim = (text: string, turnRecordId: string | null) => ({ authorId: 'ana', text, turnRecordId });

describe('recordMayVouch — RULE 2 over the models a record names', () => {
  it('admits a record every one of whose models the rule allows', () => {
    expect(recordMayVouch([OPUS])).toBe(true);
  });

  it('refuses one unadmitted model among several', () => {
    expect(recordMayVouch([OPUS, SONNET])).toBe(false);
  });

  it('refuses a record that names NO model: an empty list is not approval', () => {
    expect(recordMayVouch([])).toBe(false);
    /* Written out, because this is the trap: the obvious rule admits it. */
    expect([].some((m: { qualified: boolean }) => !m.qualified)).toBe(false);
  });

  it('refuses a served entry with no model name — the registry can hold no entry for it', async () => {
    expect(recordMayVouch([{ provider: 'anthropic', model: null }])).toBe(false);
    /* WHY it is refused, so the rule above does not need a second check that
       can never fail: approval is looked up by provider AND model, so an entry
       with no model name matches nothing and is unqualified on that account. */
    const { qualifyServedModels, approvedEntryFor } = await import('../../ai-governance/approved-models');
    expect(approvedEntryFor({ provider: 'anthropic', model: null })).toBeUndefined();
    expect(qualifyServedModels([{ provider: 'anthropic', model: null }])).toEqual([
      { provider: 'anthropic', model: null, qualified: false, approvedForHighRisk: null, pq: null },
    ]);
  });
});

describe('creditMachineClaims', () => {
  it('credits a claim an admitted record holds, and names its contributor', async () => {
    const turn = await filedTurn(ANSWER, [OPUS]);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, turn)]);
    expect(verdict.refused).toEqual([]);
    expect(verdict.credited).toEqual([
      {
        authorId: 'ana',
        text: CLAIM,
        turnRecordId: turn,
        servedBy: [{ ...OPUS, qualified: true, approvedForHighRisk: true, pq: 'pending' }],
      },
    ]);
    expect(contributorsOf(verdict)).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
    expect(refusedForModel(verdict)).toBeNull();
  });

  it('refuses a claim from an unadmitted record, and names the models for the row', async () => {
    const turn = await filedTurn(ANSWER, [SONNET]);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, turn)]);
    expect(verdict.credited).toEqual([]);
    expect(verdict.refused).toEqual([
      {
        authorId: 'ana',
        turnRecordId: turn,
        why: 'the turn was served by a model that is not approved for regulatory drafting',
        servedBy: [{ ...SONNET, qualified: false, approvedForHighRisk: false, pq: 'pending' }],
        chars: CLAIM.length,
      },
    ]);
    /* `servedBy` non-null is exactly the test a door makes to refuse. */
    expect(refusedForModel(verdict)).toHaveLength(1);
    expect(contributorsOf(verdict)).toEqual([]);
  });

  it('refuses an unverifiable claim WITHOUT naming a model — there is none to name', async () => {
    const turn = await filedTurn('Draft paragraph for 2.5.4.', [SONNET]);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, turn)]);
    expect(verdict.refused).toEqual([
      {
        authorId: 'ana',
        turnRecordId: turn,
        why: 'the turn record does not hold this text',
        servedBy: null,
        chars: CLAIM.length,
      },
    ]);
    /* And so it does not refuse the save: `refusedForModel` is null. The words
       may be the person's own, disclosed — the server cannot tell otherwise. */
    expect(refusedForModel(verdict)).toBeNull();
  });

  it('a record the rule refuses does not raise the duplicate cap', async () => {
    /* The reason `mayVouch` is a parameter of the one pass and not a filter
       after it. Both records hold the sentence; only one may vouch for it, so
       the cap is one — not two. */
    const admitted = await filedTurn(ANSWER, [OPUS]);
    const refused = await filedTurn(ANSWER, [SONNET]);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, admitted), claim(CLAIM, refused)]);
    expect(verdict.credited).toHaveLength(1);
    const { comparableText } = await import('../../clinical-regulatory-evidence/machine-attribution');
    expect(verdict.recordOccurrences(comparableText(CLAIM))).toBe(1);
  });

  it('refuses claims past the record-read bound, naming it, and credits the rest', async () => {
    /* The bound is on RECORD READS — each loads every text a record references
       — so accepted text from more than MAX_TURN_RECORDS_PER_CHECK distinct
       turns in ONE save loses its attribution on the extras. Disclosed with
       the number, because saving more often is the thing the saver can do. */
    const claims = [];
    for (let i = 0; i <= MAX_TURN_RECORDS_PER_CHECK; i++) {
      const text = `Paragraph ${i} of the efficacy overview was within expectations.`;
      claims.push(claim(text, await filedTurn(text, [OPUS])));
    }
    const verdict = await creditMachineClaims(q, ORG, claims);
    expect(verdict.credited).toHaveLength(MAX_TURN_RECORDS_PER_CHECK);
    expect(verdict.refused).toEqual([
      {
        authorId: 'ana',
        turnRecordId: claims[MAX_TURN_RECORDS_PER_CHECK].turnRecordId,
        why: `more AnA turns than one save verifies (at most ${MAX_TURN_RECORDS_PER_CHECK})`,
        servedBy: null,
        chars: claims[MAX_TURN_RECORDS_PER_CHECK].text.length,
      },
    ]);
    /* And it is NOT a governed-write refusal: the save stands, with the extra
       clause recorded as the saver's own. */
    expect(refusedForModel(verdict)).toBeNull();
  });

  it('claims nothing and reads nothing when the save carried no claim', async () => {
    const verdict = await creditMachineClaims(q, ORG, []);
    expect(verdict).toMatchObject({ credited: [], refused: [] });
    expect(machineClaimDisclosure(verdict)).toBeUndefined();
    expect(machineClaimReport(verdict)).toBeUndefined();
  });

  it('refuses every claim as unverifiable where there is no turn-record store', async () => {
    /* A deployment carrying the authoring bundle without the AnA one. The
       claim must come back unverifiable — never `model_not_approved`, which
       would refuse a save over a model nobody read — and the read must not
       raise 42P01 into the caller. */
    const storeless = new PGlite();
    try {
      const verdict = await creditMachineClaims(
        { query: (sql, params) => storeless.query(sql, params as unknown[]) as Promise<{ rows: any[] }> },
        ORG,
        [claim(CLAIM, '3f2504e0-4f89-41d3-9a0c-0305e82c3301')],
      );
      expect(verdict.credited).toEqual([]);
      expect(verdict.refused[0].why).toBe('the turn record store is not provisioned');
      expect(refusedForModel(verdict)).toBeNull();
    } finally {
      await storeless.close();
    }
  });
});

describe('what the record and the saver are told', () => {
  it('discloses a machine author that was claimed and not credited', async () => {
    const verdict = await creditMachineClaims(q, ORG, []);
    expect(machineClaimDisclosure(verdict, [{ id: 'ana', name: 'AnA (AI draft)' }])).toEqual({
      uncredited: ['ana'],
      credited: [],
      refused: [],
    });
  });

  it('the saver is told the reason and the length, never the record’s internals', async () => {
    const turn = await filedTurn('Draft paragraph for 2.5.4.', [OPUS]);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, turn)]);
    const report = machineClaimReport(verdict);
    expect(report).toEqual({ credited: 0, refused: [{ why: 'the turn record does not hold this text', chars: CLAIM.length }] });
    expect(JSON.stringify(report)).not.toContain(turn);
  });

  it('the refusal names every model, counts the passages, and promises nothing it cannot keep', async () => {
    const turn = await filedTurn(ANSWER, [SONNET]);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, turn)]);
    const refusal = governedSaveRefusal(refusedForModel(verdict)!);
    expect(refusal.code).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
    expect(refusal.message).toContain('anthropic/claude-sonnet-5');
    expect(refusal.message).toContain('one passage');
    expect(refusal.servedBy).toEqual(['claude-sonnet-5']);
    expect(refusal.turnRecordIds).toEqual([turn]);
    /* NOT "ask again with Thorough effort", which the governed-write TOOL
       refusal says: in production no approved model has passed performance
       qualification, so that advice ends in a second refusal. */
    expect(refusal.message).not.toMatch(/thorough effort/i);
    /* And it says the work is not lost, because it is not: the editor keeps
       the claim and the device keeps the text. */
    expect(refusal.message).toContain('still on this device');
  });

  it('says a model is unnamed rather than leaving a gap where its name goes', async () => {
    const turn = await filedTurn(ANSWER, []);
    const verdict = await creditMachineClaims(q, ORG, [claim(CLAIM, turn)]);
    const refusal = governedSaveRefusal(refusedForModel(verdict)!);
    expect(refusal.message).toContain('a model this answer’s record does not name');
    expect(refusal.message).not.toContain('by , which');
  });
});

describe('decoded explicit remedy attribution', () => {
  it('credits decoded remedy words from an intact qualified turn, but never unrelated or malformed JSON', async () => {
    const replacement = 'Dose is 5 mg of "salt A".\nAt 24 weeks the response was 42%.';
    const fix = { sectionId: 'aaaaaaaa-0000-4000-8000-000000000001', baseUpdatedAt: '2026-10-13T10:00:00Z', quote: 'The earlier wording.', replacement, reason: 'Use the source value.' };
    const fenced = (value: unknown) => `\`\`\`authoring-remedy\n${JSON.stringify(value)}\n\`\`\``;
    const turn = await filedTurn(fenced(fix), [OPUS]);
    const credited = await creditMachineClaims(q, ORG, [claim(replacement, turn)]);
    expect(credited.credited).toHaveLength(1);
    expect(credited.refused).toEqual([]);
    const foreign = await creditMachineClaims(q, ORG + 1, [claim(replacement, turn)]);
    expect(foreign.credited).toEqual([]);
    const unrelated = await creditMachineClaims(q, ORG, [claim('An invented result.', turn)]);
    expect(unrelated.credited).toEqual([]);
    const malformed = await filedTurn(fenced({ ...fix, baseUpdatedAt: undefined }), [OPUS]);
    expect((await creditMachineClaims(q, ORG, [claim(replacement, malformed)])).credited).toEqual([]);
    const refusedModel = await filedTurn(fenced(fix), [SONNET]);
    expect((await creditMachineClaims(q, ORG, [claim(replacement, refusedModel)])).credited).toEqual([]);
  });

});
