/**
 * Contract: text typed in the editor reaches the filing it belongs to.
 *
 * ── The split ─────────────────────────────────────────────────────────────────
 * Two section editors ship, one per store:
 *
 *   v2  DocumentAuthoring  → PATCH /api/authoring/sections/:id → authoring_sections
 *   mdx PathwayPanes       → PATCH /api/c2c/documents/:id/sections/:key
 *                                                      → c2c_document_sections
 *
 * c2c_documents is the system of record for a regulatory filing — rule-pack
 * outline, readiness trigger, the version-snapshot trigger that RAISES without
 * an actor, span lineage. authoring_sections is the editing layer.
 *
 * The editor most people use wrote the second one. So the store that decides
 * what the filing CONTAINS never saw the text anybody actually wrote. A series
 * of earlier fixes made the surfaces agree about what each store knew; none of
 * them changed that. This is the one that does: a save commits the working copy
 * into the repository.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Against the REAL router over HTTP with REAL signed JWTs, on the REAL
 * migrations — because every property here is a database property:
 *
 *   • the governed section receives the text, in the shape the readers expect;
 *   • the Part 11 version ledger gets an ATTRIBUTED row — the snapshot trigger
 *     raises without app.actor_id, so a 200 is positive proof the GUC was set;
 *   • readiness and has_content, which are computed from the governed store,
 *     now see work done in this editor;
 *   • an unbound document still saves, and SAYS it did not reach a filing;
 *   • a section whose code matches nothing in the rule pack is not invented;
 *   • a failure to reach the filing rolls the authored write back with it —
 *     the two move together or neither does.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';
import { REASON_NOT_STATED } from '../../server/services/c2c/commit-section-to-filing';

const JWT_SECRET = 'commit-section-to-filing-contract';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;

/* Sealing is opt-in on AUDIT_HMAC_KEY (>= 32 chars) and production refuses to
   boot without it — auditSealPosture.ts. Set here so the chained-audit
   assertions exercise the SEALED path this product actually ships, rather than
   passing against an unsealed row and calling it tamper-evident. */
process.env.AUDIT_HMAC_KEY = 'contract-test-audit-hmac-key-not-a-real-secret';

const AUTHOR = {
  // INTEGER, not a uuid. shared/schema.ts declares `users.id serial`, and the
  // phase-9 migration reconciles to it explicitly: "the brief assumed a
  // uuid-keyed user/org model; the live schema is integer-keyed". The Part 11
  // trigger casts app.actor_id to integer, so a uuid subject — which the
  // golden-journey harness uses for its own uuid-keyed fixture — would 22P02
  // here and prove nothing about production.
  id: '42',
  organizationId: 1,
  email: 'author@filing.example',
  name: 'Avery Author',
};
const MEMBERSHIP_ID = Number.parseInt(AUTHOR.id, 10); // 42

const PROJECT = '9a111111-2222-3333-4444-555555555555';
const DOC = 'doc_filing_contract';

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
  CREATE TABLE audit_logs (
    id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
    table_name text, record_id text, actor_id text, target text,
    target_type text, target_id text, reason text, payload_hash text,
    ana_action_id text, sha256_chain text,
    occurred_at timestamptz DEFAULT now(), hmac_seal text,
    old_values   json,
    new_values   json,
    ip_address   text,
    user_agent   text
  );
  INSERT INTO organizations (id, name) VALUES (1, 'contract-org');
  INSERT INTO users (id, name, email) VALUES ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, ${MEMBERSHIP_ID}, 'member');
  INSERT INTO regulatory_programs (id) VALUES ('${PROJECT}');
