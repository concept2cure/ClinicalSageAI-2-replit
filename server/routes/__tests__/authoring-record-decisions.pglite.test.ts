/**
 * Tracked-change decisions are recorded whole, verified and atomically — the
 * REAL authoring router over HTTP (supertest, real signed JWTs) against the
 * authoring subsystem unit, the audit_logs chain and the AnA turn-record store
 * on in-process Postgres (PGlite). Row D5, 2026-09-26.
 *
 * Accepting a tracked suggestion strips its mark, so the decision's trail row
 * is the only place the proposed words survive. Before this change that row
 * cut each text to 500 characters (200 in bulk, and only the first 20 changes
 * of an "Accept all"), was written after the decision upsert had already
 * committed, and named the proposer only as the editing client typed it.
 *
 * What is shown here, each through POST /api/authoring/documents/:id/
 * tracked-change-decisions and /bulk:
 *   1. a 1,200-character proposed text is in the trail metadata whole, with
 *      its SHA-256, and the trail row verifies against its chained entry;
 *   2. an "Accept all" of 25 changes records all 25 with full text in ONE
 *      trail row, beside 25 decision upserts;
 *   3. an AnA turn record the suggestion names is verified in the tenant's
 *      ana_turn_records — another tenant's record, or a non-id, is recorded
 *      as unverified with why, never as verified;
 *   4. a sectionId from another document is refused 400 and nothing is written;
 *   5. when the chained audit_logs row cannot be written, neither the decision
 *      upsert nor the trail row survives;
 *   6. the person's stated reason is the trail's change_reason and the chain
 *      row's audit_logs.reason; with none given, both are null — never invented;
 *   7. a FROZEN document still refuses a decision (behaviour kept).
 *
 * The migration list is the authoring subsystem unit exactly as the durable
 * applier (scripts/db/authoring-subsystem.mjs, AUTHORING_SUBSYSTEM_FILES) runs
 * it, in its order — a test below holds the two lists equal — then the chain
 * order key and the turn-record store from the C2C set.
 *
 * PGlite is ONE session: the pool shim's connect() hands back that same
 * session, so the route's BEGIN/COMMIT/ROLLBACK are real transaction control
 * over every statement it issues.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, REPO_ROOT, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { TurnRecorder, writeTurnRecord } from '../../services/ana/turn-record';
import { metadataSha256 } from '../../services/authoring/authoring-evidence';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

/** The authoring subsystem unit, in the durable applier's order. */
const AUTHORING_UNIT = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260727_authoring_object_permissions.sql',
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260730_authoring_subsystem_schema.sql',
];

const T = 180_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

/** An AnA turn record in this tenant, and one in another. */
let ownTurn: { id: string; sha256: string };
let foreignTurn: { id: string; sha256: string };

interface DecisionRow { change_id: string; decision: string; user_id: string; user_name: string | null }
interface TrailRow {
  id: string;
  section_id: string | null;
  operation_type: string;
  actor_email: string;
  actor_id: string | null;
  change_reason: string | null;
  metadata: Record<string, any>;
}
interface ChainRow {
  action: string;
  table_name: string;
  record_id: string;
  reason: string | null;
  actor_id: number | null;
  chain_seq: string | null;
  details: Record<string, any>;
}

async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pool.query(sql, params)).rows as R[];
}

/** A draft (or other-status) document of this tenant with one section. */
async function seedDoc(status = 'draft'): Promise<{ docId: string; sectionId: string }> {
  const docId = randomUUID();
  const sectionId = randomUUID();
  await jdb.pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, $2, 'M2', $3, $4, $5)`,
    [docId, `Module 2.5 — decisions ${docId.slice(0, 8)}`, status, AUTHOR.id, ORG],
  );
  await jdb.pool.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, '2.5.4', 'Overview of Efficacy', '<p>The primary endpoint was met.</p>', $3)`,
    [sectionId, docId, ORG],
  );
  return { docId, sectionId };
}

