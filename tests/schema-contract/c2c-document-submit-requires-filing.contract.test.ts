/**
 * Contract: a governed document cannot be marked 'submitted' by a reason alone.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * POST /api/c2c/documents/:id/submit flipped `status` to 'submitted' and
 * stamped `submitted_at` given nothing but a reason string. No package was
 * assembled, no sequence was dispatched, nothing left the platform — yet the
 * document, and every surface that reads its status, claimed it had been
 * filed. A status of 'submitted' is a regulatory claim, and this route was the
 * one place in the product that could make it without a basis
 * (findings IND-05 / ESTAR-06).
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * The route now demands evidence that a filing happened, on one of two bases:
 *
 *   • `sequenceId` — an ectd_sequences row in the caller's organization that
 *     has actually been dispatched (status 'dispatched', or dispatch_status
 *     'sent' / 'acknowledged'). A draft sequence is not a filing; a sequence
 *     in another organization is not visible and therefore not evidence.
 *   • `externalFiling` — an explicit { channel, reference, filedAt }
 *     attestation for a filing made outside the platform (ESG, CDRH portal,
 *     CESP, courier). It is the operator's assertion, attributed to them.
 *
 * Whichever basis is given is persisted in the governed ledger the route
 * already writes — c2c_ana_actions.payload, hash-chained into audit_logs —
 * beside the actor and the reason, so an inspector can see WHY the status
 * says what it says. Reason stays mandatory; attribution is unchanged.
 *
 * Runs the REAL migrations in PGlite and drives the REAL router over HTTP,
 * because every property here is a database property: what the status column
 * holds afterwards, and what the ledger recorded about it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import supertest from 'supertest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = [
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260528_phase9_document_schema.sql',
  // The submissions spine: submissions → ectd_sequences → submission_leaves.
  'migrations/20260604_submission_core_canonical.sql',
].map((f) => path.join(REPO_ROOT, f));

const ORG = 7;
const OTHER_ORG = 8;
const USER = 42;
const DOC = 'doc_contract_submit';
const PROJECT = '11111111-2222-3333-4444-555555555555';

/** ectd_sequences ids seeded below. */
const SEQ_DRAFT = 100;
const SEQ_DISPATCHED = 101;
const SEQ_DISPATCHED_OTHER_ORG = 102;

let pg: PGlite;

/**
 * The route calls `pool.query` for the membership pre-check and
 * `pool.connect()` for the transaction. PGlite is a single embedded instance, so
 * both are served by it and `release` is a no-op.
 */
vi.mock('../../server/db', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]),
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]),
      release: () => {},
    }),
  },
}));

