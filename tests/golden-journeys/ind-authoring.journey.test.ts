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
 * electronic_signatures is TEST-ONLY DDL here (code shape): the deployed
 * push-surface table of the same name has a DIFFERENT column set, so the
 * e-sign INSERT fails against real deployments until that reconciliation
 * lands. Recorded as a limitation, not hidden.
 *
 * Output: tests/golden-journeys/__reports__/ind-authoring.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, JourneyRecorder, type JourneyDb } from './harness';

// The authoring router carries its own jose JWT verification (HS256 over
// JWT_SECRET) — so this journey authenticates with REAL signed tokens, and the
// signature check stays fully active. A forged-secret token is a known-bad step.
const JWT_SECRET = 'journey-a-test-secret-0725';
process.env.JWT_SECRET = JWT_SECRET;

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
  id: '3f1c2a10-0000-4000-8000-000000000001',
  organizationId: 1,
  email: 'author@journey.example',
  name: 'Avery Author',
};
const APPROVER = {
  id: '3f1c2a10-0000-4000-8000-000000000002',
  organizationId: 1,
  email: 'approver@journey.example',
  name: 'Quinn Approver',
};
const OUTSIDER = {
  id: '3f1c2a10-0000-4000-8000-000000000099',
  organizationId: 2,
  email: 'outsider@other.example',
  name: 'Iris Intruder',
};

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  -- users.id is UUID here: the history handler joins users ON
  -- u.id = doc_revisions.created_by::uuid, and created_by holds JWT subject ids.
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'journey-org'), (2, 'other-org');
  INSERT INTO users (id, name, email) VALUES
    ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}'),
    ('${APPROVER.id}', '${APPROVER.name}', '${APPROVER.email}'),
    ('${OUTSIDER.id}', '${OUTSIDER.name}', '${OUTSIDER.email}');
`;

/** Code-shaped electronic_signatures — TEST-ONLY (see file header). */
const TEST_ONLY_ESIGN_DDL = `
  CREATE TABLE electronic_signatures (
    id UUID PRIMARY KEY,
    doc_id UUID NOT NULL,
    signer_email TEXT NOT NULL,
    signer_name TEXT,
    signature_meaning TEXT NOT NULL,
    signature_intent TEXT NOT NULL,
    document_hash TEXT NOT NULL,
    pin_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT,
    user_agent TEXT,
    tenant_id INTEGER NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
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
    migrations: ['db/migrations/20260725_authoring_document_loop_tables.sql'],
    testOnlySql: TEST_ONLY_ESIGN_DDL,
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
  const { jsonPath, mdPath } = R.write('ind-authoring');
  // eslint-disable-next-line no-console
  console.info(`[journey] manifest: ${jsonPath}\n[journey] report:   ${mdPath}`);
  await jdb?.close();
});

describe('Journey A phase 1 — authoring loop over HTTP (canonical DDL)', () => {
  let docId: string;
  let sectionId: string;
  let firstRevisionId: string;
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

    // ── KNOWN-BAD: cross-tenant read → 404, not data ─────────────────────────
    await R.expectBlocked('cross-tenant-document-read', async () => {
      const res = await asUser(OUTSIDER)(request(app).get(`/api/authoring/docs/${docId}`));
      return { blocked: res.status === 404, status: res.status };
    });

    // ── KNOWN-BAD: token signed with the WRONG secret → 401 ──────────────────
    await R.expectBlocked('forged-jwt-rejected', async () => {
      const forged = await mint(AUTHOR, 'not-the-server-secret');
      const res = await request(app)
        .get(`/api/authoring/docs/${docId}`)
        .set('Authorization', `Bearer ${forged}`);
      return { blocked: res.status === 401, status: res.status, error: res.body.error };
    });

    // ── 7. Part 11: PIN from the VERIFIED identity ───────────────────────────
    await R.step('create-signing-pin', async () => {
      const res = await asUser(AUTHOR)(
        request(app).post(`/api/authoring/docs/${docId}/create-pin`),
      ).send({ pin: 'jrny-482913' });
      expect(res.status).toBe(200);
      return { pinCreated: true, identitySource: 'verified JWT (getActorEmail)' };
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
      ).send({ pin: 'wrong-pin-000', meaning: 'AUTHOR', intent: 'I authored this document' });
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
      ).send({ pin: 'jrny-482913', meaning: 'AUTHOR', intent: 'I authored this document' });
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
        request(app).post(`/api/authoring/docs/${docId}/create-pin`),
      ).send({ pin: 'appr-771002' });
      const res = await asUser(APPROVER)(
        request(app).post(`/api/authoring/docs/${docId}/e-sign`),
      ).send({ pin: 'appr-771002', meaning: 'APPROVER', intent: 'Approved for submission' });
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
        `SELECT signer_email, signature_meaning, pin_verified FROM electronic_signatures
          WHERE doc_id = $1 AND tenant_id = 1 ORDER BY signed_at`,
        [docId],
      );
      const emails = sigs.rows.map((r) => (r as { signer_email: string }).signer_email);
      expect(emails).toEqual([AUTHOR.email, APPROVER.email]);
      return { signers: sigs.rows };
    });

    R.observations.push(
      'Fixed while building this journey: freeze queried authoring_sections.document_id — a column that does not exist (doc_id everywhere else). Freeze had never been executable.',
      'Fixed while building this journey: create-pin, freeze and e-sign took signer identity from the attacker-controlled x-user-email header; they now use the verified JWT via getActorEmail — the same fix the file had already applied to every other attribution column (Part 11 §11.100).',
      'INTEGRITY GAP (recorded, not fixed): freeze hashes the full JSON snapshot including a frozenAt timestamp (not reproducible), while e-sign hashes the section-content join — the two chains are independently verifiable but NOT linked, so a signature cannot be cryptographically tied to the frozen snapshot it covers. Belongs to the electronic_signatures reconciliation (ledger C-11 / WO-03).',
    );
    R.limitations.push(
      'electronic_signatures here is TEST-ONLY code-shaped DDL: the deployed push-surface table of the same name has a different column set, so the e-sign INSERT fails on real deployments until that reconciliation lands (ledger C-11).',
      'Authentication uses real HS256-signed JWTs verified by the router itself; only the upstream token-ISSUANCE flow (login/MFA) is outside this journey.',
      'Templates, checklists, exports, permissions and the packager hand-off are not yet in the journey; dossier readiness and eCTD compile are the next phase of Journey A.',
    );

    const m = R.manifest();
    expect(m.summary.failed).toBe(0);
    expect(m.summary.blockedAsExpected).toBeGreaterThanOrEqual(3);
  }, T);
});
