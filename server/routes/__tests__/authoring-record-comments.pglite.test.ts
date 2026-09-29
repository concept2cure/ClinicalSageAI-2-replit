/**
 * A comment, its quoted passage and what happens to its thread are an
 * authoring RECORD — proven through the REAL authoring router, over HTTP, on
 * in-process Postgres (PGlite) built from the authoring subsystem's own
 * migrations (row D5, 2026-09-26).
 *
 * What is proven, each against the engine and the wire rather than a mock of
 * either:
 *
 *   1. POST /sections/:id/comment writes the comment AND an
 *      authoring_audit_trail row whose after_content is the words and whose
 *      metadata holds the quoted passage with its hash and the hash of the
 *      section content it was quoted from — AND a chained audit_logs row that
 *      names that trail row (trailId), carries the SHA-256 of its metadata and
 *      the numeric principal as actor_id.
 *   2. They commit together or not at all: with the chained audit write
 *      failing, the answer is 5xx and neither the comment nor its trail row
 *      survives.
 *   3. The document is the SECTION's, never the one the body names.
 *   4. A reply to a comment on another section is refused (400) and writes
 *      nothing.
 *   5. PATCH resolve/reopen records the transition, the resolution note as the
 *      reason, both statuses, and the person who did it.
 *   6. The ENGINE refuses to rewrite a comment's words or quoted passage (its
 *      status stays mutable), and refuses UPDATE, DELETE and TRUNCATE on the
 *      trail.
 *   7. GET /docs/:docId/audit reports every new row intact; a row rewritten
 *      past the table's guard (trigger disabled, then restored) reads
 *      intact:false and names the field that no longer matches the chain.
 *
 * ── Why the pool is wrapped ──────────────────────────────────────────────────
 * PGlite is ONE session. A statement a handler sends on the pool while its
 * transaction client is open runs INSIDE that transaction here, whereas on a
 * real pg Pool it would run on another connection and commit on its own. So a
 * write that escaped the transaction would still roll back in this harness and
 * the atomicity claim would pass for the wrong reason. The wrapper records
 * which executor each statement went through and whether a transaction was
 * open, and the tests assert the writes went through the transaction's client.
 * The same wrapper injects the audit_logs failure for (2).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { stableStringify } from '../../../shared/canonical-json';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

/** A second member of the organization — the one who resolves the thread. */
const REVIEWER = { id: '8', organizationId: ORG, email: 'reviewer@canvas.example', name: 'Robin Reviewer' };

const DOC_A = 'd0c0000a-0000-4000-8000-00000000000a';
const DOC_B = 'd0c0000b-0000-4000-8000-00000000000b';
const SEC_A1 = '5ec000a1-0000-4000-8000-0000000000a1';
const SEC_A2 = '5ec000a2-0000-4000-8000-0000000000a2';
const SEC_B1 = '5ec000b1-0000-4000-8000-0000000000b1';
const SEC_A1_CONTENT = '<p>The pivotal study met its primary endpoint with a hazard ratio of 0.71.</p>';

// ── The executor trace and the fault (see header) ────────────────────────────
type Via = 'pool' | 'client';
interface Stmt { via: Via; sql: string; inTx: boolean }
const trace = { stmts: [] as Stmt[], txOpen: false, failAuditInsert: false, faultHits: 0 };

