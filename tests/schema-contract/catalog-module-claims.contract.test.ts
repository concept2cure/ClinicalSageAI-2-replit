/**
 * Contract: no Apps-catalog module description makes a claim the platform
 * cannot evidence.
 *
 * WHY THIS EXISTS. `check:compliance-claims` scans customer-facing SOURCE
 * files, and it is good at that. The Apps catalog is customer-facing copy that
 * lives nowhere a file-scanner can usefully read: the text a buyer sees is a
 * row in `available_modules`, and that row is the result of a seed INSERT plus
 * every later migration that updates it. No single file holds the string a
 * customer is actually shown.
 *
 * So the catalog drifted while the gate stayed green. `authoring-engine` was
 * sold as "An AI system per document type (no hallucinations, every required
 * element) ... GxP automations whose non-AI validation logic runs as intended
 * 100% of the time" — three absolutes, in the one screen where a customer
 * decides what to switch on, describing a surface that reads no data at all.
 * Meanwhile `document-authoring`, the real editor, carried an internal
 * engineering note as its description, including a "no UI" that had been false
 * for a thousand lines of UI.
 *
 * This test closes that gap by asserting against the catalog the migrations
 * actually produce, using the SAME rules the source gate uses
 * (`scripts/ci/compliance-claims.rules.mjs`) so a rule added there protects
 * both readers. It is deliberately a schema-contract test rather than a unit
 * test: mocks accept any string, and the thing under test is the assembled
 * result of several migrations.
 *
 * @compliance 21 CFR 11 — records must be accurate; a catalog entry is a
 *             representation about the system made to the person buying it.
 */

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Every migration in the deploy set that writes `available_modules`, in the
 * order the deploy set applies them — READ FROM scripts/db/migration-set.mjs.
 *
 * This was a hand-written list of five files, commented "in the order the
 * deploy set applies them", and it was not: it applied
 * 20260810_reconcile_module_catalog.sql first and the honest rewrite
 * (20260814m) last, the reverse of C2C_MIGRATION_FILES, and it omitted the
 * eight writers added after it. The deploy set runs 20260810 AFTER 20260814m,
 * and its upsert sets description = EXCLUDED.description, so every deployed
 * catalog carried "no hallucinations ... 100% of the time" while this test,
 * replaying an order no database ever saw, passed. Derived, it cannot drift.
 */
const WRITES_CATALOG = /(INSERT\s+INTO|UPDATE)\s+(public\.)?"?available_modules"?/i;
let CATALOG_MIGRATIONS: string[] = [];

/** The migration that owns the shapes of the catalog and the tables its writers read. */
const DDL_SOURCE = 'migrations/0000_sweet_joseph.sql';
/** `available_modules`, plus what the writers join or insert into. */
const DDL_TABLES = [
  'organizations', 'users', 'projects', 'module_subscriptions', 'available_modules',
  'concept2cure_artifacts', 'concept2cure_messages', 'activity_feed',
];

/**
 * The real `CREATE TABLE available_modules`, read from the migration that
 * declares it.
 *
 * Extracted rather than hand-written for the reason the harness header gives:
 * hand-mirrored DDL cannot detect drift, because it IS a second copy that can
 * drift. If a column is renamed in the migration, this test follows it.
 */
function baseDdl(): string[] {
  const src = fs.readFileSync(path.join(REPO_ROOT, DDL_SOURCE), 'utf8');
  return DDL_TABLES.map((t) => {
    const m = src.match(new RegExp(`CREATE TABLE "${t}" \\([\\s\\S]*?\\n\\);`));
    if (!m) throw new Error(`${t} DDL not found in ${DDL_SOURCE}`);
    return m[0];
  });
}

interface ClaimRule {
  id: string;
  re: RegExp;
  why: string;
}

let pg: PGlite;
let rows: Array<{ module_id: string; name: string; description: string | null }>;
let CLAIMS: ClaimRule[];

