import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const creator = 'db/migrations/20260810_reconcile_module_catalog.sql';
const sql = fs.readFileSync(path.resolve(creator), 'utf8');
const packaging = fs.readFileSync(path.resolve('db/migrations/20260823_module_catalog_commercial_packaging.sql'), 'utf8');
let db: PGlite;

describe('filing catalogue fold preserves subscriptions over deploy replay', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE TABLE available_modules (
        module_id text PRIMARY KEY, name text, description text, category text,
        path text, icon text, sort_order integer, metadata json, updated_at timestamptz
      );
      CREATE TABLE organization_modules (
        organization_id integer NOT NULL,
        module_id text REFERENCES available_modules(module_id) ON DELETE CASCADE,
        enabled boolean NOT NULL
      );
      INSERT INTO available_modules (module_id, name, metadata)
        VALUES ('filings-catalog', 'Previously bought discovery', '{"tiers":["recorded"],"custom":"keep"}'),
               ('ectd-publishing', 'Created by its separate seed', '{}');
      INSERT INTO organization_modules VALUES (19, 'filings-catalog', true);
    `);
  });
  afterAll(async () => { await db?.close(); });

  it('the creator stays on the durable migration set', () => {
    expect(C2C_MIGRATION_FILES).toContain(creator);
  });

  it('double apply deprecates the old identity and keeps its row, metadata and tenant subscription', async () => {
    for (let replay = 0; replay < 2; replay += 1) {
      await db.exec(sql);
      await db.exec(packaging);
      const old = await db.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM available_modules WHERE module_id = 'filings-catalog'`,
      );
      expect(old.rows).toHaveLength(1);
      expect(old.rows[0].metadata).toEqual({ tiers: ['recorded'], custom: 'keep', deprecated: true });
      const subscriptions = await db.query(`SELECT * FROM organization_modules WHERE organization_id = 19`);
      expect(subscriptions.rows).toEqual([{ organization_id: 19, module_id: 'filings-catalog', enabled: true }]);
      const canonical = await db.query<{ deprecated: boolean | null }>(
        `SELECT (metadata->>'deprecated')::boolean AS deprecated FROM available_modules WHERE module_id = 'projects'`,
      );
      expect(canonical.rows).toEqual([{ deprecated: null }]);
    }
  });

  it('fresh deployments need no retired filing identity to satisfy packaging', async () => {
    await db.exec('ROLLBACK');
    await db.exec(`DELETE FROM organization_modules WHERE module_id = 'filings-catalog';
      DELETE FROM available_modules WHERE module_id = 'filings-catalog';`);
    for (let replay = 0; replay < 2; replay += 1) {
      await db.exec(sql);
      await db.exec(packaging);
      expect((await db.query(`SELECT module_id FROM available_modules WHERE module_id = 'filings-catalog'`)).rows).toEqual([]);
    }
  });
});
