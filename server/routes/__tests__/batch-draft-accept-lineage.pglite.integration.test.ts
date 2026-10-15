/**
 * Ledger L160 — accepting an AnA batch draft into a coauthor document records
 * lineage in the same transaction, or refuses.
 *
 * Real router, real PGlite with the real evidence-spine and span-lineage
 * migrations; the request-scoped db is a Drizzle handle over that database so
 * the route's raw BEGIN/COMMIT and the gate's adapted client share one
 * connection, exactly as in production.
 *
 * The machine-claim cases at the end also mount the real POST
 * /api/claude/batch over the same database, with the real turn-record
 * migration and writer; only the drafting service (the model) is stubbed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as any, pg: null as any }));
vi.mock('../../db/requestDb', () => {
  // The turn-record writer connects, BEGINs and COMMITs on the request's one
  // connection (requestConnectable); here that connection is the PGlite session.
  const query = (text: string, params?: unknown[]) => holder.pg.query(text, params);
  return {
    requestDb: () => holder.db,
    requestConnectable: () => ({ query, connect: async () => ({ query, release: () => undefined }) }),
  };
});
const actor = vi.hoisted(() => ({ id: 501 as number | null, organizationId: 77, name: 'Dana Reviewer', role: 'reviewer' }));
/** What the stubbed model answers for each section of a batch; `models`, when
 *  set, is the model each section reports, by position. */
const drafting = vi.hoisted(() => ({ content: '', model: 'model-of-record', models: null as string[] | null }));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({
    batchDraft: async (req: { requests: unknown[] }) =>
      req.requests.map((_, i) => ({
        content: drafting.content,
        model: drafting.models?.[i] ?? drafting.model,
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
        latencyMs: 1,
      })),
  }),
}));
vi.mock('../../services/auditService', async (orig) => {
  // Model provenance is fire-and-forget through the shared pool; the chained
  // row the turn record writes (writeChainedAuditRow) stays real.
  const real = await orig<any>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});

import createBatchDraftRoutes from '../batch-draft-routes';
import anaIntelligenceRoutes from '../ana-intelligence';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

const ORG = 77;
let pg: PGlite;
let app: express.Express;

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf8');
}
async function spans(documentId: number) {
  const r = await pg.query<{ provenance_kind: string }>(
    `SELECT provenance_kind FROM document_span_lineage
      WHERE document_table = 'coauthor_documents' AND document_id = $1 AND deleted_at IS NULL`,
    [String(documentId)],
  );
  return r.rows;
}
async function seedDoc(content = 'The prior text of the section.'): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, content, status) VALUES ($1, $2, 'draft') RETURNING id`,
    [ORG, content],
  );
  return r.rows[0].id;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE coauthor_documents (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, content TEXT, status TEXT, metadata JSON, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE coauthor_document_versions (id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL, version_number INTEGER NOT NULL, content TEXT, created_by TEXT, change_summary TEXT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE audit_events (id SERIAL PRIMARY KEY, organization_id INTEGER, event_type TEXT, entity_type TEXT, entity_id INTEGER, user_id INTEGER, user_name TEXT, user_role TEXT, ip_address TEXT, timestamp TIMESTAMPTZ, reason TEXT, metadata JSONB, regulatory_significant BOOLEAN, gxp_relevant BOOLEAN, created_at TIMESTAMPTZ);
  `);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'org');`);
  await pg.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pg.exec(migration('db/migrations/20260803_document_span_lineage.sql'));
  await pg.exec(migration('migrations/20260907_span_lineage_accepted_machine_draft.sql'));
  await pg.exec(migration('migrations/20260908_span_lineage_machine_draft.sql'));
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(migration('migrations/20260921_audit_logs_chain_seq.sql'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;`);
  await pg.exec(migration('migrations/20260926_ana_turn_records.sql'));
  holder.db = drizzle(pg);
  holder.pg = pg;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = actor.id == null ? { organizationId: actor.organizationId } : { id: actor.id, organizationId: actor.organizationId, name: actor.name, role: actor.role };
    next();
  });
  app.use('/api/batch-draft', createBatchDraftRoutes());
  app.use('/api/claude', anaIntelligenceRoutes);
}, 90_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(() => {
  actor.id = 501;
  actor.organizationId = ORG;
  drafting.models = null;
  delete process.env.AUDIT_HMAC_KEY;
});

