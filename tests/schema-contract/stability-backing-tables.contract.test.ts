/**
 * Schema contract: backed stability tables + views (G-02, tenant-isolated from birth).
 *
 * db/migrations/20260728_stability_backing_tables.sql creates the seven previously
 * unbacked stab_* tables, the shared cmc_methods catalog, and the two v_stab_* views —
 * each tenant-isolated (or, for the global catalog, deliberately not) exactly as the
 * follow-up to the stability security fix requires.
 *
 * This suite applies the migration to real Postgres (PGlite) and, under a NON-superuser
 * role with app.rls_enforce='on' (RLS is bypassed for superusers/owners), proves:
 *   - a new stab_* table (stab_capa, stab_samples) auto-tags tenant_id on INSERT and a
 *     second tenant's read/UPDATE by surrogate id (capa_id, sample_id) affects ZERO rows,
 *   - cmc_methods is GLOBAL — a row inserted by one tenant is visible to another (the
 *     catalog decision; tenant-scoping it would hide every method), and
 *   - v_stab_due_tp isolates via the base tables' RLS (security_invoker), so one tenant
 *     never sees another's due timepoints through the view.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const ISOLATION_MIGRATION = 'db/migrations/20260728_stability_tenant_isolation.sql';
const MIGRATION = 'db/migrations/20260728_stability_backing_tables.sql';
let db: PGlite;

async function asTenant<T>(tenantId: number | null, enforce: boolean, fn: () => Promise<T>): Promise<T> {
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('app.rls_enforce', $1, true)`, [enforce ? 'on' : 'off']);
    await db.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId == null ? '' : String(tenantId)]);
    await db.exec('SET LOCAL ROLE stab_app');
    const r = await fn();
    await db.exec('COMMIT');
    return r;
  } catch (e) {
    await db.exec('ROLLBACK').catch(() => {});
    throw e;
  }
}

const T1_STUDY = '11111111-1111-1111-1111-111111111111';
const T2_STUDY = '22222222-2222-2222-2222-222222222222';
const T1_COND = 'c1111111-1111-1111-1111-111111111111';
const T2_COND = 'c2222222-2222-2222-2222-222222222222';

beforeAll(async () => {
  db = new PGlite();
  // The two view base tables already exist in the real schema (022); create the minimal
  // shapes here (without tenant_id — the migration's sweep adds it + the policy), so the
  // migration's guarded CREATE VIEW fires.
  await db.exec(`
    CREATE TABLE stab_conditions (cond_id UUID PRIMARY KEY, study_id UUID, kind TEXT);
    CREATE TABLE stab_timepoints (
      tp_id UUID PRIMARY KEY, study_id UUID, cond_id UUID,
      label TEXT, month INT, planned_date DATE, actual_date DATE
    );
    CREATE ROLE stab_app NOLOGIN;
  `);

  // Apply BOTH stability migrations, in the order the applier runs them. The
  // isolation migration owns the PRE-EXISTING tables (it adds tenant_id, coerces a
  // TEXT one, and attaches the policy) — including stab_timepoints / stab_conditions,
  // which the two views read. The backing migration deliberately only touches the
  // tables it creates, so applying it alone would leave those base tables unisolated
  // and the view-isolation assertion below would be vacuous.
  await db.exec(fs.readFileSync(path.resolve(ISOLATION_MIGRATION), 'utf8'));
  await db.exec(fs.readFileSync(path.resolve(MIGRATION), 'utf8'));

  // Grant AFTER the migration so every new table + view is covered.
  await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO stab_app;`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('backed stability tables + views enforce tenant isolation', () => {
  it('created the seven tables, the catalog, and the two views', async () => {
    const tabs = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name IN ('stab_capa','stab_excursions','stab_samples','stab_chain',
                             'stab_assignments','stab_signoffs','stab_protocols','cmc_methods')`,
    );
    expect(tabs.rows[0].n).toBe(8);
    const views = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.views
        WHERE table_name IN ('v_stab_due_tp','v_stab_upcoming_tp')`,
    );
    expect(views.rows[0].n).toBe(2);
    // cmc_methods must have NO tenant_id (global catalog)
    const tcol = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name='cmc_methods' AND column_name='tenant_id'`,
    );
    expect(tcol.rows[0].n).toBe(0);
  });

  it('stab_capa: INSERT auto-tags tenant, cross-tenant read/UPDATE by capa_id is blocked', async () => {
    await asTenant(1, true, async () => {
      await db.query(`INSERT INTO stab_capa (capa_id, study_id, title, status)
                      VALUES ('aaaa1111-1111-1111-1111-111111111111', $1, 'OOS follow-up', 'OPEN')`, [T1_STUDY]);
    });
    const tag = await asTenant(1, true, () =>
      db.query<{ tenant_id: number }>(`SELECT tenant_id FROM stab_capa WHERE capa_id='aaaa1111-1111-1111-1111-111111111111'`),
    );
    expect(tag.rows[0].tenant_id).toBe(1);

    await asTenant(2, true, async () => {
      const read = await db.query(`SELECT * FROM stab_capa WHERE capa_id='aaaa1111-1111-1111-1111-111111111111'`);
      expect(read.rows.length).toBe(0);
      const upd = await db.query(`UPDATE stab_capa SET status='HACKED' WHERE capa_id='aaaa1111-1111-1111-1111-111111111111'`);
      expect(upd.affectedRows ?? 0).toBe(0);
    });

    const still = await asTenant(1, true, () =>
      db.query<{ status: string }>(`SELECT status FROM stab_capa WHERE capa_id='aaaa1111-1111-1111-1111-111111111111'`),
    );
    expect(still.rows[0].status).toBe('OPEN');
  });

  it('stab_samples: RLS-only lookup by sample_id is isolated (the router queries it with no study filter)', async () => {
    await asTenant(1, true, async () => {
      await db.query(`INSERT INTO stab_samples (sample_id, study_id, tp_id, sample_code)
                      VALUES ('bbbb1111-1111-1111-1111-111111111111', $1, 'dddd1111-1111-1111-1111-111111111111', 'S1-LT-0M')`, [T1_STUDY]);
    });
    // finding: GET /samples/:id/barcode.png and the chain routes look up by sample_id ONLY.
    const other = await asTenant(2, true, () =>
      db.query(`SELECT sample_code FROM stab_samples WHERE sample_id='bbbb1111-1111-1111-1111-111111111111'`),
    );
    expect(other.rows.length).toBe(0);
    const own = await asTenant(1, true, () =>
      db.query(`SELECT sample_code FROM stab_samples WHERE sample_id='bbbb1111-1111-1111-1111-111111111111'`),
    );
    expect(own.rows.length).toBe(1);
  });

  it('cmc_methods is a GLOBAL catalog — visible across tenants (not isolated)', async () => {
    await asTenant(1, true, async () => {
      await db.query(`INSERT INTO cmc_methods (id, title, status)
                      VALUES ('eeee1111-1111-1111-1111-111111111111', 'Assay by HPLC', 'VALIDATED')`);
    });
    // A second tenant MUST see the shared method (else every stab_tests↔cmc_methods join breaks).
    const seen = await asTenant(2, true, () =>
      db.query(`SELECT title FROM cmc_methods WHERE id='eeee1111-1111-1111-1111-111111111111'`),
    );
    expect(seen.rows.length).toBe(1);
    expect((seen.rows[0] as { title: string }).title).toBe('Assay by HPLC');
  });

  it('v_stab_due_tp isolates via base-table RLS (security_invoker) — no cross-tenant timepoints', async () => {
    // Each tenant seeds an unsampled timepoint (actual_date NULL) for its own study.
    await asTenant(1, true, async () => {
      await db.query(`INSERT INTO stab_conditions (cond_id, study_id, kind) VALUES ($1, $2, 'LT')`, [T1_COND, T1_STUDY]);
      await db.query(`INSERT INTO stab_timepoints (tp_id, study_id, cond_id, label, month, planned_date, actual_date)
                      VALUES ('f1111111-1111-1111-1111-111111111111', $1, $2, '0M', 0, '2026-01-01', NULL)`, [T1_STUDY, T1_COND]);
    });
    await asTenant(2, true, async () => {
      await db.query(`INSERT INTO stab_conditions (cond_id, study_id, kind) VALUES ($1, $2, 'LT')`, [T2_COND, T2_STUDY]);
      await db.query(`INSERT INTO stab_timepoints (tp_id, study_id, cond_id, label, month, planned_date, actual_date)
                      VALUES ('f2222222-2222-2222-2222-222222222222', $1, $2, '0M', 0, '2026-01-01', NULL)`, [T2_STUDY, T2_COND]);
    });

    // Tenant 1 sees only its own timepoint through the view; tenant 2's study returns nothing to it.
    const own = await asTenant(1, true, () =>
      db.query(`SELECT tp_id FROM v_stab_due_tp WHERE study_id=$1`, [T1_STUDY]),
    );
    expect(own.rows.length).toBe(1);
    // Tenant 2 asking for tenant 1's study id via the view gets nothing (base-table RLS).
    const cross = await asTenant(2, true, () =>
      db.query(`SELECT tp_id FROM v_stab_due_tp WHERE study_id=$1`, [T1_STUDY]),
    );
    expect(cross.rows.length).toBe(0);
  });
});
