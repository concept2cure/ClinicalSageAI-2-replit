/**
 * Audit Trail Ledger — F-2 (VSR-001): a governed write appears in the ledger.
 *
 * Runs the real route against in-process PGlite: audit_logs from the shared
 * fixture + migrations/20260921_audit_logs_chain_seq.sql, a minimal
 * audit_events with its chain columns, and the real chained writer
 * (writeChainedAuditRow → computeAuditChainSealed) for the governed row.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

vi.mock('../../db', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  getPool: () => ({ query: vi.fn(), connect: vi.fn() }),
  query: vi.fn(),
  db: {},
}));

import { writeChainedAuditRow } from '../../services/auditService';
import createAuditTrailLedgerRoutes, { readAuditLedger, type AuditLedgerEntry } from '../audit-trail-ledger.routes';
import { verifyAuditChain } from '../../services/audit/chain';
import type { PoolClient } from 'pg';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations/20260921_audit_logs_chain_seq.sql',
);

const FIXTURE = `
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason text;
CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, name text, email text);
CREATE TABLE IF NOT EXISTS audit_events (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL,
  event_type varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id integer NOT NULL,
  user_id integer,
  user_name text NOT NULL,
  ip_address text,
  "timestamp" timestamp DEFAULT now() NOT NULL,
  reason text,
  signature_status varchar(50),
  signature_meaning text,
  metadata json,
  record_hash text,
  previous_hash text,
  sequence_number integer
);
INSERT INTO users (id, name, email) VALUES (11, 'Rita Reviewer', 'rita@example.test');
`;

let pglite: PGlite;
const ORG = 7;
const OTHER_ORG = 8;

/** A pg.Pool stand-in over PGlite: the route only needs connect() → { query, release }. */
function poolOverPglite(): Pick<Pool, 'connect'> {
  return {
    connect: (async () => ({
      query: (sql: string, params?: unknown[]) => pglite.query(sql, params),
      release: () => undefined,
    })) as unknown as Pool['connect'],
  };
}

function pgliteClient(): PoolClient {
  return { query: (sql: string, params?: unknown[]) => pglite.query(sql, params) } as unknown as PoolClient;
}

function appFor(user: { organizationId?: number; role?: string } | null) {
  const app = express();
  app.use((req, _res, next) => {
    // An organisation admin unless a case says otherwise: the ledger is read by
    // owners, admins and managers (P1-20).
    if (user) (req as express.Request & { user?: unknown }).user = { id: 11, role: 'admin', ...user };
    next();
  });
  app.use(
    '/api/audit-trail',
    createAuditTrailLedgerRoutes(poolOverPglite(), {
      // The route verifies on a super-admin scope; over PGlite one client
      // sees every tenant, which is what that scope means here.
      verifyTenantChain: (orgId) => verifyAuditChain(pgliteClient(), { tenantId: orgId }),
    }),
  );
  return app;
}