const WRITE = /^\s*INSERT INTO (authoring_comments|authoring_audit_trail|audit_logs)\b/i;
/** The governed writes a request issued: table, executor, inside a transaction. */
const writesSince = (mark: number) =>
  trace.stmts
    .slice(mark)
    .filter((s) => WRITE.test(s.sql))
    .map((s) => [WRITE.exec(s.sql)![1].toLowerCase(), s.via, s.inTx] as const);

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let reviewer: (r: request.Test) => request.Test;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      // The authoring subsystem unit, as scripts/db/authoring-subsystem.mjs
      // applies it (AUTHORING_SUBSYSTEM_FILES) — including the two files whose
      // 2026-09-26 amendments are under test: the trail's append-only triggers
      // and actor_id, and the comment's content-fixed trigger.
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      // On the deploy set: threading columns + the reply self-reference.
      'migrations/20260728_authoring_comments_threading.sql',
      // The chain's order key: without it the writer runs the pre-fix recipe.
      'migrations/20260921_audit_logs_chain_seq.sql',
    ],
    testOnlySql: `
      INSERT INTO users (id, name, email) VALUES (${REVIEWER.id}, '${REVIEWER.name}', '${REVIEWER.email}');
      INSERT INTO organization_users (organization_id, user_id, role) VALUES (${ORG}, ${REVIEWER.id}, 'member');
      INSERT INTO authoring_documents (id, title, status, created_by, tenant_id) VALUES
        ('${DOC_A}', 'Module 2.5 Clinical Overview', 'draft', '${AUTHOR.id}', ${ORG}),
        ('${DOC_B}', 'Module 2.7 Clinical Summary', 'draft', '${AUTHOR.id}', ${ORG});
      INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id) VALUES
        ('${SEC_A1}', '${DOC_A}', '2.5.1', 'Rationale', '${SEC_A1_CONTENT}', 0, ${ORG}),
        ('${SEC_A2}', '${DOC_A}', '2.5.2', 'Biopharmaceutics', '<p>Oral bioavailability was 62%.</p>', 1, ${ORG}),
        ('${SEC_B1}', '${DOC_B}', '2.7.1', 'Summary', '<p>Summary.</p>', 0, ${ORG});
    `,
  });

  const tap = (via: Via) => async (textOrConfig: unknown, params?: unknown[]) => {
    const sql = typeof textOrConfig === 'string' ? textOrConfig : String((textOrConfig as { text?: unknown })?.text ?? '');
    trace.stmts.push({ via, sql, inTx: trace.txOpen });
    if (via === 'client') {
      const head = sql.trim().toUpperCase();
      if (head === 'BEGIN') trace.txOpen = true;
      if (head === 'COMMIT' || head === 'ROLLBACK') trace.txOpen = false;
    }
    if (trace.failAuditInsert && /^\s*INSERT INTO audit_logs\b/i.test(sql)) {
      trace.faultHits += 1;
      throw new Error('injected: the chained audit_logs write failed');
    }
    return jdb.pool.query(textOrConfig as string, params);
  };
  h.db = jdb.db;
  h.pool = { query: tap('pool'), connect: async () => ({ query: tap('client'), release: () => {} }) };

  author = asToken(await mint(AUTHOR));
  reviewer = asToken(await mint(REVIEWER));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);
}, T);

afterAll(async () => {
  await jdb?.close();
});

// ── Reading back ─────────────────────────────────────────────────────────────
interface TrailRow {
  id: string; doc_id: string | null; section_id: string | null; operation_type: string;
  actor_email: string; actor_id: string | null; before_content: string | null; after_content: string | null;
  content_hash_before: string | null; content_hash_after: string | null; change_reason: string | null;
  metadata: Record<string, any>;
}
interface ChainRow {
  id: string; tenant_id: number; user_id: number | null; actor_id: number | null; action: string;
  table_name: string; record_id: string; chain_seq: string | number | null; sha256_chain: string | null;
  reason: string | null; new_values: Record<string, any>;
}

async function trailFor(commentId: string, operation?: string): Promise<TrailRow[]> {
  const r = await jdb.pglite.query<TrailRow>(
    `SELECT id, doc_id, section_id, operation_type, actor_email, actor_id, before_content, after_content,
            content_hash_before, content_hash_after, change_reason, metadata
       FROM authoring_audit_trail
      WHERE metadata->>'comment_id' = $1 ${operation ? 'AND operation_type = $2' : ''}
      ORDER BY created_at ASC`,
    operation ? [commentId, operation] : [commentId],
  );
  return r.rows;
}

/** The chained audit_logs row whose details name this trail row. */
async function chainFor(trailId: string): Promise<ChainRow[]> {
  const r = await jdb.pglite.query<ChainRow>(
    `SELECT id, tenant_id, user_id, actor_id, action, table_name, record_id, chain_seq, sha256_chain, reason, new_values
       FROM audit_logs WHERE new_values::jsonb->>'trailId' = $1`,
    [trailId],
  );
  return r.rows.map((row) => ({
    ...row,
    new_values: typeof row.new_values === 'string' ? JSON.parse(row.new_values) : row.new_values,
  }));
}

