/**
 * A frozen document is placed into its filing (sales rehearsal 2026-11-10, finding B1).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Freeze accepted the Nonclinical Overview; Place into filing then answered 409
 * INDEPENDENT_CHECK_REQUIRED for the same document. Both run the one release rule
 * (workflow-import-governance.ts assertWorkflowImportRelease), which re-derives each
 * chained ledger row's hash from its occurred_at. Freeze reads on a node-postgres
 * client, where a timestamptz is a Date. Placement reads on the request's Drizzle
 * transaction, and Drizzle's node-postgres driver asks pg to return a timestamptz as
 * its raw text. The text hashed differently from the Date the writer hashed, every
 * chained row read as broken, and the ledger's catch-all said "independent checks
 * are missing". The suites never saw it: their request clients ignore the driver's
 * `types` option, so they returned Dates where PostgreSQL returns text.
 *
 * ── What is pinned here ──────────────────────────────────────────────────────
 *   - the request client honours the driver's `types` option, as pg does;
 *   - a frozen, sealed document whose rows the real writer chained is placed (201);
 *   - a ledger that cannot be read answers 503 in words, not 409;
 *   - a chained row that no longer derives is still refused 409 (the rule holds).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import type { IndPgliteDb } from '../../../db/pglite-harness';
import { expandRoleClaims } from '../../../middleware/auth';
import { writeAuthoringAuditTrail } from '../../authoring/authoring-evidence';
import {
  createCurrentSnapshotFixture, grantSnapshotDocumentView, installCurrentSnapshotActor,
} from '../../../routes/__tests__/_coauthor-current-source-fixture';

const state = vi.hoisted(() => ({ fixture: null as IndPgliteDb | null, failLedgerRead: false }));
vi.mock('../../../db', () => ({
  get db() { return state.fixture?.db; },
  pool: { query: async (sql: string, params?: unknown[]) => state.fixture!.pglite.query(sql, params) },
  transaction: async (callback: (q: unknown) => Promise<unknown>) => state.fixture!.pglite.transaction((q) => callback(q)),
  getPool: () => ({ query: async (sql: string, params?: unknown[]) => state.fixture!.pglite.query(sql, params) }),
}));
vi.mock('../../../auth', () => ({ authMiddleware: ((_req, _res, next) => next()) as RequestHandler }));

const ORG = 7;
/** Fresh per test: the trail and the chain are append-only (they cannot be truncated). */
let SOURCE = '';
let SECTION = '';
const BODY = '<p>The nonclinical programme supports the proposed first-in-human dose.</p>';
const pg = (): PGlite => state.fixture!.pglite;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** OIDs pg's driver lets a caller override: timestamptz, timestamp, date. */
const DRIVER_TYPED = [1184, 1114, 1082];
type DriverQuery = string | { text: string; rowMode?: string; types?: { getTypeParser: (oid: number, format?: string) => (v: string) => unknown } };

/**
 * The request's pinned connection, answering as node-postgres does: a query config's `types` is honoured, so a
 * Drizzle query gets a timestamptz as PostgreSQL's text ("2026-11-10 11:30:01.754+00"), not a Date.
 */
function pgFaithfulRequestClient(db: PGlite) {
  return {
    async query(input: DriverQuery, params?: unknown[]) {
      const sql = typeof input === 'string' ? input : input.text;
      if (state.failLedgerRead && /FULL OUTER JOIN chains/.test(sql)) throw new Error('relation "audit_logs" is not readable');
      const types = typeof input === 'string' ? undefined : input.types;
      const parsers = types ? Object.fromEntries(DRIVER_TYPED.map((oid) => [oid, types.getTypeParser(oid, 'text')])) : undefined;
      const rowMode = typeof input !== 'string' && input.rowMode === 'array' ? 'array' as const : undefined;
      const result = await db.query(sql, params, { ...(rowMode ? { rowMode } : {}), ...(parsers ? { parsers } : {}) });
      return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
    },
  };
}

const place = () => request(app).post('/api/coauthor/documents').send({
  sourceAuthoringDocId: SOURCE, moduleNumber: '2.4', title: 'Nonclinical Overview',
  changeReason: 'Placing the frozen overview into sequence 0000',
});