/** The launch apps' governed write, exactly as they issue it: inside a transaction. */
async function governedWrite(orgId: number, action: string, details: Record<string, unknown>): Promise<void> {
  await pglite.transaction(async (tx) => {
    await writeChainedAuditRow(tx, {
      tenantId: orgId,
      userId: 11,
      action,
      resourceType: 'vault_document',
      resourceId: 'doc-42',
      details,
      ipAddress: '10.0.0.5',
    });
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await pglite.exec(fs.readFileSync(MIGRATION, 'utf8'));
  await pglite.exec(FIXTURE);
});
afterAll(async () => {
  await pglite.close();
});
beforeEach(async () => {
  await pglite.exec('DELETE FROM audit_logs; DELETE FROM audit_events;');
});

describe('GET /api/audit-trail/ledger', () => {
  it('shows a governed write the moment it is chained (audit_logs), labelled by source', async () => {
    await governedWrite(ORG, 'vault.document.ingest', { description: 'Ingested protocol v3', meaning: 'Authorship' });
    await governedWrite(ORG, 'c2c.work.sign', { title: 'Signed CSR section 9' });

    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sources).toEqual({ audit_logs: 2, audit_events: 0 });
    // The verdict is the server verifier's, over the tenant's whole chain.
    expect(res.body.meta.chain).toMatchObject({ store: 'audit_logs', ok: true, rowsChecked: 2, sequencedRows: 2, legacyRows: 0 });
    expect(res.body.meta.chain.brokenAt).toBeUndefined();
    const data: AuditLedgerEntry[] = res.body.data;
    expect(data).toHaveLength(2);

    const stored = await pglite.query<{ id: string; sha256_chain: string; chain_seq: string }>(
      'SELECT id, sha256_chain, chain_seq FROM audit_logs ORDER BY chain_seq',
    );
    const [first, second] = stored.rows;

    // Newest first; hash/prevHash are the REAL chain values in the tenant's order.
    expect(data[0]).toMatchObject({
      id: `AUD-${second.id}`,
      source: 'audit_logs',
      seq: Number(second.chain_seq),
      hash: second.sha256_chain,
      prevHash: first.sha256_chain,
      kind: 'esign',
      event: 'Signed CSR section 9',
      actor: 'Rita Reviewer',
      target: 'vault_document:doc-42',
      ip: '10.0.0.5',
      sig: false,
    });
    expect(data[1]).toMatchObject({
      id: `AUD-${first.id}`,
      source: 'audit_logs',
      hash: first.sha256_chain,
      prevHash: 'genesis',
      kind: 'vault',
      event: 'Ingested protocol v3',
      meaning: 'Authorship',
    });
    expect(data[0].when).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    // The surface's own link check holds over a per-tenant chain.
    expect(data[0].prevHash).toBe(data[1].hash);
  });

  it('never shows another tenant\'s governed writes (organisation from the verified JWT)', async () => {
    await governedWrite(ORG, 'vault.document.ingest', {});
    await governedWrite(OTHER_ORG, 'vault.document.ingest', {});

    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger?organizationId=8');
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual({ audit_logs: 1, audit_events: 0 });
    const other = await pglite.query<{ sha256_chain: string }>('SELECT sha256_chain FROM audit_logs WHERE tenant_id = $1', [OTHER_ORG]);
    expect(res.body.data.map((e: AuditLedgerEntry) => e.hash)).not.toContain(other.rows[0].sha256_chain);
    // The tenant is stamped on the transaction the read runs in (RLS sees it).
    const stamped = await pglite.query<{ v: string }>("SELECT current_setting('app.current_tenant_id', true) AS v");
    expect(stamped.rows[0].v).toBe(''); // transaction-local: gone after COMMIT
  });

  it('merges audit_events (SCIM / projects-management / IVDR) newest-first with their own chain values', async () => {
    await governedWrite(ORG, 'vault.document.ingest', {});
    await pglite.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, "timestamp",
                                 signature_status, signature_meaning, record_hash, previous_hash, sequence_number)
       VALUES ($1, 'user.provisioned', 'user', 3, 'SCIM', now() + interval '1 minute', 'signed', 'Approval', $2, NULL, 1)`,
      [ORG, 'e'.repeat(64)],
    );

    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual({ audit_logs: 1, audit_events: 1 });
    expect(res.body.data[0]).toMatchObject({ source: 'audit_events', hash: 'e'.repeat(64), prevHash: 'genesis', sig: true, meaning: 'Approval', actor: 'SCIM', seq: 1 });
    expect(res.body.data[1]).toMatchObject({ source: 'audit_logs' });
  });

  it('applies limit across both stores', async () => {
    for (let i = 0; i < 3; i++) await governedWrite(ORG, `vault.document.ingest.${i}`, {});
    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.sources).toEqual({ audit_logs: 2, audit_events: 0 });
    // The verdict covers the whole chain, not the two-row window.
    expect(res.body.meta.chain).toMatchObject({ ok: true, rowsChecked: 3 });
  });

  it('refuses a member (403) before reading anything: the ledger names every user in the organisation', async () => {
    const res = await request(appFor({ organizationId: 1, role: 'member' })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'AUDIT_READ_RESTRICTED' });
  });

  it('refuses without tenant context (403) rather than reading anything', async () => {
    await governedWrite(ORG, 'vault.document.ingest', {});
    const res = await request(appFor(null)).get('/api/audit-trail/ledger');
    expect(res.status).toBe(403);
  });

  it('fails closed (503, not an empty ledger) when the chained schema is missing', async () => {
    await governedWrite(ORG, 'vault.document.ingest', {});
    const scratch = new PGlite();
    try {
      await scratch.exec(`CREATE TABLE audit_events (id serial PRIMARY KEY, organization_id integer, record_hash text)`);
      await expect(readAuditLedger(scratch as unknown as Pick<import('pg').PoolClient, 'query'>, ORG, 10)).rejects.toMatchObject({ code: '42P01' });
    } finally {
      await scratch.close();
    }
  });
});

describe('GET /api/audit-trail/ledger — the verdict sees cross-tenant legacy links', () => {
  it("verifies a legacy row that linked to ANOTHER tenant's head (the pre-fix global recipe)", async () => {
    // Two legacy rows written by the old recipe on an unscoped connection:
    // tenant 8 first, then tenant 7 deriving from tenant 8's hash (the global
    // head it saw). A one-tenant verdict for 7 must accept that link — the
    // ledger surface was showing "Chain verification failed" on exactly this.
    // The walker's own derivation keeps the fixture honest to the recipe.
    const { deriveChainHash } = await import('../../services/audit/chain');
    const { GENESIS_PREVIOUS_HASH } = await import('../../services/audit/audit-hmac-seal');
    const a = { id: 'legacy-a', tenant_id: OTHER_ORG, action: 'x.a', actor_id: 1, target: 't:a', payload_hash: 'p-a', occurred_at: '2026-01-01T00:00:00.000Z' };
    const b = { id: 'legacy-b', tenant_id: ORG, action: 'x.b', actor_id: 1, target: 't:b', payload_hash: 'p-b', occurred_at: '2026-01-01T00:00:01.000Z' };
    const hashA = deriveChainHash(a as never, GENESIS_PREVIOUS_HASH);
    const hashB = deriveChainHash(b as never, hashA);
    for (const [r, h] of [[a, hashA], [b, hashB]] as const) {
      await pglite.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, table_name, record_id, actor_id, target, payload_hash, sha256_chain, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [r.id, r.tenant_id, 11, r.action, 'audit_test', r.id, r.actor_id, r.target, r.payload_hash, h, r.occurred_at],
      );
    }
    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(200);
    expect(res.body.meta.chain).toMatchObject({ ok: true, legacyRows: 1, rowsChecked: 1 });
  });
});
