/**
 * The batch-draft accept credits AnA with the words a reader is shown, and
 * says AnA's text was accepted only when the lineage credited some of it.
 *
 * Periodic review 2026-09-28, editor family, the batch-draft accept, round 3.
 * The round-2 reviewer's probes, pinned:
 *   - PROBE-C: a raw-text element (xmp, textarea, plaintext) whose opening tag
 *     the clause splitter puts in another clause. The clause holding the
 *     element's words had its `<b …>` stripped as a tag, though a reader shows
 *     it as text, so words typed into AnA's sentence were credited to AnA;
 *   - PROBE-D: an honest, unedited draft holding `**`, a `*` list, a footnote
 *     asterisk or a `\|` did not verify, because the verifier read the record
 *     only as markdown while the card sends the draft as written;
 *   - the wording: a verified claim of one word ("primary") made the audit
 *     reason, the version summary and lastDraftSource name AnA, over content
 *     the lineage recorded entirely as the accepter's;
 *   - N8: a claim with no comparable text (`<p></p>`) verifies nothing.
 * And two found while fixing them:
 *   - content the editor reads as plain text (no known tag) shows every
 *     `<…>`: a tag-shaped token in AnA's sentence was stripped for the
 *     comparison and shown to the reader;
 *   - an accepted clause carried forward into a raw-text region a later save
 *     opened before it kept AnA's name over words that region now shows.
 * Round 4 (the refute-review of round 3) refuted the premise that attribute
 * text is hidden from every reader: the editor opens content in source mode.
 * So `<b 3 patients died …>` is no longer removed for the comparison, a claim
 * holding it no longer verifies, and the three tests below that relied on it
 * say so (batch-draft-accept-readers.pglite.integration.test.ts has the rest).
 *
 * Same harness as batch-draft-accept-lineage.pglite.integration.test.ts (that
 * file is at its length limit): the real router and the real POST
 * /api/claude/batch over PGlite with the real lineage and turn-record
 * migrations; only the model is stubbed.
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

const SENTENCE = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const DRAFT = `<p>${SENTENCE}</p><p>No new safety signal was identified in any prespecified subgroup.</p>`;
/** AnA's sentence with words a reader is shown typed into it, as a tag-shaped token. */
const TAMPERED = 'The primary endpoint was met <b 3 patients died of hepatic failure> at week twelve in the intent-to-treat population.';
const SHOWN = '3 patients died';

/** One batch through the real route; the turn record it wrote. */
async function draftBatch(content = DRAFT): Promise<string> {
  drafting.content = content;
  const res = await request(app)
    .post('/api/claude/batch')
    .send({ requests: [{ framework: 'ich_clinical', sectionType: '§2.7.3 Summary of Clinical Efficacy', instructions: 'Draft it.' }] });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const turnRecord = res.body.data.results[0].turnRecord;
  expect(turnRecord?.status).toBe('recorded');
  return turnRecord.id;
}
async function seedDoc(content = 'The prior text of the section.'): Promise<number> {
  const r = await pg.query<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, content, status) VALUES ($1, $2, 'draft') RETURNING id`,
    [ORG, content],
  );
  return r.rows[0].id;
}
async function accept(id: number, body: Record<string, unknown>) {
  const res = await request(app).post(`/api/batch-draft/documents/${id}/accept`).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res;
}
/** Whose each live span is, in offset order: the kind, and the machine for a machine span. */
async function spansOf(id: number) {
  const r = await pg.query<{ char_start: number; char_end: number; provenance_kind: string; machine_author_id: string | null }>(
    `SELECT char_start, char_end, provenance_kind, machine_author_id FROM document_span_lineage
      WHERE document_table = 'coauthor_documents' AND document_id = $1 AND deleted_at IS NULL ORDER BY char_start`,
    [String(id)],
  );
  return r.rows.map((s) => ({ start: s.char_start, end: s.char_end, whose: s.machine_author_id ? `${s.provenance_kind}:${s.machine_author_id}` : s.provenance_kind }));
}
/** Whose the span covering offset `at` is. */
async function whoseAt(id: number, at: number): Promise<string[]> {
  return (await spansOf(id)).filter((s) => s.start <= at && s.end > at).map((s) => s.whose);
}
/** The accept's audit row (latest), its version summary and the document's metadata. */
async function record(id: number) {
  const a = await pg.query<{ reason: string; metadata: Record<string, any> }>(
    `SELECT reason, metadata FROM audit_events WHERE entity_id = $1 AND event_type = 'coauthor_document.draft_accepted' ORDER BY id DESC LIMIT 1`,
    [id],
  );
  const v = await pg.query<{ change_summary: string }>(
    `SELECT change_summary FROM coauthor_document_versions WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
    [id],
  );
  const m = await pg.query<{ m: string }>(`SELECT metadata::text AS m FROM coauthor_documents WHERE id = $1`, [id]);
  return { reason: a.rows[0]?.reason, audit: a.rows[0]?.metadata ?? {}, summary: v.rows[0]?.change_summary, metadata: JSON.parse(m.rows[0].m ?? '{}') };
}

