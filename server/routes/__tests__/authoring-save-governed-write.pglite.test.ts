/**
 * The section save believes a machine-authorship claim only when the record
 * holds the words AND RULE 2 admits every model that served the turn
 * (AnA reasoning round 15, SEC-A-7 door 1, 2026-10-05).
 *
 * The REAL authoring router over HTTP (supertest, signed JWTs) on PGlite with
 * the authoring unit, the audit chain, the span-lineage tables and the AnA
 * turn-record store.
 *
 * ── What this door did ───────────────────────────────────────────────────────
 * `PATCH /api/authoring/sections/:sectionId` carries two claims from the
 * editor and checked the AUTHOR ID of each and nothing else:
 *
 *   acceptedMachineText  which WORDS a machine wrote → the lineage records
 *                        each matching clause as `accepted_machine_draft`;
 *   acceptedAuthors      WHO contributed → the revision's origin
 *                        (`ai-draft-accept`), `inputs.contributors`, and the
 *                        filing's `draft_source`.
 *
 * So a member could record their own words as AnA's, or AnA's words under a
 * model RULE 2 does not admit for regulatory drafting, by sending a claim.
 * The sibling door — the eCTD batch-draft accept — has verified its claims
 * against the turn record since the 2026-09-28 review; this one had not, and
 * nothing in its audit row said a claim had even been made (its metadata was
 * `{ titleChanged }`).
 *
 * ── The rule these tests pin ─────────────────────────────────────────────────
 * An unadmitted model's text never stands as MACHINE-AUTHORED governed
 * content. It may stand as a person's own assertion, disclosed: the clause is
 * still saved, recorded as the saver's assertion, and the claim and the reason
 * it was not credited go on the Part 11 row. Both channels follow ONE verdict,
 * so a contributor cannot be named by a claim no record vouches for.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { randomUUID } from 'node:crypto';

import { createJourneyDb, assertNoSchemaGaps, type JourneyDb } from '../../../tests/golden-journeys/harness';
import { PREREQ, AUTHOR, ORG, OTHER_ORG, mint, makeApp, asToken } from './_authoring-canvas-fixture';
import { TurnRecorder, writeTurnRecord } from '../../services/ana/turn-record';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;
/** AnA's sentence, as the record holds it and as the editor saves it. */
const ANA_WORDS = 'The primary endpoint was met: ORR 42% (95% CI 31–53) in the 10 mg arm.';
/** The saver's own sentence, in the same save. */
const OWN_WORDS = 'Secondary endpoints are summarised in Table 2.';
const OPUS = { provider: 'anthropic', model: 'claude-opus-5-5' };
/** Approved for nothing high-risk: RULE 2 does not admit its text as governed content. */
const SONNET = { provider: 'anthropic', model: 'claude-sonnet-5' };
const REASON = 'Efficacy overview drafted for the 2.5.4 submission package';

let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;

async function rows<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pool.query(sql, params)).rows as R[];
}

/** A turn of `org` answering `answer`, served by `served` in order. */
async function servedTurn(
  answer: string,
  served: Array<{ provider: string; model: string }> = [OPUS],
  org = ORG,
): Promise<string> {
  const r = new TurnRecorder();
  r.setTurn({ organizationId: org, threadId: `th_${org}`, runId: randomUUID(), actorUserId: Number(AUTHOR.id), surface: 'conversation' });
  r.setRequest('Summarise the efficacy results for 2.5.4', 'Summarise the efficacy results for 2.5.4');
  if (served[0]) r.setModel({ ...served[0], effort: 'balanced' });
  served.forEach((m, i) => r.addServed(i + 1, m));
  r.setAnswer({ streamed: answer, stored: answer });
  const written = await writeTurnRecord(jdb.pool, r.seal('answered'));
  return written.id;
}