`;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let token = '';
const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

/** doc_id of the authored document, and the ids of its sections by code. */
let authoringDocId = '';
const sectionIds: Record<string, string> = {};

async function q<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await (h.pool as any).query(sql, params);
  return r.rows as T[];
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      // ALTERs doc_revisions above with the ledger columns the router now writes
      // (content/chain hashes, origin, input manifest) and installs the
      // append-only triggers. Same position the durable applier uses.
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      // The governed store: rule packs, c2c_documents, c2c_document_sections,
      // the readiness trigger and the Part 11 snapshot trigger.
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260728_c2c_document_sections_timestamps.sql',
      'migrations/20260728_c2c_section_version_author_kind.sql',
      // MUST follow BOTH bundles: the binding ALTER is guarded on
      // authoring_documents AND c2c_documents, so listed any earlier it
      // no-ops with a NOTICE and the column this whole file is about is
      // silently absent. Same ordering the durable path uses.
      'migrations/20260728_authoring_document_governed_binding.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  token = await new SignJWT({
    userId: AUTHOR.id, email: AUTHOR.email, name: AUTHOR.name,
    organizationId: AUTHOR.organizationId, tenant_id: AUTHOR.organizationId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);

  // A governed filing with two rule-pack sections.
  const pack = await q<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, 1, $2, 'ind', 'fda', $3, 'IND', 'draft', 0)`,
    [DOC, PROJECT, pack[0].version],
  );
  await q(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, status)
     VALUES ($1, '2.5', 'Clinical overview', 1, 'todo'),
            ($1, '2.6', 'Nonclinical summaries', 2, 'todo')`,
    [DOC],
  );

  // An authored document BOUND to it, with three sections: two that correspond
  // to rule-pack keys and one that does not.
  const created = await as(request(app).post('/api/authoring/docs')).send({
    title: 'IND — working copy', module: 'M2',
  });
  expect(created.status).toBe(201);
  authoringDocId = created.body.document.id;
  await q(`UPDATE authoring_documents SET c2c_document_id = $1 WHERE id = $2`, [DOC, authoringDocId]);

  for (const code of ['2.5', '2.6', 'ZZ-not-in-pack']) {
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: authoringDocId, code, title: code, content: '', order_index: 1,
    });
    expect(s.status).toBe(201);
    sectionIds[code] = s.body.section.id;
  }
}, T);

afterAll(async () => { await jdb?.close(); });

const save = (code: string, content: string) =>
  as(request(app).patch(`/api/authoring/sections/${sectionIds[code]}`)).send({
    content, changeReason: 'drafting the overview',
  });

/** A save exactly as the document editor makes it: no reason, because the
 *  editor has no field to give one. Every assertion above sends a reason, so
 *  the path nearly every real save takes had no coverage at all. */
const saveWithoutReason = (code: string, content: string) =>
  as(request(app).patch(`/api/authoring/sections/${sectionIds[code]}`)).send({ content });

describe('a save in the editor reaches the filing', () => {
  it('writes the text into the governed section', async () => {
    const res = await save('2.5', 'The investigational product was well tolerated.');
    expect(res.status).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: true, documentId: DOC, sectionKey: '2.5' });

    const [row] = await q<{ content: any; draft_source: string }>(
      `SELECT content, draft_source FROM c2c_document_sections
        WHERE document_id = $1 AND section_key = '2.5'`,
      [DOC],
    );
    // The shape the governed readers understand — the same one the mdx editor
    // writes, which sectionHasContentSql and sectionPlainText both handle.
    expect(row.content).toEqual({ text: 'The investigational product was well tolerated.' });
    // NULL, not 'human'. authoring_sections carries no provenance column, so
    // this path cannot know who authored the text; it used to write 'human'
    // anyway and this assertion pinned that guess in place. The governed store
    // now records that the origin was not stated.
    expect(row.draft_source).toBeNull();
  }, T);

  it('the governed outline now reports the section as written', async () => {
    // has_content is computed from the governed store. Before this, work done
    // in this editor was invisible to it no matter how much was written.
    const [row] = await q<{ has_content: boolean }>(
      `SELECT (content ->> 'text') IS NOT NULL AND length(btrim(content ->> 'text')) > 0 AS has_content
         FROM c2c_document_sections WHERE document_id = $1 AND section_key = '2.5'`,
      [DOC],
    );
    expect(row.has_content).toBe(true);
  }, T);

  it('a re-save enters the Part 11 ledger ATTRIBUTED to the real actor', async () => {
    // c2c_snapshot_section_version() RAISES without app.actor_id, so a 200 on a
    // second save is positive proof the GUC reached the trigger — the exact
    // property `SET LOCAL app.actor_id = $1` failed to provide before #1188.
    const res = await save('2.5', 'Revised: no dose-limiting toxicity was observed.');
    expect(res.status).toBe(200);

    const versions = await q<{ author_id: number; reason: string; content: any }>(
      `SELECT author_id, reason, content FROM c2c_document_section_versions
        ORDER BY version`,
    );
    // The trigger is BEFORE UPDATE and preserves OLD.content, so each row holds
    // what that save SUPERSEDED — version 1 is the scaffold placeholder the
    // first save replaced, and the newest row is the first save's text.
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const newest = versions[versions.length - 1];
    expect(newest.content).toEqual({ text: 'The investigational product was well tolerated.' });

    // Every row is attributed to the verified actor, as an integer — the type
    // the ledger and the live users table both use. Attribution is the property
    // the snapshot trigger exists to enforce, so it is asserted on all of them.
    for (const v of versions) {
      expect(v.author_id).toBe(42);
      expect(v.reason).toBe('drafting the overview');
    }
  }, T);

  it('and the working copy still holds the text too', async () => {
    const [row] = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.5']],
    );
    expect(row.content).toBe('Revised: no dose-limiting toxicity was observed.');
  }, T);
});

describe('the reason for change is recorded, never invented', () => {
  it('records that no reason was given, rather than inventing one', async () => {
    /* The path nearly every real save takes. Only AuthoringAiDraft sends a
       `changeReason`; the document editor has no field for one, so this is
       what the ledger receives on an ordinary save.

       It used to receive the literal 'authored in the document editor' —
       supplied here, not by anyone — sitting in the reason column of the
       filing's immutable version ledger, indistinguishable on the page an
       inspector reads from a sentence a person actually wrote. It also
       defeated the gate built for this: the snapshot trigger RAISES on an
       empty app.reason ("Part 11 reason-for-change is mandatory"), and a
       constant satisfies that on every save, so the mandatory-reason gate had
       never once fired for this editor.

       The trigger will not accept empty, so the honest value has to SAY it was
       not stated — the same answer `author_kind` gives with 'unspecified'
       rather than guessing 'human'. Asserted against the exported constant so
       the check cannot drift from the writer. */
    const res = await saveWithoutReason('2.5', 'Saved with no reason given.');
    expect(res.status).toBe(200);

    const versions = await q<{ reason: string }>(
      `SELECT reason FROM c2c_document_section_versions ORDER BY version DESC LIMIT 1`,
    );
    expect(versions[0].reason).toBe(REASON_NOT_STATED);
    expect(versions[0].reason).not.toMatch(/authored in the document editor/i);
  }, T);

  it('still records a real reason verbatim when the save gives one', async () => {
    /* The working path must keep working: the fix must not flatten a stated
       reason into the not-stated marker. */
    const res = await save('2.5', 'Saved with a reason this time.');
    expect(res.status).toBe(200);
    const [newest] = await q<{ reason: string }>(
      `SELECT reason FROM c2c_document_section_versions ORDER BY version DESC LIMIT 1`,
    );
    expect(newest.reason).toBe('drafting the overview');
  }, T);

  it('treats a whitespace-only reason as not stated', async () => {
    /* "   " is not a reason. Storing it would satisfy the trigger's non-empty
       check while telling a reader nothing, which is the same fabrication in a
       quieter form. */
    const res = await as(request(app).patch(`/api/authoring/sections/${sectionIds['2.5']}`))
      .send({ content: 'Saved with a blank reason.', changeReason: '   ' });
    expect(res.status).toBe(200);
    const [newest] = await q<{ reason: string }>(
      `SELECT reason FROM c2c_document_section_versions ORDER BY version DESC LIMIT 1`,
    );
    expect(newest.reason).toBe(REASON_NOT_STATED);
  }, T);

});

describe('a section save reaches the hash-chained ledger', () => {
  /* The section save is the most frequent governed act in the product and the
     one that changes what the filing SAYS. It reached neither ledger.
     `createAuditTrail` wrote the unchained `authoring_audit_trail` row and
     then, because the handler correctly passes its own transaction client,
     skipped the mirror entirely — the guard was `if (executor === pool)`. So
     an edit to a filed document left NO tamper-evident trace: nothing for
     verifyAuditChain to attest, and `authoring_audit_trail` carries no chain,
     no HMAC and no immutability trigger.

     Freeze, e-sign and sign were each fixed at their own call sites and are
     the reason the gap was invisible — the three loudest acts were covered
     and the everyday one was not. */
  it('writes a chained, sealed row for the save', async () => {
    const before = await q<{ n: string }>(`SELECT count(*) AS n FROM audit_logs`);
    const res = await save('2.6', 'A change that must leave a tamper-evident trace.');
    expect(res.status).toBe(200);

    const rows = await q<{
      action: string; sha256_chain: string; hmac_seal: string;
      record_id: string; tenant_id: number; new_values: any;
    }>(`SELECT action, sha256_chain, hmac_seal, record_id, tenant_id, new_values
          FROM audit_logs ORDER BY occurred_at DESC, id DESC LIMIT 1`);

    expect(
      Number((await q<{ n: string }>(`SELECT count(*) AS n FROM audit_logs`))[0].n),
      'the save wrote no chained audit row at all',
    ).toBeGreaterThan(Number(before[0].n));

    const [row] = rows;
    expect(row.action).toBe('authoring.section.UPDATE');
    expect(row.record_id).toBe(sectionIds['2.6']);
    expect(row.tenant_id).toBe(1);
    // The chain and the seal are what make it tamper-evident; a row with
    // either missing is an ordinary log line wearing the name.
    expect(row.sha256_chain, 'no chain hash — the row is not linked').toBeTruthy();
    expect(row.hmac_seal, 'no HMAC seal — the row is not sealed').toBeTruthy();
  }, T);

  it('writes exactly ONE chained row per save, not one per ledger', async () => {
    /* Freeze, e-sign and sign write their own richer chained row, so
       `createAuditTrail` must not add a second for them — the chain is the
       tamper-evidence, and double-counting the three acts that matter most is
       not a cosmetic duplicate. The opt-out is explicit
       (`chainedRowWrittenByCaller`), and this pins that an ordinary save,
       which does NOT opt out, still yields exactly one. */
    const before = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM audit_logs`))[0].n);
    const res = await save('2.6', 'One act, one entry in the chain.');
    expect(res.status).toBe(200);
    const after = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM audit_logs`))[0].n);
    expect(after - before).toBe(1);
  }, T);

  it('a freeze — which writes its OWN chained row — still gets exactly one', async () => {
    /* This covers the opt-out, and it exists because the test above did not.
       Asserting "exactly one row" on an ordinary save cannot fail when the
       opt-out is ignored: an ordinary save never opts out, so inverting
       `chainedRowWrittenByCaller` left that assertion green. (Verified by
       inverting it and watching all thirteen stay green.)

       Freeze, e-sign and sign each write a richer, action-specific chained row
       at their own call site, so `createAuditTrail` must NOT add a second. A
       duplicate here is not cosmetic: the chain is the tamper-evidence, and
       double-counting the three acts that matter most corrupts the census a
       reviewer takes from it. */
    const doc = await as(request(app).post('/api/authoring/docs')).send({
      title: 'Doc to freeze', module: 'M2',
    });
    const freezeDocId = doc.body.document.id;

    const before = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM audit_logs`))[0].n);
    const res = await as(request(app).post(`/api/authoring/docs/${freezeDocId}/freeze`))
      .send({ reason: 'Locked for submission.' });
    expect(res.status, 'the freeze did not succeed, so this proves nothing').toBe(200);

    const rows = await q<{ action: string }>(
      `SELECT action FROM audit_logs WHERE record_id = $1 ORDER BY occurred_at`, [freezeDocId],
    );
    expect(rows.map((r) => r.action)).toEqual(['authoring.document.freeze']);

    const after = Number((await q<{ n: string }>(`SELECT count(*) AS n FROM audit_logs`))[0].n);
    expect(after - before, 'the freeze wrote more than one row into the chain').toBe(1);
  }, T);

  it('takes the whole save down if the chained row cannot be written', async () => {
    /* Fail-closed is the point: an un-audited change to a filed document must
       not commit. Proven by making the audit write itself impossible, and
       asserting the CONTENT did not move — not by mocking, so the rollback is
       the database's. */
    const before = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );
    await q(`ALTER TABLE audit_logs ADD CONSTRAINT tmp_no_authoring
               CHECK (action <> 'authoring.section.UPDATE') NOT VALID`);
    try {
      const res = await save('2.6', 'This must not survive without an audit row.');
      expect(res.status).toBe(500);
    } finally {
      await q(`ALTER TABLE audit_logs DROP CONSTRAINT tmp_no_authoring`);
    }
    const after = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );
    expect(after[0].content).toBe(before[0].content);
  }, T);
});

