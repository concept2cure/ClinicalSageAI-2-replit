/**
 * Refute-review probe (round 3, batch-draft accept), through the real routes.
 *
 * Harness copied from server/routes/__tests__/batch-draft-accept-shown-words.pglite.integration.test.ts
 * at 283fe08c4: the real router and the real POST /api/claude/batch over PGlite
 * with the real lineage and turn-record migrations; only the model is stubbed.
 * Every module comes from ./tree (git archive 283fe08c4), so the working
 * tree's uncommitted edits by another session are not under test.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ db: null as any, pg: null as any }));
vi.mock('./tree/server/db/requestDb', () => {
  const query = (text: string, params?: unknown[]) => holder.pg.query(text, params);
  return {
    requestDb: () => holder.db,
    requestConnectable: () => ({ query, connect: async () => ({ query, release: () => undefined }) }),
  };
});
const actor = vi.hoisted(() => ({ id: 501 as number | null, organizationId: 77, name: 'Dana Reviewer', role: 'reviewer' }));
const drafting = vi.hoisted(() => ({ content: '', model: 'model-of-record' }));
vi.mock('./tree/server/services/ana/AnaDocumentDraftingService', () => ({
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
vi.mock('./tree/server/services/auditService', async (orig) => {
  const real = await orig<any>();
  return { ...real, default: { ...real.default, logAction: async () => undefined } };
});

import createBatchDraftRoutes from './tree/server/routes/batch-draft-routes';
import anaIntelligenceRoutes from './tree/server/routes/ana-intelligence';
import { AUDIT_LOGS_PGLITE_DDL } from './tree/server/db/pglite-harness';
import { htmlToPlainText } from './tree/server/services/ectd/leaf-pdf-renderer';
import { sectionContentToBlocks, blockRuns } from './tree/server/export/authoring-section-content';

const ORG = 77;
let pg: PGlite;
let app: express.Express;
const TREE = path.resolve(__dirname, 'tree');

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(TREE, rel), 'utf8');
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
  app.use(express.json({ limit: '5mb' }));
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
  const v = await pg.query<{ change_summary: string }>(
    `SELECT change_summary FROM coauthor_document_versions WHERE document_id = $1 ORDER BY version_number DESC LIMIT 1`,
    [id],
  );
  const m = await pg.query<{ m: string; content: string }>(`SELECT metadata::text AS m, content FROM coauthor_documents WHERE id = $1`, [id]);
  return { reason: a.rows[0]?.reason, audit: a.rows[0]?.metadata ?? {}, summary: v.rows[0]?.change_summary, metadata: JSON.parse(m.rows[0].m ?? '{}'), content: m.rows[0].content };
}
const exportText = (content: string) =>
  sectionContentToBlocks(content).map((b) => blockRuns(b).map((r) => r.text).join('')).join('\n');
const log = (...a: unknown[]) => console.log(...a); // eslint-disable-line no-console

describe('claim (1): a clause credited to AnA whose shown words are not in the record', () => {
  it.each([
    ['D1 <pre>: node-html-parser keeps a <pre> as raw text', `<pre><b ${SHOWN}>${SENTENCE}</b></pre>`],
    ['D2 <b"…">: node-html-parser does not read it as a tag', `<p>The study drug was well <b"${SHOWN}"> tolerated in all cohorts.</p>`],
    ['D2 <b/…>: likewise', `<p>The study drug was well <b/${SHOWN}> tolerated in all cohorts.</p>`],
  ])('%s', async (label, content) => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
    const r = await record(id);
    const leaf = htmlToPlainText(r.content);
    const exp = exportText(r.content);
    log(`\n[${label}]\n  stored: ${JSON.stringify(r.content)}\n  span at "${SHOWN}": ${JSON.stringify(await whoseAt(id, r.content.indexOf(SHOWN)))}` +
      `\n  audit reason: ${r.reason}\n  lastDraftSource: ${r.metadata.lastDraftSource}  lastDraftModel: ${r.metadata.lastDraftModel}  clausesInAcceptedText: ${r.audit.clausesInAcceptedText}` +
      `\n  eCTD leaf (htmlToPlainText) shows: ${JSON.stringify(leaf)}\n  authoring export shows: ${JSON.stringify(exp)}`);
    expect(await whoseAt(id, r.content.indexOf(SHOWN))).toEqual(['accepted_machine_draft:ana']);
    expect(r.reason).toBe('AnA batch draft accepted into document');
    expect(leaf).toContain(SHOWN);
    expect(exp).toContain(SHOWN);
  });

  it('D4: content the co-author editor opens in source mode (a <figure>) shows attribute words; the lineage credits them', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const content = `<p>The study drug was well <b ${SHOWN}>tolerated</b> in all cohorts.</p><figure></figure>`;
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
    const r = await record(id);
    log(`\n[D4 source mode]\n  stored: ${JSON.stringify(r.content)}\n  span at "${SHOWN}": ${JSON.stringify(await whoseAt(id, r.content.indexOf(SHOWN)))}\n  audit reason: ${r.reason}`);
    expect(await whoseAt(id, r.content.indexOf(SHOWN))).toEqual(['accepted_machine_draft:ana']);
  });
});

describe('claim (1) via the verifier: the markdown reading drops every asterisk, so a claim AnA never wrote verifies', () => {
  it('record "5*10 mg/kg"; claim and content "510 mg/kg": verified and credited to AnA', async () => {
    const draft = 'The starting dose was 5*10 mg/kg based on the NOAEL in the 28-day rat study.';
    const forged = 'The starting dose was 510 mg/kg based on the NOAEL in the 28-day rat study.';
    const turnRecordId = await draftBatch(draft);
    const id = await seedDoc();
    await accept(id, { content: forged, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: forged }] });
    const r = await record(id);
    log(`\n[MD-asterisk]\n  record draft: ${JSON.stringify(draft)}\n  claim = content: ${JSON.stringify(forged)}\n  verified: ${JSON.stringify(r.audit.machineText.verified)}\n  unverified: ${JSON.stringify(r.audit.machineText.unverified)}\n  spans: ${JSON.stringify(await spansOf(id))}\n  reason: ${r.reason}  model: ${r.audit.model}`);
    expect(r.audit.machineText.verified).toHaveLength(1);
    expect(await whoseAt(id, forged.indexOf('510'))).toEqual(['accepted_machine_draft:ana']);
  });
});

describe('claim (2): an honest, unedited draft that is not credited', () => {
  it('HTML with an inline style (a ": " inside the tag splits the clause inside the tag)', async () => {
    const draft = '<p style="text-align: justify">Not applicable to this product.</p>';
    const turnRecordId = await draftBatch(draft);
    const id = await seedDoc();
    await accept(id, { content: draft, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: draft }] });
    const r = await record(id);
    log(`\n[C2 style]\n  draft = content = claim: ${JSON.stringify(draft)}\n  verified: ${r.audit.machineText.verified.length}  unverified: ${JSON.stringify(r.audit.machineText.unverified)}\n  spans: ${JSON.stringify(await spansOf(id))}\n  reason: ${r.reason}\n  summary: ${r.summary}\n  lastDraftSource: ${r.metadata.lastDraftSource}  lastDraftModel: ${r.metadata.lastDraftModel}\n  leaf shows: ${JSON.stringify(htmlToPlainText(r.content))}`);
    expect(r.audit.machineText.verified).toHaveLength(1);
    expect(r.metadata.lastDraftSource).toBe('ana-batch');
  });

  it('markdown with "<LLOQ" and a later ">3×ULN" (the whole-claim strip crosses clauses)', async () => {
    const draft = 'Plasma concentrations were <LLOQ at 72 hours in all subjects. ALT >3×ULN was reported in two subjects.';
    const turnRecordId = await draftBatch(draft);
    const id = await seedDoc();
    await accept(id, { content: draft, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: draft }] });
    const r = await record(id);
    log(`\n[C2 LLOQ]\n  draft = content = claim: ${JSON.stringify(draft)}\n  verified: ${r.audit.machineText.verified.length}\n  spans: ${JSON.stringify(await spansOf(id))}\n  reason: ${r.reason}\n  lastDraftSource: ${r.metadata.lastDraftSource}`);
    expect(r.metadata.lastDraftSource).toBe('ana-batch');
  });
});

describe('claim (4): authorship from the request', () => {
  it('authorId "constructor" passes the vocabulary check and is written as the machine author', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    await accept(id, { content: RECORD, turnRecordId, acceptedMachineText: [{ authorId: 'constructor', text: RECORD }] });
    const r = await record(id);
    log(`\n[AUTH]\n  verified: ${JSON.stringify(r.audit.machineText.verified)}\n  spans: ${JSON.stringify(await spansOf(id))}\n  reason: ${r.reason}`);
    expect((await spansOf(id)).map((s) => s.whose)).toContain('accepted_machine_draft:constructor');
  });
});

describe('occurrence bound: one sentence in the record, credited as many times as the claim is repeated', () => {
  it('the record holds the sentence once; the content has it three times; three claims credit all three', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const content = `<p>${SENTENCE}</p>\n\n<p>${SENTENCE}</p>\n\n<p>${SENTENCE}</p>`;
    const once = await (async () => {
      const id1 = await seedDoc();
      await accept(id1, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
      return (await spansOf(id1)).map((s) => s.whose);
    })();
    await accept(id, { content, turnRecordId, acceptedMachineText: [1, 2, 3].map(() => ({ authorId: 'ana', text: RECORD })) });
    const thrice = (await spansOf(id)).map((s) => s.whose);
    log(`\n[DUP]\n  one claim: ${JSON.stringify(once)}\n  same claim x3: ${JSON.stringify(thrice)}`);
    expect(once.filter((w) => w === 'accepted_machine_draft:ana')).toHaveLength(1);
    expect(thrice.filter((w) => w === 'accepted_machine_draft:ana')).toHaveLength(3);
  });
});

describe('D3 and D5 through the route', () => {
  it('D3: <template> hides "not" from the eCTD leaf in a clause credited to AnA', async () => {
    const draft = '<p>The study drug was not effective in reducing mortality.</p>';
    const turnRecordId = await draftBatch(draft);
    const id = await seedDoc();
    const content = '<p>The study drug was <template>not </template>effective in reducing mortality.</p>';
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: draft }] });
    const r = await record(id);
    const leaf = htmlToPlainText(r.content);
    log(`\n[D3 route]\n  record: ${JSON.stringify(draft)}\n  stored: ${JSON.stringify(r.content)}\n  spans: ${JSON.stringify(await spansOf(id))}\n  reason: ${r.reason}\n  eCTD leaf shows: ${JSON.stringify(leaf)}`);
    expect(await whoseAt(id, content.indexOf('effective'))).toEqual(['accepted_machine_draft:ana']);
    expect(leaf).toBe('The study drug was effective in reducing mortality.');
  });

  it('D5: an inline figure the route accepts; its alt is printed by the eCTD leaf inside the credited clause', async () => {
    const turnRecordId = await draftBatch();
    const id = await seedDoc();
    const content = `<p>The study drug was well <img src="data:image/png;base64,iVBORw0KGgo=" alt="${SHOWN}"> tolerated in all cohorts.</p>`;
    await accept(id, { content, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
    const r = await record(id);
    const leaf = htmlToPlainText(r.content);
    log(`\n[D5 route]\n  stored: ${JSON.stringify(r.content)}\n  span at alt: ${JSON.stringify(await whoseAt(id, r.content.indexOf(SHOWN)))}\n  reason: ${r.reason}\n  eCTD leaf shows: ${JSON.stringify(leaf)}`);
    expect(await whoseAt(id, r.content.indexOf(SHOWN))).toEqual(['accepted_machine_draft:ana']);
    expect(leaf).toContain(SHOWN);
  });
});

describe('claim (4) checks that held', () => {
  it('a record of another organization does not verify; a tampered record does not verify; an upper-case id does', async () => {
    const turnRecordId = await draftBatch();
    await pg.exec(`INSERT INTO organizations (id, name) VALUES (78, 'other') ON CONFLICT DO NOTHING;`);
    const other = (await pg.query<{ id: number }>(`INSERT INTO coauthor_documents (organization_id, content, status) VALUES (78, 'x', 'draft') RETURNING id`)).rows[0].id;
    actor.organizationId = 78;
    await accept(other, { content: RECORD, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
    const a = (await pg.query<{ metadata: any }>(`SELECT metadata FROM audit_events WHERE entity_id = $1 ORDER BY id DESC LIMIT 1`, [other])).rows[0].metadata;
    actor.organizationId = ORG;

    const id2 = await seedDoc();
    await accept(id2, { content: RECORD, turnRecordId: turnRecordId.toUpperCase(), acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
    const upper = (await record(id2)).audit.machineText;

    const t2 = await draftBatch();
    await pg.query(`UPDATE ana_turn_records SET record_text = replace(record_text, 'Draft it.', 'Draft that.') WHERE id = $1`, [t2]).catch((e) => log('tamper update refused:', e.message));
    const id3 = await seedDoc();
    await accept(id3, { content: RECORD, turnRecordId: t2, acceptedMachineText: [{ authorId: 'ana', text: RECORD }] });
    const tampered = (await record(id3)).audit.machineText;
    log(`\n[C4 held]\n  other org: ${JSON.stringify(a.machineText)}\n  upper-case id: verified ${upper.verified.length}\n  tampered: ${JSON.stringify(tampered)}`);
    expect(a.machineText.unverified.map((u: any) => u.reason)).toEqual(['turn_record_not_found']);
    expect(upper.verified).toHaveLength(1);
  });
});

describe('claim (2): the raw-text region rule applied to content read as plain text', () => {
  it('a markdown draft with an XML example holding <title>: every later prose clause is not credited', async () => {
    const draft = 'The eCTD backbone lists each leaf with a title element.\n\n```xml\n<leaf ID="l1"><title>Cover Letter</title></leaf>\n```\n\nEach leaf title must match the document title exactly.\n\nThe sponsor will submit the cover letter in Module 1.';
    const turnRecordId = await draftBatch(draft);
    const id = await seedDoc();
    await accept(id, { content: draft, turnRecordId, acceptedMachineText: [{ authorId: 'ana', text: draft }] });
    const r = await record(id);
    const spans = await spansOf(id);
    log(`\n[C2 region-on-plain-text]\n  verified: ${r.audit.machineText.verified.length}\n  spans: ${JSON.stringify(spans.map((s) => ({ ...s, text: draft.slice(s.start, s.end) })))}\n  leaf shows: ${JSON.stringify(htmlToPlainText(draft))}\n  export shows: ${JSON.stringify(exportText(draft))}`);
    expect(await whoseAt(id, draft.indexOf('The sponsor will submit'))).toEqual(['accepted_machine_draft:ana']);
  });
});