/** The section's creation, written as the editor writes it: the trail row and its chained entry, on one connection. */
async function chainedCreation(): Promise<void> {
  // In a transaction, as every enlisted writer runs: the chain position is transaction-local (set_config(…, true)).
  await pg().transaction(async (tx) => {
  const executor = { query: (text: string, params?: unknown[]) => tx.query(text, params) };
  await writeAuthoringAuditTrail({ tenantId: ORG, actorId: '1', actorEmail: 'author@example.invalid', actorRole: 'author',
    ipAddress: '127.0.0.1', userAgent: 'vitest', pool: { query: async () => ({ rows: [] }) } as never },
  { docId: SOURCE, sectionId: SECTION, operationType: 'CREATE', beforeContent: null, afterContent: BODY,
    changeReason: 'Section created', metadata: { section_code: '2.4' }, executor: executor as never });
  });
  const chained = await pg().query<{ chain_seq: string | null }>(
    "SELECT chain_seq::text FROM audit_logs WHERE new_values->>'docId' = $1", [SOURCE]);
  expect(chained.rows.map((row) => row.chain_seq === null), 'the creation is a sequenced chain row').toEqual([false]);
}

/** Freeze's seal: what the copy is held to. */
async function seal(): Promise<void> {
  const doc = (await pg().query('SELECT * FROM authoring_documents WHERE id=$1', [SOURCE])).rows[0];
  const sections = (await pg().query('SELECT * FROM authoring_sections WHERE doc_id=$1 ORDER BY order_index', [SOURCE])).rows;
  const frozen = JSON.stringify({ document: doc, sections, frozenAt: new Date().toISOString() });
  await pg().query(`INSERT INTO frozen_documents(document_id,version,frozen_content,content_hash,tenant_id)
    VALUES($1,'v1.0.frozen',$2,$3,$4)`, [SOURCE, frozen, sha(frozen), ORG]);
}

let app: express.Express;
beforeAll(async () => {
  state.fixture = await createCurrentSnapshotFixture();
  for (const file of ['migrations/20260814d_document_alias_map.sql', 'db/migrations/20260725_authoring_audit_trail.sql',
    'migrations/20260921_audit_logs_chain_seq.sql']) {
    await pg().exec(readFileSync(resolve(__dirname, '../../../../', file), 'utf8'));
  }
  // V-W1-3: a session whose time zone is not UTC. The ledger must still read occurred_at as the UTC ISO text the writer hashed.
  await pg().exec("SET TIME ZONE 'America/New_York'");
  await installCurrentSnapshotActor(pg(), { organizationId: ORG, userId: 1, role: 'member', email: 'author@example.invalid' });
  app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 1, userId: 1, organizationId: ORG, role: 'admin', roles: expandRoleClaims('admin', undefined) } as never;
    Object.assign(req, { dbClient: pgFaithfulRequestClient(pg()) });
    next();
  });
  app.use('/api/coauthor', (await import('../../../routes/coauthor')).default);
}, 90_000);

beforeEach(async () => {
  state.failLedgerRead = false;
  SOURCE = randomUUID(); SECTION = randomUUID();
  await pg().exec(`TRUNCATE coauthor_document_versions,coauthor_documents,c2c_document_aliases,audit_events,doc_permissions,
    frozen_documents`);
  await pg().query(`INSERT INTO authoring_documents(id,tenant_id,status,title,module,created_by)
    VALUES($1,$2,'FROZEN','Nonclinical Overview (2.4)','M2','1')`, [SOURCE, ORG]);
  await pg().query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,content,order_index)
    VALUES($1,$2,$3,'2.4','Nonclinical Overview',$4,1)`, [SECTION, SOURCE, ORG, BODY]);
  await grantSnapshotDocumentView(pg(), { organizationId: ORG, userId: 1, documentId: SOURCE });
  await chainedCreation();
  await seal();
});
afterAll(async () => { await state.fixture?.close(); });

describe('a frozen document is placed into its filing', () => {
  it('the request client answers a timestamptz as text, as PostgreSQL does through Drizzle', async () => {
    const client = pgFaithfulRequestClient(pg());
    const typed = await client.query({ text: 'SELECT occurred_at FROM audit_logs LIMIT 1', types: { getTypeParser: () => (v: string) => v } });
    const row = typed.rows[0] as { occurred_at: unknown };
    expect(typeof row.occurred_at).toBe('string');
  });

  it('places a frozen, sealed document whose section creation is chained', async () => {
    const res = await place();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.document.content).toContain('first-in-human dose');
  });

  it('a ledger that cannot be read answers 503 in words, and nothing is written', async () => {
    state.failLedgerRead = true;
    const res = await place();
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toBe('INDEPENDENT_CHECK_LEDGER_UNREADABLE');
    expect(res.body.message).toMatch(/could not be read/);
    expect(res.body.message).not.toMatch(/audit_logs|relation|SELECT/);
    expect((await pg().query('SELECT count(*)::int AS n FROM coauthor_documents')).rows[0]).toEqual({ n: 0 });
  });

  it('a chained row that no longer derives is still refused 409', async () => {
    await pg().query("UPDATE audit_logs SET occurred_at = occurred_at - interval '1 second' WHERE new_values->>'docId' = $1", [SOURCE]);
    const res = await place();
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('INDEPENDENT_CHECK_REQUIRED');
  });
});