describe('POST /api/batch-draft/documents/:id/accept (ledger L160)', () => {
  it('records every clause of the accepted text as the acceptor\'s assertion, in the same transaction as the content and its audit row', async () => {
    const id = await seedDoc();
    const content =
      'The primary endpoint was met at week twelve in the intent-to-treat population. These findings were consistent across every prespecified subgroup we examined.';
    const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send({ content, model: 'test-model' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe(content);
    const rows = await spans(id);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.provenance_kind === 'author_assertion')).toBe(true);
    const audit = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE entity_id = $1`, [id]);
    expect(Number(audit.rows[0].n)).toBe(1);
  });

  it('refuses an accept with no identified user, and writes nothing', async () => {
    const id = await seedDoc();
    actor.id = null;
    const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send({ content: 'Unattributed prose that must not land.' });
    expect(res.status).toBe(401);
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe('The prior text of the section.');
    expect(await spans(id)).toHaveLength(0);
    const versions = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM coauthor_document_versions WHERE document_id = $1`, [id]);
    expect(Number(versions.rows[0].n)).toBe(0);
  });
});

/* 2026-09-23 (W5/D7, co-author final pass): the accept route wrote content
   into any coauthor_documents row it could lock, whatever its status — so an
   ordinary member could replace the text of an approved (placed) snapshot,
   the column the PUT rule (services/coauthor/coauthor-status-write.ts)
   protects. A verdict row is refused here by the same rule, imported, and
   nothing is written: not the content, not a version row, not a lineage span,
   not an audit row. */
