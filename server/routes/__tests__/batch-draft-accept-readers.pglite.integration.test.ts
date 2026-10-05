/**
 * The batch-draft accept credits AnA with a clause only when every reader of
 * the saved content shows the words of AnA's turn record for it.
 *
 * Periodic review 2026-09-28, editor family, the batch-draft accept, round 4:
 * the refute-review of round 3. Each describe below is one of its findings,
 * from its own route probe (review-probes/route.probe.test.ts in this round's
 * evidence), asserting what is true now. The readers and the rules are in
 * server/services/clinical-regulatory-evidence/machine-attribution.ts.
 *
 * Same harness as batch-draft-accept-shown-words.pglite.integration.test.ts:
 * the real router and the real POST /api/claude/batch over PGlite with the
 * real lineage and turn-record migrations; only the model is stubbed.
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
  const query = (text: string, params?: unknown[]) => holder.pg.query(text, params);
  return {
    requestDb: () => holder.db,
    requestConnectable: () => ({ query, connect: async () => ({ query, release: () => undefined }) }),
  };
});
const actor = vi.hoisted(() => ({ id: 501 as number | null, organizationId: 77, name: 'Dana Reviewer', role: 'reviewer' }));
const drafting = vi.hoisted(() => ({ content: '', model: 'model-of-record' }));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({
  getAnaDraftingService: () => ({
    batchDraft: async (req: { requests: unknown[] }) =>
      req.requests.map(() => ({
        content: drafting.content,
        model: drafting.model,
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 },
        latencyMs: 1,
      })),
  }),
}));
vi.mock('../../services/auditService', async (orig) => {
  const real = await orig<any>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});

import createBatchDraftRoutes from '../batch-draft-routes';
import anaIntelligenceRoutes from '../ana-intelligence';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
import { verifyMachineText } from '../../services/authoring/machine-claim-verify';
import { htmlToPlainText } from '../../services/ectd/leaf-pdf-renderer';

const ORG = 77;
let pg: PGlite;
let app: express.Express;

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf8');
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
    (req as any).user = { id: actor.id, organizationId: actor.organizationId, name: actor.name, role: actor.role };
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
  drafting.model = 'model-of-record';
  delete process.env.AUDIT_HMAC_KEY;
});

const SENTENCE = 'The study drug was well tolerated in all cohorts.';
const RECORD = `<p>${SENTENCE}</p>`;
const SHOWN = '3 patients died';

/** One batch through the real route; the turn record it wrote. */
async function draftBatch(content = RECORD): Promise<string> {
  drafting.content = content;
  const res = await request(app)
    .post('/api/claude/batch')
    .send({ requests: [{ framework: 'ich_clinical', sectionType: '§2.7.4 Summary of Clinical Safety', instructions: 'Draft it.' }] });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const turnRecord = res.body.data.results[0].turnRecord;
  expect(turnRecord?.status).toBe('recorded');
  return turnRecord.id;
}
async function seedDoc(): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, content, status) VALUES ($1, 'The prior text of the section.', 'draft') RETURNING id`,
    [ORG],
  );
  return r.rows[0].id;
}
/** Accept `content` with the claim `claims` (AnA's draft by default) against a fresh record of `draft`. */
async function acceptInto(content: string, opts: { draft?: string; claims?: Array<{ authorId: string; text: string }> } = {}) {
  const draft = opts.draft ?? RECORD;
  const turnRecordId = await draftBatch(draft);
  const id = await seedDoc();
  const acceptedMachineText = opts.claims ?? [{ authorId: 'ana', text: draft }];
  const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send({ content, turnRecordId, acceptedMachineText });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { id, turnRecordId };
}
async function spansOf(id: number) {
  const r = await pg.query<{ char_start: number; char_end: number; provenance_kind: string; machine_author_id: string | null }>(
    `SELECT char_start, char_end, provenance_kind, machine_author_id FROM document_span_lineage
      WHERE document_table = 'coauthor_documents' AND document_id = $1 AND deleted_at IS NULL ORDER BY char_start`,
    [String(id)],
  );
  return r.rows.map((s) => ({ start: s.char_start, end: s.char_end, whose: s.machine_author_id ? `${s.provenance_kind}:${s.machine_author_id}` : s.provenance_kind }));
}
async function whoseAt(id: number, at: number): Promise<string[]> {
  return (await spansOf(id)).filter((s) => s.start <= at && s.end > at).map((s) => s.whose);
}
async function record(id: number) {
  const a = await pg.query<{ reason: string; metadata: Record<string, any> }>(
    `SELECT reason, metadata FROM audit_events WHERE entity_id = $1 AND event_type = 'coauthor_document.draft_accepted' ORDER BY id DESC LIMIT 1`,
    [id],
  );
  const m = await pg.query<{ m: string }>(`SELECT metadata::text AS m FROM coauthor_documents WHERE id = $1`, [id]);
  return { reason: a.rows[0]?.reason, audit: a.rows[0]?.metadata ?? {}, metadata: JSON.parse(m.rows[0].m ?? '{}') };
}

describe('words a reader is shown that the record does not hold are the accepter\'s (D1, D2, D4, D5, D6)', () => {
  it.each([
    ['D1: a tag inside <pre>', `<pre><b ${SHOWN}>${SENTENCE}</b></pre>`],
    ['D2: <b"…">, which the leaf and the export print', `<p>The study drug was well <b"${SHOWN}"> tolerated in all cohorts.</p>`],
    ['D2: <b/…>', `<p>The study drug was well <b/${SHOWN}> tolerated in all cohorts.</p>`],
    ['D4: attribute words, in content the editor opens in source mode', `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p><figure></figure>`],
    ['D4: attribute words, in content the fidelity gate may send to source mode', `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p>`],
    ['D5: an image alt the leaf prints', `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${SHOWN}"> tolerated in all cohorts.</p>`],
    ['D6: a footnote the export prints', `<p>The study drug was well <sup data-note="${SHOWN}">tolerated</sup> in all cohorts.</p>`],
  ])('%s: the clause is the accepter\'s, and the accept does not name AnA', async (_, content) => {
    const { id } = await acceptInto(content);
    const r = await record(id);
    expect(r.audit.machineText.verified, 'the honest claim verifies').toHaveLength(1);
    expect(await whoseAt(id, content.indexOf(SHOWN)), 'a word AnA never wrote was credited to AnA').toEqual(['author_assertion']);
    expect(r.metadata.lastDraftSource).toBe('batch-not-ana');
    expect(r.audit.model).toBeNull();
  });

  it('D1 is also closed in the readers since 737c4e67c: the leaf reads <pre> as markup', () => {
    expect(htmlToPlainText(`<pre><b ${SHOWN}>${SENTENCE}</b></pre>`)).toBe(SENTENCE);
  });
});

