/**
 * A migration writes no event into a tenant's audit trail.
 *
 * db/migrations/20260317_global_regulatory_compliance.sql re-runs on every
 * deploy, and ended by inserting an audit_events row for organisation 1 as
 * user 0, 'system', from 127.0.0.1: "Global regulatory compliance tables
 * created". The provisioned column types made it fail (and the failure was
 * swallowed); against a column that accepts the value it lands — which is
 * how this test shows it, before and after.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/20260317_global_regulatory_compliance.sql'), 'utf8');
/** audit_events with entity_id TEXT: a database whose column would accept the row. */
const ACCEPTING_AUDIT_EVENTS = `CREATE TABLE audit_events (
  id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, user_id INTEGER, user_name TEXT NOT NULL, user_role TEXT, ip_address TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT now(), reason TEXT, regulatory_significant BOOLEAN, gxp_relevant BOOLEAN)`;

describe('20260317_global_regulatory_compliance, applied on every deploy', () => {
  it("records nothing in any organisation's audit trail", async () => {
    const pg = new PGlite();
    try {
      await pg.exec(ACCEPTING_AUDIT_EVENTS);
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
      const rows = (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_events')).rows[0];
      expect(rows.n).toBe(0);
    } finally {
      await pg.close();
    }
  }, 60_000);
});