async function buildApp() {
  const router = (await import('../../server/routes/c2c/documents')).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: USER, organizationId: ORG };
    next();
  });
  app.use('/api/c2c/documents', router);
  return app;
}

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    -- recordGovernedAction writes a hash-chained row in the same transaction as
    -- the status change; provisioned rather than stubbed so the coupling is
    -- part of what is under test.
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
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  for (const f of FILES) await pg.exec(fs.readFileSync(f, 'utf8'));

  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  const pack = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await pg.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, $2, $3, 'ind', 'fda', $4, 'Submit Doc', 'approved', 0)`,
    [DOC, ORG, PROJECT, pack.rows[0].version],
  );

  // One submission per organization, three sequences: a draft and a dispatched
  // one in the caller's org, and a dispatched one that belongs to someone else.
  await pg.query(
    `INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES (1, 'IND', 'ind', 'biotech', 'fda', $1, $3),
            (2, 'IND (other org)', 'ind', 'biotech', 'fda', $2, $3)`,
    [ORG, OTHER_ORG, USER],
  );
  await pg.query(
    `INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, status, dispatch_status, organization_id, created_by)
     VALUES ($1, 1, 'fda', '0000', 'draft',      NULL,           $4, $6),
            ($2, 1, 'fda', '0001', 'dispatched', 'acknowledged', $4, $6),
            ($3, 2, 'fda', '0000', 'dispatched', 'sent',         $5, $6)`,
    [SEQ_DRAFT, SEQ_DISPATCHED, SEQ_DISPATCHED_OTHER_ORG, ORG, OTHER_ORG, USER],
  );
});
afterEach(async () => {
  vi.resetModules();
  await pg?.close();
});

const REASON = 'Sequence 0001 acknowledged by the FDA ESG';

const submit = async (body: Record<string, unknown>) =>
  supertest(await buildApp()).post(`/api/c2c/documents/${DOC}/submit`).send(body);

async function docState() {
  const r = await pg.query<{ status: string; submitted_at: string | null }>(
    `SELECT status, submitted_at FROM c2c_documents WHERE id = $1`,
    [DOC],
  );
  return r.rows[0];
}

/** The governed ledger rows this route writes for the document. */
async function ledger() {
  const r = await pg.query<{ payload: any; proposed_by: number; decision_reason: string }>(
    `SELECT payload, proposed_by, decision_reason FROM c2c_ana_actions
      WHERE command = 'transition' AND target = $1 ORDER BY proposed_at`,
    [`document:${DOC}`],
  );
  return r.rows;
}

describe('POST /:id/submit — a submitted status needs a filing behind it', () => {
  it('REGRESSION: a reason alone no longer files the document', async () => {
    // This is the exact request that used to succeed.
    const res = await submit({ reason: REASON });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('FILING_EVIDENCE_REQUIRED');

    const doc = await docState();
    expect(doc.status).toBe('approved');
    expect(doc.submitted_at).toBeNull();
    // And nothing entered the ledger claiming a transition happened.
    expect(await ledger()).toHaveLength(0);
  }, 60_000);

  it('a sequence that is still draft is not a filing', async () => {
    const res = await submit({ reason: REASON, sequenceId: SEQ_DRAFT });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SEQUENCE_NOT_DISPATCHED');
    expect((await docState()).status).toBe('approved');
    expect(await ledger()).toHaveLength(0);
  }, 60_000);

  it('a dispatched sequence in the caller\'s organization is, and is recorded on the ledger row', async () => {
    const res = await submit({ reason: REASON, sequenceId: SEQ_DISPATCHED });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');

    const doc = await docState();
    expect(doc.status).toBe('submitted');
    expect(doc.submitted_at).not.toBeNull();

    // c2c_documents has no sequence column, and submission_leaves.document_id
    // is an INTEGER that cannot hold a text c2c document id — so the tie lives
    // on the governed ledger row, beside the actor and the reason.
    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.filing.sequence).toMatchObject({
      sequenceId: SEQ_DISPATCHED,
      sequenceNumber: '0001',
      region: 'fda',
      status: 'dispatched',
      dispatchStatus: 'acknowledged',
    });
    expect(rows[0].proposed_by).toBe(USER);
    expect(rows[0].decision_reason).toBe(REASON);
  }, 60_000);

  it('a dispatched sequence from another organization is not visible, so it is not evidence', async () => {
    const res = await submit({ reason: REASON, sequenceId: SEQ_DISPATCHED_OTHER_ORG });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SEQUENCE_NOT_FOUND');
    expect((await docState()).status).toBe('approved');
    expect(await ledger()).toHaveLength(0);
  }, 60_000);

  it('an explicit external-filing attestation is accepted and persisted with actor and reason', async () => {
    const externalFiling = {
      channel: 'esg',
      reference: 'ESG-CORE-2026-0902-000123',
      filedAt: '2026-09-02T14:05:00.000Z',
    };
    const res = await submit({ reason: REASON, externalFiling });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('submitted');
    expect((await docState()).status).toBe('submitted');

    const rows = await ledger();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.filing.external).toEqual(externalFiling);
    expect(rows[0].proposed_by).toBe(USER);
    expect(rows[0].decision_reason).toBe(REASON);

    // The same write is hash-chained into audit_logs, attributed to the actor.
    const audit = await pg.query<{ actor_id: string; reason: string; action: string }>(
      `SELECT actor_id, reason, action FROM audit_logs WHERE target = $1`,
      [`document:${DOC}`],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      actor_id: String(USER),
      reason: REASON,
      action: 'c2c.work.transition',
    });
  }, 60_000);

  it('an attestation without a reference is refused', async () => {
    const res = await submit({
      reason: REASON,
      externalFiling: { channel: 'cdrh-portal', filedAt: '2026-09-02T14:05:00Z' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/externalFiling\.reference/);
    expect((await docState()).status).toBe('approved');
    expect(await ledger()).toHaveLength(0);
  }, 60_000);

  it('the reason is still mandatory, even with evidence', async () => {
    const res = await submit({ sequenceId: SEQ_DISPATCHED });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('reason required');
    expect((await docState()).status).toBe('approved');
  }, 60_000);
});
