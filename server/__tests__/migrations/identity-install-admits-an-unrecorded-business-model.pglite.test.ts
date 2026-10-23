/**
 * A fresh install's identity.organizations admits an organisation whose
 * business model nobody recorded.
 *
 * db/migrations/051_gcc_multi_tenant_identity.sql (install-fresh; db:provision
 * runs it) created business_model NOT NULL. The C-48 bridge
 * (db/migrations/20260919_c48_stage1_identity_org_bridge.sql, deploy set)
 * mirrors every public.organizations row into this table with business_model
 * NULL, because nothing records one, and relaxes the NOT NULL on deploy; so a
 * fresh install carried, until its first deploy, a constraint that refused
 * exactly the rows the bridge writes. 051 now creates the column nullable.
 * Applied here twice, against PGlite, as written.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const IDENTITY = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/051_gcc_multi_tenant_identity.sql'),
  'utf8',
);

describe('db/migrations/051_gcc_multi_tenant_identity.sql, applied twice', () => {
  it('admits an organisation with no business model, and keeps a recorded one', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(IDENTITY);
      await pg.exec(IDENTITY);

      await pg.exec(`INSERT INTO identity.organizations (legal_name) VALUES ('Mirrored Co')`);
      await pg.exec(
        `INSERT INTO identity.organizations (legal_name, business_model) VALUES ('Recorded CRO', 'CRO_PARTNER')`,
      );

      const rows = await pg.query<{ legal_name: string; business_model: string | null }>(
        `SELECT legal_name, business_model FROM identity.organizations ORDER BY legal_name`,
      );
      expect(rows.rows).toEqual([
        { legal_name: 'Mirrored Co', business_model: null },
        { legal_name: 'Recorded CRO', business_model: 'CRO_PARTNER' },
      ]);
      const col = await pg.query<{ is_nullable: string; column_default: string | null }>(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_schema = 'identity' AND table_name = 'organizations' AND column_name = 'business_model'`,
      );
      expect(col.rows).toEqual([{ is_nullable: 'YES', column_default: null }]);
    } finally {
      await pg.close();
    }
  }, 120_000);
});
