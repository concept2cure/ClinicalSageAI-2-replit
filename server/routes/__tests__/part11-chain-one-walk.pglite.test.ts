/**
 * The audit trail's chain verdict, on the one walk of the audit_events chain
 * (server/services/audit/audit-event-chain.ts).
 *
 * Two things the route's own loop got wrong, shown on the real trigger:
 *
 *  1. `totalVerified++` ran at the end of the loop body for every hashed row,
 *     so an entry whose hash did NOT re-compute still counted toward
 *     `verifiedEntries`: "broken, 3 of 3 verified".
 *  2. The pointer comparison was skipped when an entry's previous_hash was
 *     null, so an entry removed and its successor's pointer blanked and
 *     re-hashed read as an intact chain.
 *
 * Harness as part11-chain-trigger-written.pglite.test.ts (AUD-02): the real
 * trigger migration, the real route.
 */
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import router from '../part11-compliance';
import { AUDIT_EVENT_CHAIN_COLUMNS, auditEventRecordHash, type AuditEventChainRow } from '../../services/audit/audit-event-chain';

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

const write = (n: number) => pg.query(
  `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, reason)
   SELECT $1, 'document.approved', 'document', g, 'A. Rivera', 'step ' || g FROM generate_series(1, $2) g`, [ORG, n]);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE audit_events (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL,
    event_type VARCHAR(100) NOT NULL, entity_type VARCHAR(100) NOT NULL, entity_id INTEGER NOT NULL,
    user_id INTEGER, user_name TEXT NOT NULL, "timestamp" TIMESTAMP NOT NULL DEFAULT now(),
    old_values JSON, new_values JSON, reason TEXT, created_at TIMESTAMP NOT NULL DEFAULT now());`);
  await pg.exec(fs.readFileSync(path.join(process.cwd(), 'db/migrations/20260222_audit_events_hash_chain.sql'), 'utf8'));
}, 60_000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => { await pg.exec('DELETE FROM audit_events'); });

describe('the audit trail chain verdict', () => {
  /* A control asserts only what the change leaves alone, so it passes against
     the route as it was and as it is. */
  it('control: a chain the trigger wrote is intact, and every entry is counted verified', async () => {
    await write(3);
    const data = await verdict();
    expect(data).toMatchObject({ chainStatus: 'intact', integrityValid: true, totalEntries: 3, verifiedEntries: 3, brokenLinks: 0 });
  });

  /* "Each entry is cryptographically linked to its predecessor" read as covering
     the whole entry. The chain's hash does not include the before and after
     values, and the sentence now says so. */
  it('says what the hash covers, and that the before and after values are not part of it', async () => {
    await write(3);
    const data = await verdict();
    expect(data.compliance.tamperEvident).toMatch(/All 3 audit entries match the hash recorded/);
    expect(data.compliance.tamperEvident).toMatch(/before and after values .* not part of the hash/);
  });

  it('does not count an entry whose hash did not re-compute as verified', async () => {
    await write(3);
    await pg.query(`UPDATE audit_events SET reason = 'altered' WHERE organization_id = $1 AND sequence_number = 2`, [ORG]);
    const data = await verdict();
    expect(data.chainStatus).toBe('broken');
    expect(data.verifiedEntries, 'an entry that failed re-computation was counted verified').toBe(2);
    expect(data).toMatchObject({ hashedEntries: 3, contentBreaks: 1, pointerBreaks: 0 });
    expect(data.brokenLinkDetails[0]).toMatchObject({ sequenceNumber: 2, kind: 'content' });
  });

  it('does not read a removal hidden by a blanked, re-hashed pointer as an intact chain', async () => {
    await write(3);
    await pg.query(`DELETE FROM audit_events WHERE organization_id = $1 AND sequence_number = 2`, [ORG]);
    await pg.query(`UPDATE audit_events SET previous_hash = NULL WHERE organization_id = $1 AND sequence_number = 3`, [ORG]);
    // Re-hash the successor over its blanked pointer, so it is self-consistent
    // and only its place in the chain is wrong.
    const { rows } = await pg.query<AuditEventChainRow>(
      `SELECT ${AUDIT_EVENT_CHAIN_COLUMNS} FROM audit_events WHERE organization_id = $1 AND sequence_number = 3`, [ORG]);
    await pg.query('UPDATE audit_events SET record_hash = $2 WHERE id = $1', [rows[0].id, auditEventRecordHash(rows[0])]);

    const data = await verdict();
    expect(data.chainStatus, 'a removed entry was hidden by blanking its successor\'s pointer').not.toBe('intact');
    expect(data).toMatchObject({ chainStatus: 'unverifiable', integrityValid: null, unlinkedEntries: 1, brokenLinks: 0 });
  });
});
