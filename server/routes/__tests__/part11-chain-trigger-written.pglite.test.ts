/**
 * AUD-02 (client administration walk, 2026-11-10): a chain the product wrote
 * must verify intact, and a changed row must still read broken.
 *
 * The walker exported the audit trail three times in a new organisation. The
 * audit trail's header then read "Audit-event chain verification failed · 3
 * broken links over 3 entries". The three rows were sound: re-computing the
 * database trigger's own formula in SQL matched every record_hash.
 *
 * The verifier rebuilt the trigger's input in JavaScript. The trigger hashes
 * `timestamp::text`, and audit_events.timestamp is `timestamp without time
 * zone` written by NOW() with microseconds ("2026-11-10 07:26:03.891025"). The
 * verifier hashed an ISO string cut to milliseconds with "+00" appended, or
 * `String(Date)`. Neither is the trigger's input, so every row a trigger hashed
 * read as a broken link.
 *
 * Real SQL on PGlite: the canonical audit_events columns (0000_sweet_joseph.sql),
 * the real trigger migration (db/migrations/20260222_audit_events_hash_chain.sql),
 * rows written by the real signed export, read by the real route.
 */
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import router from '../part11-compliance';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';
import { generateSignedAuditExport } from '../../services/audit/signedAuditExport';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ORG = 7;

let pg: PGlite;
const client = {
  query: async (text: string, params?: unknown[]) => {
    const r = await pg.query(text, params as unknown[]);
    return { rows: r.rows as any[], rowCount: r.rows.length };
  },
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.dbClient = client;
    req.user = { id: 5, organizationId: ORG, roles: ['admin'], role: 'admin' };
    req.tenantContext = { organizationId: ORG };
    next();
  });
  app.use('/api/part11', router);
  return app;
}

const verdict = async () => {
  const res = await request(makeApp()).get('/api/part11/audit-trail/chain-integrity');
  expect(res.status).toBe(200);
  return res.body.data;
};

const exportOnce = () =>
  generateSignedAuditExport(
    client as never,
    { organizationId: ORG, format: 'json', exportedBy: 'walk2.owner@example.test', exportedByRole: 'admin' },
    { verifyAuditLogsChain: async () => ({ ok: true, rowsChecked: 0, legacyRows: 0, sequencedRows: 0 }) as never },
  );

beforeAll(async () => {
  process.env.AUDIT_EXPORT_SIGNING_KEY = 'test-export-key';
  pg = new PGlite();
  // audit_events as 0000_sweet_joseph.sql creates it (the columns the trigger,
  // the export and the verifier touch; `timestamp` is WITHOUT time zone there).
  await pg.exec(`CREATE TABLE audit_events (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL,
    event_type VARCHAR(100) NOT NULL, entity_type VARCHAR(100) NOT NULL, entity_id INTEGER NOT NULL,
    user_id INTEGER, user_name TEXT NOT NULL, user_role TEXT, session_id TEXT, ip_address TEXT,
    "timestamp" TIMESTAMP NOT NULL DEFAULT now(), old_values JSON, new_values JSON, changed_fields JSON,
    reason TEXT, comments TEXT, regulatory_significant BOOLEAN DEFAULT false, gxp_relevant BOOLEAN DEFAULT false,
    metadata JSON, created_at TIMESTAMP NOT NULL DEFAULT now());`);
  // The export also reads audit_logs (signed-export-audit-logs.pglite.test.ts does the same).
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'migrations/20260921_audit_logs_chain_seq.sql'), 'utf8'));
  await pg.exec(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
                 ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();`);
  await pg.exec(fs.readFileSync(path.join(ROOT, 'db/migrations/20260222_audit_events_hash_chain.sql'), 'utf8'));
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM audit_events'); });

describe('a chain the product wrote verifies intact (AUD-02)', () => {
  it('three signed exports, each recorded by the trigger, verify as an intact chain of three', async () => {
    await exportOnce();
    await exportOnce();
    await exportOnce();
    const rows = (await pg.query<{ ts: string; record_hash: string | null }>(
      `SELECT "timestamp"::text AS ts, record_hash FROM audit_events WHERE organization_id = $1 ORDER BY sequence_number`, [ORG])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.record_hash ?? '')), 'the trigger hashed every row').toBe(true);

    const data = await verdict();
    expect(data.brokenLinkDetails, 'no row the trigger wrote is a broken link').toEqual([]);
    expect(data.chainStatus).toBe('intact');
    expect(data.integrityValid).toBe(true);
    expect(data.totalEntries).toBe(3);
    expect(data.verifiedEntries).toBe(3);
    expect(data.brokenLinks).toBe(0);
  });

  it('a row written with a microsecond timestamp verifies (the case the walk hit)', async () => {
    await pg.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, "timestamp", reason)
       VALUES ($1, 'audit.export', 'audit_export', 0, 'walk2.owner@example.test', '2026-11-10 07:26:03.891025', 'r')`, [ORG]);
    const data = await verdict();
    expect(data.chainStatus).toBe('intact');
    expect(data.verifiedEntries).toBe(1);
  });

  it('a changed reason on a written row still reads BROKEN: the verifier is not lenient', async () => {
    await exportOnce();
    await exportOnce();
    await exportOnce();
    await pg.query(`UPDATE audit_events SET reason = reason || ' (edited)' WHERE organization_id = $1 AND sequence_number = 2`, [ORG]);
    const data = await verdict();
    expect(data.chainStatus).toBe('broken');
    expect(data.integrityValid).toBe(false);
    expect(data.brokenLinks).toBe(1);
    expect(data.brokenLinkDetails[0].sequenceNumber).toBe(2);
  });

  it('a changed timestamp on a written row reads BROKEN', async () => {
    await exportOnce();
    await exportOnce();
    await pg.query(`UPDATE audit_events SET "timestamp" = "timestamp" + interval '1 microsecond' WHERE organization_id = $1 AND sequence_number = 1`, [ORG]);
    const data = await verdict();
    expect(data.chainStatus).toBe('broken');
    expect(data.brokenLinkDetails.map((b: { sequenceNumber: number }) => b.sequenceNumber)).toEqual([1]);
  });

  it('a changed actor on a written row reads BROKEN', async () => {
    await exportOnce();
    await pg.query(`UPDATE audit_events SET user_name = 'someone.else@example.test' WHERE organization_id = $1`, [ORG]);
    const data = await verdict();
    expect(data.chainStatus).toBe('broken');
  });
});
