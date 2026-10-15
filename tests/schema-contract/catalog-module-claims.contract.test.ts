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