describe('a revert moves the filing too, not just the working copy', () => {
  /* `commitSectionToFiling` exists because the editing layer and the filing
     had drifted. The PATCH path calls it; REVERT DID NOT.

     So an author who reverted a bad edit saw the good text restored in the
     editor, the revision ledger recorded the restoration and the audit trail
     recorded a REVERT — while `c2c_document_sections`, which is what the
     filing IS, still held the bad text. Every record agreed a revert had
     happened and the one artifact that matters disagreed. Nothing surfaced
     it, because each store was internally consistent with itself. */
  it('restores the filing to the reverted content, not only authoring_sections', async () => {
    // Two saves, so there is a prior revision to go back to.
    expect((await save('2.6', '<p>Good text that belongs in the filing.</p>')).status).toBe(200);
    expect((await save('2.6', '<p>BAD EDIT that must not survive the revert.</p>')).status).toBe(200);

    const [before] = await q<{ text: string }>(
      `SELECT content ->> 'text' AS text FROM c2c_document_sections
        WHERE document_id = $1 AND section_key = '2.6'`, [DOC],
    );
    expect(before.text, 'the bad edit never reached the filing, so this proves nothing')
      .toContain('BAD EDIT');

    // The revision holding the good text.
    const revs = await q<{ id: string; content: string }>(
      `SELECT id, content FROM doc_revisions WHERE section_id = $1 ORDER BY created_at`,
      [sectionIds['2.6']],
    );
    const good = revs.find((r) => (r.content ?? '').includes('Good text'));
    expect(good, 'no revision carries the good text').toBeTruthy();

    const res = await as(request(app).post(`/api/authoring/sections/${sectionIds['2.6']}/revert`))
      .send({ rev_id: good!.id });
    expect(res.status).toBe(200);

    // The working copy went back.
    const [working] = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );
    expect(working.content).toContain('Good text');

    // THE DECISIVE ASSERTION: so did the filing.
    const [filed] = await q<{ text: string }>(
      `SELECT content ->> 'text' AS text FROM c2c_document_sections
        WHERE document_id = $1 AND section_key = '2.6'`, [DOC],
    );
    expect(filed.text, 'the filing still holds the reverted-away text').toContain('Good text');
    expect(filed.text).not.toContain('BAD EDIT');
  }, T);

  it('records WHY in the version ledger — a mechanism naming itself', async () => {
    /* Not the fabrication REASON_NOT_STATED guards against. On an ordinary
       save the system cannot know why a human changed the words, so it must
       not invent one. Here it does know: this is a restoration of a named
       revision, which is a complete and truthful answer. */
    /* Asserted by existence rather than by "newest": other cases in this file
       save the same document, so a positional read is a test that passes or
       fails on execution order rather than on the property. */
    const reasons = await q<{ reason: string }>(
      `SELECT reason FROM c2c_document_section_versions`,
    );
    expect(
      reasons.some((r) => /^Reverted to revision /.test(r.reason ?? '')),
      'the revert left no reason of its own in the version ledger',
    ).toBe(true);
  }, T);
});

