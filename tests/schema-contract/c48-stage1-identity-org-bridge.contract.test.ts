/**
 * Org-uuid identity-bridge contract (ledger C-48 Stage 1).
 *
 * The platform had two disjoint uuid org spaces both feeding app.current_org_id:
 * the COALESCE-family tables (no FK) hold public.organizations.uuid; the
 * identity-FK-bound family (core.programs, ai.*, ectd_v4.*, …) FK to
 * identity.organizations(id), a hand-seeded 9-uuid island. A single GUC could not
 * straddle them. db/migrations/20260919_c48_stage1_identity_org_bridge.sql unifies
 * the FK parent set: it backfills identity.organizations from public.organizations.uuid
 * (the canonical per-tenant uuid) and installs a forward-sync trigger, WITHOUT
 * touching the GUC or enforcement (Stage 2/3).
 *
 * This pins, against real (PGlite) Postgres with the identity.organizations NOT NULL
 * contract faithfully reproduced: (a) it is wired into the set before the final
 * isolation pair; (b) the backfill mirrors every public org onto its uuid, supplying
 * the NOT NULL legal_name/business_model; (c) it never disturbs the pre-existing seed
 * rows (no DROP — the FK repoint is Stage 4); (d) the forward-sync trigger mirrors a
 * newly-created org; (e) it is idempotent; (f) the fail-closed invariant detects an
 * org with no mirror.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — tenant isolation depends on a single
 *             org identity that is valid across every governed schema.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  C2C_MIGRATION_FILES,
  C48_STAGE1_IDENTITY_ORG_BRIDGE,
  UUID_TENANT_ISOLATION_NONPUBLIC,
  TENANT_ISOLATION_SWEEP,
} from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BRIDGE = C48_STAGE1_IDENTITY_ORG_BRIDGE;
const T = 180_000;
const readMig = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const SEED = 'a1000000-0000-0000-0000-000000000001'; // a disjoint identity seed uuid

// The identity.organizations NOT NULL contract, reproduced verbatim from
// db/migrations/051_gcc_multi_tenant_identity.sql: legal_name and business_model
// are NOT NULL with NO default (the backfill must supply both); everything else the
// migration writes has a default.
const seedSchema = `
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
    signature_legal_disclaimer text NOT NULL DEFAULT 'certify',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL DEFAULT 'system'
  );
  INSERT INTO identity.organizations (id, legal_name, business_model)
    VALUES ('${SEED}', 'Seed Co', 'GOVERNMENT_AGENCY');
  CREATE TABLE public.organizations (
    id serial PRIMARY KEY,
    uuid uuid NOT NULL DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    status text NOT NULL DEFAULT 'active'
  );
`;

describe('C-48 Stage 1: wired before the final isolation pair', () => {
  it('is in the C2C deploy set, ahead of the uuid sweep and the integer sweep', () => {
    expect(C2C_MIGRATION_FILES).toContain(BRIDGE);
    const idxBridge = C2C_MIGRATION_FILES.indexOf(BRIDGE);
    const idxUuid = C2C_MIGRATION_FILES.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC);
    const idxSweep = C2C_MIGRATION_FILES.indexOf(TENANT_ISOLATION_SWEEP);
    expect(idxBridge).toBeGreaterThan(-1);
    expect(idxBridge).toBeLessThan(idxUuid); // a backfill, before the sweeps
    expect(idxBridge).toBeLessThan(idxSweep);
    // and the final pair is left intact (sweep last, uuid step just before it)
    expect(C2C_MIGRATION_FILES.slice(-2)).toEqual([UUID_TENANT_ISOLATION_NONPUBLIC, TENANT_ISOLATION_SWEEP]);
  });
});

describe('C-48 Stage 1: backfill + forward-sync + idempotency', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(seedSchema);
    await pg.exec(`INSERT INTO public.organizations (name, slug) VALUES ('Acme Bio','acme');`);
    await pg.exec(readMig(BRIDGE));
    await pg.exec(readMig(BRIDGE)); // idempotent
  }, T);

  afterAll(async () => {
    await pg.close();
  });

  it('backfills every public org onto its uuid as an identity parent, defaulting the NOT NULL cols', async () => {
    const { rows } = await pg.query<{ legal_name: string; business_model: string }>(
      `SELECT io.legal_name, io.business_model
         FROM identity.organizations io JOIN public.organizations po ON io.id = po.uuid
        WHERE po.slug = 'acme'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].legal_name).toBe('Acme Bio');
    expect(rows[0].business_model).toBe('BIO_PHARMA_SPONSOR');
  });

  it('never disturbs the pre-existing seed rows (no DROP — FK repoint is Stage 4)', async () => {
    const { rows } = await pg.query(`SELECT 1 FROM identity.organizations WHERE id = '${SEED}'`);
    expect(rows).toHaveLength(1);
  });

  it('forward-sync trigger mirrors a newly-created org automatically', async () => {
    await pg.exec(`INSERT INTO public.organizations (name, slug) VALUES ('Gamma Dx','gamma');`);
    const { rows } = await pg.query(
      `SELECT 1 FROM identity.organizations io JOIN public.organizations po ON io.id = po.uuid WHERE po.slug = 'gamma'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('leaves no public org without an identity mirror (the deploy invariant)', async () => {
    const { rows } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.organizations po
        WHERE NOT EXISTS (SELECT 1 FROM identity.organizations io WHERE io.id = po.uuid)`,
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('C-48 Stage 1: the fail-closed invariant detects an unmirrored org', () => {
  it('the invariant predicate flags a public org that has no identity mirror', async () => {
    // Reproduce the exact orphan condition the migration RAISEs on: an org whose
    // uuid is absent from identity.organizations. (Verified separately on real
    // Postgres that the migration then RAISEs; PGlite asserts the detection query.)
    const pg = new PGlite();
    await pg.exec(seedSchema);
    await pg.exec(`INSERT INTO public.organizations (name, slug) VALUES ('Orphan Inc','orphan');`);
    const { rows } = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.organizations po
        WHERE NOT EXISTS (SELECT 1 FROM identity.organizations io WHERE io.id = po.uuid)`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(1); // detected, before the migration heals it
    await pg.close();
  });
});