async function count(table: string): Promise<number> {
  const r = await jdb.pglite.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return r.rows[0].n;
}
const counts = async () => ({
  comments: await count('authoring_comments'),
  trail: await count('authoring_audit_trail'),
  chain: await count('audit_logs'),
});

const comment = (as: (r: request.Test) => request.Test, sectionId: string, body: Record<string, unknown>) =>
  as(request(app).post(`/api/authoring/sections/${sectionId}/comment`)).send(body);

/** Ids of the rows made through the routes, for the integrity pass in (7). */
const made = { quoted: '', reply: '', resolved: '' };

// ─────────────────────────────────────────────────────────────────────────────

describe('(1) a comment and its record, written through POST /sections/:id/comment', () => {
  it('writes the comment, a trail row with the words and the quoted passage, and a chained row naming it', async () => {
    const quote = 'met its primary endpoint';
    const anchor = { quote, from: 21, to: 45 };
    const body = 'Cite the SAP section that pre-specifies this endpoint.';
    const mark = trace.stmts.length;

    const res = await comment(author, SEC_A1, { body, anchor });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const commentId = res.body.comment.id as string;
    made.quoted = commentId;

    // The comment row, as written.
    const stored = await jdb.pglite.query<{ body: string; anchor: unknown; created_by: string; doc_id: string }>(
      'SELECT body, anchor, created_by, doc_id FROM authoring_comments WHERE id = $1',
      [commentId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]).toMatchObject({ body, anchor, created_by: AUTHOR.id, doc_id: DOC_A });

    // The trail row: the words as after_content, the passage and its hashes.
    const trail = await trailFor(commentId);
    expect(trail).toHaveLength(1);
    const t = trail[0];
    expect(t.operation_type).toBe('comment_added');
    expect(t.doc_id).toBe(DOC_A);
    expect(t.section_id).toBe(SEC_A1);
    expect(t.after_content).toBe(body);
    expect(t.content_hash_after).toBe(sha256(body));
    expect(t.before_content).toBeNull();
    expect(t.actor_email).toBe(AUTHOR.email);
    expect(t.actor_id).toBe(AUTHOR.id);
    expect(t.metadata).toMatchObject({
      comment_id: commentId,
      section_id: SEC_A1,
      parent_comment_id: null,
      anchor,
      quote,
      quoteSha256: sha256(quote),
      sectionContentSha256: sha256(SEC_A1_CONTENT),
    });

    // The chained row: names the trail row, hashes its metadata as stored, and
    // carries the numeric principal — not "System", not absent.
    const chain = await chainFor(t.id);
    expect(chain).toHaveLength(1);
    const c = chain[0];
    expect(c.action).toBe('authoring.section.comment_added');
    expect(c.table_name).toBe('authoring_section');
    expect(c.record_id).toBe(SEC_A1);
    expect(c.tenant_id).toBe(ORG);
    expect(c.actor_id).toBe(Number(AUTHOR.id));
    expect(c.user_id).toBe(Number(AUTHOR.id));
    expect(c.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(c.chain_seq, 'the row took a position on the tenant chain').not.toBeNull();
    expect(c.new_values.trailId).toBe(t.id);
    expect(c.new_values.metadataSha256).toBe(sha256(stableStringify(t.metadata)));
    expect(c.new_values.contentHashAfter).toBe(sha256(body));
    expect(c.new_values.operationType).toBe('comment_added');
    expect(c.new_values.actorEmail).toBe(AUTHOR.email);

    // All three writes went through the transaction's client, inside BEGIN.
    expect(writesSince(mark)).toEqual([
      ['authoring_comments', 'client', true],
      ['authoring_audit_trail', 'client', true],
      ['audit_logs', 'client', true],
    ]);
  }, T);
});

describe('(2) the comment and its record commit together or not at all', () => {
  it('when the chained audit write fails: 5xx, and no comment row and no trail row remain', async () => {
    const before = await counts();
    const body = `Unrecorded comment ${randomUUID()}`;
    const mark = trace.stmts.length;

    trace.failAuditInsert = true;
    let res: request.Response;
    try {
      res = await comment(author, SEC_A1, { body, anchor: { quote: 'hazard ratio' } });
    } finally {
      trace.failAuditInsert = false;
    }

    // The fault was actually reached — this is not passing on an earlier failure.
    expect(trace.faultHits).toBe(1);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).toBeLessThan(600);
    expect(res.body.comment).toBeUndefined();

    // The comment and the trail row WERE written, on the transaction's client,
    // before the chained write failed — and were rolled back with it.
    expect(writesSince(mark)).toEqual([
      ['authoring_comments', 'client', true],
      ['authoring_audit_trail', 'client', true],
      ['audit_logs', 'client', true],
    ]);
    expect(trace.stmts.slice(mark).some((s) => s.via === 'client' && s.sql.trim().toUpperCase() === 'ROLLBACK')).toBe(true);
    expect(trace.txOpen).toBe(false);

    const gone = await jdb.pglite.query('SELECT 1 FROM authoring_comments WHERE body = $1', [body]);
    expect(gone.rows).toHaveLength(0);
    const noTrail = await jdb.pglite.query('SELECT 1 FROM authoring_audit_trail WHERE after_content = $1', [body]);
    expect(noTrail.rows).toHaveLength(0);
    expect(await counts()).toEqual(before);
  }, T);
});