describe('a metadata change to a section is audited', () => {
  /* The PATCH audit block fired only on a CONTENT change, so a save that
     renamed a section, re-coded it, or toggled its track-changes mode updated
     the row and left NO audit trail — a change to a governed record with no
     record of the change, which §11.10(e) does not permit. Renaming a CTD code
     is not cosmetic: `commitSectionToFiling` matches a section to its filing
     slot BY that code. */
  let metaSecId = '';

  it('creates a section to rename', async () => {
    const sec = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: authoringDocId, code: '3.2.P.5', title: 'Control of Drug Product',
      content: '', order_index: 5,
    });
    expect(sec.status).toBe(201);
    metaSecId = sec.body.section.id;
  }, T);

  it('records a RENAME, naming what moved, and creates NO content revision', async () => {
    const before = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM doc_revisions WHERE section_id = $1`, [metaSecId],
    );
    const res = await as(request(app).patch(`/api/authoring/sections/${metaSecId}`))
      .send({ title: 'Control of the Drug Product' });
    expect(res.status).toBe(200);

    const rows = await q<{ operation_type: string; change_reason: string | null; metadata: any }>(
      `SELECT operation_type, change_reason, metadata FROM authoring_audit_trail
        WHERE section_id = $1 AND operation_type = 'RENAME'`, [metaSecId],
    );
    expect(rows.length, 'a rename left no audit row').toBeGreaterThan(0);
    const md = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    expect(md.source).toBe('section-metadata');
    expect(md.changes.some((c: any) => c.field === 'title' && c.to === 'Control of the Drug Product')).toBe(true);
    /* No reason is invented for a self-describing metadata change. */
    expect(rows[0].change_reason).toBeNull();

    // A rename is not a content edit — the revision ledger did not grow.
    const after = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM doc_revisions WHERE section_id = $1`, [metaSecId],
    );
    expect(after[0].n).toBe(before[0].n);
  }, T);

  it('reaches the hash-chained ledger, not only the soft table', async () => {
    /* The metadata audit rides the transaction through createAuditTrail, so it
       lands in `audit_logs` with a chain and a seal — the same guarantee a
       content save now has. */
    const rows = await q<{ action: string; sha256_chain: string; hmac_seal: string }>(
      `SELECT action, sha256_chain, hmac_seal FROM audit_logs
        WHERE record_id = $1 AND action = 'authoring.section.RENAME'`, [metaSecId],
    );
    expect(rows.length, 'the rename never reached the chain').toBeGreaterThan(0);
    expect(rows[0].sha256_chain).toBeTruthy();
    expect(rows[0].hmac_seal).toBeTruthy();
  }, T);

  it('records a TRACK_CHANGES toggle', async () => {
    const res = await as(request(app).patch(`/api/authoring/sections/${metaSecId}`))
      .send({ track_changes: true });
    expect(res.status).toBe(200);
    const rows = await q<{ metadata: any }>(
      `SELECT metadata FROM authoring_audit_trail
        WHERE section_id = $1 AND operation_type = 'TRACK_CHANGES'`, [metaSecId],
    );
    expect(rows.length).toBeGreaterThan(0);
    const md = typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata) : rows[0].metadata;
    expect(md.changes.some((c: any) => c.field === 'track_changes' && c.to === true)).toBe(true);
  }, T);

  it('does not audit a metadata PATCH that changes nothing', async () => {
    /* Re-sending the current title is a no-op, and a no-op is not an event. An
       audit trail full of "nothing changed" rows hides the changes that did. */
    const before = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM authoring_audit_trail WHERE section_id = $1`, [metaSecId],
    );
    const res = await as(request(app).patch(`/api/authoring/sections/${metaSecId}`))
      .send({ title: 'Control of the Drug Product' });
    expect(res.status).toBe(200);
    const after = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM authoring_audit_trail WHERE section_id = $1`, [metaSecId],
    );
    expect(after[0].n).toBe(before[0].n);
  }, T);
});

