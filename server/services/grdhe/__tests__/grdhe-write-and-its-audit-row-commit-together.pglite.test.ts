/**
 * A GRDHE write and its audit row are committed together, or neither is.
 *
 * What the service used to do: setDataResidencyConfig, addTerminologyMapping
 * and createCanonicalAdverseEvent ran their INSERT on its own (autocommit) and
 * only then opened a transaction for log_audit(). When the audit insert failed
 * — as every one dated after 2026-03-31 did, regulatory_harmonization.audit_log
 * having no partition for it — the residency configuration, mapping or adverse
 * event stayed saved with no audit row, and the caller was told the write
 * failed.
 *
 * The service is real and runs on PGlite through drizzle, over the real
 * db/migrations/081_grdhe_regulatory_mapping_layer.sql. The audit failure is
 * the production one: the DEFAULT partition is dropped for those cases.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { drizzle } from 'drizzle-orm/pglite';
import type { CreateAdverseEventRequest, TerminologyMapping } from '../types';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../db', () => ({
  get db() {
    return holder.db;
  },
}));

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const ACTOR = 'qa.lead@sponsor.example';
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';

let pg: PGlite;
let service: typeof import('../grdheService').grdheService;

const count = async (table: string, where: string, params: unknown[]) =>
  (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM regulatory_harmonization.${table} WHERE ${where}`, params))
    .rows[0].n;

const adverseEvent = (caseNumber: string): CreateAdverseEventRequest => ({
  tenantId: TENANT,
  caseNumber,
  caseType: 'spontaneous',
  reportType: 'initial',
  eventDate: '2026-10-01',
  receiveDate: '2026-10-02',
  isSerious: false,
  patient: { sex: 'F' },
  reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA' }],
  suspectProducts: [{ name: 'Examplamab' }],
  reporter: { qualification: 'physician' },
});

async function mapping(sourceCode: string): Promise<Omit<TerminologyMapping, 'id' | 'createdAt'>> {
  const v = (
    await pg.query<{ id: string }>(
      `SELECT id FROM regulatory_harmonization.terminology_versions WHERE terminology_system = 'MEDDRA' AND version_code = '26.1'`
    )
  ).rows[0].id;
  return {
    sourceSystem: 'MEDDRA', sourceVersionId: v, sourceCode, sourceDisplay: 'Headache',
    targetSystem: 'MEDDRA', targetVersionId: v, targetCode: '10019211', targetDisplay: 'Headache',
    mappingType: 'equivalent', confidenceScore: 1, requiresReview: false, mappingSource: 'manual',
  };
}

/** The database's own message, under drizzle's "Failed query" wrapper. */
const databaseMessage = async (write: Promise<unknown>): Promise<string> => {
  const err = (await write.then(() => null, (e: unknown) => e)) as { message?: string; cause?: { message?: string } } | null;
  return String(err?.cause?.message ?? err?.message ?? 'resolved');
};

/** The production failure: no partition takes an audit row dated today. */
async function withoutTodaysAuditPartition(run: () => Promise<void>) {
  await pg.exec('DROP TABLE regulatory_harmonization.audit_log_default');
  try {
    await run();
  } finally {
    await pg.exec(
      'CREATE TABLE regulatory_harmonization.audit_log_default PARTITION OF regulatory_harmonization.audit_log DEFAULT'
    );
  }
}

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  await pg.exec(SQL);
  holder.db = drizzle(pg);
  // Imported after the handle exists: the service captures `db` when it loads.
  service = (await import('../grdheService')).grdheService;
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('a GRDHE write and its audit row commit together', () => {
  it('records an adverse event and its audit row, attributed to the caller', async () => {
    const event = await service.createCanonicalAdverseEvent(adverseEvent('CASE-OK'), ACTOR);
    const audit = await pg.query<{ user_id: string }>(
      `SELECT user_id FROM regulatory_harmonization.audit_log WHERE table_name = 'canonical_adverse_events' AND record_id = $1`,
      [event.id]
    );
    expect(audit.rows).toEqual([{ user_id: ACTOR }]);
  });

  it('keeps no adverse event whose audit row could not be written', async () => {
    await withoutTodaysAuditPartition(async () => {
      expect(await databaseMessage(service.createCanonicalAdverseEvent(adverseEvent('CASE-NO-AUDIT'), ACTOR))).toMatch(
        /no partition of relation "audit_log"/
      );
    });
    expect(await count('canonical_adverse_events', 'case_number = $1', ['CASE-NO-AUDIT']), 'an unaudited case was kept').toBe(0);
  });

  it('keeps no data-residency configuration whose audit row could not be written', async () => {
    const tenant = '6b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
    await withoutTodaysAuditPartition(async () => {
      expect(await databaseMessage(service.setDataResidencyConfig({ tenantId: tenant, primaryRegion: 'EU_WEST' }, ACTOR))).toMatch(
        /no partition of relation "audit_log"/
      );
    });
    expect(await count('tenant_data_residency', 'tenant_id = $1', [tenant]), 'an unaudited configuration was kept').toBe(0);
  });

  it('keeps no terminology mapping whose audit row could not be written', async () => {
    const m = await mapping('NO-AUDIT-1');
    await withoutTodaysAuditPartition(async () => {
      expect(await databaseMessage(service.addTerminologyMapping(m, ACTOR))).toMatch(/no partition of relation "audit_log"/);
    });
    expect(await count('terminology_mappings', 'source_code = $1', ['NO-AUDIT-1']), 'an unaudited mapping was kept').toBe(0);
  });
});
