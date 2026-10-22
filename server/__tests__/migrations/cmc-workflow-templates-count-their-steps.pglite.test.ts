/**
 * The shared CMC workflow templates count their own steps and claim no
 * duration nobody sourced.
 *
 * migrations/20260919_cmc_playbook_schema.sql (deploy set) seeds twelve global
 * templates at organization_id = 0. Nine carried a total_tasks that
 * contradicted their own template_data.steps (the NDA/BLA Module 3 template:
 * 24 tasks, 4 steps; the retired playbook route created exactly those 4), and
 * every one carried an estimated_time ('12-16 weeks', ...) with no source.
 * total_tasks is now the number of steps, estimated_time is not recorded, and
 * because the seed is ON CONFLICT DO NOTHING the file also corrects the rows it
 * seeded on earlier deploys, and nothing else. Run here, against PGlite.
 *
 * The method-validation template also cited ICH Q2(R1), superseded by Q2(R2)
 * (Step 4, 2023-11-01). The template rows carry no version (keyed by slug, at
 * organization_id 0), so the label is updated in place, and on earlier
 * deploys only where the row still holds the exact seeded text.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'migrations/20260919_cmc_playbook_schema.sql'), 'utf8');

/** The values the seed wrote before 2026-10-15. */
const AS_FIRST_SEEDED = `
  UPDATE cmc_workflows w SET total_tasks = s.total, estimated_time = s.est
    FROM (VALUES
      ('ind-cmc-template', 6, '4-6 weeks'), ('nda-cmc-template', 24, '12-16 weeks'),
      ('annual-product-review-template', 15, '6-8 weeks'), ('method-validation-template', 8, '3-4 weeks'),
      ('qbd-development-template', 12, '6-8 weeks'), ('change-control-template', 10, '4-8 weeks'),
      ('tech-transfer-template', 18, '8-12 weeks'), ('comparability-template', 14, '6-10 weeks'),
      ('dissolution-dev-template', 12, '4-6 weeks'), ('cleaning-validation-template', 9, '3-5 weeks'),
      ('process-validation-template', 16, '8-12 weeks'), ('stability-supplement-template', 5, '2-3 weeks')
    ) AS s(id, total, est)
   WHERE w.id = s.id AND w.organization_id = 0;`;

const templates = async (pg: PGlite) =>
  (await pg.query<{ id: string; total_tasks: number | null; steps: number; estimated_time: string | null }>(
    `SELECT id, total_tasks, jsonb_array_length(template_data->'steps') AS steps, estimated_time
       FROM cmc_workflows WHERE organization_id = 0 ORDER BY id`)).rows;

/** The method-validation template's description as first seeded, and as seeded now. */
const Q2R1_LABEL = 'ICH Q2(R1) compliant analytical method validation protocol';
const Q2R2_LABEL = 'ICH Q2(R2) compliant analytical method validation protocol';

const description = async (pg: PGlite, id: string, org: number) =>
  (await pg.query<{ description: string | null }>(
    `SELECT description FROM cmc_workflows WHERE id = $1 AND organization_id = $2`, [id, org])).rows[0]?.description;

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE organizations (id serial PRIMARY KEY, name text);`);
    await fn(pg);
  } finally {
    await pg.close();
  }
}

describe('migrations/20260919_cmc_playbook_schema.sql, applied on every deploy', () => {
  it('seeds twelve templates whose task count is their step count, with no estimated time', () =>
    withDb(async (pg) => {
      await pg.exec(SQL);
      await pg.exec(SQL);
      const rows = await templates(pg);
      expect(rows).toHaveLength(12);
      for (const r of rows) {
        expect({ id: r.id, total_tasks: r.total_tasks, estimated_time: r.estimated_time })
          .toEqual({ id: r.id, total_tasks: r.steps, estimated_time: null });
      }
    }), 120_000);

  it('corrects the counts and withdraws the durations it seeded earlier, and leaves a tenant\'s template and a recorded time alone', () =>
    withDb(async (pg) => {
      await pg.exec(SQL);
      await pg.exec(AS_FIRST_SEEDED);
      await pg.exec(`
        UPDATE cmc_workflows SET estimated_time = '3 weeks (2025 actuals)'
         WHERE id = 'stability-supplement-template' AND organization_id = 0;
        INSERT INTO cmc_workflows (id, organization_id, name, estimated_time, total_tasks, template_data)
          VALUES ('tenant-own-template', 7, 'Our template', '2 weeks', 9, '{"steps": ["a", "b"]}');
      `);

      await pg.exec(SQL);
      await pg.exec(SQL);

      const rows = await templates(pg);
      expect(rows).toHaveLength(12);
      for (const r of rows) expect(r.total_tasks).toBe(r.steps);
      expect(rows.filter((r) => r.estimated_time !== null)).toEqual([
        { id: 'stability-supplement-template', total_tasks: 5, steps: 5, estimated_time: '3 weeks (2025 actuals)' },
      ]);
      const own = await pg.query(
        `SELECT total_tasks, estimated_time FROM cmc_workflows WHERE id = 'tenant-own-template'`);
      expect(own.rows).toEqual([{ total_tasks: 9, estimated_time: '2 weeks' }]);
    }), 120_000);

  it('cites ICH Q2(R2), not the superseded Q2(R1)', () =>
    withDb(async (pg) => {
      await pg.exec(SQL);
      await pg.exec(SQL);
      expect(await description(pg, 'method-validation-template', 0)).toBe(Q2R2_LABEL);
      const superseded = await pg.query(`SELECT id FROM cmc_workflows WHERE description LIKE '%Q2(R1)%'`);
      expect(superseded.rows).toEqual([]);
    }), 120_000);

  it('updates the citation on the row an earlier deploy seeded, and on nothing it did not seed', () =>
    withDb(async (pg) => {
      await pg.exec(SQL);
      await pg.exec(`
        UPDATE cmc_workflows SET description = '${Q2R1_LABEL}'
         WHERE id = 'method-validation-template' AND organization_id = 0;
        INSERT INTO cmc_workflows (id, organization_id, name, description)
          VALUES ('tenant-method-validation', 7, 'Our method validation', '${Q2R1_LABEL}');
      `);

      await pg.exec(SQL);
      await pg.exec(SQL);

      expect(await description(pg, 'method-validation-template', 0)).toBe(Q2R2_LABEL);
      expect(await description(pg, 'tenant-method-validation', 7)).toBe(Q2R1_LABEL);
    }), 120_000);

  it('leaves a global description someone has since edited', () =>
    withDb(async (pg) => {
      await pg.exec(SQL);
      await pg.exec(`
        UPDATE cmc_workflows SET description = 'Validation per ICH Q2(R1), kept for legacy methods'
         WHERE id = 'method-validation-template' AND organization_id = 0;
      `);
      await pg.exec(SQL);
      expect(await description(pg, 'method-validation-template', 0)).toBe(
        'Validation per ICH Q2(R1), kept for legacy methods',
      );
    }), 120_000);
});