describe('a section code is locked to the filing on a bound document', () => {
  /* The code is the section's identity in the filing — commitSectionToFiling
     matches it to c2c_document_sections.section_key. Re-coding a bound section
     silently re-points it to a different slot (or none), so the next content
     save lands elsewhere and the old slot's content is orphaned. The rename
     dialog offered the code as a freely editable field. */
  let boundSecId = '';

  it('creates a section on the bound document', async () => {
    const sec = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: authoringDocId, code: '3.2.S.1', title: 'General Information',
      content: '', order_index: 6,
    });
    expect(sec.status).toBe(201);
    boundSecId = sec.body.section.id;
  }, T);

  it('refuses a code change, and changes nothing', async () => {
    const res = await as(request(app).patch(`/api/authoring/sections/${boundSecId}`))
      .send({ code: '3.2.S.9' });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('CODE_LOCKED_TO_FILING');
    expect(res.body.error?.message).toMatch(/place in the filing/i);
    // Discloses no schema object, query or route.
    expect(JSON.stringify(res.body)).not.toMatch(/authoring_documents|c2c_document|SELECT|\/api\//i);
    const [row] = await q<{ code: string }>(
      `SELECT code FROM authoring_sections WHERE id = $1`, [boundSecId],
    );
    expect(row.code).toBe('3.2.S.1');
  }, T);

  it('allows a title-only rename — the code is present but unchanged', async () => {
    const res = await as(request(app).patch(`/api/authoring/sections/${boundSecId}`))
      .send({ code: '3.2.S.1', title: 'General Information (updated)' });
    expect(res.status).toBe(200);
    const [row] = await q<{ title: string; code: string }>(
      `SELECT title, code FROM authoring_sections WHERE id = $1`, [boundSecId],
    );
    expect(row.title).toBe('General Information (updated)');
    expect(row.code).toBe('3.2.S.1');
  }, T);

  it('allows a code change on an UNBOUND document — there is no filing to break', async () => {
    const doc = await as(request(app).post('/api/authoring/docs')).send({
      title: 'Unbound note', module: 'M2',
    });
    const sec = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: doc.body.document.id, code: '1.1', title: 'x', content: '', order_index: 1,
    });
    const res = await as(request(app).patch(`/api/authoring/sections/${sec.body.section.id}`))
      .send({ code: '1.2' });
    expect(res.status).toBe(200);
    const [row] = await q<{ code: string }>(
      `SELECT code FROM authoring_sections WHERE id = $1`, [sec.body.section.id],
    );
    expect(row.code).toBe('1.2');
  }, T);
});

