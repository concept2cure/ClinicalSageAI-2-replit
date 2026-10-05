/**
 * A decision on an AnA suggestion is bound to the words its turn wrote, and
 * names every model that wrote them (AnA reasoning round 10, GRD-missed,
 * 2026-10-05). The REAL authoring router over HTTP against the authoring
 * subsystem unit, the audit chain and the AnA turn-record store on PGlite.
 *
 * The decision's trail row named a turn record as the suggestion's source
 * when the record EXISTED in the tenant (authoring-record.ts). So "From our
 * turn." was filed as verified against a turn that answered "Draft paragraph
 * for 2.5.4.", with AnA as its verified proposer; the decisions suite pinned
 * exactly that (its bulk "b-own"). The source named no model.
 *
 * The source is now verified by the canonical claim verifier
 * (machine-claim-verify.ts): the record verifies whole and holds the words
 * decided. A verified source names every model that served the turn, with
 * whether RULE 2 lets its text stand as governed content and its PQ status.
 * One decision reads at most MAX_TURN_RECORDS_PER_CHECK records, as the
 * batch-draft accept does, because each read loads every text a record holds.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { TurnRecorder, writeTurnRecord } from '../../services/ana/turn-record';
import { MAX_TURN_RECORDS_PER_CHECK, verifyMachineText } from '../../services/authoring/machine-claim-verify';
import { AUTHORING_SUBSYSTEM_FILES } from '../../../scripts/db/authoring-subsystem.mjs';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;
const ANSWER = 'The primary endpoint was met: ORR 42% (95% CI 31–53) in the 10 mg arm.';
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5' };
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pool.query(sql, params)).rows as R[];
}

function recorder(question: string, answer: string, served: Array<{ provider: string; model: string }>): TurnRecorder {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: ORG, threadId: `th_${ORG}`, runId: randomUUID(), actorUserId: Number(AUTHOR.id), surface: 'conversation' });
  r.setRequest(question, question);
  r.setModel({ ...served[0], effort: 'balanced' });
  served.forEach((m, i) => r.addServed(i + 1, m));
  r.setAnswer({ streamed: answer, stored: answer });
  return r;
}

/** A turn whose calls were served by `served`, in order, answering `answer`. */
const writeServedTurn = (answer: string, served = [OPUS]) =>
  writeTurnRecord(jdb.pool, recorder('Summarise the efficacy results for 2.5.4', answer, served).seal('answered'));