describe('POST /api/batch-draft/documents/:id/accept refuses a verdict row', () => {
  const counts = async (id: number) => {
    const v = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM coauthor_document_versions WHERE document_id = $1`, [id]);
    const a = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE entity_id = $1`, [id]);
    return { versions: Number(v.rows[0].n), audits: Number(a.rows[0].n), spans: (await spans(id)).length };
  };

  it.each(['approved', 'finalized', 'signed', 'locked', ' Approved '])(
    "status %j: 409 FINALIZED_DOCUMENT_READ_ONLY, and the row, its versions, spans and audit are untouched",
    async (status) => {
      const r0 = await pg.query<{ id: number }>(
        `INSERT INTO coauthor_documents (organization_id, content, status, metadata) VALUES ($1, '<p>approved text</p>', $2, '{"k":1}') RETURNING id`,
        [ORG, status],
      );
      const id = r0.rows[0].id;
      const before = (await pg.query('SELECT content, status, metadata::text AS metadata, updated_at FROM coauthor_documents WHERE id = $1', [id])).rows[0];

      const res = await request(app)
        .post(`/api/batch-draft/documents/${id}/accept`)
        .send({ content: 'Text nobody approved, written into an approved snapshot by an ordinary member.' });

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.error).toBe('FINALIZED_DOCUMENT_READ_ONLY');
      const after = (await pg.query('SELECT content, status, metadata::text AS metadata, updated_at FROM coauthor_documents WHERE id = $1', [id])).rows[0];
      expect(after).toEqual(before);
      expect(await counts(id)).toEqual({ versions: 0, audits: 0, spans: 0 });
    },
  );

  it('a working row is still accepted (the refusal is the verdict, not the route)', async () => {
    const r0 = await pg.query<{ id: number }>(
      `INSERT INTO coauthor_documents (organization_id, content, status) VALUES ($1, 'Prior working text.', 'review') RETURNING id`,
      [ORG],
    );
    const res = await request(app)
      .post(`/api/batch-draft/documents/${r0.rows[0].id}/accept`)
      .send({ content: 'The accepted draft of this working section, written for review.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('POST /api/batch-draft/documents/:id/accept — a truncated draft is not a finished one', () => {
  it('refuses a draft the model cut off at its output limit, and writes nothing', async () => {
    /* A draft that hit maxTokens stops mid-sentence. This route writes into
       `coauthor_documents` — the table leaf-source-resolver materializes eCTD
       leaves from — so an accepted truncated narrative is versioned, audited
       and filed exactly like a finished one. MAX_CONTENT_CHARS cannot catch it:
       8192 tokens is nowhere near 400,000 characters, which is why it was
       invisible. 21 CFR 11.10(a) requires a system able to discern an invalid
       record. */
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({
        content: 'The primary endpoint was met at week twelve in the intent-to-treat popul',
        finish_reason: 'max_tokens',
        model: 'test-model',
      });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('DRAFT_TRUNCATED');

    // Nothing landed: not the content, not a version, not a lineage span.
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe('The prior text of the section.');
    expect(await spans(id)).toHaveLength(0);
    const versions = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM coauthor_document_versions WHERE document_id = $1`, [id]);
    expect(Number(versions.rows[0].n)).toBe(0);
  });

  it('refuses on the explicit truncated flag as well as the raw reason', async () => {
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: 'Cut off here', truncated: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('DRAFT_TRUNCATED');
  });

  it('accepts a completed draft that reports its finish reason', async () => {
    /* The other half of the rule: reporting the reason must not itself block a
       complete draft, or callers will stop sending it. */
    const id = await seedDoc();
    const content =
      'The primary endpoint was met at week twelve. No new safety signal was identified.';
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content, finish_reason: 'end_turn', truncated: false, model: 'test-model' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe(content);
  });
});

/* NEW (high), periodic review 2026-09-28, editor family: the accept took "this
   text was machine-drafted by model X" from the request body — the
   acceptedMachineText and the model — and the lineage recorded it as fact. A
   member could record their own words as AnA's, or AnA's under a model that
   never wrote them. The generator (POST /api/claude/batch) kept no record to
   check against. Now it writes one turn record per batch, and the accept
   believes a claim only when that record holds the text. */
const DRAFT =
  '<p>The primary endpoint was met at week twelve in the intent-to-treat population.</p>' +
  '<p>No new safety signal was identified in any prespecified subgroup.</p>';

/** Draft `sections` sections through the real /api/claude/batch, each asked
 *  for with `instructions` and answered with `content`; the turn record the
 *  first result names. */
async function draftBatch(instructions = 'Draft it.', sections = 1, content = DRAFT): Promise<{ id: string; sha256: string }> {
  drafting.content = content;
  const requests = Array.from({ length: sections }, (_, i) => ({
    framework: 'ich_clinical',
    sectionType: `§2.7.${i + 3} Summary of Clinical Efficacy`,
    instructions,
  }));
  const res = await request(app).post('/api/claude/batch').send({ requests });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const turnRecord = res.body.data.results[0].turnRecord;
  expect(turnRecord?.status, JSON.stringify(res.body.data.results[0])).toBe('recorded');
  return { id: turnRecord.id, sha256: turnRecord.sha256 };
}
async function machineSpans(id: number) {
  const r = await pg.query<{ machine_author_id: string; asserted_by: string }>(
    `SELECT machine_author_id, asserted_by FROM document_span_lineage
      WHERE document_table = 'coauthor_documents' AND document_id = $1 AND deleted_at IS NULL
        AND provenance_kind = 'accepted_machine_draft'`,
    [String(id)],
  );
  return r.rows;
}
/** Whose each live span of the document is, split at character `at`: the spans
 *  wholly before it, wholly after it, and any that straddle it. */
async function whoseSpans(id: number, at: number) {
  const r = await pg.query<{ char_start: number; char_end: number; provenance_kind: string; machine_author_id: string | null }>(
    `SELECT char_start, char_end, provenance_kind, machine_author_id FROM document_span_lineage
      WHERE document_table = 'coauthor_documents' AND document_id = $1 AND deleted_at IS NULL
      ORDER BY char_start`,
    [String(id)],
  );
  const whose = (s: (typeof r.rows)[number]) => (s.machine_author_id ? `${s.provenance_kind}:${s.machine_author_id}` : s.provenance_kind);
  return {
    before: r.rows.filter((s) => s.char_end <= at).map(whose),
    after: r.rows.filter((s) => s.char_start >= at).map(whose),
    straddling: r.rows.filter((s) => s.char_start < at && s.char_end > at).map(whose),
  };
}
async function acceptAudit(id: number): Promise<Record<string, any>> {
  const r = await pg.query<{ metadata: Record<string, any> }>(
    `SELECT metadata FROM audit_events WHERE entity_id = $1 AND event_type = 'coauthor_document.draft_accepted'`,
    [id],
  );
  return r.rows[0]?.metadata;
}
async function docMetadata(id: number): Promise<Record<string, any>> {
  const r = await pg.query<{ m: string }>(`SELECT metadata::text AS m FROM coauthor_documents WHERE id = $1`, [id]);
  return JSON.parse(r.rows[0].m);
}
/** Accept DRAFT into `id`, claiming it is AnA's, with whatever else `extra` sends. */
function acceptClaimingAnA(id: number, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/batch-draft/documents/${id}/accept`)
    .send({ content: DRAFT, acceptedMachineText: [{ authorId: 'ana', text: DRAFT }], ...extra });
}

describe('POST /api/batch-draft/documents/:id/accept — AI authorship is checked against the turn record', () => {
  it('the batch records what it produced: one turn record holding the draft, its id and hash on the result', async () => {
    const { id, sha256 } = await draftBatch();
    const rec = await pg.query<{ record_sha256: string; organization_id: number; actor_user_id: number }>(
      `SELECT record_sha256, organization_id, actor_user_id FROM ana_turn_records WHERE id = $1`,
      [id],
    );
    expect(rec.rows[0]).toEqual({ record_sha256: sha256, organization_id: ORG, actor_user_id: 501 });
    const blob = await pg.query(`SELECT 1 FROM ana_record_blobs WHERE organization_id = $1 AND text = $2`, [ORG, DRAFT]);
    expect(blob.rows).toHaveLength(1);
  });

  it('a forged claim with no record behind it yields no accepted_machine_draft span, and the claim is disclosed', async () => {
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { model: 'forged-model' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect(await machineSpans(id), 'a client claim of AI authorship was recorded as fact').toEqual([]);
    const all = await spans(id);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.every((r) => r.provenance_kind === 'author_assertion')).toBe(true);

    const audit = await acceptAudit(id);
    expect(audit.machineText.unverified).toEqual([
      expect.objectContaining({ authorId: 'ana', turnRecordId: null, reason: 'no_turn_record_id', chars: DRAFT.length }),
    ]);
    expect(audit.machineText.verified).toEqual([]);
    expect(audit.model).toBeNull();
    expect((await docMetadata(id)).lastDraftModel).toBeNull();
  });

  it('a real record id does not launder the accepter\'s own text as AnA\'s', async () => {
    const { id: turnRecordId } = await draftBatch();
    const id = await seedDoc();
    const own = '<p>This sentence was written by the accepting reviewer and never by AnA.</p>';
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: own, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: own }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await machineSpans(id)).toEqual([]);
    expect((await acceptAudit(id)).machineText.unverified[0]).toMatchObject({ turnRecordId, reason: 'text_not_in_record' });
  });

  it('a draft accepted with its record id is AnA\'s, accepted by this person, under the record\'s model', async () => {
    const { id: turnRecordId } = await draftBatch();
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { turnRecordId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const machine = await machineSpans(id);
    expect(machine.length).toBeGreaterThanOrEqual(1);
    expect(machine.every((m) => m.machine_author_id === 'ana' && m.asserted_by === '501')).toBe(true);

    const audit = await acceptAudit(id);
    expect(audit.model).toBe('model-of-record');
    expect(audit.machineText.verified).toEqual([
      expect.objectContaining({ authorId: 'ana', turnRecordId, turnActorUserId: 501, chars: DRAFT.length }),
    ]);
    expect(audit.machineText.unverified).toEqual([]);
    expect((await docMetadata(id)).lastDraftModel).toBe('model-of-record');
  });

  it('a model named in the body is ignored; the model comes from the record', async () => {
    const { id: turnRecordId } = await draftBatch();
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { turnRecordId, model: 'forged-model' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await docMetadata(id)).lastDraftModel).toBe('model-of-record');
    const audit = await acceptAudit(id);
    expect(audit.model).toBe('model-of-record');
    expect(JSON.stringify(audit)).not.toContain('forged-model');
  });

});

describe('POST /api/batch-draft/documents/:id/accept — a claim the record cannot vouch for', () => {
  it('a record from another tenant does not verify', async () => {
    actor.organizationId = 88;
    const { id: turnRecordId } = await draftBatch();
    actor.organizationId = ORG;
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { turnRecordId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await machineSpans(id), 'another organization\'s record verified a claim here').toEqual([]);
    expect((await acceptAudit(id)).machineText.unverified[0]).toMatchObject({ turnRecordId, reason: 'turn_record_not_found' });
  });

  it('a record that no longer verifies whole does not verify a claim', async () => {
    const { id: turnRecordId } = await draftBatch();
    // The chain row that carries the record's hash is gone: the record is no
    // longer what the tenant chain says was written.
    await pg.query(`DELETE FROM audit_logs WHERE record_id = $1`, [turnRecordId]);
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { turnRecordId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await machineSpans(id)).toEqual([]);
    expect((await acceptAudit(id)).machineText.unverified[0]).toMatchObject({ turnRecordId, reason: 'record_not_intact' });
  });

  it.each([
    ['not-a-uuid', 'malformed_turn_record_id'],
    [12345, 'no_turn_record_id'],
    [{ id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b' }, 'no_turn_record_id'],
  ])('a record id of %j is disclosed as %s, not answered with a 500', async (turnRecordId, reason) => {
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { turnRecordId });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await machineSpans(id)).toEqual([]);
    expect((await acceptAudit(id)).machineText.unverified[0]).toMatchObject({ reason });
  });
});

/* The record vouches only for what AnA wrote in it (periodic review
   2026-09-28, editor family, the batch-draft accept; fix-up round). Two
   properties the cases above never exercised, each of which, if lost, brings
   the finding back:
   - the batch's record holds the person's own request beside AnA's drafts, so
     the check must read AnA's outputs only, never the request;
   - acceptedMachineText carries up to 32 entries, so one real draft sent with
     forged ones must not carry the forged ones through.
   And the model half: a batch whose drafts report two models cannot say which
   wrote a given card, so neither its record nor the accept names one. */
describe('POST /api/batch-draft/documents/:id/accept — the record vouches only for what AnA wrote in it', () => {
  it('the accepter\'s own words, stored in the record as their request, do not verify as AnA\'s', async () => {
    const own = 'This sentence was typed by the accepting reviewer as the instruction and never written by AnA.';
    const { id: turnRecordId } = await draftBatch(own);
    // The case is real only if the record holds the sentence, as the request.
    const held = await pg.query(`SELECT 1 FROM ana_record_blobs WHERE organization_id = $1 AND strpos(text, $2) > 0`, [ORG, own]);
    expect(held.rows.length, 'the batch record does not hold the request text').toBeGreaterThanOrEqual(1);

    const id = await seedDoc();
    const content = `<p>${own}</p>`;
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: content }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect(await machineSpans(id), 'the person\'s own request verified as AnA\'s text').toEqual([]);
    const audit = await acceptAudit(id);
    expect(audit.machineText.verified).toEqual([]);
    expect(audit.machineText.unverified).toEqual([expect.objectContaining({ turnRecordId, reason: 'text_not_in_record' })]);
  });

  it('one verified claim does not carry a forged one: only the recorded draft is AnA\'s', async () => {
    const { id: turnRecordId } = await draftBatch();
    const id = await seedDoc();
    const own = '<p>This closing paragraph was written by the accepting reviewer alone.</p>';
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({
        content: `${DRAFT}\n\n${own}`, // a blank line: the lineage's paragraph boundary
        turnRecordId,
        acceptedMachineText: [{ authorId: 'ana', text: DRAFT }, { authorId: 'ana', text: own }],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    // DRAFT is AnA's, accepted by this person; the closing paragraph, claimed
    // beside it, is the person's own.
    const whose = await whoseSpans(id, DRAFT.length);
    expect(whose.straddling).toEqual([]);
    expect(whose.before.length).toBeGreaterThanOrEqual(1);
    expect(whose.before).toEqual(whose.before.map(() => 'accepted_machine_draft:ana'));
    expect(whose.after.length).toBeGreaterThanOrEqual(1);
    expect(whose.after, 'a forged claim rode in beside a real one').toEqual(whose.after.map(() => 'author_assertion'));
    const audit = await acceptAudit(id);
    expect(audit.machineText.verified).toEqual([expect.objectContaining({ turnRecordId, chars: DRAFT.length })]);
    expect(audit.machineText.unverified).toEqual([
      expect.objectContaining({ turnRecordId, reason: 'text_not_in_record', chars: own.length }),
    ]);
  });

  it('a batch whose drafts came from two models names neither, and neither does the accept', async () => {
    drafting.models = ['model-a', 'model-b'];
    const { id: turnRecordId } = await draftBatch('Draft it.', 2);
    const id = await seedDoc();
    const res = await acceptClaimingAnA(id, { turnRecordId, model: 'model-a' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    // The draft is AnA's; which model wrote this card's draft the record cannot say.
    expect((await machineSpans(id)).length).toBeGreaterThanOrEqual(1);
    expect((await acceptAudit(id)).model).toBeNull();
    expect((await docMetadata(id)).lastDraftModel).toBeNull();
  });
});

/* A claim is believed only when it is INSIDE what AnA wrote (periodic review
   2026-09-28, editor family, the batch-draft accept, round 2). Each row is a
   claim sent with the real record id that is not, and each was believed:
   - PROBE-A. Both comparisons removed every `<…>` run, and `<` followed by a
     space starts no tag, so a browser shows it: words typed inside `< … >`
     into AnA's draft verified and were credited to AnA. There is now one
     comparison form, comparableText in machine-attribution.ts, and it removes
     only what a browser parses as a tag.
   - One claim that WRAPS the recorded draft: containment the wrong way round
     carries the accepter's paragraph in with the draft.
   - An asterisk AnA never wrote: the verifier read the claim as markdown, as
     it reads the record, and dropped it. The record holds what the model
     wrote, a claim what is shown, so only the record's side is read as
     markdown now, and the verifier is never looser than the lineage. */
const HIDDEN = '< 3 patients died of hepatic failure >';
const TAMPERED = DRAFT.replace('was met at week twelve', `was met ${HIDDEN} at week twelve`);
const OWN = '<p>This closing paragraph was written by the accepting reviewer alone.</p>';

describe('POST /api/batch-draft/documents/:id/accept — a claim not inside what AnA wrote', () => {
  it.each([
    ['PROBE-A: words typed inside < … > into the draft', TAMPERED],
    ['the recorded draft and the accepter\'s own paragraph, as one claim', `${DRAFT}\n\n${OWN}`],
    ['the draft with an asterisk AnA never wrote', DRAFT.replace('was met at', 'was met* at')],
  ])('%s: does not verify, and every clause is the accepter\'s', async (_, text) => {
    expect(text).not.toBe(DRAFT);
    const { id: turnRecordId } = await draftBatch();
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: text, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const all = (await spans(id)).map((r) => r.provenance_kind);
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all, 'text AnA never wrote was credited to AnA').toEqual(all.map(() => 'author_assertion'));
    const audit = await acceptAudit(id);
    expect(audit.machineText.verified).toEqual([]);
    expect(audit.machineText.unverified).toEqual([expect.objectContaining({ turnRecordId, reason: 'text_not_in_record', chars: text.length })]);
  });

  it('PROBE-B: words typed inside < … > into a verified draft are the accepter\'s, not AnA\'s', async () => {
    const { id: turnRecordId } = await draftBatch();
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: TAMPERED, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: DRAFT }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    // The honest claim is AnA's draft and verifies; the words typed into it do not ride on it.
    expect((await acceptAudit(id)).machineText.verified).toEqual([expect.objectContaining({ turnRecordId, chars: DRAFT.length })]);
    const covering = (await whoseSpans(id, TAMPERED.indexOf('3 patients died'))).straddling;
    expect(covering, 'text AnA never wrote was credited to AnA').toEqual(['author_assertion']);
  });

  it('a draft recorded as markdown verifies as the text it shows', async () => {
    const shown = 'The primary endpoint was met at week twelve | in the intent-to-treat population.';
    const { id: turnRecordId } = await draftBatch('Draft it.', 1, 'The **primary endpoint** was met at week twelve \\| in the intent-to-treat population.');
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: shown, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: shown }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await acceptAudit(id)).machineText.verified).toEqual([expect.objectContaining({ turnRecordId, chars: shown.length })]);
    expect((await machineSpans(id)).length).toBeGreaterThanOrEqual(1);
  });
});

