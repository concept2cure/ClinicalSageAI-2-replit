/**
 * An organisation mirrored into identity.organizations carries no business
 * model nobody recorded.
 *
 * db/migrations/20260919_c48_stage1_identity_org_bridge.sql (deploy set)
 * mirrors every public.organizations row into identity.organizations, the FK
 * parent of the identity-bound tables. business_model is NOT NULL there
 * (db/migrations/051_gcc_multi_tenant_identity.sql) and has no source on
 * public.organizations, so the bridge wrote 'BIO_PHARMA_SPONSOR' for every
 * tenant, CROs and device makers included, in its backfill and its signup
 * trigger. It now relaxes that NOT NULL where an install created it, mirrors
 * NULL ("not recorded"), and withdraws the guess from the mirrors it wrote
 * earlier that nobody has edited since. Run here, against PGlite.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const BRIDGE = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/20260919_c48_stage1_identity_org_bridge.sql'),
  'utf8',
);

const SEED = 'a1000000-0000-0000-0000-000000000001';

/** identity.organizations as 051 creates it (business_model NOT NULL, no default), and public.organizations. */
const AS_INSTALLED = `
  CREATE SCHEMA identity;
  CREATE TYPE identity.org_business_model AS ENUM
    ('BIO_PHARMA_SPONSOR','CRO_PARTNER','REGULATORY_CONSULTANCY','CMO_CDMO',
     'ACADEMIC_INSTITUTION','GOVERNMENT_AGENCY','DEVICE_MANUFACTURER','DIAGNOSTIC_COMPANY');
  CREATE TABLE identity.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name text NOT NULL,
    display_name text,
    business_model identity.org_business_model NOT NULL,
    is_active boolean NOT NULL DEFAULT TRUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL DEFAULT 'system'
  );
  INSERT INTO identity.organizations (id, legal_name, business_model) VALUES ('${SEED}', 'Seed Co', 'GOVERNMENT_AGENCY');
  CREATE TABLE public.organizations (
    id serial PRIMARY KEY,
    uuid uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    status text NOT NULL DEFAULT 'active'
  );
`;

const modelOf = async (pg: PGlite, slug: string) =>
  (await pg.query<{ business_model: string | null }>(
    `SELECT io.business_model FROM identity.organizations io JOIN public.organizations po ON io.id = po.uuid
      WHERE po.slug = $1`,
    [slug],
  )).rows.map((r) => r.business_model);

async function withDb(fn: (pg: PGlite) => Promise<void>) {
  const pg = new PGlite();
  try {
    await pg.exec(AS_INSTALLED);
    await fn(pg);
  } finally {
    await pg.close();
  }
}

describe('the C-48 identity mirror, applied twice', () => {
  it('mirrors an organisation with no business model, at backfill and at signup', () =>
    withDb(async (pg) => {
      await pg.exec(`INSERT INTO public.organizations (name, slug) VALUES ('Acme CRO', 'acme')`);
      await pg.exec(BRIDGE);
      await pg.exec(BRIDGE);
      expect(await modelOf(pg, 'acme')).toEqual([null]);

      await pg.exec(`INSERT INTO public.organizations (name, slug) VALUES ('Gamma Dx', 'gamma')`);
      expect(await modelOf(pg, 'gamma')).toEqual([null]);

      const col = await pg.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'identity' AND table_name = 'organizations' AND column_name = 'business_model'`);
      expect(col.rows).toEqual([{ is_nullable: 'YES' }]);
      const seed = await pg.query(`SELECT business_model FROM identity.organizations WHERE id = '${SEED}'`);
      expect(seed.rows).toEqual([{ business_model: 'GOVERNMENT_AGENCY' }]);
    }), 120_000);

  it('withdraws the guess from mirrors an earlier deploy wrote, and leaves an edited one as it is', () =>
    withDb(async (pg) => {
      await pg.exec(`
        INSERT INTO public.organizations (name, slug) VALUES
          ('Backfilled Bio', 'backfilled'), ('Signed-up CRO', 'signedup'),
          ('Confirmed Sponsor', 'confirmed'), ('Corrected CRO', 'corrected');
        -- What the bridge wrote before 2026-10-15: the guess, on every mirror.
        INSERT INTO identity.organizations (id, legal_name, display_name, business_model, created_by)
          SELECT uuid, name, name, 'BIO_PHARMA_SPONSOR',
                 CASE slug WHEN 'backfilled' THEN 'c48-stage1-backfill' ELSE 'c48-stage1-sync' END
            FROM public.organizations;
        -- Someone has since looked at two of them.
        UPDATE identity.organizations SET updated_at = created_at + interval '1 day'
         WHERE legal_name = 'Confirmed Sponsor';
        UPDATE identity.organizations SET business_model = 'CRO_PARTNER', updated_at = created_at + interval '1 day'
         WHERE legal_name = 'Corrected CRO';
      `);

      await pg.exec(BRIDGE);
      await pg.exec(BRIDGE);

      expect(await modelOf(pg, 'backfilled')).toEqual([null]);
      expect(await modelOf(pg, 'signedup')).toEqual([null]);
      expect(await modelOf(pg, 'confirmed')).toEqual(['BIO_PHARMA_SPONSOR']);
      expect(await modelOf(pg, 'corrected')).toEqual(['CRO_PARTNER']);
      const seed = await pg.query(`SELECT business_model FROM identity.organizations WHERE id = '${SEED}'`);
      expect(seed.rows).toEqual([{ business_model: 'GOVERNMENT_AGENCY' }]);
    }), 120_000);
});
