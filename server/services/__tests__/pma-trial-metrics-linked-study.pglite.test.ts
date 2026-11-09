/**
 * The PMA screen's trial cards read the study the project is linked to, and
 * no other; and a card names what it counts (MDX journey M20,
 * `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * getPmaTrialMetrics bound a project with no link to the organization's most
 * recently updated clinical_ops study whose name, indication or therapeutic
 * area contained the product name, and did not say which: another product's
 * enrolment could read as this one's. clinical_ops studies carry no project
 * key; the project's link is `metadata.clinicalStudyId`, written by AnA's
 * link_program_clinical_study. And "AE rate" counted serious and critical
 * protocol deviations per enrolled subject, with alarm thresholds of 2% and
 * 5%: clinical_ops records no adverse events.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { regulatoryPrograms } from '../../../shared/schema/programs';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => ({
  get db() { return holder.db; },
  pool: { query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) },
  getDb: () => holder.db,
  getPool: () => ({ query: async (text: string, params?: unknown[]) => holder.pg.query(text, params) }),
}));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

import { getPmaTrialMetrics } from '../regulatory-programs.service';

function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const ORG = 1;
const OTHER_ORG = 2;
const UNLINKED = '11111111-1111-4111-8111-111111111111';   // product "Corvant valve", no link
const LINKED = '22222222-2222-4222-8222-222222222222';     // linked to its own study
const DANGLING = '33333333-3333-4333-8333-333333333333';   // linked to a study that is not there
const ACROSS = '44444444-4444-4444-8444-444444444444';     // linked to another organization's study
const MALFORMED = '55555555-5555-4555-8555-555555555555';  // a link that is not a study id

const ANOTHER_PRODUCTS = 'aaaaaaaa-0000-4000-8000-000000000001'; // "Corvant valve II pivotal", someone else's
const OWN = 'aaaaaaaa-0000-4000-8000-000000000002';
const OTHER_ORGS = 'aaaaaaaa-0000-4000-8000-000000000003';

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
  await holder.pg.exec(ddlOf(regulatoryPrograms as PgTable));
  await holder.pg.exec(`
    CREATE SCHEMA clinical_ops;
    CREATE TABLE clinical_ops.studies (id uuid PRIMARY KEY, org_id text, name text, phase text, status text,
      indication text, therapeutic_area text, target_enrollment int, enrolled int, sites int, active_sites int,
      updated_at timestamptz DEFAULT now());
    CREATE TABLE clinical_ops.deviations (id serial PRIMARY KEY, study_id uuid, severity text);
    CREATE TABLE clinical_ops.endpoint_results (id serial PRIMARY KEY, study_id uuid, endpoint_name text, status text);
  `);
  const program = (id: string, metadata: Record<string, unknown> | null) => holder.pg.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, product_name, program_type, status, phase, metadata)
     VALUES ($1, $2, 'Corvant valve — PMA', 'Corvant valve', 'pma', 'active', 'planning', $3::jsonb)`,
    [id, ORG, metadata ? JSON.stringify(metadata) : null],
  );
  await program(UNLINKED, null);
  await program(LINKED, { clinicalStudyId: OWN });
  await program(DANGLING, { clinicalStudyId: 'aaaaaaaa-0000-4000-8000-0000000000ff' });
  await program(ACROSS, { clinicalStudyId: OTHER_ORGS });
  await program(MALFORMED, { clinicalStudyId: 'CV-PIVOTAL' });
  const study = (id: string, org: number, name: string, enrolled: number, target: number, updated: string) =>
    holder.pg.query(
      `INSERT INTO clinical_ops.studies (id, org_id, name, phase, status, indication, therapeutic_area,
         target_enrollment, enrolled, sites, active_sites, updated_at)
       VALUES ($1, $2, $3, 'pivotal', 'enrolling', 'aortic stenosis', 'cardiology', $4, $5, 20, 14, $6)`,
      [id, String(org), name, target, enrolled, updated],
    );
  // The most recently updated study naming the product is another product's.
  await study(ANOTHER_PRODUCTS, ORG, 'Corvant valve II pivotal', 612, 680, '2026-11-01T00:00:00Z');
  await study(OWN, ORG, 'CV-01 pivotal IDE', 340, 680, '2026-10-01T00:00:00Z');
  await study(OTHER_ORGS, OTHER_ORG, 'Corvant valve pivotal', 100, 200, '2026-10-01T00:00:00Z');
  for (const severity of ['serious', 'critical', 'serious', 'minor']) {
    await holder.pg.query(`INSERT INTO clinical_ops.deviations (study_id, severity) VALUES ($1, $2)`, [OWN, severity]);
  }
  for (const status of ['achieved', 'pending']) {
    await holder.pg.query(
      `INSERT INTO clinical_ops.endpoint_results (study_id, endpoint_name, status) VALUES ($1, 'primary', $2)`,
      [OWN, status],
    );
  }
}, 60_000);

afterAll(async () => { await holder.pg?.close(); });

const card = (r: Awaited<ReturnType<typeof getPmaTrialMetrics>>, label: string) => r?.metrics.find((m) => m.label === label);

describe("the PMA screen's trial cards", () => {
  it('bind no study by its name: a project with no link says so', async () => {
    const r = await getPmaTrialMetrics(ORG, UNLINKED);
    expect(r?.study).toBeNull();
    expect(r?.metrics.map((m) => m.metric)).toEqual(['—', '—', '—', '—']);
    expect(r?.metrics.every((m) => m.meta === 'No study linked to this project')).toBe(true);
  });

  it("read the linked study's figures, and name the study", async () => {
    const r = await getPmaTrialMetrics(ORG, LINKED);
    expect(r?.study).toMatchObject({ id: OWN, name: 'CV-01 pivotal IDE' });
    expect(card(r, 'Enrolled')).toMatchObject({ metric: '340/680', meta: '50% of target · CV-01 pivotal IDE' });
    expect(card(r, 'Endpoints achieved')).toMatchObject({ metric: '1/2' });
  });

  it('count protocol deviations as protocol deviations, never as adverse events, with no invented threshold', async () => {
    const r = await getPmaTrialMetrics(ORG, LINKED);
    expect(card(r, 'AE rate')).toBeUndefined();
    expect(card(r, 'Serious deviations')).toEqual({
      label: 'Serious deviations', metric: '3', meta: 'Serious and critical protocol deviations',
    });
  });

  it('say a link to a study that is not there was not found', async () => {
    for (const id of [DANGLING, ACROSS, MALFORMED]) {
      const r = await getPmaTrialMetrics(ORG, id);
      expect(r?.study, id).toBeNull();
      expect(r?.metrics.every((m) => m.meta === 'The linked study was not found'), id).toBe(true);
    }
  });
});