describe('a freeze refuses a document that is still asking questions', () => {
  /* Freeze is the seal: after it the content is hash-sealed, signed under
     §11.50 and filed. Nothing checked whether the document was FINISHED, so a
     section carrying open reviewer comments and unaccepted tracked changes
     could be frozen, signed and submitted.

     Both then vanish in a way nothing downstream can see. Comments are not part
     of the exported content at all, so forty unanswered queries simply do not
     travel and the filed document looks settled. Unresolved suggestions do
     travel, so an unfinished sentence reaches a reviewer mid-argument. */

  /** A fresh document with one section, so each case starts clean. */
  async function freshDoc(content: string) {
    const doc = await as(request(app).post('/api/authoring/docs')).send({
      title: 'Freeze gate', module: 'M2',
    });
    const id = doc.body.document.id;
    const sec = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: id, code: '2.5', title: '2.5', content, order_index: 1,
    });
    return { docId: id, sectionId: sec.body.section.id };
  }

  const freeze = (docId: string, body: Record<string, unknown> = {}) =>
    as(request(app).post(`/api/authoring/docs/${docId}/freeze`)).send({
      reason: 'Locked for submission.', ...body,
    });

  it('refuses while a reviewer comment is still open, and says how many', async () => {
    const { docId, sectionId } = await freshDoc('<p>Settled prose.</p>');
    await q(
      `INSERT INTO authoring_comments (id, section_id, doc_id, body, status, created_by, tenant_id)
       VALUES (gen_random_uuid(), $1, $2, 'Is 100 mg the right dose?', 'open', 'reviewer', 1)`,
      [sectionId, docId],
    );

    const res = await freeze(docId);
    expect(res.status, 'a document with an open question was sealed').toBe(409);
    expect(res.body.error?.code).toBe('DOCUMENT_NOT_SETTLED');
    expect(res.body.unresolved).toMatchObject({ openComments: 1 });
    // The refusal names the situation rather than a status code.
    expect(res.body.error?.message).toMatch(/1 unresolved comment\b/);
    // And discloses no schema object, query or route.
    expect(JSON.stringify(res.body)).not.toMatch(/authoring_comments|SELECT|\/api\//i);

    // Nothing was sealed.
    const [row] = await q<{ status: string }>(
      `SELECT status FROM authoring_documents WHERE id = $1`, [docId],
    );
    expect(String(row.status).toUpperCase()).not.toBe('FROZEN');
  });

  it('refuses while a tracked change is undecided', async () => {
    const { docId } = await freshDoc(
      '<p>Administer <del>100 mg</del><ins>200 mg</ins> daily.</p>',
    );
    const res = await freeze(docId);
    expect(res.status).toBe(409);
    /* Two marks — one insertion, one deletion — counted by the same census the
       export takes, so the gate and the export can never disagree about
       whether a document has unsettled edits. */
    expect(res.body.unresolved).toMatchObject({ pendingEdits: 2 });
    expect(res.body.error?.message).toMatch(/accepted or rejected/i);
  });

  it('proceeds once the comment is resolved — the refusal is not permanent', async () => {
    const { docId, sectionId } = await freshDoc('<p>Settled prose.</p>');
    await q(
      `INSERT INTO authoring_comments (id, section_id, doc_id, body, status, created_by, tenant_id)
       VALUES (gen_random_uuid(), $1, $2, 'Question', 'open', 'reviewer', 1)`,
      [sectionId, docId],
    );
    expect((await freeze(docId)).status).toBe(409);

    await q(`UPDATE authoring_comments SET status = 'resolved' WHERE doc_id = $1`, [docId]);
    expect((await freeze(docId)).status).toBe(200);
  });

  it('proceeds when the caller states they intend to seal it as it stands', async () => {
    /* A refusal, not a prohibition. Freezing a draft with open comments is a
       real thing to want — an internal baseline before a review round — so the
       caller may proceed by SAYING SO. */
    const { docId, sectionId } = await freshDoc('<p>Settled prose.</p>');
    await q(
      `INSERT INTO authoring_comments (id, section_id, doc_id, body, status, created_by, tenant_id)
       VALUES (gen_random_uuid(), $1, $2, 'Question', 'open', 'reviewer', 1)`,
      [sectionId, docId],
    );

    const res = await freeze(docId, { acknowledgeUnresolved: true });
    expect(res.status).toBe(200);

    /* And WHAT was sealed over is in the record, not only in someone's memory:
       the frozen row's own reason carries it. */
    const [frozen] = await q<{ frozen_reason: string }>(
      `SELECT frozen_reason FROM frozen_documents WHERE document_id = $1`, [docId],
    );
    expect(frozen.frozen_reason).toMatch(/1 unresolved comment/i);
    expect(frozen.frozen_reason).toMatch(/acknowledged by/i);
  });

  it('freezes a settled document with no ceremony at all', async () => {
    /* The working path. A finished document must not have acquired a new
       hurdle — nothing to acknowledge, nothing appended to its reason. */
    const { docId } = await freshDoc('<p>Settled prose, no comments, no marks.</p>');
    const res = await freeze(docId);
    expect(res.status).toBe(200);

    const [frozen] = await q<{ frozen_reason: string }>(
      `SELECT frozen_reason FROM frozen_documents WHERE document_id = $1`, [docId],
    );
    expect(frozen.frozen_reason).toBe('Locked for submission.');
  });
});