/* The audit reason, the superseded version's summary and lastDraftSource were
   written the same on every accept, naming AnA even when nothing verified and
   the accept recorded none of its text as AnA's. They name AnA only when the
   lineage credited AnA with a clause from text this accept verified (round 3:
   a verified claim alone is not enough; batch-draft-accept-shown-words). */
describe('POST /api/batch-draft/documents/:id/accept — it names AnA as the writer only when the record does', () => {
  const NOT_ANA = ['Batch-draft text accepted into document; this accept credits none of it to AnA', 'Superseded by batch-draft text this accept does not credit to AnA', 'batch-not-ana'];
  const ANA = ['AnA batch draft accepted into document', 'Superseded by an accepted AnA batch draft', 'ana-batch'];
  const claimed = (...texts: string[]) => texts.map((text) => ({ authorId: 'ana', text }));

  it.each<[string, boolean, Record<string, unknown>, string[]]>([
    ['a claim with no record behind it', false, { content: DRAFT, acceptedMachineText: claimed(DRAFT) }, NOT_ANA],
    ['no claim at all', false, { content: DRAFT }, NOT_ANA],
    ['a verified draft', true, { content: DRAFT, acceptedMachineText: claimed(DRAFT) }, ANA],
    ['a verified draft beside a forged paragraph', true, { content: `${DRAFT}\n\n${OWN}`, acceptedMachineText: claimed(DRAFT, OWN) }, ANA],
  ])('%s: the audit reason, the version summary and lastDraftSource say what verified', async (_, recorded, body, [reason, summary, source]) => {
    const sent = recorded ? { ...body, turnRecordId: (await draftBatch()).id } : body;
    const id = await seedDoc();
    const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send(sent);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const a = await pg.query<{ reason: string }>(`SELECT reason FROM audit_events WHERE entity_id = $1 AND event_type = 'coauthor_document.draft_accepted'`, [id]);
    const v = await pg.query<{ change_summary: string }>(`SELECT change_summary FROM coauthor_document_versions WHERE document_id = $1`, [id]);
    const said = { reason: a.rows[0]?.reason, summary: v.rows[0]?.change_summary, source: (await docMetadata(id)).lastDraftSource };
    expect(said).toEqual({ reason, summary, source });
  });
});