describe('(3) the document is the section’s', () => {
  it('a body naming another document is ignored: comment and record are filed under the section’s own document', async () => {
    const res = await comment(author, SEC_A1, { body: 'Filed where it was made.', doc_id: DOC_B });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.comment.doc_id).toBe(DOC_A);

    const row = await jdb.pglite.query<{ doc_id: string }>('SELECT doc_id FROM authoring_comments WHERE id = $1', [res.body.comment.id]);
    expect(row.rows[0].doc_id).toBe(DOC_A);
    const trail = await trailFor(res.body.comment.id);
    expect(trail).toHaveLength(1);
    expect(trail[0].doc_id).toBe(DOC_A);
    expect((await chainFor(trail[0].id))[0].new_values.docId).toBe(DOC_A);

    // Nothing was filed against the document the body named.
    const onB = await jdb.pglite.query('SELECT 1 FROM authoring_audit_trail WHERE doc_id = $1', [DOC_B]);
    expect(onB.rows).toHaveLength(0);
    const bAudit = await author(request(app).get(`/api/authoring/docs/${DOC_B}/audit`));
    expect(bAudit.status).toBe(200);
    expect(bAudit.body.events).toHaveLength(0);
  }, T);
});

describe('(4) a reply belongs to a thread on the same section', () => {
  it('a reply whose parent is on another section → 400, and nothing is written', async () => {
    const parent = await comment(author, SEC_A2, { body: 'Bioavailability needs the fed-state number.' });
    expect(parent.status).toBe(201);
    const parentId = parent.body.comment.id as string;

    const before = await counts();
    const res = await comment(reviewer, SEC_A1, { body: 'Replying on the wrong section.', parent_comment_id: parentId });
    expect(res.status).toBe(400);
    expect(await counts()).toEqual(before);
    const stray = await jdb.pglite.query('SELECT 1 FROM authoring_comments WHERE parent_comment_id = $1', [parentId]);
    expect(stray.rows).toHaveLength(0);
  }, T);

  it('the same reply on the parent’s own section is accepted and recorded as reply_added', async () => {
    const parent = await jdb.pglite.query<{ id: string }>(
      `SELECT id FROM authoring_comments WHERE section_id = $1 AND parent_comment_id IS NULL ORDER BY created_at DESC LIMIT 1`,
      [SEC_A2],
    );
    const parentId = parent.rows[0].id;
    const res = await comment(reviewer, SEC_A2, { body: 'Fed-state AUC added to Table 3.', parent_comment_id: parentId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    made.reply = res.body.comment.id;
    const trail = await trailFor(made.reply);
    expect(trail).toHaveLength(1);
    expect(trail[0].operation_type).toBe('reply_added');
    expect(trail[0].metadata.parent_comment_id).toBe(parentId);
    expect(trail[0].actor_id).toBe(REVIEWER.id);
    expect((await chainFor(trail[0].id))[0].actor_id).toBe(Number(REVIEWER.id));
  }, T);
});

describe('(5) PATCH /comments/:id — resolving and reopening are recorded, with who and why', () => {
  it('resolve with a note: transition resolved, the note as the reason, both statuses, the real actor', async () => {
    const note = 'SAP §9.2 cited in the revised paragraph.';
    const res = await reviewer(request(app).patch(`/api/authoring/comments/${made.quoted}`)).send({ status: 'resolved', resolution_note: note });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.comment.status).toBe('resolved');

    const rows = await trailFor(made.quoted, 'comment_resolved');
    expect(rows).toHaveLength(1);
    const t = rows[0];
    made.resolved = t.id;
    expect(t.change_reason).toBe(note);
    expect(t.after_content).toBe(note);
    expect(t.before_content).toBeNull();
    expect(t.metadata).toMatchObject({
      comment_id: made.quoted,
      section_id: SEC_A1,
      transition: 'resolved',
      previous_status: 'open',
      status: 'resolved',
      previous_resolution_note: null,
      resolution_note: note,
    });
    // The person — not "System", not "unknown", not absent.
    expect(t.actor_email).toBe(REVIEWER.email);
    expect(t.actor_id).toBe(REVIEWER.id);

    const [c] = await chainFor(t.id);
    expect(c.actor_id).toBe(Number(REVIEWER.id));
    expect(c.user_id).toBe(Number(REVIEWER.id));
    expect(c.new_values.actorEmail).toBe(REVIEWER.email);
    expect(c.new_values.changeReason).toBe(note);
    expect(c.reason).toBe(note);
    expect(c.action).toBe('authoring.section.comment_resolved');
  }, T);

  it('reopen: transition reopened, from resolved to open, the earlier note kept as before_content', async () => {
    const res = await author(request(app).patch(`/api/authoring/comments/${made.quoted}`)).send({ status: 'open' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.comment).toMatchObject({ status: 'open', resolution_note: null, resolved_by: null });

    const rows = await trailFor(made.quoted, 'comment_updated');
    expect(rows).toHaveLength(1);
    const t = rows[0];
    expect(t.metadata).toMatchObject({ transition: 'reopened', previous_status: 'resolved', status: 'open', resolution_note: null });
    expect(t.before_content).toBe('SAP §9.2 cited in the revised paragraph.');
    expect(t.after_content).toBeNull();
    expect(t.change_reason).toBeNull();
    expect(t.actor_email).toBe(AUTHOR.email);
    expect(t.actor_id).toBe(AUTHOR.id);
    expect((await chainFor(t.id))[0].actor_id).toBe(Number(AUTHOR.id));
  }, T);
});

describe('(6) the engine holds the record, whoever asks', () => {
  it('refuses to rewrite a comment’s words or quoted passage, and lets its status move', async () => {
    const id = made.reply;
    await expect(
      jdb.pglite.query(`UPDATE authoring_comments SET body = 'words it never said' WHERE id = $1`, [id]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    await expect(
      jdb.pglite.query(`UPDATE authoring_comments SET anchor = '{"quote":"another passage"}'::jsonb WHERE id = $1`, [id]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
    const kept = await jdb.pglite.query<{ body: string; anchor: unknown }>('SELECT body, anchor FROM authoring_comments WHERE id = $1', [id]);
    expect(kept.rows[0].body).toBe('Fed-state AUC added to Table 3.');

    const moved = await jdb.pglite.query(`UPDATE authoring_comments SET status = 'in_review' WHERE id = $1`, [id]);
    expect((moved as { affectedRows?: number }).affectedRows).toBe(1);
    const now = await jdb.pglite.query<{ status: string }>('SELECT status FROM authoring_comments WHERE id = $1', [id]);
    expect(now.rows[0].status).toBe('in_review');
  }, T);

  it('refuses UPDATE, DELETE and TRUNCATE on authoring_audit_trail', async () => {
    const before = await count('authoring_audit_trail');
    await expect(
      jdb.pglite.query(`UPDATE authoring_audit_trail SET after_content = 'rewritten' WHERE id = $1`, [made.resolved]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION: authoring_audit_trail row cannot be update/);
    await expect(
      jdb.pglite.query('DELETE FROM authoring_audit_trail WHERE id = $1', [made.resolved]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION: authoring_audit_trail row cannot be delete/);
    await expect(jdb.pglite.query('TRUNCATE authoring_audit_trail')).rejects.toThrow(
      /IMMUTABILITY_VIOLATION: authoring_audit_trail cannot be truncated/,
    );
    expect(await count('authoring_audit_trail')).toBe(before);
  }, T);
});

describe('(7) GET /docs/:docId/audit verifies every row against its chain entry', () => {
  type Ev = { id: string; event_type: string; integrity: { chained: boolean; intact: boolean | null; mismatches: string[]; chainPayloadIntact: boolean | null } | null };
  const audit = async (): Promise<Ev[]> => {
    const r = await author(request(app).get(`/api/authoring/docs/${DOC_A}/audit`));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return r.body.events as Ev[];
  };

  it('every row written through the routes above reads intact', async () => {
    const events = await audit();
    // On this document: the quoted comment, the doc_id-override comment, the
    // parent on 2.5.2, the reply, the resolve and the reopen. The refused
    // reply (4) and the rolled-back comment (2) left nothing.
    expect(events.length).toBe(6);
    for (const e of events) {
      expect(e.integrity, `${e.event_type} ${e.id}`).toEqual({ chained: true, intact: true, mismatches: [], chainPayloadIntact: true });
    }
  }, T);

  it('a quote rewritten past the guard reads intact:false, naming metadata; the other rows stay intact', async () => {
    const [t] = await trailFor(made.quoted, 'comment_added');
    await jdb.pglite.exec('ALTER TABLE authoring_audit_trail DISABLE TRIGGER trg_authoring_audit_trail_append_only');
    try {
      await jdb.pglite.query(
        `UPDATE authoring_audit_trail SET metadata = jsonb_set(metadata, '{quote}', '"missed its primary endpoint"') WHERE id = $1`,
        [t.id],
      );
    } finally {
      await jdb.pglite.exec('ALTER TABLE authoring_audit_trail ENABLE TRIGGER trg_authoring_audit_trail_append_only');
    }
    // The guard is back.
    await expect(
      jdb.pglite.query(`UPDATE authoring_audit_trail SET change_reason = 'x' WHERE id = $1`, [t.id]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);

    const events = await audit();
    const hit = events.find((e) => e.id === t.id)!;
    expect(hit.integrity).toEqual({ chained: true, intact: false, mismatches: ['metadata'], chainPayloadIntact: true });
    for (const e of events.filter((x) => x.id !== t.id)) expect(e.integrity?.intact, e.event_type).toBe(true);
  }, T);

  it('a comment’s words rewritten past the guard — hash column rewritten to match — read intact:false, naming after_content', async () => {
    const [t] = await trailFor(made.reply, 'reply_added');
    const forged = 'Fed-state data not needed.';
    await jdb.pglite.exec('ALTER TABLE authoring_audit_trail DISABLE TRIGGER trg_authoring_audit_trail_append_only');
    try {
      // The row is made internally consistent (its own hash column matches the
      // new words), so only the chain can tell.
      await jdb.pglite.query(
        'UPDATE authoring_audit_trail SET after_content = $1, content_hash_after = $2 WHERE id = $3',
        [forged, sha256(forged), t.id],
      );
    } finally {
      await jdb.pglite.exec('ALTER TABLE authoring_audit_trail ENABLE TRIGGER trg_authoring_audit_trail_append_only');
    }

    const events = await audit();
    const hit = events.find((e) => e.id === t.id)!;
    expect(hit.integrity).toEqual({ chained: true, intact: false, mismatches: ['after_content'], chainPayloadIntact: true });
    expect(events.filter((e) => e.integrity?.intact === false).map((e) => e.id).sort()).toEqual(
      [t.id, (await trailFor(made.quoted, 'comment_added'))[0].id].sort(),
    );
  }, T);
});

describe('the database this ran on', () => {
  it('had every table and column the routes under test asked for', () => {
    assertNoSchemaGaps(jdb);
  });
});