describe('what it deliberately does NOT do', () => {
  it('does not invent a section the rule pack does not define', async () => {
    const res = await save('ZZ-not-in-pack', 'Text under a code the filing has no slot for.');
    // The save succeeds — the working copy is real.
    expect(res.status).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: false });
    expect(res.body.filing.reason).toMatch(/no section "ZZ-not-in-pack"/);

    // And nothing was created in the governed outline.
    const rows = await q(
      `SELECT 1 FROM c2c_document_sections WHERE document_id = $1 AND section_key = 'ZZ-not-in-pack'`,
      [DOC],
    );
    expect(rows).toHaveLength(0);
  }, T);

  it('an unbound document saves, and says the text did not reach a filing', async () => {
    const other = await as(request(app).post('/api/authoring/docs')).send({
      title: 'Org-wide note', module: 'M2',
    });
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: other.body.document.id, code: '2.5', title: '2.5', content: '', order_index: 1,
    });

    const res = await as(request(app).patch(`/api/authoring/sections/${s.body.section.id}`))
      .send({ content: 'Notes that belong to no filing.' });

    expect(res.status).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: false });
    expect(res.body.filing.reason).toMatch(/not bound to a filing/i);

    // Crucially: it did NOT land in the other document's 2.5.
    const [row] = await q<{ content: any }>(
      `SELECT content FROM c2c_document_sections WHERE document_id = $1 AND section_key = '2.5'`,
      [DOC],
    );
    expect(row.content).not.toEqual({ text: 'Notes that belong to no filing.' });
  }, T);
});

describe('the two stores move together or neither does', () => {
  it('a filing write that cannot happen takes the authored write down with it', async () => {
    // Point the binding at a document that does not exist. The FK on
    // c2c_document_sections means the UPDATE matches nothing — but the deeper
    // property under test is the transaction: if committing to the filing
    // THROWS, the authored content must not be left behind on its own.
    //
    // Simulated by breaking the join mid-flight rather than by mocking, so the
    // rollback is the database's, not a stub's.
    const before = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );

    await q(`ALTER TABLE c2c_document_sections ADD CONSTRAINT tmp_refuse CHECK (section_key <> '2.6') NOT VALID`);
    try {
      const res = await save('2.6', 'This must not survive on its own.');
      expect(res.status).toBe(500);
      expect(res.body.error?.code).toBe('LINEAGE_REQUIRED');
    } finally {
      await q(`ALTER TABLE c2c_document_sections DROP CONSTRAINT tmp_refuse`);
    }

    const after = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );
    // The authored row is untouched: the refused filing write rolled it back.
    expect(after[0].content).toBe(before[0].content);
  }, T);
});