describe('words of the record a reader is not shown are not AnA\'s either (D3)', () => {
  it('<template> hides "not" from the eCTD leaf: the clause is the accepter\'s', async () => {
    const draft = '<p>The study drug was not effective in reducing mortality.</p>';
    const content = '<p>The study drug was <template>not </template>effective in reducing mortality.</p>';
    const { id } = await acceptInto(content, { draft });
    expect(htmlToPlainText(content)).toBe('The study drug was effective in reducing mortality.');
    expect(await whoseAt(id, content.indexOf('effective'))).toEqual(['author_assertion']);
  });
});

describe('the verifier reads the record as markdown shows it (D8)', () => {
  it('record "5*10 mg/kg", claim and content "510 mg/kg": does not verify, nothing is AnA\'s', async () => {
    const draft = 'The starting dose was 5*10 mg/kg based on the NOAEL in the 28-day rat study.';
    const forged = 'The starting dose was 510 mg/kg based on the NOAEL in the 28-day rat study.';
    const { id, turnRecordId } = await acceptInto(forged, { draft, claims: [{ authorId: 'ana', text: forged }] });
    const r = await record(id);
    expect(r.audit.machineText.verified).toEqual([]);
    expect(r.audit.machineText.unverified).toEqual([expect.objectContaining({ turnRecordId, reason: 'text_not_in_record' })]);
    expect((await spansOf(id)).map((s) => s.whose)).toEqual(['author_assertion']);
  });
});

