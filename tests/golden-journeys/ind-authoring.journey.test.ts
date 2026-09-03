/**
 * Golden Journey A, phase 1 (WO-01): IND document authoring → freeze → e-sign.
 *
 * Route-level traversal: the REAL authoring.router mounted in an express app
 * and driven over HTTP (supertest) with REAL signed JWTs — the router's own
 * jose signature verification stays fully active, org scoping and attribution
 * derive from verified claims, and the forged-token / cross-tenant known-bad
 * steps prove both.
 *
 * Storage is the C-11 remediation: db/migrations/20260725_authoring_document_loop_tables.sql
 * — the flagship loop's tables had NO CREATE TABLE anywhere in the repository
 * until that migration. This journey is the acceptance proof that the
 * code-derived reconstruction matches what the code actually does.
 *
 * Signatures land in `authoring_signatures` (db/migrations/20260725_authoring_signatures_and_workflow.sql).
 * e-sign previously wrote `electronic_signatures` — the Part 11 table for the
 * integer-keyed legacy document system, whose shape it could never satisfy — so
 * this journey used TEST-ONLY DDL to stand in for it. That reconciliation has
 * landed (ledger C-11 residual 1) and the journey now runs entirely on canonical
 * migrations.
 *
 * Output: tests/golden-journeys/__reports__/ind-authoring.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { createJourneyDb, JourneyRecorder, type JourneyDb, assertNoSchemaGaps, assertNoDegradedTenantEnrichment } from './harness';

// The authoring router carries its own jose JWT verification (HS256 over
// JWT_SECRET) — so this journey authenticates with REAL signed tokens, and the
// signature check stays fully active. A forged-secret token is a known-bad step.
const JWT_SECRET = randomBytes(32).toString('hex');
const FORGED_JWT_SECRET = randomBytes(32).toString('hex');
const AUTHOR_PIN = randomBytes(12).toString('hex');
const APPROVER_PIN = randomBytes(12).toString('hex');
const WRONG_PIN = randomBytes(12).toString('hex');
process.env.JWT_SECRET = JWT_SECRET;
// The authoring router now verifies via the CANONICAL verifyJwtWithRotation,
// which in test env (NODE_ENV=test → suffix DEV) reads JWT_SECRET_DEV ?? JWT_SECRET.
// This file overrides JWT_SECRET for isolation, so it must override the
// env-suffixed secret the verifier actually reads, or every token 401s.
process.env.JWT_SECRET_DEV = JWT_SECRET;

async function mint(user: { id: string; organizationId: number; email: string; name: string }, secret = JWT_SECRET) {
  return new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: user.organizationId,
    tenant_id: user.organizationId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

const T = 180_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const AUTHOR = {
  id: '3',
  organizationId: 1,
  email: 'author@journey.example',
  name: 'Avery Author',
};
const APPROVER = {
  id: '4',
  organizationId: 1,
  email: 'approver@journey.example',
  name: 'Quinn Approver',
};
const OUTSIDER = {
  id: '99',
  organizationId: 2,
  email: 'outsider@other.example',
  name: 'Iris Intruder',
};

// Subject ids are INTEGERS because that is what the product has: users.id is a
// serial (shared/schema.ts) and organization_users.user_id is an integer
// referencing it. These were UUIDs sharing a '3f1c2a10…' prefix, seeded under
// one membership row derived with Number.parseInt(AUTHOR.id, 10) — which
// truncates that UUID to 3.
//
// No server code does that any more, and none should: truncating an id to its
// leading digits makes '3f1c…' and '3a9b…' the same member, which is an
// authorization answer arrived at by string accident. parseFiniteInt rejects
// anything not wholly digits, and the signing gate reads
// Number(getActorId(req)) — a UUID gives NaN and the gate fails closed. Both
// are right. The fixture was modelling an identity shape production does not
// have, and the §11.10(g) gate is what finally made that visible.

const PREREQ = `
  -- The canonical audit ledger auditService.logAction writes on every governed
  -- mutation the router performs. Same reason as the tamper-proof table in the
  -- migration list below: its absence did not just lose audit rows, it aborted
  -- the shared PGlite transaction and rolled back the business write under test.
  -- Column set mirrors writeChainedAuditRow's INSERT plus the FOR UPDATE
  -- chain-head read (sha256_chain / occurred_at), and matches the shape already
  -- used by server/routes/c2c/__tests__/governed-action.pglite.integration.test.ts.
  CREATE TABLE audit_logs (
    id            TEXT PRIMARY KEY,
    tenant_id     INTEGER,
    user_id       INTEGER,
    action        TEXT,
    table_name    TEXT,
    record_id     TEXT,
    actor_id      INTEGER,
    target        TEXT,
    payload_hash  TEXT,
    sha256_chain  TEXT,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    hmac_seal     TEXT,
    old_values    JSON,
    new_values    JSON,
    ip_address    TEXT,
    user_agent    TEXT
  );
  -- \`uuid\` as db/migrations/20260129_add_org_uuid_alignment.sql adds it; the
  -- org-membership middleware LEFT JOINs it on every request and, without it,
  -- degrades to a membership-only decision with orgUuid = null (ledger L148).
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT, uuid UUID NOT NULL DEFAULT gen_random_uuid());
  -- users.id is INTEGER, standing in for the production serial. It was UUID for
  -- a history join that read u.id = r.created_by::uuid; that join was removed
  -- (Postgres rejects integer = uuid at parse time) and now compares as text,
  -- u.id::text = r.created_by, which matches either shape.
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  INSERT INTO organizations (id, name) VALUES (1, 'journey-org'), (2, 'other-org');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}'),
    ('${APPROVER.id}', '${APPROVER.name}', '${APPROVER.email}'),
    ('${OUTSIDER.id}', '${OUTSIDER.name}', '${OUTSIDER.email}');
  -- AUTHOR + APPROVER are in org 1; OUTSIDER is a genuine member of org 2 (its
  -- own org) — tenant isolation to org 1 is enforced separately by the router,
  -- not by this membership row.
  -- Roles, not just membership: §11.10(g) asks whether the signer has the
  -- AUTHORITY to sign, and DEFAULT_SIGNING_ROLES is admin/approver/reviewer.
  -- Both signers were seeded 'member', so once that gate landed neither could
  -- sign — the wrong-PIN step got 403 from the authority check before the PIN
  -- was ever read, and the happy-path step got the same 403.
  --
  -- The org role is not the signature's MEANING: a 'reviewer' applying a
  -- signature that means AUTHOR is the intended shape, identity and authority
  -- being separate from what the signature asserts. OUTSIDER stays 'member' —
  -- they never sign here, and their steps must be refused by tenant isolation
  -- rather than by a role check standing in front of it.
  INSERT INTO organization_users (organization_id, user_id, role) VALUES
    (1, ${AUTHOR.id}, 'reviewer'),
    (1, ${APPROVER.id}, 'approver'),
    (2, ${OUTSIDER.id}, 'member');
`;

let jdb: JourneyDb;
let app: express.Express;

const R = new JourneyRecorder(
  'Journey A (phase 1) — IND document authoring to freeze and e-sign',
  'The flagship authoring loop over HTTP against the C-11 code-derived canonical DDL: create document, author sections with automatic revisions, history and revert, comment, cite, PIN, freeze with content hash, Part 11 e-sign (JWT-attributed), approver sign-off with auto-freeze — plus tenant-isolation and honest-failure checks.',
);

const tokens = new Map<string, string>();
function asUser(u: typeof AUTHOR) {
  return (req: request.Test) => req.set('Authorization', `Bearer ${tokens.get(u.id)!}`);
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
      // The tamper-proof audit log the router ALSO writes on governed actions.
      // Omitting it did not merely lose audit rows, it corrupted unrelated
      // assertions: the write failed with 42P01, and because PGlite is a SINGLE
      // connection shared by the whole request, that error put the surrounding
      // transaction into "current transaction is aborted" — so the export
      // record, which had already INSERTed successfully (rowCount 1, id
      // returned), was rolled back with it. The endpoint still answered 200 and
      // the durability assertion below failed with an empty table, pointing at
      // the export path rather than at the missing audit table.
      //
      // Production is unaffected: the table is on the durable apply path
      // (C2C_MIGRATION_FILES), and a real pool gives the audit write its own
      // connection, so its failure could not poison another statement's
      // transaction. This list was simply behind the schema.
      'db/migrations/20260813_audit_tamper_proof_log.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      // The router's own tables (templates/tokens/export_history/…), moved out of
      // retired runtime DDL into this migration by the canonical-spine refactor.
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      // The section save writes content and its span lineage in one transaction
      // and refuses to commit one without the other, so this table is now a
      // prerequisite for the authoring spine, not an optional extra.
      'db/migrations/20260803_document_span_lineage.sql',
      // Comment threading + author identity. The comment READ path
      // (GET /documents/:id/comments) has always selected user_name,
      // user_email, parent_comment_id and position_data, so this migration is
      // already load-bearing for a route the editor calls; the write path now
      // populates the same columns instead of leaving every comment attributed
      // to a raw actor id. It is on the durable apply path
      // (C2C_MIGRATION_FILES) — this list was simply behind it.
      'migrations/20260728_authoring_comments_threading.sql',
      // Object-level authorization. The section-edit gate and the creator
      // auto-grant both go through the canonical permission service now
      // (services/authoring/authoring-permissions.ts), which reads and writes
      // the grant's identity and lifecycle columns — principal_id, granted_by,
      // valid_from/valid_until, revoked_at. Without this migration the journey
      // ran against a doc_permissions narrower than the code under test: the
      // decision threw 42703 and fail-closed denied, which the harness catches
      // rather than letting the journey pass on a database smaller than
      // production's. On the durable apply path via AUTHORING_SUBSYSTEM_FILES.
      'db/migrations/20260727_authoring_object_permissions.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  for (const u of [AUTHOR, APPROVER, OUTSIDER]) tokens.set(u.id, await mint(u));

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  // No auth shim: the router's OWN jose middleware verifies these tokens.
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => {
  // A journey that ran against a database missing a table its subject writes
  // to proves less than it claims (ledger L145).
  // Ordered BEFORE the schema-gap check on purpose: a degraded membership is
  // usually CAUSED by a missing column, and the gap check would otherwise
  // throw first and report the symptom while hiding which claims were
  // proven without an org context (ledger L148).
  await assertNoDegradedTenantEnrichment();
  assertNoSchemaGaps(jdb);
  const { jsonPath, mdPath } = R.write('ind-authoring');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

describe('Journey A phase 1 — authoring loop over HTTP (canonical DDL)', () => {
  let docId: string;
  let sectionId: string;
  let firstRevisionId: string;
  let commentId: string;
  let freezeHash: string;

  it('runs the authoring spine', async () => {
    // ── KNOWN-BAD: no title → 400, honest validation ─────────────────────────
    await R.expectBlocked('create-doc-without-title', async () => {
      const res = await asUser(AUTHOR)(request(app).post('/api/authoring/docs')).send({});
      return { blocked: res.status === 400, status: res.status, error: res.body.error };
    });

    // ── 1. Create the IND Module 2 document ─────────────────────────────────
    await R.step('create-document', async () => {
      const res = await asUser(AUTHOR)(request(app).post('/api/authoring/docs')).send({
        title: 'IND 12345 — Module 2.5 Clinical Overview',
        module: 'M2',
        product_code: 'C2C-001',
      });
      expect(res.status).toBe(201);
      docId = res.body.document.id;
      return { docId, status: res.body.document.status, createdBy: res.body.document.created_by };
    });

    // ── 2. Author a section (creates the initial revision) ──────────────────
    await R.step('create-section', async () => {
      const res = await asUser(AUTHOR)(request(app).post('/api/authoring/sections')).send({
        doc_id: docId,
        code: '2.5.1',
        title: 'Product Development Rationale',
        content: 'Initial rationale draft: effect size assumption 0.35.',
        order_index: 1,
      });
      expect(res.status).toBe(201);
      sectionId = res.body.section.id;
      return { sectionId };
    });

    // ── 3. Save an edit — automatic revision of the PRIOR content ───────────
    await R.step('save-section-creates-revision', async () => {
      const res = await asUser(AUTHOR)(
        request(app).patch(`/api/authoring/sections/${sectionId}`),
      ).send({ content: 'Revised rationale: effect size assumption corrected to 0.25.' });
      expect(res.status).toBe(200);
      expect(res.body.revision_created).toBe(true);
      return { revisionCreated: res.body.revision_created };
    });

    // ── 4. History shows both revisions, attributed ──────────────────────────
    await R.step('revision-history', async () => {
      const res = await asUser(AUTHOR)(
        request(app).get(`/api/authoring/sections/${sectionId}/history`),
      );
      expect(res.status).toBe(200);
      const revisions = res.body.revisions ?? res.body.history ?? [];
      expect(revisions.length).toBeGreaterThanOrEqual(2);
      firstRevisionId = revisions[revisions.length - 1].id;
      return { revisions: revisions.length, firstRevisionId };
    });

    // ── 5. Revert to the initial revision ────────────────────────────────────
    await R.step('revert-to-first-revision', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/sections/${sectionId}/revert`),
      ).send({ rev_id: firstRevisionId });
      expect(res.status).toBe(200);
      expect(String(res.body.section.content)).toContain('0.35');
      return { revertedTo: firstRevisionId, contentContains: '0.35' };
    });

    // ── 6. Comment + citation (source trace) ─────────────────────────────────
    await R.step('comment-and-cite', async () => {
      const c = await asUser(APPROVER)(
        request(app).post(`/api/authoring/sections/${sectionId}/comment`),
      ).send({ doc_id: docId, body: 'Confirm the effect size against the SAP before freeze.' });
      expect(c.status).toBe(201);
      commentId = c.body.comment.id;
      const cite = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/sections/${sectionId}/cite`),
      ).send({
        source: 'CSR-2024-001',
        citation_text: 'Phase 2 pooled analysis, Table 14.2.1',
        reference_id: 'ref-14-2-1',
      });
      expect(cite.status).toBe(201);
      const list = await asUser(AUTHOR)(
        request(app).get(`/api/authoring/sections/${sectionId}/citations`),
      );
      expect(list.status).toBe(200);
      expect((list.body.citations ?? []).length).toBe(1);
      return {
        commentId: c.body.comment.id,
        citationId: cite.body.citation.id,
        citationsListed: list.body.citations.length,
      };
    });

    // ── KNOWN-BAD: cross-tenant CHILD parentage rejected at the DB boundary ──
    // A raw tenant-2 revision pointing at the tenant-1 section must be rejected
    // by the composite FK doc_revisions_section_tenant_fkey (P0 #4) — RLS filters
    // rows by their own tenant, but only this FK stops a child from structurally
    // straddling two tenants. This is a physical guarantee independent of session
    // vars, so we assert it directly against the pool.
    await R.expectBlocked('cross-tenant-child-parentage-rejected-at-db', async () => {
      try {
        await jdb.pool.query(
          `INSERT INTO doc_revisions (id, section_id, content, created_by, tenant_id)
           VALUES (gen_random_uuid(), $1, 'cross-tenant', 'sys', 2)`,
          [sectionId],
        );
        return { blocked: false };
      } catch (e) {
        return { blocked: /foreign key|violates/i.test(String(e)), thrown: String(e).split('\n')[0] };
      }
    });

    // ── KNOWN-BAD: cross-tenant read → 404, not data ─────────────────────────
    await R.expectBlocked('cross-tenant-document-read', async () => {
      const res = await asUser(OUTSIDER)(request(app).get(`/api/authoring/docs/${docId}`));
      return { blocked: res.status === 404, status: res.status };
    });

    // ── KNOWN-BAD: token signed with the WRONG secret → 401 ──────────────────
    await R.expectBlocked('forged-jwt-rejected', async () => {
      const forged = await mint(AUTHOR, FORGED_JWT_SECRET);
      const res = await request(app)
        .get(`/api/authoring/docs/${docId}`)
        .set('Authorization', `Bearer ${forged}`);
      return { blocked: res.status === 401, status: res.status, error: res.body.error };
    });

    // ── 7. Part 11: PIN from the VERIFIED identity ───────────────────────────
    await R.step('create-signing-pin', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post('/api/authoring/users/pin'),
      ).send({ pin: AUTHOR_PIN });
      expect(res.status).toBe(200);
      return { pinCreated: true, identitySource: 'verified JWT (getActorEmail)' };
    });

    // ── 7b. Settle before the seal ───────────────────────────────────────────
    // Freeze refuses to silently seal a document that is still asking questions:
    // the reviewer's open comment must be resolved (or the freeze explicitly
    // acknowledge it) before the content is hashed and signed. A pre-signature
    // filing freeze is the clean-seal case, so the journey resolves the open
    // review comment here rather than acknowledging an unfinished document.
    await R.step('resolve-review-comment-before-seal', async () => {
      const res = await asUser(AUTHOR)(
        request(app).patch(`/api/authoring/comments/${commentId}`),
      ).send({ status: 'resolved', resolution_note: 'Effect size confirmed against the SAP.' });
      expect(res.status).toBe(200);
      return { commentResolved: true, commentId };
    });

    // ── 8. Freeze — immutable snapshot with content hash ─────────────────────
    await R.step('freeze-document', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/docs/${docId}/freeze`),
      ).send({ reason: 'Pre-signature freeze for IND submission' });
      expect(res.status).toBe(200);
      const frozen = await asUser(AUTHOR)(
        request(app).get(`/api/authoring/docs/${docId}/frozen`),
      );
      expect(frozen.status).toBe(200);
      const snap = frozen.body.frozen ?? frozen.body;
      freezeHash = snap.content_hash ?? snap.contentHash;
      expect(freezeHash).toMatch(/^[0-9a-f]{64}$/);
      return { contentHash: freezeHash, frozenBy: snap.frozen_by ?? snap.frozenBy };
    });

    // ── KNOWN-BAD: e-sign with a wrong PIN → 401 ─────────────────────────────
    await R.expectBlocked('e-sign-wrong-pin', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/docs/${docId}/e-sign`),
      ).send({ pin: WRONG_PIN, meaning: 'AUTHOR', intent: 'I authored this document' });
      return { blocked: res.status === 401, status: res.status };
    });

    // ── 9. E-sign (AUTHOR) — hash verified against an INDEPENDENT recomputation
    // NOTE (finding): freeze hashes the full JSON snapshot (including a
    // frozenAt timestamp), e-sign hashes the section content join
    // (computeDocHash). The two integrity chains are NOT linked — a signature
    // cannot be cryptographically tied to the frozen snapshot. Recorded in
    // observations; the journey asserts each chain independently.
    await R.step('e-sign-author', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/docs/${docId}/e-sign`),
      ).send({ pin: AUTHOR_PIN, meaning: 'AUTHOR', intent: 'I authored this document' });
      expect(res.status).toBe(200);

      // Independent recomputation of the signature hash from durable state.
      const secs = await jdb.pool.query(
        `SELECT code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = 1 ORDER BY order_index`,
        [docId],
      );
      const { createHash } = await import('node:crypto');
      const expected = createHash('sha256')
        .update(secs.rows.map((r) => `${(r as { code: string }).code}:${(r as { content: string }).content}`).join('|||'))
        .digest('hex');
      expect(res.body.documentHash).toBe(expected);

      // Independent verification of the freeze chain: stored hash matches the
      // stored snapshot bytes.
      const froz = await jdb.pool.query(
        `SELECT frozen_content, content_hash FROM frozen_documents WHERE document_id = $1 AND tenant_id = 1 ORDER BY frozen_at LIMIT 1`,
        [docId],
      );
      const frozRow = froz.rows[0] as { frozen_content: string; content_hash: string };
      const frozRecomputed = createHash('sha256').update(frozRow.frozen_content).digest('hex');
      expect(frozRecomputed).toBe(frozRow.content_hash);

      return {
        signatureId: res.body.signatureId,
        signatureHashIndependentlyVerified: res.body.documentHash === expected,
        freezeHashIndependentlyVerified: frozRecomputed === frozRow.content_hash,
        chainsLinked: false,
      };
    });

    // ── 10. Approver signs — status APPROVED + auto-freeze 'approved' ────────
    await R.step('e-sign-approver', async () => {
      await asUser(APPROVER)(
        request(app).post('/api/authoring/users/pin'),
      ).send({ pin: APPROVER_PIN });
      const res = await asUser(APPROVER)(
        request(app).post(`/api/authoring/docs/${docId}/e-sign`),
      ).send({ pin: APPROVER_PIN, meaning: 'APPROVER', intent: 'Approved for submission' });
      expect(res.status).toBe(200);
      const doc = await asUser(APPROVER)(request(app).get(`/api/authoring/docs/${docId}`));
      const rows = await jdb.pool.query(
        `SELECT version FROM frozen_documents WHERE document_id = $1 AND tenant_id = 1 ORDER BY frozen_at`,
        [docId],
      );
      return {
        signatureId: res.body.signatureId,
        documentStatus: doc.body.document?.status ?? doc.body.status,
        frozenVersions: rows.rows.map((r) => (r as { version: string }).version),
      };
    });

    // ── Evidence: signatures are JWT-attributed, not header-attributed ───────
    await R.step('signature-attribution-evidence', async () => {
      const sigs = await jdb.pool.query(
        `SELECT signer_email, meaning, reason, method, pin_verified FROM authoring_signatures
          WHERE doc_id = $1 AND tenant_id = 1 ORDER BY signed_at`,
        [docId],
      );
      const emails = sigs.rows.map((r) => (r as { signer_email: string }).signer_email);
      expect(emails).toEqual([AUTHOR.email, APPROVER.email]);
      return { signers: sigs.rows };
    });

    // ── Evidence: the signatures LIST endpoint finally sees them ─────────────
    // GET /docs/:docId/signatures has always read authoring_signatures while
    // e-sign wrote electronic_signatures, so the list was empty even after a
    // document was signed twice. One store now, so the read path agrees with the
    // write path (ledger C-11 residual 1).
    await R.step('signatures-list-returns-both-signatures', async () => {
      const res = await asUser(AUTHOR)(
        request(app).get(`/api/authoring/docs/${docId}/signatures`),
      );
      expect(res.status).toBe(200);
      const list = res.body.signatures as { signer_email: string; meaning: string; method: string }[];
      expect(list).toHaveLength(2);
      expect(new Set(list.map((s) => s.meaning))).toEqual(new Set(['AUTHOR', 'APPROVER']));
      expect(list.every((s) => s.method === 'PIN')).toBe(true);
      return { count: list.length, meanings: list.map((s) => s.meaning) };
    });

    // ── Evidence: the signature is BOUND to the snapshot it covers ──────────
    // Previously recorded as an INTEGRITY GAP: freeze and signature hashes each
    // verified independently but nothing said which snapshot a signature
    // attested to. §11.70 makes that link the point. Now the signature carries
    // the covered snapshot's version and hash, and its digest — computed over
    // durable columns only, no timestamp — can be recomputed by any auditor.
    await R.step('signature-is-cryptographically-bound-to-the-frozen-snapshot', async () => {
      const sigs = await jdb.pool.query(
        `SELECT signer_email, meaning, content_hash, signature_digest,
                covered_freeze_version, covered_content_hash
           FROM authoring_signatures WHERE doc_id = $1 AND tenant_id = 1
          ORDER BY signed_at`,
        [docId],
      );
      const froz = await jdb.pool.query(
        `SELECT version, content_hash FROM frozen_documents
          WHERE document_id = $1 AND tenant_id = 1 ORDER BY frozen_at`,
        [docId],
      );
      const firstFreeze = froz.rows[0] as { version: string; content_hash: string };

      const { createHash } = await import('node:crypto');
      const recompute = (r: {
        signer_email: string; meaning: string; content_hash: string;
        covered_content_hash: string | null;
      }) =>
        createHash('sha256')
          .update(
            ['authoring-sig-v1', r.signer_email, r.meaning, r.content_hash, r.covered_content_hash ?? ''].join('|'),
          )
          .digest('hex');

      const rows = sigs.rows as {
        signer_email: string; meaning: string; content_hash: string;
        signature_digest: string; covered_freeze_version: string | null;
        covered_content_hash: string | null;
      }[];
      expect(rows.length).toBe(2);

      for (const r of rows) {
        // The link: each signature names the snapshot in force when it was made.
        expect(r.covered_content_hash).toBe(firstFreeze.content_hash);
        expect(r.covered_freeze_version).toBe(firstFreeze.version);
        // The binding is cryptographic, and independently recomputable.
        expect(r.signature_digest).toBe(recompute(r));
      }

      // Tampering with the covered hash must break the digest — that is what
      // makes this a binding rather than a comment.
      const tampered = recompute({ ...rows[0], covered_content_hash: 'not-the-snapshot' });
      expect(tampered).not.toBe(rows[0].signature_digest);

      return {
        signatures: rows.length,
        coveredFreezeVersion: rows[0].covered_freeze_version,
        digestsIndependentlyRecomputed: true,
        tamperingDetected: true,
      };
    });

    await R.expectBlocked('cross-tenant-signature-list-is-empty', async () => {
      const res = await asUser(OUTSIDER)(
        request(app).get(`/api/authoring/docs/${docId}/signatures`),
      );
      return {
        blocked: res.status === 200 && (res.body.signatures ?? []).length === 0,
        status: res.status,
        rows: (res.body.signatures ?? []).length,
      };
    });

    // ── 12. Export the approved document ────────────────────────────────────
    // Every step below failed before the C-14 fix: POST /export inserted into
    // `authoring_exports` and diff-since-export read `doc_exports`, neither of
    // which any migration or runtime DDL in this repo creates. Both were
    // unguarded, so both endpoints returned 500 unconditionally — an approved,
    // signed IND document could not be exported at all.
    await R.step('diff-since-export-before-any-export', async () => {
      const res = await asUser(AUTHOR)(
        request(app).get(`/api/authoring/docs/${docId}/diff-since-export`),
      );
      expect(res.status).toBe(200);
      expect(res.body.baseline).toBeNull();
      return { status: res.status, baseline: res.body.baseline };
    });

    const exportedAt = await R.step('export-approved-document-as-xml', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/docs/${docId}/export`),
      ).send({ format: 'xml' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      const body = res.text ?? String(res.body);
      expect(body).toContain('<document>');

      // The record must be durable, not just a successful response.
      const rows = await jdb.pool.query(
        `SELECT document_id, export_type, doc_sha256, exported_by, file_name, file_size, tenant_id
           FROM authoring_export_history WHERE document_id = $1 AND tenant_id = 1`,
        [docId],
      );
      expect(rows.rows).toHaveLength(1);
      const rec = rows.rows[0] as {
        export_type: string; doc_sha256: string; exported_by: string;
        file_name: string; file_size: number;
      };
      expect(rec.export_type).toBe('xml');
      expect(rec.exported_by).toBe(AUTHOR.email);
      // file_name/file_size are the REAL ones — they are recorded after the
      // bytes are generated, which is why logExport moved below generation.
      expect(rec.file_name).toMatch(/\.xml$/);
      expect(rec.file_size).toBeGreaterThan(0);

      // doc_sha256 independently recomputed from durable section state.
      const secs = await jdb.pool.query(
        `SELECT code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = 1 ORDER BY order_index`,
        [docId],
      );
      const { createHash } = await import('node:crypto');
      const expected = createHash('sha256')
        .update(secs.rows.map((r) => `${(r as { code: string }).code}:${(r as { content: string }).content}`).join('|||'))
        .digest('hex');
      expect(rec.doc_sha256).toBe(expected);

      return {
        status: res.status,
        exportType: rec.export_type,
        fileName: rec.file_name,
        fileSize: rec.file_size,
        docSha256IndependentlyVerified: rec.doc_sha256 === expected,
      };
    });

    await R.step('exports-list-shows-the-export', async () => {
      const res = await asUser(AUTHOR)(request(app).get(`/api/authoring/docs/${docId}/exports`));
      expect(res.status).toBe(200);
      const list = res.body.exports ?? res.body.history ?? res.body;
      expect(Array.isArray(list) ? list.length : 0).toBeGreaterThanOrEqual(1);
      return { status: res.status, count: Array.isArray(list) ? list.length : 0 };
    });

    await R.step('diff-since-export-now-baselines-against-the-export', async () => {
      const res = await asUser(AUTHOR)(
        request(app).get(`/api/authoring/docs/${docId}/diff-since-export`),
      );
      expect(res.status).toBe(200);
      // A baseline now exists, and nothing changed after the export.
      expect(res.body.baseline).not.toBeNull();
      expect(res.body.count ?? 0).toBe(0);
      return { status: res.status, baseline: res.body.baseline, changed: res.body.count ?? 0 };
    });

    await R.expectBlocked('export-cross-tenant-is-not-found', async () => {
      const res = await asUser(OUTSIDER)(
        request(app).post(`/api/authoring/docs/${docId}/export`),
      ).send({ format: 'xml' });
      return { blocked: res.status === 404, status: res.status };
    });

    await R.expectBlocked('export-rejects-an-unsupported-format', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/docs/${docId}/export`),
      ).send({ format: 'rtf' });
      return { blocked: res.status === 400, status: res.status };
    });

    void exportedAt;

    // ── 13. The Part 11 audit trail actually persisted ──────────────────────
    // Nothing in the repo created authoring_audit_trail, and the write sits in a
    // try/catch that logs and continues — so every authoring operation looked
    // successful while its audit record went nowhere (ledger C-14). Even with the
    // table present the write still failed: getTenantId reads the tenant from the
    // verified JWT, and createAuditEvent handed it a headers-only stand-in.
    await R.step('part-11-audit-trail-is-durable', async () => {
      const rows = await jdb.pool.query(
        `SELECT operation_type, actor_email, tenant_id, content_hash_after
           FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = 1
          ORDER BY created_at`,
        [docId],
      );
      expect(rows.rows.length).toBeGreaterThan(0);
      const ops = rows.rows.map((r) => (r as { operation_type: string }).operation_type);
      // The export we just performed must be on the record.
      expect(ops).toContain('EXPORT');
      // Every row is attributed to a real signed-in actor, never 'system'.
      const actors = new Set(rows.rows.map((r) => (r as { actor_email: string }).actor_email));
      expect(actors.has('unknown')).toBe(false);
      return { auditRows: rows.rows.length, operations: [...new Set(ops)], actors: [...actors] };
    });

    R.observations.push(
      'Fixed while building this journey: e-sign wrote `electronic_signatures` — the Part 11 table for the INTEGER-keyed legacy document system, whose document_id is an integer FK and which carries seven NOT NULL columns the authoring insert never supplied. It could not work on any real deployment. The authoring loop now has its own store, authoring_signatures, which is what GET /docs/:docId/signatures had always read — so the list endpoint returned nothing even for a twice-signed document (ledger C-11 residual 1).',
      'Fixed while building this journey: POST /docs/:docId/sign took its signer from `x-user-email || body.signer_email || \'system\'` and decided workflow approval from the x-roles header. Both now come from the verified token. The defect survived because that endpoint wrote authoring_signatures, which did not exist, so it failed before attribution ever mattered.',
      'Fixed while building this journey: POST /docs/:docId/export inserted into `authoring_exports` and GET /docs/:docId/diff-since-export read `doc_exports` — NEITHER table is created by any migration or any runtime DDL in this repo, and both queries were unguarded. Every export request and every diff request returned 500. The flagship authoring loop could draft, freeze and sign a document but could not export one (ledger C-14).',
      'Fixed while building this journey: the export record is now written by logExport() AFTER the bytes are generated, so file_name and file_size are the real ones rather than placeholders, and ANA-initiated exports (command-executor) record to the same table instead of the phantom one.',
      'Fixed while building this journey: freeze queried authoring_sections.document_id — a column that does not exist (doc_id everywhere else). Freeze had never been executable.',
      'Fixed while building this journey: the canonical user PIN enrollment route, freeze and e-sign take signer identity from the verified JWT via getActorEmail. The former document-scoped create-pin route, which trusted an attacker-controlled x-user-email header and duplicated PIN enrollment, remains deleted (Part 11 §11.100).',
      'Fixed while building this journey (was recorded here as an INTEGRITY GAP): freeze and signature hashes each verified independently but nothing said WHICH snapshot a signature attested to, which is exactly what 21 CFR Part 11 §11.70 requires. Signatures now carry the covered snapshot version and hash, and signature_digest is computed over durable columns only — no timestamp — so an auditor can recompute it from the stored row and detect tampering with the signer, the meaning, the content, or the snapshot binding (ledger C-11 residual 2).',
    );
    R.limitations.push(
      'Authentication uses real HS256-signed JWTs verified by the router itself; only the upstream token-ISSUANCE flow (login/MFA) is outside this journey.',
      'Templates, checklists, exports, permissions and the packager hand-off are not yet in the journey; dossier readiness and eCTD compile are the next phase of Journey A.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(3);
  }, T);
});