/** A fresh document and section of this organisation. */
async function seedSection(): Promise<{ docId: string; sectionId: string }> {
  const docId = randomUUID();
  const sectionId = randomUUID();
  await jdb.pool.query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, $2, 'M2', 'draft', $3, $4)`,
    [docId, `Module 2.5 — save door ${docId.slice(0, 8)}`, AUTHOR.id, ORG],
  );
  await jdb.pool.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, '2.5.4', 'Overview of Efficacy', '<p>Placeholder.</p>', $3)`,
    [sectionId, docId, ORG],
  );
  return { docId, sectionId };
}

interface SaveClaim {
  authorId: string;
  text: string;
  turnRecordId?: string | null;
}

/** Save `ANA_WORDS` + `OWN_WORDS` with the given claims, as the editor does. */
async function save(
  claims: SaveClaim[],
  opts: { authors?: Array<{ id: string; name?: string }>; anaText?: string } = {},
): Promise<{ docId: string; sectionId: string; status: number; body: any }> {
  const { docId, sectionId } = await seedSection();
  const content = `<p>${opts.anaText ?? ANA_WORDS}</p><p>${OWN_WORDS}</p>`;
  const res = await author(request(app).patch(`/api/authoring/sections/${sectionId}`)).send({
    content,
    changeReason: REASON,
    ...(claims.length ? { acceptedMachineText: claims } : {}),
    ...(opts.authors ? { acceptedAuthors: opts.authors } : {}),
  });
  return { docId, sectionId, status: res.status, body: res.body };
}

/* ── Why the spans are compared by HASH, and the AnA clause's hash is MEASURED
      rather than written down ────────────────────────────────────────────────
   document_span_lineage stores `span_text_sha256`, never the words. And the
   clause the gate cuts out of `<p>…</p>` is its own canonical form of the
   paragraph, not the string this file holds — so hashing ANA_WORDS here would
   pin the gate's tokenizer, not the rule. Instead one honest save is made in
   `beforeAll` and the hash it credited to AnA is kept: every later case asserts
   that THAT clause is the one recorded as the saver's own assertion. The
   invariant is the same clause moving from machine-authored to asserted, which
   is exactly what this door decides. */
let anaClauseSha = '';

/** Every live machine span on a section, by kind. */
async function machineSpans(sectionId: string) {
  return rows<{ provenance_kind: string; machine_author_id: string; asserted_by: string | null; span_text_sha256: string }>(
    `SELECT provenance_kind, machine_author_id, asserted_by, span_text_sha256
       FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = 'authoring_sections' AND document_id = $2
        AND provenance_kind IN ('accepted_machine_draft', 'machine_draft') AND deleted_at IS NULL
      ORDER BY char_start`,
    [ORG, sectionId],
  );
}

/** Every live author-assertion span's text hash on a section. */
async function assertedSpans(sectionId: string): Promise<string[]> {
  const r = await rows<{ span_text_sha256: string | null }>(
    `SELECT span_text_sha256 FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = 'authoring_sections' AND document_id = $2
        AND provenance_kind = 'author_assertion' AND deleted_at IS NULL
      ORDER BY char_start`,
    [ORG, sectionId],
  );
  return r.map((x) => String(x.span_text_sha256 ?? ''));
}