/** Everything the decision routes can have written for one document. */
async function recordOf(docId: string) {
  const decisions = await rows<DecisionRow>(
    `SELECT change_id, decision, user_id, user_name FROM authoring_tracked_change_decisions
      WHERE artifact_id = $1 AND tenant_id = $2 ORDER BY change_id`,
    [docId, ORG],
  );
  const trail = await rows<TrailRow>(
    `SELECT id, section_id, operation_type, actor_email, actor_id, change_reason, metadata
       FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = $2 ORDER BY created_at`,
    [docId, ORG],
  );
  const chain = (
    await rows<Omit<ChainRow, 'details'> & { new_values: unknown }>(
      `SELECT action, table_name, record_id, reason, actor_id, chain_seq::text AS chain_seq, new_values
         FROM audit_logs
        WHERE tenant_id = $1 AND action LIKE 'authoring.section.%' AND new_values->>'docId' = $2
        ORDER BY chain_seq`,
      [ORG, docId],
    )
  ).map(({ new_values, ...r }) => ({
    ...r,
    details: (typeof new_values === 'string' ? JSON.parse(new_values) : new_values) as Record<string, any>,
  }));
  return { decisions, trail, chain };
}

async function decisionAuditCount(): Promise<number> {
  const [r] = await rows<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_logs WHERE action LIKE 'authoring.section.tracked_change%'`,
  );
  return r.n;
}

async function writeTurn(organizationId: number, question: string) {
  const r = new TurnRecorder();
  r.setTurn({ organizationId, threadId: `th_${organizationId}`, runId: randomUUID(), actorUserId: Number(AUTHOR.id), surface: 'conversation' });
  r.setRequest(question, question);
  r.setModel({ provider: 'anthropic', model: 'model-x', effort: 'balanced' });
  r.setAnswer({ streamed: 'Draft paragraph for 2.5.4.', stored: 'Draft paragraph for 2.5.4.' });
  return writeTurnRecord(jdb.pool, r.seal('answered'));
}

const single = (docId: string) =>
  author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions`));
const bulk = (docId: string) =>
  author(request(app).post(`/api/authoring/documents/${docId}/tracked-change-decisions/bulk`));

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      ...AUTHORING_UNIT,
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260926_ana_turn_records.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);

  ownTurn = await writeTurn(ORG, 'Draft the efficacy overview for 2.5.4');
  foreignTurn = await writeTurn(OTHER_ORG, 'Another organization’s question');
}, T);

afterAll(async () => {
  if (jdb) assertNoSchemaGaps(jdb);
  await jdb?.close();
});

describe('the harness builds the schema a deploy builds', () => {
  it('lists the authoring subsystem unit exactly as the durable applier declares it', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/db/authoring-subsystem.mjs'), 'utf8');
    const block = src.match(/export const AUTHORING_SUBSYSTEM_FILES = \[([\s\S]*?)\n\];/);
    expect(block, 'AUTHORING_SUBSYSTEM_FILES not found in the applier').toBeTruthy();
    const declared = [...block![1].matchAll(/^\s*'(db\/migrations\/[^']+\.sql)',/gm)].map((m) => m[1]);
    expect(declared).toEqual(AUTHORING_UNIT);
  });
});

