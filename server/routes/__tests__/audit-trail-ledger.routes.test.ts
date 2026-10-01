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
import createAuditTrailLedgerRoutes, { readAuditLedger, readRecordAuditHistory, type AuditLedgerEntry } from '../audit-trail-ledger.routes';
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
async function governedWrite(orgId: number, action: string, details: Record<string, unknown>, userId = 11): Promise<void> {
  await pglite.transaction(async (tx) => {
    await writeChainedAuditRow(tx, {
      tenantId: orgId,
      userId,
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
  // The ledger resolves actor names through public.actor_name (D3 2026-09-29,
  // migrations/20260929_actor_names.sql), applied from the real file; it reads
  // organization_users, so a minimal one stands in. No enforcement is set here,
  // so it names every account, as the users join it replaced did.
  await pglite.exec('CREATE TABLE IF NOT EXISTS organization_users (user_id integer, organization_id integer);');
  await pglite.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260929_actor_names.sql'), 'utf8'));
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

/* ── F-42 (VSR-001 §18) ──────────────────────────────────────────────────────
   The ledger named the account that acted by its display name alone, and a
   display name is not an identity. In the 2026-09-27 execution the run
   identity and the demo account were both "JM Smith", and the entry for the
   program the run created could not say which of them created it. */
describe('GET /api/audit-trail/ledger — an entry names the account that acted (F-42)', () => {
  it('tells apart two accounts that share a display name', async () => {
    await pglite.exec(`INSERT INTO users (id, name, email) VALUES (12, 'Rita Reviewer', 'rita.two@example.test') ON CONFLICT (id) DO NOTHING`);
    await governedWrite(ORG, 'vault.document.ingest', { description: 'Ingested by the first account' }, 11);
    await governedWrite(ORG, 'vault.document.ingest', { description: 'Ingested by the second account' }, 12);

    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(200);
    const data: AuditLedgerEntry[] = res.body.data;
    const by = (event: string) => data.find((e) => e.event === event);
    expect(by('Ingested by the first account')).toMatchObject({ actor: 'Rita Reviewer', actorRef: 'user:11' });
    expect(by('Ingested by the second account')).toMatchObject({ actor: 'Rita Reviewer', actorRef: 'user:12' });
  });

  it('names the account on an audit_events entry too, and names none for the system', async () => {
    await pglite.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, record_hash, sequence_number)
       VALUES ($1, 'projects.update', 'project', 1, 11, 'Rita Reviewer', $2, 1),
              ($1, 'scim.sync', 'user', 2, NULL, 'SCIM', $3, 2)`,
      [ORG, 'a'.repeat(64), 'b'.repeat(64)],
    );
    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(200);
    const events = (res.body.data as AuditLedgerEntry[]).filter((e) => e.source === 'audit_events');
    expect(events.find((e) => e.actor === 'Rita Reviewer')?.actorRef).toBe('user:11');
    expect(events.find((e) => e.actor === 'SCIM')?.actorRef).toBeNull();
  });
});

/* #24 (launch sweep finding 53's remainder, 2026-09-28). audit_logs carries no
   signature column, so the ledger reported sig=false for every audit_logs row —
   including an SOP made effective under password re-authentication, which read
   "C2c Work Approve", unsigned, no meaning, no address. The signature row names
   its audit row (electronic_signatures.signature_manifest.auditId; an authoring
   e-sign records its signatureId), and the ledger now joins on exactly that. */
describe('GET /api/audit-trail/ledger — a signed act shows as signed, from its signature row', () => {
  const SIG_FIXTURE = `
    CREATE TABLE IF NOT EXISTS electronic_signatures (
      id serial PRIMARY KEY, organization_id integer, signature_type text, signature_meaning text,
      signer_name text, ip_address text, signature_manifest json);
    CREATE TABLE IF NOT EXISTS authoring_signatures (
      id uuid PRIMARY KEY, doc_id uuid, tenant_id integer, meaning text, signer_name text, ip_address text);
    CREATE TABLE IF NOT EXISTS authoring_documents (id uuid PRIMARY KEY, tenant_id integer, title text);`;
  const DOC = '6f1c2b1e-0a4d-4c7e-9f3a-111111111111';
  const SIG = '9b2e7c55-3d1f-4b8a-8e6c-222222222222';

  beforeAll(async () => {
    await pglite.exec(SIG_FIXTURE);
  });
  beforeEach(async () => {
    await pglite.exec('DELETE FROM electronic_signatures; DELETE FROM authoring_signatures; DELETE FROM authoring_documents;');
  });

  async function write(action: string, resourceType: string, resourceId: string, details: Record<string, unknown>): Promise<string> {
    await pglite.transaction(async (tx) => {
      await writeChainedAuditRow(tx, { tenantId: ORG, userId: 11, action, resourceType, resourceId, details });
    });
    const r = await pglite.query<{ id: string }>('SELECT id FROM audit_logs ORDER BY chain_seq DESC LIMIT 1');
    return r.rows[0].id;
  }
  const ledger = async () => {
    const res = await request(appFor({ organizationId: ORG })).get('/api/audit-trail/ledger');
    expect(res.status).toBe(200);
    return res.body.data as AuditLedgerEntry[];
  };

  it('an SOP approval: signed, the declared meaning, the act and the document named, linked to its signature row', async () => {
    const auditId = await write('c2c.work.approve', 'qms-document', '1', {});
    await pglite.query(
      `INSERT INTO electronic_signatures (organization_id, signature_type, signature_meaning, signer_name, ip_address, signature_manifest)
       VALUES ($1, 'qms-document-approval', 'APPROVED', 'Rae Okafor', '10.1.2.3', $2)`,
      [ORG, JSON.stringify({ auditId, docNumber: 'C2C-SOP-001', version: '1.0' })],
    );
    const [e] = await ledger();
    expect(e).toMatchObject({
      id: `AUD-${auditId}`,
      sig: true,
      kind: 'esign',
      meaning: 'APPROVED',
      event: 'Controlled document approved (e-signature)',
      target: 'C2C-SOP-001 v1.0',
      targetRef: 'qms-document:1',
      ip: '10.1.2.3',
    });
    expect(e.signatureRef).toMatch(/^electronic_signatures:\d+$/);
  });

  it('a document e-sign: signed, by the signature the row records — for that document only', async () => {
    await pglite.query(
      `INSERT INTO authoring_signatures (id, doc_id, tenant_id, meaning, signer_name) VALUES ($1, $2, $3, 'REVIEWER', 'Rae Okafor')`,
      [SIG, DOC, ORG],
    );
    await pglite.query(`INSERT INTO authoring_documents (id, tenant_id, title) VALUES ($1, $2, 'Module 2.5 Clinical Overview')`, [DOC, ORG]);
    const signed = await write('authoring.document.e-sign', 'authoring_document', DOC, { meaning: 'REVIEWER', signatureId: SIG });
    // The same signature id recorded against a different document links nothing.
    const other = await write('authoring.document.e-sign', 'authoring_document', '00000000-0000-0000-0000-000000000000', { meaning: 'REVIEWER', signatureId: SIG });
    const data = await ledger();
    expect(data.find((e) => e.id === `AUD-${signed}`)).toMatchObject({
      sig: true, meaning: 'REVIEWER', event: 'Document e-signed', signatureRef: `authoring_signatures:${SIG}`,
      target: 'Module 2.5 Clinical Overview',
      targetRef: `authoring_document:${DOC}`,
    });
    expect(data.find((e) => e.id === `AUD-${other}`)).toMatchObject({ sig: false, signatureRef: null });
  });

  it('claims nothing it cannot link: no signature row, or another organisation’s, leaves the row unsigned', async () => {
    const unsigned = await write('c2c.work.approve', 'qms-document', '2', {});
    const foreign = await write('c2c.work.approve', 'qms-document', '3', {});
    await pglite.query(
      `INSERT INTO electronic_signatures (organization_id, signature_type, signature_meaning, signer_name, signature_manifest)
       VALUES ($1, 'qms-document-approval', 'APPROVED', 'Someone Else', $2)`,
      [OTHER_ORG, JSON.stringify({ auditId: foreign, docNumber: 'X-1', version: '1.0' })],
    );
    const data = await ledger();
    for (const id of [unsigned, foreign]) {
      expect(data.find((e) => e.id === `AUD-${id}`)).toMatchObject({ sig: false, signatureRef: null, event: 'C2c Work Approve' });
    }
  });
});

/**
 * Reporting review 2026-10-01, SECURITY-8: the ledger and a record's history
 * returned the verifier's raw break, which can name another organisation's row
 * by id and tenant number with its hashes (the walk loads other tenants' legacy
 * rows as context), and told an organisation with no chained rows `ok: true`.
 * The exports already redacted and said "not verified"; these readers state the
 * same verdict through the same function (audited-export.ts tenantChainVerdict).
 */
describe('the chain verdict the ledger readers state (SECURITY-8)', () => {
  const none = { query: async () => ({ rows: [] }) } as unknown as Pick<PoolClient, 'query'>;
  const walk = (over: Record<string, unknown>) => async () => ({ ok: true, rowsChecked: 4, tenants: 2, legacyRows: 4, sequencedRows: 0, ...over }) as never;
  const readers = [
    ['the ledger', (v: ReturnType<typeof walk>) => readAuditLedger(none, ORG, 10, v)],
    ["a record's history", (v: ReturnType<typeof walk>) => readRecordAuditHistory(none, ORG, { tableName: 'vault_document', recordId: 'd1' }, v)],
  ] as const;

  it.each(readers)("%s names nothing of another organisation's in a break", async (_label, read) => {
    const brokenAt = { id: 'theirs-row', expected: 'e'.repeat(64), stored: 'f'.repeat(64), tenantId: OTHER_ORG, segment: 'legacy', commitsTo: { id: 'theirs-prev', tenantId: OTHER_ORG } };
    const { meta } = await read(walk({ ok: false, brokenAt }));
    expect(meta.chain).toMatchObject({ ok: false, brokenAt: { segment: 'legacy', row: 'another organization', commitsTo: 'another organization' } });
    expect(JSON.stringify(meta.chain)).not.toMatch(/theirs|eeee|ffff|"tenantId"/);
  });

  it.each(readers)('%s still names this organisation\'s own broken row', async (_label, read) => {
    const brokenAt = { id: 'ours-row', expected: 'e'.repeat(64), stored: 'f'.repeat(64), tenantId: ORG, segment: 'sequenced', commitsTo: null };
    expect((await read(walk({ ok: false, brokenAt }))).meta.chain.brokenAt).toEqual({ segment: 'sequenced', id: 'ours-row', expected: 'e'.repeat(64), stored: 'f'.repeat(64), commitsTo: null });
  });

  it.each(readers)('%s states a walk over no chained rows as not verified, never ok', async (_label, read) => {
    const { meta } = await read(walk({ rowsChecked: 0, legacyRows: 0 }));
    expect(meta.chain).toMatchObject({ store: 'audit_logs', ok: null, rowsChecked: 0, reason: expect.stringMatching(/no chain to verify/) });
  });
});