/* SEC-B-FO-b4, periodic review 2026-09-28, editor family: the accept wrote any
   `<img src>` it was sent into coauthor_documents, which the co-author canvas
   then opens. An image that is not an uploaded figure (shared/authoring/
   figure-refs.ts) is refused here as the section save refuses it. */
describe('POST /api/batch-draft/documents/:id/accept — the figure rule', () => {
  it('refuses an image that is not an uploaded figure, and writes nothing', async () => {
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: '<p>The accepted text of the section.</p><img src="https://collector.example/p.png">' });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('FIGURE_NOT_UPLOADED');
    expect(res.body.refusedImages).toEqual([{ position: 1, src: 'https://collector.example/p.png' }]);
    expect(res.body.error).toMatch(/not an uploaded figure/);

    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe('The prior text of the section.');
    expect(await spans(id)).toHaveLength(0);
    const versions = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM coauthor_document_versions WHERE document_id = $1`, [id]);
    expect(Number(versions.rows[0].n)).toBe(0);
    const audits = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE entity_id = $1`, [id]);
    expect(Number(audits.rows[0].n)).toBe(0);
  });

  it('accepts an uploaded figure reference', async () => {
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: '<p>The accepted text of the section.</p><img src="/api/authoring/images/file_1727500000000_abc123">' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});