/** A record row and its texts with no chained audit row: a record that does not verify. */
async function insertUnchainedTurn(answer: string): Promise<string> {
  const sealed = recorder('An unchained question', answer, [OPUS]).seal('answered');
  for (const [hash, text] of sealed.blobs) {
    await jdb.pool.query(
      `INSERT INTO ana_record_blobs (organization_id, sha256, text, chars) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, sha256) DO NOTHING`,
      [ORG, hash, text, text.length],
    );
  }
  const t = sealed.body.turn;
  const [inserted] = await rows<{ id: string }>(
    `INSERT INTO ana_turn_records
       (organization_id, thread_id, run_id, user_message_id, assistant_message_id, actor_user_id, outcome,
        started_at, ended_at, schema_version, record_text, record_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [ORG, t.threadId, t.runId, t.userMessageId, t.assistantMessageId, t.actorUserId, t.outcome, t.startedAt, t.endedAt,
      sealed.body.schema, sealed.text, sealed.sha256],
  );
  return String(inserted.id);
}

async function seedDoc(): Promise<{ docId: string; sectionId: string }> {
  const docId = randomUUID();
  const sectionId = randomUUID();
  await jdb.pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id) VALUES ($1, $2, 'M2', 'draft', $3, $4)`,
    [docId, `Module 2.5 — sources ${docId.slice(0, 8)}`, AUTHOR.id, ORG],
  );
  await jdb.pool.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, '2.5.4', 'Overview of Efficacy', '<p>The primary endpoint was met.</p>', $3)`,
    [sectionId, docId, ORG],
  );
  return { docId, sectionId };
}

/** The one trail row a decision wrote for a document: its metadata. */
async function decisionMetadata(docId: string): Promise<Record<string, any>> {
  const trail = await rows<{ metadata: Record<string, any> }>(
    'SELECT metadata FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = $2 ORDER BY created_at',
    [docId, ORG],
  );
  expect(trail).toHaveLength(1);
  return trail[0].metadata;
}

/** Accept one AnA insertion of `text` naming `sourceRecord`; the decision's metadata. */
async function acceptOne(text: string, sourceRecord: string): Promise<Record<string, any>> {
  const { docId, sectionId } = await seedDoc();
  const res = await author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions`)).send({
    changeId: `ana-${randomUUID().slice(0, 8)}`,
    decision: 'accept',
    changeType: 'insertion',
    text,
    authorId: 'ana',
    sourceRecord,
    sectionId,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return decisionMetadata(docId);
}

/** Accept all of `changes`; each change's recorded source, by change id. */
async function acceptAll(changes: Array<{ changeId: string; text: string; sourceRecord: string }>) {
  const { docId } = await seedDoc();
  const body = changes.map((c) => ({ ...c, changeType: 'insertion', authorId: 'ana' }));
  const res = await author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions/bulk`)).send({
    decision: 'accept',
    changeIds: body.map((c) => c.changeId),
    changes: body,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const metadata = await decisionMetadata(docId);
  return Object.fromEntries((metadata.changes as Array<Record<string, any>>).map((c) => [c.changeId, c]));
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      // The authoring subsystem unit, from its durable applier's own list.
      ...AUTHORING_SUBSYSTEM_FILES,
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260926_ana_turn_records.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  if (jdb) assertNoSchemaGaps(jdb);
  await jdb?.close();
});

describe('the words decided must be words the named turn wrote', () => {
  it('single: words the turn never wrote → unverified, and AnA is not the verified proposer', async () => {
    const turn = await writeServedTurn('Draft paragraph for 2.5.4.');
    const decided = await acceptOne('From our turn.', turn.id);
    expect(decided.source).toEqual({ verified: false, claimed: turn.id, why: 'the turn record does not hold this text' });
    expect(decided.proposedBy).toBe('AnA (AI draft)');
    expect(decided.proposedByVerified).toBe(false);
  }, T);

  it('bulk: each change is held to its own words — the turn’s are verified, others are not', async () => {
    const turn = await writeServedTurn('Draft paragraph for 2.5.4.');
    const byId = await acceptAll([
      { changeId: 'own', text: 'Draft paragraph for 2.5.4.', sourceRecord: turn.id },
      { changeId: 'unheld', text: 'From our turn.', sourceRecord: turn.id },
    ]);
    expect(byId.own.source.verified).toBe(true);
    expect(byId.own.proposedByVerified).toBe(true);
    expect(byId.unheld.source).toEqual({ verified: false, claimed: turn.id, why: 'the turn record does not hold this text' });
    expect(byId.unheld.proposedByVerified).toBe(false);
  }, T);

  it('single: a decision that names a turn and no words is not vouched for', async () => {
    const turn = await writeServedTurn('Draft paragraph for 2.5.4.');
    const decided = await acceptOne('', turn.id);
    expect(decided.source).toEqual({ verified: false, claimed: turn.id, why: 'no text was decided' });
    expect(decided.proposedByVerified).toBe(false);
  }, T);

  it('single: a record that does not verify vouches for nothing, even for its own words', async () => {
    const id = await insertUnchainedTurn(ANSWER);
    const decided = await acceptOne(ANSWER, id);
    expect(decided.source).toEqual({ verified: false, claimed: id, why: 'the turn record does not verify' });
    expect(decided.proposedByVerified).toBe(false);
  }, T);
});

describe('a verified source names every model that wrote the words, as RULE 2 reads it', () => {
  it('single: two models served the turn → both, each qualified or not, with its PQ status', async () => {
    const turn = await writeServedTurn(ANSWER, [OPUS, SONNET]);
    const decided = await acceptOne(ANSWER, turn.id);
    expect(decided.source).toEqual({
      verified: true,
      turnRecordId: turn.id,
      turnRecordSha256: turn.sha256,
      outcome: 'answered',
      // Outside production RULE 2 admits a PQ-pending model approved for high-risk work, and says its PQ.
      servedBy: [
        { ...OPUS, qualified: true, approvedForHighRisk: true, pq: 'pending' },
        { ...SONNET, qualified: false, approvedForHighRisk: false, pq: 'pending' },
      ],
    });
    expect(decided.proposedByVerified).toBe(true);
  }, T);

  it('the claim verifier names every model that served a turn, and no one model for a turn two served', async () => {
    const two = await writeServedTurn(ANSWER, [OPUS, SONNET]);
    const one = await writeServedTurn('Draft paragraph for 2.5.4.', [SONNET]);
    const verdict = await verifyMachineText(jdb.pool, ORG, [
      { authorId: 'ana', text: ANSWER, turnRecordId: two.id },
      { authorId: 'ana', text: 'Draft paragraph for 2.5.4.', turnRecordId: one.id },
    ]);
    expect(verdict.unverified).toEqual([]);
    expect(verdict.verified.map((v) => [v.index, v.model, v.servedBy, v.outcome])).toEqual([
      [0, null, [OPUS, SONNET], 'answered'],
      [1, SONNET.model, [SONNET], 'answered'],
    ]);
  }, T);
});

describe('one decision reads a bounded number of turn records', () => {
  it('bulk: at most MAX_TURN_RECORDS_PER_CHECK distinct turns; a change from one more is said, not verified', async () => {
    const changes = [];
    for (let i = 0; i <= MAX_TURN_RECORDS_PER_CHECK; i++) {
      const text = `Paragraph ${i} of the efficacy overview.`;
      changes.push({ changeId: `many-${i}`, text, sourceRecord: (await writeServedTurn(text)).id });
    }
    const byId = await acceptAll(changes);
    const sources = changes.map((c) => byId[c.changeId].source);
    expect(sources.slice(0, MAX_TURN_RECORDS_PER_CHECK).every((x) => x.verified === true)).toBe(true);
    expect(sources[MAX_TURN_RECORDS_PER_CHECK]).toEqual({
      verified: false,
      claimed: changes[MAX_TURN_RECORDS_PER_CHECK].sourceRecord,
      why: `more AnA turns than one decision verifies (at most ${MAX_TURN_RECORDS_PER_CHECK})`,
    });
  }, T);
});