describe('PROBE-C: a raw-text element whose opening tag is in another clause', () => {
  it.each([
    ['xmp, blank-line paragraphs', `<xmp>\n\n${TAMPERED}\n\n</xmp>`],
    ['textarea, blank-line paragraphs', `<textarea>\n\n${TAMPERED}\n\n</textarea>`],
    ['plaintext after an earlier paragraph', `<p>Reviewer note.</p>\n\n<plaintext>\n\n${TAMPERED}`],
    ['xmp on one line, split at " and " (the splitter keeps " and" on the clause)', `<xmp>Reviewer note and ${TAMPERED} and so on</xmp>`],
  ])('%s: the clause holding the shown words is the accepter\'s, though the draft verified', async (_, content) => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: DRAFT }] });

    expect((await record(id)).audit.machineText.verified, 'the honest claim verifies').toHaveLength(1);
    expect(await whoseAt(id, content.indexOf(SHOWN)), 'words a reader is shown, typed into AnA\'s sentence, were credited to AnA').toEqual(['author_assertion']);
  });

  it('the claim may be the tampered sentence itself: it does not verify (round 4), and credits nothing', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const content = `<xmp>\n\n${TAMPERED}\n\n</xmp>`;
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: TAMPERED }] });

    const r = await record(id);
    expect(r.audit.machineText.verified, 'the record never held the token\'s words').toEqual([]);
    expect(r.audit.machineText.unverified.map((u: { reason: string }) => u.reason)).toEqual(['text_not_in_record']);
    expect(await whoseAt(id, content.indexOf(SHOWN))).toEqual(['author_assertion']);
    expect(r.metadata.lastDraftSource, 'the accept said AnA\'s text was accepted, over none').not.toBe('ana-batch');
    expect(r.audit.model).toBeNull();
  });
});

describe('the verifier keeps a raw-text element\'s own tags', () => {
  it.each([
    ['<xmp class="q">', `<xmp class="q">${SENTENCE}</xmp >`],
    ['<textarea rows="2">', `<textarea rows="2">${SENTENCE}</textarea>`],
  ])('a claim holding an %s the record does not have is not AnA\'s text, and is disclosed', async (_, claim) => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content: `<p>${SENTENCE}</p>`, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: claim }] });

    const r = await record(id);
    expect(r.audit.machineText.verified, 'AnA never wrote the <xmp>').toEqual([]);
    expect(r.audit.machineText.unverified.map((u: { reason: string }) => u.reason)).toEqual(['text_not_in_record']);
  });
});

describe('content read as plain text shows every `<…>`', () => {
  it('a tag-shaped token typed into AnA\'s sentence, in content with no known tag, is not AnA\'s', async () => {
    // No known tag anywhere, so the section editor and the export show every
    // character: `<q 3 patients died of hepatic failure>` included.
    const plain = `${SENTENCE}\n\nNo new safety signal was identified in any prespecified subgroup.`;
    const turnRecordId = await draftBatch(plain);
    const id = await seedDoc();
    const content = plain.replace('was met ', 'was met <q 3 patients died of hepatic failure> ');
    // The claim is AnA's draft as recorded. The tampered content as the claim
    // no longer verifies at all (round 4): the record never held those words.
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: plain }] });

    const r = await record(id);
    expect(r.audit.machineText.verified, 'AnA\'s draft verifies').toHaveLength(1);
    expect(await whoseAt(id, content.indexOf(SHOWN)), 'shown to the editor\'s reader, credited to AnA').toEqual(['author_assertion']);
    expect(await whoseAt(id, content.indexOf('No new safety')), 'the untouched sentence is still AnA\'s').toEqual(['accepted_machine_draft:ana']);
  });
});

describe('a clause accepted as AnA\'s, carried into a raw-text region by a later save', () => {
  it('loses AnA\'s name: the words the region now shows were never compared', async () => {
    // As HTML, `<b>` is a tag no reader shows, so the first accept credits the
    // sentence to AnA, correctly for what is shown. (Round 3 used
    // `<b 3 patients died …>` here; round 4 no longer credits that at all.)
    const MARKED = 'The primary endpoint was met <b>at week twelve</b> in the intent-to-treat population.';
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const first = `<p>${MARKED}</p>`;
    await accept(id, { content: first, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: DRAFT }] });
    expect(await whoseAt(id, first.indexOf('primary'))).toEqual(['accepted_machine_draft:ana']);

    // A later save puts an <xmp> before the same characters: a reader now sees
    // the `<b>` as text. The clause's hash is unchanged, so carry-forward used
    // to keep AnA's name on it.
    const second = `<p>Reviewer note.</p><xmp>\n\n<p>${MARKED}</p>\n\n</xmp>`;
    await accept(id, { content: second });
    expect(await whoseAt(id, second.indexOf('<b>at week'))).toEqual(['author_assertion']);
  });
});

