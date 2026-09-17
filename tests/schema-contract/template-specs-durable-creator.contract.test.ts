/**
 * Contract: `c2c_template_specs` has a creator on the replaying applier.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The table has NO Drizzle definition — zero hits for it anywhere under
 * `shared/` — so `drizzle-kit push` cannot create it. Its only two creators are
 * `migrations/20260531_template_specs.sql` and
 * `migrations/20260716_template_doc_types.sql`, and neither was in
 * `C2C_MIGRATION_FILES`. Both run on install-fresh's step-3 overlay and nowhere
 * else.
 *
 * So the table exists on every freshly provisioned database and is re-asserted
 * on none of them. Two consequences, and only the second is the headline one:
 *
 *   1. A database provisioned BEFORE 20260716 was written has the table (from
 *      20260531) and NOT `doc_types`, and no applier will ever add it. That is
 *      what "reaches no populated database" means — not that the table is
 *      absent today, but that the column never travels to a database that
 *      predates it.
 *   2. Nothing re-creates the table if it is ever lost — a restore, a schema
 *      tool, a manual intervention. It is read and written at runtime
 *      (`server/services/templates/templateStore.ts`) and rendered by
 *      `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx`.
 *
 * ── WHY THE MISSING COLUMN IS SILENT RATHER THAN LOUD ────────────────────────
 * No statement names `doc_types`. The INSERT lists twelve columns without it,
 * the UPDATE sets four without it, and every read is `SELECT *` / `RETURNING *`.
 * On a database lacking the column nothing raises 42703: `row.doc_types` is
 * `undefined`, and `templateStore.ts:47` maps that to `[]` —
 * `Array.isArray(undefined)` is false. Every template then reports zero
 * document types, which is indistinguishable from a template that genuinely has
 * none. A missing column rendered as an empty result, with no error anywhere.
 *
 * ── WHAT THIS TEST DOES NOT CLAIM ────────────────────────────────────────────
 * That fixing the applier makes document-type chips appear. It does not:
 * NOTHING IN THE REPOSITORY EVER WRITES `doc_types`. Verified by grepping all
 * of server/, client/, shared/, migrations/ and db/ — the only references are
 * the type declaration, the read that defaults to `[]`, the UI that renders it,
 * and the migration that adds the column with `DEFAULT '[]'`. (The `docTypes`
 * hits under `pathway-engines/` and `cerv2-ai-routes` are a different concept:
 * `c2c_documents.doc_type` filters.) So the column is inert everywhere, and a
 * database with it behaves exactly like one without. That is worth fixing on
 * its own and is not this test's subject; this test is about the table having a
 * durable creator at all.
 *
 * ── THE GUARD THAT WAS TOLD TO IGNORE THIS ───────────────────────────────────
 * `tests/ops/apply-c2c-migrations-manifest.test.mjs` exempts the file via
 * KNOWN_UNLISTED, whose stated reason is that such files' "objects come from
 * shared/schema.ts via drizzle-kit push and they carry nothing an existing
 * database additionally needs." BOTH halves fail here: there is no Drizzle
 * definition, and the file carries `ADD COLUMN IF NOT EXISTS doc_types`, which
 * is exactly something an existing database additionally needs. That guard's own
 * comment sets the rule this test enforces: "Removing an entry (by listing the
 * file in the applier) is always safe; adding one requires the reason above to
 * actually hold."
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { declaredTableEntries } from '../../scripts/db/lib/declared-tables.mjs';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TABLE = 'c2c_template_specs';
const ENTRYPOINTS = [
  './shared/schema.ts',
  './shared/schema/ana-intelligence.ts',
  './shared/schema/report-os.ts',
];

describe(`${TABLE} — the premises this contract rests on`, () => {
  it('has no Drizzle definition, so push cannot create it', () => {
    const declared = declaredTableEntries(ENTRYPOINTS, REPO_ROOT).map((t) => t.name);
    expect(declared).not.toContain(TABLE);
  });

  it('is used at runtime, so its absence would not be harmless', () => {
    const store = fs.readFileSync(
      path.join(REPO_ROOT, 'server/services/templates/templateStore.ts'),
      'utf8',
    );
    expect(store).toContain(TABLE);
    // Reads are SELECT * — which is why a missing column is silent, not a 42703.
    expect(store).toMatch(new RegExp(`SELECT \\* FROM ${TABLE}`));
  });
});

describe(`${TABLE} — durability`, () => {
  it('has a creator in C2C_MIGRATION_FILES', () => {
    const creators = C2C_MIGRATION_FILES.filter((f) => {
      const abs = path.join(REPO_ROOT, f);
      if (!fs.existsSync(abs)) return false;
      const text = fs.readFileSync(abs, 'utf8').replace(/--.*$/gm, '');
      return new RegExp(`CREATE TABLE\\s+(?:IF NOT EXISTS\\s+)?"?${TABLE}\\b`, 'i').test(text);
    });
    // Was: [] — both creators sat on install-fresh's overlay and nowhere else.
    expect(creators).not.toEqual([]);
  });

  it('carries the doc_types column on that same durable path', () => {
    const adders = C2C_MIGRATION_FILES.filter((f) => {
      const abs = path.join(REPO_ROOT, f);
      if (!fs.existsSync(abs)) return false;
      const text = fs.readFileSync(abs, 'utf8').replace(/--.*$/gm, '');
      return /ADD COLUMN IF NOT EXISTS doc_types/i.test(text);
    });
    expect(adders).not.toEqual([]);
  });
});

describe('the exemption that hid this is gone', () => {
  it('20260716_template_doc_types.sql is no longer in KNOWN_UNLISTED', () => {
    const guard = fs.readFileSync(
      path.join(REPO_ROOT, 'tests/ops/apply-c2c-migrations-manifest.test.mjs'),
      'utf8',
    );
    const start = guard.indexOf('const KNOWN_UNLISTED');
    const block = guard.slice(start, guard.indexOf(']);', start));
    // The guard's own rule: an entry requires its stated reason to hold. Here
    // neither half does — no Drizzle definition, and it carries an ADD COLUMN.
    expect(block).not.toContain('20260716_template_doc_types.sql');
  });
});