describe('1 — a long proposed text is recorded whole', () => {
  it('a 1,200-character insertion lands in the trail metadata in full, with its SHA-256, and verifies against the chain', async () => {
    const { docId, sectionId } = await seedDoc();
    const sentence = 'The primary endpoint, progression-free survival at 12 months, was met with a hazard ratio of 0.62. ';
    const TAIL = '[END-OF-TEXT]';
    const LONG = sentence.repeat(13).slice(0, 1200 - TAIL.length) + TAIL;
    expect(LONG.length).toBe(1200);

    const res = await single(docId).send({
      changeId: 'ins-long-1',
      decision: 'accept',
      changeType: 'insertion',
      text: LONG,
      authorId: 'dana@sponsor.test',
      authorName: 'Dana Reviewer',
      at: '2026-09-26T10:00:00.000Z',
      sectionId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.decision).toMatchObject({ change_id: 'ins-long-1', decision: 'accept', user_id: AUTHOR.id });

    const { decisions, trail, chain } = await recordOf(docId);
    expect(decisions).toEqual([{ change_id: 'ins-long-1', decision: 'accept', user_id: AUTHOR.id, user_name: AUTHOR.email }]);
    expect(trail).toHaveLength(1);
    const row = trail[0];
    expect(row.operation_type).toBe('tracked_change_decision');
    expect(row.section_id).toBe(sectionId);
    expect(row.actor_email).toBe(AUTHOR.email);
    expect(row.actor_id).toBe(AUTHOR.id);
    // Whole: every character, including the tail a cut would have dropped.
    expect(row.metadata.text).toBe(LONG);
    expect(String(row.metadata.text)).toHaveLength(1200);
    expect(String(row.metadata.text).endsWith('[END-OF-TEXT]')).toBe(true);
    expect(row.metadata.textSha256).toBe(sha256(LONG));
    expect(row.metadata).toMatchObject({
      decision: 'accept',
      changeId: 'ins-long-1',
      changeType: 'insertion',
      proposedBy: 'Dana Reviewer',
      proposedByVerified: false,
      proposedAt: '2026-09-26T10:00:00.000Z',
    });
    // No source was claimed, so none is recorded.
    expect(row.metadata.source).toBeUndefined();

    // One chained entry, naming this row and hashing its metadata as stored —
    // so the full text is covered by the tenant chain.
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({
      action: 'authoring.section.tracked_change_decision',
      table_name: 'authoring_section',
      record_id: sectionId,
      actor_id: Number(AUTHOR.id),
    });
    expect(chain[0].chain_seq).not.toBeNull();
    expect(chain[0].details.trailId).toBe(row.id);
    expect(chain[0].details.metadataSha256).toBe(metadataSha256(row.metadata));
    expect(chain[0].details.actorEmail).toBe(AUTHOR.email);

    // And the reader the inspector uses says so.
    const audit = await author(request(app).get(`/api/authoring/docs/${docId}/audit`));
    expect(audit.status).toBe(200);
    const ev = (audit.body.events as Array<Record<string, any>>).find((e) => e.id === row.id);
    expect(ev?.integrity).toMatchObject({ chained: true, intact: true, mismatches: [], chainPayloadIntact: true });
  }, T);
});

describe('2 — "Accept all" records every change', () => {
  it('25 changes → 25 upserts, ONE trail row carrying all 25 texts whole with their hashes, one chain entry', async () => {
    const { docId, sectionId } = await seedDoc();
    const changes = Array.from({ length: 25 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return {
        changeId: `ana-${n}`,
        changeType: i % 5 === 4 ? 'deletion' : 'insertion',
        // ~300 characters each: longer than the 200 the old bulk record kept.
        text: `Change ${n}: ` + `Exposure increased dose-proportionally from 10 to 80 mg in cohort ${n}. `.repeat(4) + `[tail ${n}]`,
        authorId: 'ana',
        authorName: 'Someone else entirely',
        at: '2026-09-26T11:00:00.000Z',
      };
    });
    for (const c of changes) expect(c.text.length).toBeGreaterThan(200);

    const res = await bulk(docId).send({
      decision: 'accept',
      changeIds: changes.map((c) => c.changeId),
      changes,
      sectionId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.count).toBe(25);

    const { decisions, trail, chain } = await recordOf(docId);
    expect(decisions).toHaveLength(25);
    expect(decisions.map((d) => d.change_id)).toEqual(changes.map((c) => c.changeId));
    expect(new Set(decisions.map((d) => d.decision))).toEqual(new Set(['accept']));

    expect(trail).toHaveLength(1);
    const row = trail[0];
    expect(row.operation_type).toBe('tracked_change_bulk_decision');
    expect(row.section_id).toBe(sectionId);
    expect(row.metadata.decision).toBe('accept');
    expect(row.metadata.count).toBe(25);
    expect(row.metadata.changeIds).toEqual(changes.map((c) => c.changeId));
    const recorded = row.metadata.changes as Array<Record<string, any>>;
    expect(recorded).toHaveLength(25);
    recorded.forEach((r, i) => {
      expect(r.changeId).toBe(changes[i].changeId);
      expect(r.changeType).toBe(changes[i].changeType);
      expect(r.text).toBe(changes[i].text);
      expect(r.textSha256).toBe(sha256(changes[i].text));
      // The machine author's canonical name, not the one the client sent.
      expect(r.proposedBy).toBe('AnA (AI draft)');
      expect(r.proposedByVerified).toBe(true);
    });

    expect(chain).toHaveLength(1);
    expect(chain[0].action).toBe('authoring.section.tracked_change_bulk_decision');
    expect(chain[0].details.trailId).toBe(row.id);
    expect(chain[0].details.metadataSha256).toBe(metadataSha256(row.metadata));
  }, T);
});

describe('3 — the AnA turn a suggestion came from is verified in the tenant', () => {
  it('single: a turn record of this organization → verified, with that record’s SHA-256', async () => {
    const stored = await rows<{ record_sha256: string; outcome: string }>(
      'SELECT record_sha256, outcome FROM ana_turn_records WHERE id = $1 AND organization_id = $2',
      [ownTurn.id, ORG],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].record_sha256).toBe(ownTurn.sha256);

    const { docId, sectionId } = await seedDoc();
    const res = await single(docId).send({
      changeId: 'ana-src-1',
      decision: 'accept',
      changeType: 'insertion',
      text: 'Draft paragraph for 2.5.4.',
      authorId: 'ana',
      sourceRecord: ownTurn.id,
      sectionId,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { trail } = await recordOf(docId);
    expect(trail).toHaveLength(1);
    expect(trail[0].metadata.source).toEqual({
      verified: true,
      turnRecordId: ownTurn.id,
      turnRecordSha256: ownTurn.sha256,
      outcome: 'answered',
    });
  }, T);

  it('single: another organization’s turn record → unverified, "no such turn record in this organization"', async () => {
    const { docId } = await seedDoc();
    const res = await single(docId).send({
      changeId: 'ana-src-2',
      decision: 'reject',
      changeType: 'insertion',
      text: 'Text claimed to come from a foreign turn.',
      authorId: 'ana',
      sourceRecord: foreignTurn.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { trail } = await recordOf(docId);
    expect(trail[0].metadata.source).toEqual({
      verified: false,
      claimed: foreignTurn.id,
      why: 'no such turn record in this organization',
    });
    // Nothing of the foreign record leaks into this tenant's trail.
    expect(JSON.stringify(trail[0].metadata)).not.toContain(foreignTurn.sha256);
  }, T);

  it('single: a claim that is not a record id → unverified, "not a record id"', async () => {
    const { docId } = await seedDoc();
    const res = await single(docId).send({
      changeId: 'ana-src-3',
      decision: 'accept',
      text: 'Text with a made-up source.',
      sourceRecord: 'turn_7',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { trail } = await recordOf(docId);
    expect(trail[0].metadata.source).toEqual({ verified: false, claimed: 'turn_7', why: 'not a record id' });
  }, T);

  it('bulk: each change is resolved on its own — own, foreign, non-id and none', async () => {
    const { docId } = await seedDoc();
    const changes = [
      { changeId: 'b-own', changeType: 'insertion', text: 'From our turn.', authorId: 'ana', sourceRecord: ownTurn.id },
      { changeId: 'b-foreign', changeType: 'insertion', text: 'From their turn.', authorId: 'ana', sourceRecord: foreignTurn.id },
      { changeId: 'b-bogus', changeType: 'insertion', text: 'From nowhere.', authorId: 'ana', sourceRecord: 'not-a-uuid' },
      { changeId: 'b-none', changeType: 'deletion', text: 'Typed by a person.', authorId: 'kim@sponsor.test', authorName: 'Kim' },
    ];
    const res = await bulk(docId).send({ decision: 'accept', changeIds: changes.map((c) => c.changeId), changes });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { trail } = await recordOf(docId);
    const byId = Object.fromEntries(
      (trail[0].metadata.changes as Array<Record<string, any>>).map((c) => [c.changeId, c]),
    );
    expect(byId['b-own'].source).toEqual({
      verified: true,
      turnRecordId: ownTurn.id,
      turnRecordSha256: ownTurn.sha256,
      outcome: 'answered',
    });
    expect(byId['b-foreign'].source).toEqual({
      verified: false,
      claimed: foreignTurn.id,
      why: 'no such turn record in this organization',
    });
    expect(byId['b-bogus'].source).toEqual({ verified: false, claimed: 'not-a-uuid', why: 'not a record id' });
    expect(byId['b-none'].source).toBeUndefined();
  }, T);
});

describe('4 — a decision is filed only against a section of its own document', () => {
  it('single and bulk: a section of ANOTHER document → 400, and nothing is written', async () => {
    const { docId } = await seedDoc();
    const other = await seedDoc();
    const auditBefore = await decisionAuditCount();

    const one = await single(docId).send({
      changeId: 'wrong-section-1',
      decision: 'accept',
      text: 'Filed against the wrong section.',
      sectionId: other.sectionId,
    });
    expect(one.status).toBe(400);
    expect(String(one.body.error)).toMatch(/not in this document/);

    const many = await bulk(docId).send({
      decision: 'accept',
      changeIds: ['wrong-section-2', 'wrong-section-3'],
      changes: [{ changeId: 'wrong-section-2', text: 'a' }, { changeId: 'wrong-section-3', text: 'b' }],
      sectionId: other.sectionId,
    });
    expect(many.status).toBe(400);

    // A well-formed id that names no section at all is refused the same way.
    const none = await single(docId).send({
      changeId: 'wrong-section-4',
      decision: 'accept',
      text: 'x',
      sectionId: randomUUID(),
    });
    expect(none.status).toBe(400);

    for (const d of [docId, other.docId]) {
      const r = await recordOf(d);
      expect(r.decisions).toEqual([]);
      expect(r.trail).toEqual([]);
      expect(r.chain).toEqual([]);
    }
    expect(await decisionAuditCount()).toBe(auditBefore);
  }, T);
});

describe('5 — the decision and its record commit together, or neither does', () => {
  it('audit_logs refusing the chained row → 500, and no decision upsert and no trail row survive', async () => {
    const { docId, sectionId } = await seedDoc();
    const auditBefore = await decisionAuditCount();
    await jdb.pglite.exec(`
      CREATE OR REPLACE FUNCTION test_refuse_decision_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated audit_logs outage'; END $$;
      CREATE TRIGGER test_refuse_decision_audit BEFORE INSERT ON audit_logs
        FOR EACH ROW WHEN (NEW.action LIKE 'authoring.section.tracked_change%')
        EXECUTE FUNCTION test_refuse_decision_audit();
    `);
    try {
      const one = await single(docId).send({
        changeId: 'atomic-1',
        decision: 'accept',
        text: 'Words that must not be accepted without a record.',
        sectionId,
      });
      expect(one.status).toBe(500);

      const many = await bulk(docId).send({
        decision: 'reject',
        changeIds: ['atomic-2', 'atomic-3'],
        changes: [{ changeId: 'atomic-2', text: 'two' }, { changeId: 'atomic-3', text: 'three' }],
        sectionId,
      });
      expect(many.status).toBe(500);

      const r = await recordOf(docId);
      expect(r.decisions, 'a decision committed without its record').toEqual([]);
      expect(r.trail, 'a trail row committed without its chain entry').toEqual([]);
      expect(r.chain).toEqual([]);
      expect(await decisionAuditCount()).toBe(auditBefore);
    } finally {
      await jdb.pglite.exec(`
        DROP TRIGGER IF EXISTS test_refuse_decision_audit ON audit_logs;
        DROP FUNCTION IF EXISTS test_refuse_decision_audit();
      `);
    }

    // Control: the same decision goes through once the chain can be written,
    // so the refusal above was the outage and nothing else.
    const again = await single(docId).send({
      changeId: 'atomic-1',
      decision: 'accept',
      text: 'Words that must not be accepted without a record.',
      sectionId,
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const r = await recordOf(docId);
    expect(r.decisions.map((d) => d.change_id)).toEqual(['atomic-1']);
    expect(r.trail).toHaveLength(1);
    expect(r.chain).toHaveLength(1);
  }, T);
});

describe('6 — the reason is the person’s, or none', () => {
  it('single: a stated reason is the trail’s change_reason and the chain row’s audit_logs.reason', async () => {
    const { docId, sectionId } = await seedDoc();
    const reason = 'Accepted: matches the CSR Table 14.2.1 hazard ratio.';
    const res = await single(docId).send({
      changeId: 'reason-1',
      decision: 'accept',
      text: 'HR 0.62 (95% CI 0.48–0.80).',
      sectionId,
      reason: `  ${reason}  `,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { trail, chain } = await recordOf(docId);
    expect(trail[0].change_reason).toBe(reason);
    expect(chain[0].reason).toBe(reason);
    expect(chain[0].details.changeReason).toBe(reason);
  }, T);

  it('bulk: a stated reason is recorded the same way', async () => {
    const { docId } = await seedDoc();
    const reason = 'Rejected: the draft overstates the secondary endpoint.';
    const res = await bulk(docId).send({
      decision: 'reject',
      changeIds: ['r-1', 'r-2'],
      changes: [{ changeId: 'r-1', text: 'one' }, { changeId: 'r-2', text: 'two' }],
      reason,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { trail, chain } = await recordOf(docId);
    expect(trail[0].change_reason).toBe(reason);
    expect(chain[0].reason).toBe(reason);
  }, T);

  it('no reason, or only whitespace → null in the trail and in audit_logs, never a made-up one', async () => {
    const { docId } = await seedDoc();
    const a = await single(docId).send({ changeId: 'no-reason-1', decision: 'accept', text: 'a' });
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    const b = await single(docId).send({ changeId: 'no-reason-2', decision: 'reject', text: 'b', reason: '   ' });
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    const c = await bulk(docId).send({ decision: 'accept', changeIds: ['no-reason-3'], changes: [{ changeId: 'no-reason-3', text: 'c' }] });
    expect(c.status, JSON.stringify(c.body)).toBe(200);

    const { trail, chain } = await recordOf(docId);
    expect(trail).toHaveLength(3);
    expect(trail.map((t) => t.change_reason)).toEqual([null, null, null]);
    expect(chain).toHaveLength(3);
    expect(chain.map((x) => x.reason)).toEqual([null, null, null]);
    expect(chain.map((x) => x.details.changeReason)).toEqual([null, null, null]);
    // No section named → filed against the document.
    expect(chain.map((x) => x.table_name)).toEqual(['authoring_document', 'authoring_document', 'authoring_document']);
    expect(chain.map((x) => x.record_id)).toEqual([docId, docId, docId]);
  }, T);
});

describe('7 — a sealed document takes no decision (existing behaviour)', () => {
  it('FROZEN → 403 DOCUMENT_FROZEN on single and bulk, and nothing is written', async () => {
    const { docId, sectionId } = await seedDoc('FROZEN');
    const auditBefore = await decisionAuditCount();
    const one = await single(docId).send({ changeId: 'frozen-1', decision: 'accept', text: 'late edit', sectionId });
    expect(one.status).toBe(403);
    expect(one.body.error).toBe('DOCUMENT_FROZEN');
    const many = await bulk(docId).send({
      decision: 'accept',
      changeIds: ['frozen-2'],
      changes: [{ changeId: 'frozen-2', text: 'late edit' }],
      sectionId,
    });
    expect(many.status).toBe(403);
    expect(many.body.error).toBe('DOCUMENT_FROZEN');

    const r = await recordOf(docId);
    expect(r.decisions).toEqual([]);
    expect(r.trail).toEqual([]);
    expect(await decisionAuditCount()).toBe(auditBefore);
  }, T);
});