describe('PROBE-D: an honest, unedited draft accepted exactly as the card sends it', () => {
  it.each([
    ['an HTML draft (control)', DRAFT],
    ['markdown bold', `The **primary endpoint** was met at week twelve in the intent-to-treat population.\n\nNo new safety signal was identified in any prespecified subgroup.`],
    ['a markdown bullet list', `Key findings:\n\n* ${SENTENCE}\n* No new safety signal was identified in any prespecified subgroup.`],
    ['HTML with a footnote asterisk', '<p>The hazard ratio was 0.72* in the intent-to-treat population at week twelve.</p><p>* Stratified Cox model.</p>'],
    ['a markdown table with an escaped pipe', '| Endpoint | Result |\n|---|---|\n| Primary \\| ITT population | Met at week twelve in the intent-to-treat population |'],
  ])('%s: verifies, and its words are AnA\'s', async (_, draft) => {
    const turnRecordId = await draftBatch(draft);
    const id = await seedDoc();
    await accept(id, { content: draft, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: draft }] });

    const r = await record(id);
    expect(r.audit.machineText.unverified, 'AnA\'s own unedited draft did not verify').toEqual([]);
    expect(r.audit.machineText.verified).toHaveLength(1);
    expect((await spansOf(id)).some((s) => s.whose === 'accepted_machine_draft:ana'), 'AnA\'s words recorded as the accepter\'s').toBe(true);
    expect(r.metadata.lastDraftSource).toBe('ana-batch');
    expect(r.audit.model).toBe('model-of-record');
  });
});

describe('the accept names AnA only when the lineage credited AnA\'s words', () => {
  const OWN = '<p>Every word of this section was written by the accepting reviewer.</p>';

  it('a verified claim of one word credits nothing, and the accept does not say AnA\'s text was accepted', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content: OWN, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: 'primary' }] });

    const r = await record(id);
    expect(r.audit.machineText.verified, '"primary" is in the record').toHaveLength(1);
    expect((await spansOf(id)).map((s) => s.whose)).toEqual(['author_assertion']);
    expect(r.reason).toBe('Batch-draft text accepted into document; this accept credits none of it to AnA');
    expect(r.summary).toBe('Superseded by batch-draft text this accept does not credit to AnA');
    expect(r.metadata.lastDraftSource).toBe('batch-not-ana');
    expect(r.metadata.lastDraftModel).toBeNull();
    expect(r.audit.model).toBeNull();
    expect(r.audit.clausesInAcceptedText).toBe(0);
  });

  it('N8: a claim with no comparable text (`<p></p>`) verifies nothing', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content: OWN, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: '<p></p>' }] });

    const r = await record(id);
    expect(r.audit.machineText.verified).toEqual([]);
    expect(r.audit.machineText.unverified.map((u: { reason: string }) => u.reason)).toEqual(['text_not_in_record']);
    expect(r.metadata.lastDraftSource).toBe('batch-not-ana');
  });

  it('accepting the same draft again names AnA: its clauses are AnA\'s, carried forward and accepted again', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const body = { content: DRAFT, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: DRAFT }] };
    await accept(id, body);
    await accept(id, body);

    const r = await record(id);
    expect(r.reason).toBe('AnA batch draft accepted into document');
    expect(r.summary).toBe('Superseded by an accepted AnA batch draft');
    expect(r.metadata.lastDraftSource).toBe('ana-batch');
    expect(r.audit.model).toBe('model-of-record');
    const anas = (await spansOf(id)).filter((s) => s.whose === 'accepted_machine_draft:ana');
    expect(anas.length).toBeGreaterThan(0);
    expect(r.audit.clausesInAcceptedText, 'every clause carried forward was accepted again').toBe(anas.length);
  });

  it('a later accept that verifies nothing does not name AnA, though AnA\'s earlier clauses carry forward', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content: DRAFT, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: DRAFT }] });
    await accept(id, { content: DRAFT });

    const r = await record(id);
    expect((await spansOf(id)).every((s) => s.whose === 'accepted_machine_draft:ana'), 'AnA\'s clauses keep their attribution').toBe(true);
    expect(r.reason).toBe('Batch-draft text accepted into document; this accept credits none of it to AnA');
    expect(r.metadata.lastDraftSource).toBe('batch-not-ana');
    expect(r.audit.clausesInAcceptedText).toBe(0);
  });
});
