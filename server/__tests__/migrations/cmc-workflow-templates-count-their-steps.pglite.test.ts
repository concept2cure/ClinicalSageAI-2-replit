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
});