/** The revision this save appended: its origin and the contributors it names. */
async function revision(sectionId: string) {
  const [r] = await rows<{ origin: string; inputs: Record<string, any> }>(
    `SELECT origin, inputs FROM doc_revisions WHERE section_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [sectionId, ORG],
  );
  return { origin: r?.origin ?? null, contributors: (r?.inputs?.contributors ?? []) as Array<{ id: string }> };
}

/** The Part 11 row this save wrote, and its metadata. */
async function trailMetadata(sectionId: string): Promise<Record<string, any>> {
  const r = await rows<{ metadata: Record<string, any> }>(
    `SELECT metadata FROM authoring_audit_trail
      WHERE section_id = $1 AND tenant_id = $2 AND operation_type = 'UPDATE'
      ORDER BY created_at DESC LIMIT 1`,
    [sectionId, ORG],
  );
  expect(r.length, 'the save wrote no Part 11 row').toBe(1);
  return r[0].metadata ?? {};
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260727_authoring_object_permissions.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_subsystem_schema.sql',
      'migrations/20260921_audit_logs_chain_seq.sql',
      'migrations/20260926_ana_turn_records.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260907_span_lineage_accepted_machine_draft.sql',
      'migrations/20260908_span_lineage_machine_draft.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  author = asToken(await mint(AUTHOR));
  const { default: router } = await import('../authoring.router');
  app = makeApp(router);

  /* The hash of the clause a credited claim puts AnA's name on — measured, so
     every case below can say "this same clause was recorded as the person's
     own" without pinning the gate's clause tokenizer. */
  const turn = await servedTurn(ANA_WORDS, [OPUS]);
  const seed = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
  const seeded = await machineSpans(seed.sectionId);
  expect(seeded.length, 'the fixture save credited no clause to AnA').toBe(1);
  anaClauseSha = seeded[0].span_text_sha256;
}, T);

afterAll(async () => {
  if (jdb) assertNoSchemaGaps(jdb);
  await jdb?.close();
});

describe('a machine-text claim is credited only when the turn record holds the words', () => {
  it('credits the claim the record holds, under a model RULE 2 admits (the honest case)', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const spans = await machineSpans(saved.sectionId);
    expect(spans.map((s) => [s.provenance_kind, s.machine_author_id, s.asserted_by, s.span_text_sha256])).toEqual([
      ['accepted_machine_draft', 'ana', String(AUTHOR.id), anaClauseSha],
    ]);
    /* The saver's own sentence is theirs, and AnA's is NOT also theirs: the two
       passes partition the clauses rather than both claiming one. */
    const asserted = await assertedSpans(saved.sectionId);
    expect(asserted).toHaveLength(1);
    expect(asserted).not.toContain(anaClauseSha);
    const rev = await revision(saved.sectionId);
    expect(rev.origin).toBe('ai-draft-accept');
    expect(rev.contributors.map((c) => c.id)).toEqual(['ana']);
  }, T);

  it('a claim of words the record does not hold is the saver’s own, not AnA’s', async () => {
    const turn = await servedTurn('Draft paragraph for 2.5.4.', [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await machineSpans(saved.sectionId)).toEqual([]);
    /* The clause is not dropped — it is the saver's, which is the whole point:
       refusing the attribution must not refuse the words. */
    expect(await assertedSpans(saved.sectionId)).toContain(anaClauseSha);
    expect(await assertedSpans(saved.sectionId)).toHaveLength(2);
  }, T);

  it('a claim naming no turn record at all is the saver’s own', async () => {
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await machineSpans(saved.sectionId)).toEqual([]);
    /* The clause is not dropped — it is the saver's, which is the whole point:
       refusing the attribution must not refuse the words. */
    expect(await assertedSpans(saved.sectionId)).toContain(anaClauseSha);
    expect(await assertedSpans(saved.sectionId)).toHaveLength(2);
  }, T);

  it('a turn record of another organisation vouches for nothing: an id is not a capability', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS], OTHER_ORG);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await machineSpans(saved.sectionId)).toEqual([]);
  }, T);
});

describe('RULE 2 at the save door: a verified claim the rule will not admit stops the save', () => {
  /** Nothing of this save reached any store. */
  async function nothingWritten(sectionId: string): Promise<void> {
    expect(await machineSpans(sectionId)).toEqual([]);
    expect(await assertedSpans(sectionId)).toEqual([]);
    expect(await rows('SELECT 1 FROM doc_revisions WHERE section_id = $1 AND tenant_id = $2', [sectionId, ORG])).toEqual([]);
    expect(await rows('SELECT 1 FROM authoring_audit_trail WHERE section_id = $1 AND tenant_id = $2', [sectionId, ORG])).toEqual([]);
    const [section] = await rows<{ content: string }>('SELECT content FROM authoring_sections WHERE id = $1', [sectionId]);
    expect(section.content, 'the section content moved on a refused save').toBe('<p>Placeholder.</p>');
  }

  it('refuses the save, names the model, and writes nothing', async () => {
    const turn = await servedTurn(ANA_WORDS, [SONNET]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(403);
    expect(saved.body.error.code).toBe('MODEL_NOT_APPROVED_FOR_GOVERNED_WRITE');
    /* The sentence names the model and says what to do. It does NOT say "ask
       again with Thorough effort": in production no approved model has passed
       performance qualification, so that advice ends in a second refusal. */
    expect(saved.body.error.message).toContain('anthropic/claude-sonnet-5');
    expect(saved.body.error.message).toContain('not approved for regulatory drafting');
    expect(saved.body.error.message).not.toMatch(/thorough effort/i);
    expect(saved.body.servedBy).toEqual(['claude-sonnet-5']);
    expect(saved.body.turnRecordIds).toEqual([turn]);
    await nothingWritten(saved.sectionId);
  }, T);

  it('one unadmitted model among several is enough', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS, SONNET]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(403);
    await nothingWritten(saved.sectionId);
  }, T);

  it('a record naming NO model is not approval: an empty list is not a list of admitted models', async () => {
    /* `[].some(m => !m.qualified)` is false, so a door asking only "is any
       model unqualified?" admits a record that names nothing at all. And the
       refusal says that, rather than leaving a gap where a model's name goes. */
    const turn = await servedTurn(ANA_WORDS, []);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(403);
    expect(saved.body.error.message).toContain('a model this answer’s record does not name');
    await nothingWritten(saved.sectionId);
  }, T);

  it('refuses when only ONE of several claims names an unadmitted model', async () => {
    const good = await servedTurn(ANA_WORDS, [OPUS]);
    const bad = await servedTurn(OWN_WORDS, [SONNET]);
    const saved = await save(
      [
        { authorId: 'ana', text: ANA_WORDS, turnRecordId: good },
        { authorId: 'ana', text: OWN_WORDS, turnRecordId: bad },
      ],
      { authors: [{ id: 'ana' }] },
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(403);
    await nothingWritten(saved.sectionId);
  }, T);

  it('an UNVERIFIABLE claim does not refuse the save — the server cannot tell', async () => {
    /* The distinction the design turns on, pinned beside its opposite: the
       cases above are refused because the server has PROOF a model wrote the
       words. Here it has none, so the words are the person's own. */
    const turn = await servedTurn('Draft paragraph for 2.5.4.', [SONNET]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await machineSpans(saved.sectionId)).toEqual([]);
    expect(await assertedSpans(saved.sectionId)).toContain(anaClauseSha);
  }, T);
});

describe('one verdict gates both channels', () => {
  it('an accepted-author claim no record vouches for names no contributor and no draft source', async () => {
    /* The bypass this closes: `acceptedAuthors` alone set the revision's origin
       to `ai-draft-accept`, wrote AnA into `inputs.contributors` and became the
       filing's `draft_source` — with no words to check and nothing checked. */
    const saved = await save([], { authors: [{ id: 'ana', name: 'AnA (AI draft)' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const rev = await revision(saved.sectionId);
    expect(rev.origin).toBe('human-edit');
    expect(rev.contributors).toEqual([]);
    /* And the refused claim is on the record. A row silent about it would read
       as a save that claimed nothing, which is not what happened. */
    expect((await trailMetadata(saved.sectionId)).machineText).toEqual({
      uncredited: ['ana'],
      credited: [],
      refused: [],
    });
  }, T);

  it('an author whose every claim is unverifiable is not a contributor either', async () => {
    const turn = await servedTurn('Draft paragraph for 2.5.4.', [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    const rev = await revision(saved.sectionId);
    expect(rev.origin).toBe('human-edit');
    expect(rev.contributors).toEqual([]);
  }, T);

  it('a verified claim that credits no clause names nobody: one word is not an acceptance', async () => {
    /* The lineage gate's own contract: "A caller that says a save accepted a
       machine's text says it only when this is above zero". A one-word claim
       verifies — the record does hold the word — and credits no clause, so the
       revision must not read `ai-draft-accept` and the filing must not record
       AnA as the draft source. The sibling batch-draft door was corrected for
       exactly this in round 3; this door files into c2c_documents. */
    const turn = await servedTurn(ANA_WORDS, [OPUS]);
    const saved = await save([{ authorId: 'ana', text: 'primary', turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(await machineSpans(saved.sectionId)).toEqual([]);
    const rev = await revision(saved.sectionId);
    expect(rev.origin).toBe('human-edit');
    expect(rev.contributors).toEqual([]);
    /* And the claim is still disclosed as credited by the verifier: the words
       ARE in the record. What no clause carries is AnA's name. */
    expect((await trailMetadata(saved.sectionId)).machineText?.credited).toHaveLength(1);
  }, T);
});

describe('the Part 11 row says a claim was made, and what became of it', () => {
  it('discloses a credited claim', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    const meta = await trailMetadata(saved.sectionId);
    expect(meta.machineText?.credited).toEqual([
      { authorId: 'ana', turnRecordId: turn, chars: ANA_WORDS.length },
    ]);
    expect(meta.machineText?.refused).toEqual([]);
  }, T);

  it('discloses an unverifiable claim with the reason the record gives', async () => {
    const turn = await servedTurn('Draft paragraph for 2.5.4.', [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    const meta = await trailMetadata(saved.sectionId);
    expect(meta.machineText?.credited).toEqual([]);
    expect(meta.machineText?.refused).toEqual([
      {
        authorId: 'ana',
        turnRecordId: turn,
        why: 'the turn record does not hold this text',
        servedBy: null,
        chars: ANA_WORDS.length,
      },
    ]);
  }, T);

  it('discloses a claim naming a record this organisation does not have', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS], OTHER_ORG);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect((await trailMetadata(saved.sectionId)).machineText?.refused).toEqual([
      {
        authorId: 'ana',
        turnRecordId: turn,
        why: 'no such turn record in this organization',
        servedBy: null,
        chars: ANA_WORDS.length,
      },
    ]);
  }, T);

  it('names the machine author from the server’s own vocabulary, never the request’s', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], {
      authors: [{ id: 'ana', name: 'Reviewed and approved by the Head of Regulatory' }],
    });
    const rev = await revision(saved.sectionId);
    expect(rev.contributors).toEqual([{ id: 'ana', name: 'AnA (AI draft)' }]);
  }, T);

  it('says nothing about machine text when no claim was made', async () => {
    const saved = await save([]);
    const meta = await trailMetadata(saved.sectionId);
    expect(meta.machineText).toBeUndefined();
    expect(meta.titleChanged).toBe(false);
  }, T);
});

describe('the saver is told what was not credited', () => {
  it('the response names each refused claim and why, so the editor can say so', async () => {
    const turn = await servedTurn('Draft paragraph for 2.5.4.', [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.body.machineText).toEqual({
      credited: 0,
      refused: [{ why: 'the turn record does not hold this text', chars: ANA_WORDS.length }],
    });
  }, T);

  it('says nothing when every claim was credited', async () => {
    const turn = await servedTurn(ANA_WORDS, [OPUS]);
    const saved = await save([{ authorId: 'ana', text: ANA_WORDS, turnRecordId: turn }], { authors: [{ id: 'ana' }] });
    expect(saved.body.machineText).toEqual({ credited: 1, refused: [] });
  }, T);
});