beforeAll(async () => {
  ({ CLAIMS } = (await import(
    path.join(REPO_ROOT, 'scripts/ci/compliance-claims.rules.mjs')
  )) as { CLAIMS: ClaimRule[] });

  const { C2C_MIGRATION_FILES } = (await import(
    path.join(REPO_ROOT, 'scripts/db/migration-set.mjs')
  )) as { C2C_MIGRATION_FILES: string[] };
  CATALOG_MIGRATIONS = C2C_MIGRATION_FILES.filter((f) =>
    WRITES_CATALOG.test(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
  );

  pg = new PGlite();
  for (const ddl of baseDdl()) await pg.exec(ddl);

  // Every writer must apply: one that fails here would leave the assertions
  // below reading a catalog no deploy produces.
  for (const file of CATALOG_MIGRATIONS) {
    await pg.exec(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
  }

  const r = await pg.query<{ module_id: string; name: string; description: string | null }>(
    'SELECT module_id, name, description FROM available_modules ORDER BY module_id',
  );
  rows = r.rows;
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('Apps catalog module descriptions', () => {
  it('keeps folded dossier identities deprecated across replay without deleting their rows', async () => {
    await pg.exec(`INSERT INTO available_modules (module_id, name, description, category, metadata)
      VALUES ('dossier', 'Existing dossier', '', 'Documents', '{}'),
             ('dossier-map', 'Existing dossier map', '', 'Documents', '{}')
      ON CONFLICT (module_id) DO UPDATE SET metadata = '{}'`);
    const source = fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
    await pg.exec(source);
    await pg.exec(source);
    const result = await pg.query<{ module_id: string; deprecated: string }>(`SELECT module_id, metadata->>'deprecated' AS deprecated
      FROM available_modules WHERE module_id IN ('dossier', 'dossier-map') ORDER BY module_id`);
    expect(result.rows).toEqual([{ module_id: 'dossier', deprecated: 'true' }, { module_id: 'dossier-map', deprecated: 'true' }]);
  });

  it('replays every catalog writer in the deploy set, in deploy order', () => {
    expect(CATALOG_MIGRATIONS.length).toBeGreaterThanOrEqual(13);
    // The pair whose order decided the defect: the honest rewrite, then the
    // reconcile upsert that runs after it.
    const honest = CATALOG_MIGRATIONS.indexOf('migrations/20260814m_catalog_honest_module_descriptions.sql');
    const reconcile = CATALOG_MIGRATIONS.indexOf('db/migrations/20260810_reconcile_module_catalog.sql');
    expect(honest).toBeGreaterThanOrEqual(0);
    expect(reconcile).toBeGreaterThan(honest);
  });

  it('seeds a non-trivial catalog (guards against asserting over zero rows)', () => {
    // A test that passes because it found nothing is the failure mode this
    // whole file exists to prevent, so it is checked first and explicitly.
    expect(rows.length).toBeGreaterThan(50);
  });

  it('shares its rules with the source gate rather than restating them', () => {
    expect(CLAIMS.length).toBeGreaterThan(0);
    for (const c of CLAIMS) {
      expect(c.re).toBeInstanceOf(RegExp);
      expect(typeof c.why).toBe('string');
    }
  });

  it('makes no unsupported compliance claim in any module description or name', () => {
    const violations: string[] = [];

    for (const row of rows) {
      for (const field of ['name', 'description'] as const) {
        const text = row[field];
        if (!text) continue;
        for (const claim of CLAIMS) {
          const m = text.match(claim.re);
          if (m) {
            violations.push(
              `${row.module_id}.${field} [${claim.id}] matched "${m[0].trim()}"\n    ${claim.why}`,
            );
          }
        }
      }
    }

    expect(violations, `\n${violations.join('\n  ')}\n`).toEqual([]);
  });

  it('states what the authoring-engine page is, since it reads no program data', () => {
    const row = rows.find((r) => r.module_id === 'authoring-engine');
    expect(row, 'authoring-engine missing from the catalog').toBeDefined();
    // The specific regression: it was sold as a document-production capability
    // when the surface renders inline fixtures. The description has to place it
    // as an overview and point at the surface that does the work.
    expect(row!.description).toMatch(/overview/i);
    expect(row!.description).toMatch(/document editor/i);
  });

  it('states no fixed count of report types — the registry grows', () => {
    const row = rows.find((r) => r.module_id === 'insights');
    expect(row, 'insights missing from the catalog').toBeDefined();
    expect(row!.description).not.toMatch(/\b\d+\s+report types\b/i);
  });

  it('describes batch-draft to a customer, not by its function names', () => {
    const row = rows.find((r) => r.module_id === 'batch-draft');
    expect(row, 'batch-draft missing from the catalog').toBeDefined();
    expect(row!.description).not.toMatch(/batch_draft_sections|saveSection|streamDraft|SSE/);
  });

  it('describes document-authoring by what it does, not by an internal handoff note', () => {
    const row = rows.find((r) => r.module_id === 'document-authoring');
    expect(row, 'document-authoring missing from the catalog').toBeDefined();
    expect(row!.description).not.toMatch(/HANDOFF|\.md\b/i);
    // "no UI" was stale by ~1,387 lines of UI.
    expect(row!.description).not.toMatch(/no UI/i);
  });

  /* Decision P-32 (2026-10-15) put the IND lifecycle in the launch catalog and
     kept 21 CFR 312.32 safety reporting out of it. The card launch
     organisations now see carried the registry's note — "… master data,
     amendments, annual reports, safety reports." — selling three things the
     screen does not offer. */
  it('describes the IND lifecycle without offering what P-32 withholds', () => {
    const row = rows.find((r) => r.module_id === 'ind-checklist');
    expect(row, 'ind-checklist missing from the catalog').toBeDefined();
    expect(row!.description).not.toMatch(/autodraft|master data/i);
    expect(row!.description).not.toMatch(/,\s*safety reports/i);
    expect(row!.description).toMatch(/IND safety reports are not part of this release/);
    expect(row!.description).toMatch(/Letter of Authorization/);
  });

  /* Same decision, the agency-questions card: it sold "signed responses",
     while approval there is a recorded status (the approve route sets status
     'approved'; no electronic signature is captured) and the screen says so. */
  it('describes agency-question approval as what it is, not as a signature', () => {
    const row = rows.find((r) => r.module_id === 'haq-manager');
    expect(row, 'haq-manager missing from the catalog').toBeDefined();
    expect(row!.description).not.toMatch(/\bsign(ed|ature)/i);
    expect(row!.description).toMatch(/approv/i);
  });
});


describe('Retired filing catalogue subscriptions', () => {
  it('fresh replay neither creates a retired filing identity nor requires it for packaging', async () => {
    const reconcile = fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
    const packaging = fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260823_module_catalog_commercial_packaging.sql'), 'utf8');
    for (let replay = 0; replay < 2; replay += 1) {
      await pg.exec(reconcile);
      await pg.exec(packaging);
      expect((await pg.query("SELECT module_id FROM available_modules WHERE module_id = 'filings-catalog'")).rows).toEqual([]);
      expect((await pg.query("SELECT module_id FROM available_modules WHERE module_id = 'projects' AND COALESCE((metadata->>'deprecated')::boolean, false) = false")).rows).toEqual([{ module_id: 'projects' }]);
    }
  });

  it('keeps an existing filing catalogue and subscription retired across catalogue and packaging replay', async () => {
    await pg.exec(`INSERT INTO organizations (id, name, slug) VALUES (210010, 'A2.10 historical subscriber', 'a210-historical-subscriber');
      INSERT INTO available_modules (module_id, name, description, category, metadata)
      VALUES ('filings-catalog', 'Historical filing catalogue', '', 'Reference', '{"legacyMarker":"kept","tiers":["recorded"]}')
      ON CONFLICT (module_id) DO UPDATE SET metadata = '{"legacyMarker":"kept","tiers":["recorded"]}';
      ALTER TABLE module_subscriptions ADD CONSTRAINT a210_subscription_retirement_fk
        FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE;
      INSERT INTO module_subscriptions (organization_id, module_id, enabled, metadata)
      VALUES (210010, 'filings-catalog', false, '{"historicalSubscription":"kept"}');`);
    const before = await pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id = 210010');
    const reconcile = fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
    const packaging = fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260823_module_catalog_commercial_packaging.sql'), 'utf8');
    for (let replay = 0; replay < 2; replay += 1) { await pg.exec(reconcile); await pg.exec(packaging); }
    const catalog = await pg.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM available_modules WHERE module_id='filings-catalog'");
    expect(catalog.rows).toHaveLength(1);
    expect(catalog.rows[0].metadata).toEqual({ deprecated: true, legacyMarker: 'kept', tiers: ['recorded'] });
    const after = await pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id = 210010');
    expect(after.rows).toEqual(before.rows);
  });
});

/* The device task workbench folded into Tasks (D2, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/). Both catalogue writers
   were amended in place (CLAUDE.md Rule 1): a fresh database never gets the row,
   and a deployed one keeps it, deprecated, with its subscriptions. */
describe('Retired device task workbench', () => {
  const reconcile = () => fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
  const packaging = () => fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260823_module_catalog_commercial_packaging.sql'), 'utf8');

  it('fresh replay neither creates device-tasks nor requires it for packaging, and Tasks stays offered', async () => {
    for (let replay = 0; replay < 2; replay += 1) {
      await pg.exec(reconcile());
      await pg.exec(packaging());
      expect((await pg.query("SELECT module_id FROM available_modules WHERE module_id = 'device-tasks'")).rows).toEqual([]);
      expect((await pg.query("SELECT module_id FROM available_modules WHERE module_id = 'tasks' AND COALESCE((metadata->>'deprecated')::boolean, false) = false")).rows).toEqual([{ module_id: 'tasks' }]);
    }
  });

  it('keeps an existing device-tasks row and its subscription, deprecated, across catalogue and packaging replay', async () => {
    await pg.exec(`INSERT INTO organizations (id, name, slug) VALUES (291029, 'Device tasks historical subscriber', 'device-tasks-historical-subscriber');
      INSERT INTO available_modules (module_id, name, description, category, metadata)
      VALUES ('device-tasks', 'Device submission workload', '', 'Review & govern', '{"legacyMarker":"kept","tiers":["standard"]}')
      ON CONFLICT (module_id) DO UPDATE SET metadata = '{"legacyMarker":"kept","tiers":["standard"]}';
      ALTER TABLE module_subscriptions ADD CONSTRAINT device_tasks_subscription_retirement_fk
        FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE;
      INSERT INTO module_subscriptions (organization_id, module_id, enabled, metadata)
      VALUES (291029, 'device-tasks', true, '{"historicalSubscription":"kept"}');`);
    const before = await pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id = 291029');
    for (let replay = 0; replay < 2; replay += 1) { await pg.exec(reconcile()); await pg.exec(packaging()); }
    const catalog = await pg.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM available_modules WHERE module_id='device-tasks'");
    expect(catalog.rows).toHaveLength(1);
    expect(catalog.rows[0].metadata).toEqual({ deprecated: true, legacyMarker: 'kept', tiers: ['standard'] });
    const after = await pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id = 291029');
    expect(after.rows).toEqual(before.rows);
  });
});

/* The Artifacts center and the device vault folded into the Vault (D2, fold F3,
   2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f3-vault/). Both catalogue
   writers were amended in place (CLAUDE.md Rule 1): a fresh database never gets
   either row, and a deployed one keeps each, deprecated, with its subscriptions. */
describe('Retired Artifacts center and device vault', () => {
  const reconcile = () => fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
  const packaging = () => fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260823_module_catalog_commercial_packaging.sql'), 'utf8');
  const RETIRED = [
    { id: 'artifacts-center', name: 'Artifacts Center', category: 'Evidence & data', tier: 'free', org: 291030 },
    { id: 'device-vault', name: 'Device artifact vault', category: 'Evidence & data', tier: 'standard', org: 291031 },
  ];

  it('fresh replay creates neither row nor requires either for packaging, and the Vault stays offered at free', async () => {
    for (let replay = 0; replay < 2; replay += 1) {
      await pg.exec(reconcile());
      await pg.exec(packaging());
      for (const { id } of RETIRED) {
        expect((await pg.query('SELECT module_id FROM available_modules WHERE module_id = $1', [id])).rows, id).toEqual([]);
      }
      const vault = await pg.query<{ metadata: { tiers?: string[]; deprecated?: boolean } }>(
        "SELECT metadata FROM available_modules WHERE module_id = 'vault'");
      expect(vault.rows).toHaveLength(1);
      expect(vault.rows[0].metadata.deprecated ?? false).toBe(false);
      expect(vault.rows[0].metadata.tiers).toEqual(['free']);
    }
  });

  it('keeps each existing row and its subscription, deprecated, across catalogue and packaging replay', async () => {
    for (const r of RETIRED) {
      await pg.exec(`INSERT INTO organizations (id, name, slug) VALUES (${r.org}, 'Historical subscriber ${r.id}', 'historical-${r.id}');`);
      await pg.query(
        `INSERT INTO available_modules (module_id, name, description, category, metadata)
         VALUES ($1, $2, '', $3, $4::json)
         ON CONFLICT (module_id) DO UPDATE SET metadata = EXCLUDED.metadata`,
        [r.id, r.name, r.category, JSON.stringify({ legacyMarker: 'kept', tiers: [r.tier] })],
      );
      await pg.query(
        `INSERT INTO module_subscriptions (organization_id, module_id, enabled, metadata) VALUES ($1, $2, true, '{"historicalSubscription":"kept"}')`,
        [r.org, r.id],
      );
    }
    await pg.exec(`ALTER TABLE module_subscriptions ADD CONSTRAINT f3_vault_fold_subscription_retirement_fk
      FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE;`);
    const subs = () => pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id IN (291030, 291031) ORDER BY organization_id');
    const before = await subs();
    expect(before.rows).toHaveLength(2);
    for (let replay = 0; replay < 2; replay += 1) { await pg.exec(reconcile()); await pg.exec(packaging()); }
    for (const r of RETIRED) {
      const catalog = await pg.query<{ metadata: Record<string, unknown> }>('SELECT metadata FROM available_modules WHERE module_id = $1', [r.id]);
      expect(catalog.rows, r.id).toHaveLength(1);
      expect(catalog.rows[0].metadata, r.id).toEqual({ deprecated: true, legacyMarker: 'kept', tiers: [r.tier] });
    }
    expect((await subs()).rows).toEqual(before.rows);
  });
});

/* The Part 11 console folded into Audit trail (D2, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-part11-console/). It never had a
   catalogue row (21 CFR §11.10(e): it is not licensable), but 20260810 kept it on
   step 1's keep-list, so a row added by any other path stayed live for a screen
   that no longer exists. Amended in place (CLAUDE.md Rule 1): off the keep-list,
   so such a row is deprecated on replay with its subscriptions kept. Audit trail
   stays off the catalogue and on the keep-list. */
describe('Retired Part 11 console', () => {
  const reconcile = () => fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
  const packaging = () => fs.readFileSync(path.join(REPO_ROOT, 'db/migrations/20260823_module_catalog_commercial_packaging.sql'), 'utf8');

  it('fresh replay creates no part11-console row, and Audit trail stays uncatalogued', async () => {
    for (let replay = 0; replay < 2; replay += 1) {
      await pg.exec(reconcile());
      await pg.exec(packaging());
      for (const id of ['part11-console', 'audit-trail']) {
        expect((await pg.query('SELECT module_id FROM available_modules WHERE module_id = $1', [id])).rows, id).toEqual([]);
      }
    }
  });

  it('deprecates a part11-console row added by another path, and keeps its subscription, across replay', async () => {
    await pg.exec(`INSERT INTO organizations (id, name, slug) VALUES (291032, 'Historical subscriber part11-console', 'historical-part11-console');`);
    await pg.query(
      `INSERT INTO available_modules (module_id, name, description, category, metadata)
       VALUES ('part11-console', '21 CFR Part 11 console', '', 'Review & govern', '{"legacyMarker":"kept","tiers":[]}'::json)
       ON CONFLICT (module_id) DO UPDATE SET metadata = EXCLUDED.metadata`,
    );
    await pg.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, metadata) VALUES (291032, 'part11-console', true, '{"historicalSubscription":"kept"}')`,
    );
    await pg.exec(`ALTER TABLE module_subscriptions ADD CONSTRAINT part11_console_fold_subscription_retirement_fk
      FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE;`);
    const subs = () => pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id = 291032');
    const before = await subs();
    expect(before.rows).toHaveLength(1);
    for (let replay = 0; replay < 2; replay += 1) { await pg.exec(reconcile()); await pg.exec(packaging()); }
    const catalog = await pg.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM available_modules WHERE module_id = 'part11-console'");
    expect(catalog.rows).toHaveLength(1);
    expect(catalog.rows[0].metadata).toEqual({ deprecated: true, legacyMarker: 'kept', tiers: [] });
    expect((await subs()).rows).toEqual(before.rows);
  });
});

/* The eCTD publishing reference folded into eCTD Compile (D2, 2026-10-29;
   docs/evidence/D2-ONE-ANA/2026-10-29/fold-ectd-publishing/). Its row was written
   only by migrations/20260814j (ON CONFLICT DO NOTHING), which runs before
   20260810 in the deploy set; 20260810 kept it off step 1's deprecation and healed
   earlier ones (step 1b); 20260823 gave it a tier. All three were amended in place
   (CLAUDE.md Rule 1): no insert, off the keep-list, no heal step, no packaging
   row. A fresh database never holds the row; a deployed one keeps it, its
   recorded tier and its subscriptions, deprecated on every replay, and nothing
   clears the flag. */
describe('Retired eCTD publishing reference', () => {
  const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
  const WRITERS = [
    'migrations/20260814j_catalog_missing_product_surfaces.sql',
    'db/migrations/20260810_reconcile_module_catalog.sql',
    'db/migrations/20260823_module_catalog_commercial_packaging.sql',
  ];
  const meta = async (db: PGlite, id: string) =>
    (await db.query<{ metadata: Record<string, unknown> }>('SELECT metadata FROM available_modules WHERE module_id = $1', [id])).rows;

  it('a fresh database replaying the whole catalogue set twice never creates the row nor requires it for packaging, and eCTD Compile stays offered', async () => {
    expect(WRITERS.every((f) => CATALOG_MIGRATIONS.includes(f))).toBe(true);
    expect(CATALOG_MIGRATIONS.indexOf(WRITERS[0])).toBeLessThan(CATALOG_MIGRATIONS.indexOf(WRITERS[1]));
    const fresh = new PGlite();
    try {
      for (const ddl of baseDdl()) await fresh.exec(ddl);
      for (let replay = 0; replay < 2; replay += 1) {
        for (const file of CATALOG_MIGRATIONS) await fresh.exec(read(file));
        expect(await meta(fresh, 'ectd-publishing'), `replay ${replay}`).toEqual([]);
        const compile = await meta(fresh, 'ectd-compile');
        expect(compile[0].metadata.deprecated ?? false).toBe(false);
        expect(compile[0].metadata.tiers).toEqual(['standard']);
      }
    } finally {
      await fresh.close();
    }
  }, 120_000);

  it('keeps a deployed row, its tier and its subscription, deprecated, across catalogue and packaging replay', async () => {
    await pg.exec(`INSERT INTO organizations (id, name, slug) VALUES (291033, 'Historical subscriber ectd-publishing', 'historical-ectd-publishing');`);
    // As a deployed database holds it today: healed by the old step 1b, tiered by the old packaging row.
    await pg.query(
      `INSERT INTO available_modules (module_id, name, description, category, metadata)
       VALUES ('ectd-publishing', 'Publishing centre', '', 'Submissions', '{"legacyMarker":"kept","tiers":["standard"]}'::json)
       ON CONFLICT (module_id) DO UPDATE SET metadata = EXCLUDED.metadata`,
    );
    await pg.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, metadata) VALUES (291033, 'ectd-publishing', true, '{"historicalSubscription":"kept"}')`,
    );
    await pg.exec(`ALTER TABLE module_subscriptions ADD CONSTRAINT ectd_publishing_fold_subscription_retirement_fk
      FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE;`);
    const subs = () => pg.query('SELECT organization_id, module_id, enabled, metadata FROM module_subscriptions WHERE organization_id = 291033');
    const before = await subs();
    expect(before.rows).toHaveLength(1);
    for (let replay = 0; replay < 2; replay += 1) {
      for (const file of WRITERS) await pg.exec(read(file));
      expect(await meta(pg, 'ectd-publishing'), `replay ${replay}`).toEqual([
        { metadata: { deprecated: true, legacyMarker: 'kept', tiers: ['standard'] } },
      ]);
    }
    expect((await subs()).rows).toEqual(before.rows);
  });
});