describe('honest, unedited drafts are AnA\'s (C2)', () => {
  it.each([
    ['an inline style: the split does not cut inside the tag', '<p style="text-align: justify">Not applicable to this product.</p>'],
    ['"<LLOQ" and a later ">3×ULN" in plain text', 'Plasma concentrations were <LLOQ at 72 hours in all subjects. ALT >3×ULN was reported in two subjects.'],
    ['a markdown draft with an XML example holding <title>', 'The eCTD backbone lists each leaf with a title element.\n\n```xml\n<leaf ID="l1"><title>Cover Letter</title></leaf>\n```\n\nEach leaf title must match the document title exactly.\n\nThe sponsor will submit the cover letter in Module 1.'],
  ])('%s: every clause is AnA\'s, and the accept names AnA', async (_, draft) => {
    const { id } = await acceptInto(draft, { draft });
    const r = await record(id);
    const whose = (await spansOf(id)).map((s) => s.whose);
    expect(whose.length).toBeGreaterThan(0);
    expect(new Set(whose), 'a clause of an honest draft was credited to the accepter').toEqual(new Set(['accepted_machine_draft:ana']));
    expect(r.metadata.lastDraftSource).toBe('ana-batch');
    expect(r.audit.model).toBe('model-of-record');
  });

  it('the inline-style draft is one clause, not two cut at the ": " inside its tag', async () => {
    const draft = '<p style="text-align: justify">Not applicable to this product.</p>';
    const { id } = await acceptInto(draft, { draft });
    expect(await spansOf(id)).toEqual([{ start: 0, end: draft.length, whose: 'accepted_machine_draft:ana' }]);
  });
});

describe('the machine author is the record\'s (AUTH)', () => {
  it('authorId "constructor" is not a machine author: it is dropped, and nothing is credited to it', async () => {
    const { id } = await acceptInto(RECORD, { claims: [{ authorId: 'constructor', text: RECORD }] });
    const r = await record(id);
    expect(r.audit.machineText).toEqual({ verified: [], unverified: [] });
    expect((await spansOf(id)).map((s) => s.whose)).toEqual(['author_assertion']);
  });

  it('a verified claim names the record\'s author, whatever the claim said', async () => {
    const turnRecordId = await draftBatch();
    const q = { query: (text: string, params?: unknown[]) => pg.query(text, params) as Promise<{ rows: any[] }> };
    const verdict = await verifyMachineText(q, ORG, [{ authorId: 'constructor', text: RECORD, turnRecordId }]);
    expect(verdict.verified.map((v) => v.authorId)).toEqual(['ana']);
  });
});

describe('a clause is credited no more times than the record holds it (DUP)', () => {
  it('the record holds the sentence once; the same claim sent three times credits one of three', async () => {
    const content = `${RECORD}\n\n${RECORD}\n\n${RECORD}`;
    const { id } = await acceptInto(content, { claims: [1, 2, 3].map(() => ({ authorId: 'ana', text: RECORD })) });
    expect((await spansOf(id)).map((s) => s.whose)).toEqual(['accepted_machine_draft:ana', 'author_assertion', 'author_assertion']);
  });

  it('nor does accepting the same draft again: the clause carried forward counts against the record', async () => {
    const content = `${RECORD}\n\n${RECORD}`;
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const body = { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] };
    for (let i = 0; i < 2; i++) {
      const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    expect((await spansOf(id)).map((s) => s.whose)).toEqual(['accepted_machine_draft:ana', 'author_assertion']);
  });

  it('nor do overlapping claims: three claims each holding the sentence credit one of three', async () => {
    const draft = `<p>Before it.</p><p>${SENTENCE}</p><p>After it.</p>`;
    const content = `${RECORD}\n\n${RECORD}\n\n${RECORD}`;
    const claims = [`<p>Before it.</p><p>${SENTENCE}</p>`, `<p>${SENTENCE}</p><p>After it.</p>`, `<p>${SENTENCE}</p>`].map((text) => ({ authorId: 'ana', text }));
    const { id } = await acceptInto(content, { draft, claims });
    expect((await record(id)).audit.machineText.verified).toHaveLength(3);
    expect((await spansOf(id)).filter((s) => s.whose === 'accepted_machine_draft:ana')).toHaveLength(1);
  });
});

describe('the figure rule reads <template> as a browser does (FIG, closed at HEAD by 737c4e67c)', () => {
  it('an external <img> inside <template> is refused, and nothing is written', async () => {
    const id = await seedDoc();
    const res = await request(app)
      .post(`/api/batch-draft/documents/${id}/accept`)
      .send({ content: '<p>See the figure.</p><template><img src="https://tracker.example/pixel.png" alt="Figure 1"></template>' });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.refusedImages).toEqual([expect.objectContaining({ src: 'https://tracker.example/pixel.png' })]);
    const doc = await pg.query<{ content: string }>(`SELECT content FROM coauthor_documents WHERE id = $1`, [id]);
    expect(doc.rows[0].content).toBe('The prior text of the section.');
  });
});
