/**
 * Device projects in Reporting & analytics (D2, fold F4, 2026-10-30; decision
 * P-61 item 3, docs/LAUNCH_DEFINITION_OF_DONE.md;
 * docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/).
 *
 * The device analytics screen read GET /api/mdx/analytics: every program of the
 * organization, drug programs included, whether or not the reader could open
 * it. Its three real figures (status counts, the 24-month submission pace, the
 * AnA draft acceptance rate) are now a section of the Reporting overview, over
 * the projects the reader can open (getAccessibleReportProjectIds), and over
 * device projects only (the Projects MDX filter's classification).
 *
 * The SQL runs on PGlite under a NOSUPERUSER role with FORCE ROW LEVEL SECURITY,
 * as the route's request client does. The honesty cases moved here from the
 * retired route's suites (mdx-analytics-availability.test.ts and
 * deferred-data-runtime-role.pglite.test.ts): an unreadable source is
 * unavailable, never zero; a genuine zero is zero; no shared pool is borrowed.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ query: vi.fn(async () => { throw new Error('the shared pool was used'); }) }));
vi.mock('../../../db', () => ({ pool: shared, getPool: () => shared, db: {} }));

import { DEVICE_PACE_MONTHS, devicePaceMonths, readDevicePortfolio } from '../device-portfolio';

const NOW = new Date('2026-10-30T12:00:00Z');
const ORG = 7; // the other tenant is organization 8

let pg: PGlite;
const client = { query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: Array<Record<string, unknown>> }> };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE ROLE report_runtime NOSUPERUSER;
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, program_type text NOT NULL,
      product_type text NOT NULL, status text NOT NULL DEFAULT 'draft', actual_submission_date timestamp, deleted_at timestamp);
    CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid, status text);
    CREATE TABLE fda_510k_documents (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL);
    CREATE TABLE cerv2_510k_sections (id serial PRIMARY KEY, organization_id integer NOT NULL, document_id integer,
      section_key text NOT NULL, draft_source text, accepted_at timestamptz);

    INSERT INTO regulatory_programs VALUES
      ('00000000-0000-4000-8000-000000000001', 7, '510k',  'device',   'active',    '2026-09-14', NULL),
      ('00000000-0000-4000-8000-000000000002', 7, 'pma',   'device',   'approved',  '2025-11-02', NULL),
      ('00000000-0000-4000-8000-000000000003', 7, 'ivdr',  'ivd',      'active',    '2024-08-01', NULL),
      ('00000000-0000-4000-8000-000000000004', 7, 'de_novo','device',  'submitted', '2026-10-01', NULL),
      ('00000000-0000-4000-8000-000000000005', 7, 'ind',   'drug',     'submitted', '2026-10-05', NULL),
      ('00000000-0000-4000-8000-000000000006', 7, '510K',  'device',   'active',    '2026-10-09', '2026-10-10'),
      ('00000000-0000-4000-8000-000000000008', 8, '510k',  'device',   'approved',  '2026-10-02', NULL);
    -- 1-4 device, readable unless named; 5 a drug; 6 deleted; 8 the other tenant's.
    INSERT INTO projects (id, organization_id, regulatory_program_id, status) VALUES
      (101, 7, '00000000-0000-4000-8000-000000000001', 'active'),
      (102, 7, '00000000-0000-4000-8000-000000000002', 'active'),
      (103, 7, '00000000-0000-4000-8000-000000000003', 'active'),
      (104, 7, '00000000-0000-4000-8000-000000000004', 'active'),
      (105, 7, '00000000-0000-4000-8000-000000000005', 'active'),
      (106, 7, '00000000-0000-4000-8000-000000000006', 'active'),
      (107, 7, NULL, 'active'),
      (108, 8, '00000000-0000-4000-8000-000000000008', 'active'),
      (109, 7, '00000000-0000-4000-8000-000000000001', 'deleted');
    INSERT INTO fda_510k_documents (id, organization_id, project_id) VALUES (1, 7, 101), (2, 7, 104), (3, 7, 105), (4, 8, 108);
    INSERT INTO cerv2_510k_sections (organization_id, document_id, section_key, draft_source, accepted_at) VALUES
      (7, 1, 'a', 'ana', now()), (7, 1, 'b', 'ana', now()), (7, 1, 'c', 'ana', NULL),
      (7, 2, 'd', 'ana', now()), (7, 2, 'e', 'human', now()),
      (7, 3, 'f', 'ana', NULL),
      (7, NULL, 'g', 'ana', NULL), (7, NULL, 'h', 'ana', now()),
      (8, 4, 'i', 'ana', NULL);
  `);
  for (const table of ['regulatory_programs', 'projects', 'fda_510k_documents', 'cerv2_510k_sections']) {
    await pg.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON ${table} USING (organization_id = nullif(current_setting('app.current_tenant_id', true), '')::integer);
      GRANT SELECT ON ${table} TO report_runtime;`);
  }
  await pg.exec('SET ROLE report_runtime');
  await pg.query("SELECT set_config('app.current_tenant_id', $1, false)", [String(ORG)]);
}, 60_000);

afterAll(async () => { await pg?.close(); });

const ALL_ORG = [101, 102, 103, 104, 105, 106, 107, 109];

describe('the device section of the Reporting overview', () => {
  it('runs as a role that cannot bypass row security', async () => {
    const role = await pg.query<{ rolsuper: boolean }>('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
    expect(role.rows[0].rolsuper).toBe(false);
  });

  it('counts device projects the reader can open, by recorded status, and never a drug, deleted or other-tenant project', async () => {
    const got = await readDevicePortfolio(client, ORG, ALL_ORG, NOW);
    expect(got.state).toBe('computed');
    if (got.state !== 'computed') return;
    expect(got.projectCount).toBe(4);
    expect(got.byStatus).toEqual([
      { status: 'active', count: 2 },
      { status: 'approved', count: 1 },
      { status: 'submitted', count: 1 },
    ]);
    expect(shared.query).not.toHaveBeenCalled();
  });

  it('reads only the projects the reader can open', async () => {
    const got = await readDevicePortfolio(client, ORG, [102, 105], NOW);
    expect(got).toMatchObject({ state: 'computed', projectCount: 1, byStatus: [{ status: 'approved', count: 1 }] });
  });

  it('counts nothing of another tenant, even when its project id is named', async () => {
    const got = await readDevicePortfolio(client, ORG, [108], NOW);
    expect(got).toEqual({ state: 'none' });
  });

  it('says there is no device project when none the reader can open is a device project', async () => {
    expect(await readDevicePortfolio(client, ORG, [105, 107], NOW)).toEqual({ state: 'none' });
    expect(await readDevicePortfolio(client, ORG, [], NOW)).toEqual({ state: 'none' });
  });

  it('paces recorded submissions over the 24 calendar months to now, oldest first', async () => {
    const got = await readDevicePortfolio(client, ORG, ALL_ORG, NOW);
    if (got.state !== 'computed') throw new Error(got.state);
    expect(got.pace.months).toHaveLength(DEVICE_PACE_MONTHS);
    expect(got.pace.months[0]).toBe('2024-11');
    expect(got.pace.months[23]).toBe('2026-10');
    const at = (m: string) => got.pace.counts[got.pace.months.indexOf(m)];
    expect(at('2026-09')).toBe(1);
    expect(at('2026-10')).toBe(1); // the De Novo; the drug IND and the deleted 510(k) are not counted
    expect(at('2025-11')).toBe(1);
    // 2024-08 is before the window.
    expect(got.pace.total).toBe(3);
    expect(got.pace.counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('builds the month window from the date it is given, across a year boundary', () => {
    const months = devicePaceMonths(new Date('2026-01-31T23:59:59Z'));
    expect(months[0]).toBe('2024-02');
    expect(months[23]).toBe('2026-01');
  });

  it('rates AnA drafts recorded against a device project the reader can open, and no other draft', async () => {
    const got = await readDevicePortfolio(client, ORG, ALL_ORG, NOW);
    if (got.state !== 'computed') throw new Error(got.state);
    // Project 101: 2 accepted, 1 pending; project 104: 1 accepted. Not the human
    // section, not the drug project's draft, not the drafts with no project.
    expect(got.anaDrafts).toEqual({ state: 'computed', accepted: 3, pending: 1, acceptanceRate: 75 });
    const narrowed = await readDevicePortfolio(client, ORG, [104], NOW);
    if (narrowed.state !== 'computed') throw new Error(narrowed.state);
    expect(narrowed.anaDrafts).toEqual({ state: 'computed', accepted: 1, pending: 0, acceptanceRate: 100 });
  });

  it('gives a genuine zero as zero, and no rate where no AnA draft is recorded', async () => {
    const got = await readDevicePortfolio(client, ORG, [103], NOW);
    expect(got).toEqual({
      state: 'computed', projectCount: 1, byStatus: [{ status: 'active', count: 1 }],
      pace: { months: devicePaceMonths(NOW), counts: new Array(DEVICE_PACE_MONTHS).fill(0), total: 0 },
      anaDrafts: { state: 'computed', accepted: 0, pending: 0, acceptanceRate: null },
    });
  });
});

describe('an unreadable source is unavailable, never zero', () => {
  const failing = (pattern: RegExp, code: string) => ({
    query: async (sql: string, params?: unknown[]) => {
      if (pattern.test(sql)) throw Object.assign(new Error('relation "private_table" does not exist'), { code });
      return client.query(sql, params);
    },
  });

  it.each(['42P01', '42703'])('the drafts store missing (%s) leaves the project figures and withholds only the rate', async (code) => {
    const got = await readDevicePortfolio(failing(/cerv2_510k_sections/, code), ORG, ALL_ORG, NOW);
    expect(got).toMatchObject({ state: 'computed', projectCount: 4, anaDrafts: { state: 'unavailable' } });
    expect(JSON.stringify(got)).not.toContain('private_table');
  });

  it.each(['42P01', '42703'])('the programs read failing (%s) throws, so the section is unavailable rather than empty', async (code) => {
    await expect(readDevicePortfolio(failing(/regulatory_programs/, code), ORG, ALL_ORG, NOW)).rejects.toThrow();
  });

  it('any other drafts failure throws too: no partial section stands in for a failed read', async () => {
    await expect(readDevicePortfolio(failing(/cerv2_510k_sections/, '08006'), ORG, ALL_ORG, NOW)).rejects.toThrow();
  });

  it('refuses an identity it cannot trust before reading anything', async () => {
    const spy = { query: vi.fn(client.query) };
    await expect(readDevicePortfolio(spy, 0, ALL_ORG, NOW)).rejects.toThrow();
    await expect(readDevicePortfolio(spy, ORG, [1.5], NOW)).rejects.toThrow();
    expect(spy.query).not.toHaveBeenCalled();
  });
});
