/**
 * POST /api/grdhe/exports refuses, with a named 422, a format the database has
 * no regulatory_format value for, and /health says export jobs are unavailable
 * and why (GRDHE follow-up 1, 2026-10-15).
 *
 * What the code used to do: the route and the generators key the formats
 * FDA_AE_3500A and EMA_AE_E2B_R3, while export_jobs.target_format and the
 * mapping rules are typed regulatory_harmonization.regulatory_format, whose
 * values (and the seeded rules) are FDA_3500A and EMA_E2B_R3. So every
 * POST /exports reached `$1::regulatory_harmonization.regulatory_format` and
 * failed there, a 500, on a real database, while /health said exportJobs: true.
 * The keys are not remapped onto those values: FDA_3500A names MedWatch Form
 * 3500A and EMA_E2B_R3 names E2B(R3), and these files are HL7 v3 ICSR-style XML
 * and E2B(R2). Which values to record is the founder's decision.
 *
 * The router and the service are real and run on PGlite through drizzle, over
 * db/migrations/081_grdhe_regulatory_mapping_layer.sql applied twice (it re-runs
 * on every deploy). The tenant's residency allows both regions and both seeded
 * rules are approved, so nothing but the format stands between a request and a job.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { drizzle } from 'drizzle-orm/pglite';
import { RECORDED_AS, SUPPORTED_FORMATS } from '../../services/grdhe/exportGenerators';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
}));

const SQL = fs.readFileSync(path.join(process.cwd(), 'db/migrations/081_grdhe_regulatory_mapping_layer.sql'), 'utf8');
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const CASE_ID = '22222222-3333-4444-8555-666666666666';
const USER = { id: 42, email: 'qa.lead@sponsor.example', organizationUuid: TENANT };

let pg: PGlite;
let app: express.Express;

const exportJob = (targetFormat: string, targetJurisdiction: string) => ({
  tenantId: TENANT, sourceEntityType: 'adverse_event', sourceEntityIds: [CASE_ID], targetFormat, targetJurisdiction,
});

const jobCount = async () =>
  (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM regulatory_harmonization.export_jobs')).rows[0].n;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp } });
  for (let deploy = 0; deploy < 2; deploy++) await pg.exec(SQL);
  await pg.query(
    `INSERT INTO regulatory_harmonization.tenant_data_residency (tenant_id, allowed_processing_regions, created_by)
     VALUES ($1, ARRAY['US_EAST', 'EU_WEST']::regulatory_harmonization.data_region[], $2)`,
    [TENANT, USER.email]
  );
  await pg.exec(`UPDATE regulatory_harmonization.mapping_rules SET approved_at = now(), approved_by = 'qa.approver@sponsor.example'`);
  holder.db = drizzle(pg);
  // Imported after the handle exists: the service captures `db` when it loads.
  const router = (await import('../grdheRoutes')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = USER;
    next();
  });
  app.use('/api/grdhe', router);
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('regulatory_format, as 081 defines it, has no value for any export format key', () => {
  it('fails the cast for every key POST /exports accepts, and the seeded rules use other values', async () => {
    for (const key of Object.keys(SUPPORTED_FORMATS)) {
      await expect(pg.query('SELECT $1::regulatory_harmonization.regulatory_format', [key]), key).rejects.toThrow(
        /invalid input value for enum regulatory_harmonization\.regulatory_format/
      );
    }
    const seeded = await pg.query<{ rule_code: string; target_format: string }>(
      `SELECT rule_code, target_format::text FROM regulatory_harmonization.mapping_rules ORDER BY rule_code`
    );
    expect(seeded.rows).toEqual([
      { rule_code: 'EMA_AE_E2B_R3_V1', target_format: 'EMA_E2B_R3' },
      { rule_code: 'FDA_AE_3500A_V1', target_format: 'FDA_3500A' },
    ]);
  });

  it('records no export format under a value that names another format', async () => {
    expect(RECORDED_AS.FDA_AE_3500A, 'FDA_3500A is MedWatch Form 3500A; the file is HL7 v3 ICSR-style XML').toBeNull();
    expect(RECORDED_AS.EMA_AE_E2B_R3, 'EMA_E2B_R3 is E2B(R3); the file is E2B(R2)').toBeNull();
    const values = (
      await pg.query<{ v: string }>('SELECT unnest(enum_range(NULL::regulatory_harmonization.regulatory_format))::text AS v')
    ).rows.map(r => r.v);
    for (const recorded of Object.values(RECORDED_AS)) {
      if (recorded !== null) expect(values).toContain(recorded);
    }
  });
});

describe('POST /api/grdhe/exports', () => {
  it.each([
    ['FDA_AE_3500A', 'FDA'],
    ['EMA_AE_E2B_R3', 'EMA'],
  ])('refuses %s with a named 422 before the database, instead of failing at the enum cast', async (format, jurisdiction) => {
    const r = await request(app).post('/api/grdhe/exports').send(exportJob(format, jurisdiction));
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body.error.code).toBe('EXPORT_FORMAT_NOT_RECORDABLE');
    expect(r.body.error.message).toContain(format);
    expect(r.body.error.message).toMatch(/no matching regulatory_format value/);
    expect(await jobCount(), 'no export job was created').toBe(0);
  });
});

describe('GET /api/grdhe/health', () => {
  it('does not offer export jobs no format can be recorded for, and says why', async () => {
    const r = await request(app).get('/api/grdhe/health');
    expect(r.status).toBe(200);
    expect(r.body.data.features.exportJobs, 'POST /exports cannot create a job for any format').toBe(false);
    expect(r.body.data.unavailableReasons?.exportJobs).toMatch(/no matching regulatory_format value/);
  });
});
