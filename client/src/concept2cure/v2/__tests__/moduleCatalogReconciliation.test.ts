/**
 * Apps catalog ↔ shell taxonomy drift guard.
 *
 * THE DEFECT THIS PINS. `available_modules` (the Apps catalog + entitlement
 * catalogue) and the shell's own app list were two independent id spaces. The
 * catalog was seeded once with 19 modules — 'cmc-wizard', 'doc-canvas',
 * 'csr-author', '510k-submission', 'nda-bla', ... — while the shell presents 86
 * apps to users via SEGMENT_MODULES, rendered on Home beneath the AnA
 * introduction. The two overlapped on exactly TWO ids ('vault',
 * 'ectd-coauthor'), so the catalog advertised 17 modules a user cannot open and
 * omitted 84 they can.
 *
 * db/migrations/20260810_reconcile_module_catalog.sql re-keys the catalog to the
 * surface ids. This test reads that migration and asserts the two lists still
 * agree, so a surface added to the shell without a catalog row (or a catalog row
 * naming no real surface) fails here rather than silently re-opening the gap.
 *
 * ── The catalog is more than one file, and must be ────────────────────────────
 * This originally read the 20260810 migration alone and treated it as the whole
 * seed. That was wrong the moment a surface was added after it: an APPLIED
 * migration must not be edited, because deployed databases will never re-run it,
 * so a new catalog row correctly arrives as a FOLLOW-UP migration. Reading one
 * file made those follow-ups look like missing rows, and the only way to go
 * green would have been to edit history — the opposite of the practice this
 * guard should protect.
 *
 * So the seed is the UNION of the 20260810 re-key and every LATER migration that
 * inserts into `available_modules`, discovered by scanning rather than listed by
 * name, so a follow-up added tomorrow is picked up without touching this file.
 * Earlier catalog migrations are deliberately excluded: they seeded the legacy
 * id space ('ind-filing', 'cmc-wizard', …) that 20260810 exists to retire, and
 * counting them would resurrect exactly the drift this guard was written for.
 *
 * It is a pure file+registry test on purpose: no database, so it runs in the
 * normal unit suite and guards the SOURCE of the seed rather than one deployment.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SEGMENTS, getSegmentModules, DEEP_LINK_ALIASES } from '../registryModel';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

const REPO_ROOT = path.resolve(__dirname, '../../../../../');

/** The migration that re-keyed the catalog to surface ids — the base seed. */
const BASE_MIGRATION = path.join(REPO_ROOT, 'db/migrations/20260810_reconcile_module_catalog.sql');

/** The base migration's date prefix; anything at or after it is in the live seed. */
const BASE_PREFIX = '20260810';

/**
 * The base re-key plus every LATER migration that seeds catalog rows, in apply
 * order (the filenames are date-prefixed, so name order is apply order).
 *
 * Discovered by scanning both migration directories, so a follow-up landing
 * tomorrow needs no edit here. Migrations EARLIER than the base are excluded on
 * purpose — `20260220_user_intelligence_platform.sql` and the drizzle baseline
 * seed the legacy id space that 20260810 retires, and folding them in would
 * re-assert the very rows this guard exists to keep retired.
 */
function catalogMigrationFiles(): string[] {
  const found: string[] = [];
  for (const dir of ['db/migrations', 'migrations']) {
    const abs = path.join(REPO_ROOT, dir);
    let names: string[] = [];
    try {
      names = readdirSync(abs).filter((n) => n.endsWith('.sql')).sort();
    } catch {
      continue;
    }
    for (const n of names) {
      if (n.slice(0, BASE_PREFIX.length) < BASE_PREFIX) continue;
      const full = path.join(abs, n);
      /* Any migration that CHANGES the catalog, not only ones that insert into
         it. A migration that only retires a row (UPDATE … deprecated) is just as
         much part of what the catalog advertises, and reading inserts alone made
         a retirement invisible — the set would still count a row that is no
         longer offered. */
      if (/(?:INSERT INTO|UPDATE)\s+available_modules/i.test(readFileSync(full, 'utf8'))) {
        found.push(full);
      }
    }
  }
  // Base first so its rows are the spine and follow-ups extend it.
  return [BASE_MIGRATION, ...found.filter((f) => f !== BASE_MIGRATION).sort((a, b) => path.basename(a).localeCompare(path.basename(b)))];
}

/**
 * Apps that must never become entitlement-gated.
 *
 * A catalog row IS an entitlement toggle. 21 CFR §11.10(e) requires a secure,
 * computer-generated, time-stamped audit trail that users cannot switch off,
 * and the Part 11 console is how that compliance is evidenced — so neither may
 * be something an organization can be sold without, or an admin can disable.
 * They stay in the shell and fully reachable; they simply have no catalog row,
 * so nothing can gate them.
 *
 * The line is "is this the mechanism by which Part 11 compliance is recorded or
 * evidenced?" — 'identity-console' (enterprise SSO/SCIM) is a real commercial
 * add-on, and 'qmp' / 'report-governance' are features, so all three ARE seeded.
 */
const NEVER_LICENSABLE = new Set(['audit-trail', 'part11-console']);

/** Every app id the shell presents to a user, across every segment. */
function shellAppIds(): Set<string> {
  const ids = new Set<string>();
  for (const seg of SEGMENTS as Array<{ id: string }>) {
    for (const group of getSegmentModules(seg.id) ?? []) {
      for (const id of group.items) ids.add(id);
    }
  }
  return ids;
}

/**
 * The module ids the migration seeds, read from its INSERT ... VALUES block.
 * Deliberately parses only the VALUES rows (leading `('id', ...`), not the
 * retire-list in step 1, so the two halves of the migration are checked apart.
 */
/**
 * Module ids a migration RETIRES (deprecates). The catalog reader filters on
 * `deprecated`, so a retired row is not an advertised module and must not count
 * as one — the same retire-don't-delete mechanism the base migration uses to
 * stand down the legacy id space.
 *
 * Parsed from comment-STRIPPED sql and bounded to a single statement. Both
 * matter: these migrations document their own rollback in `--` comments, so
 * matching raw text picks up ids from prose, and an unbounded match runs from
 * one UPDATE past the next semicolon into unrelated rows.
 *
 * A `module_id NOT IN (…)` clause is deliberately NOT read — that is the base
 * migration retiring everything OUTSIDE its new id space, which is already
 * expressed by reading its INSERT block as the seed.
 */
function retiredModuleIds(sql: string): string[] {
  const executable = sql.replace(/^\s*--.*$/gm, '');
  const out: string[] = [];
  for (const stmt of executable.split(';')) {
    if (!/UPDATE\s+available_modules/i.test(stmt)) continue;
    if (!/deprecated/i.test(stmt)) continue;
    const where = stmt.slice(stmt.search(/\bWHERE\b/i));
    if (/module_id\s+NOT\s+IN/i.test(where)) continue;
    if (!/module_id\s*(=|\bIN\b)/i.test(where)) continue;
    for (const id of where.matchAll(/'([a-z0-9-]+)'/g)) out.push(id[1]);
  }
  return out;
}

function seededModuleIds(sql: string): string[] {
  const insertAt = sql.indexOf('INSERT INTO available_modules');
  if (insertAt === -1) return [];
  const body = sql.slice(insertAt);
  const end = body.indexOf('ON CONFLICT');
  expect(end, 'INSERT must be an upsert (ON CONFLICT)').toBeGreaterThan(-1);
  return Array.from(body.slice(0, end).matchAll(/^\s*\('([a-z0-9-]+)'/gim)).map((m) => m[1]);
}

describe('Apps catalog ↔ shell taxonomy', () => {
  const files = catalogMigrationFiles();
  const sources = files.map((f) => readFileSync(f, 'utf8'));
  /** Every catalog migration concatenated — the seed as a deployed DB sees it. */
  const sql = sources.join('\n');
  /** The base migration alone, for the assertions that are about ITS structure. */
  const baseSql = sources[0];
  const retired = new Set(sources.flatMap(retiredModuleIds));
  /** Every row the migrations INSERT, retired or not — the structural set. */
  const seededRows = sources.flatMap(seededModuleIds);
  /** What the catalog actually advertises: inserted, minus stood back down. */
  const seeded = seededRows.filter((id) => !retired.has(id));
  const shell = shellAppIds();

  it('reads the base seed and every follow-up that adds catalog rows', () => {
    expect(files[0]).toBe(BASE_MIGRATION);
    // If this ever collapses to one file again, the follow-up pattern has been
    // broken by editing an applied migration.
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  /*
   * The invariant is a SUPERSET, not an equality.
   *
   * This asserted `seeded === shellAppIds()` exactly, which was right while the
   * catalog was a one-time re-key of the segment nav lists. It is wrong now, and
   * the migration header above says why: the product renders ~118 surfaces, the
   * persistent rail exposes 14, and "everything else is meant to be found
   * through the Apps catalog". The catalog is the BROADER discovery surface by
   * design — 20260814j deliberately seeds eight built, routed surfaces that no
   * segment group lists, precisely so a user can find them.
   *
   * Demanding equality would have forced one of two bad outcomes: deleting those
   * rows and re-hiding the surfaces, or padding every segment's nav with them.
   * So the guard splits into the two directions that are actually true.
   */
  it('leaves no app the shell presents without a catalog row', () => {
    // Direction 1 — no gaps. This is the original defect: an app a user can open
    // from the shell but cannot be entitled to.
    const expected = [...shell].filter((id) => !NEVER_LICENSABLE.has(id));
    const seededSet = new Set(seeded);
    expect(expected.filter((id) => !seededSet.has(id))).toEqual([]);
  });

  it('seeds no catalog row for something a user cannot actually open', () => {
    // Direction 2 — no phantoms. A catalog row states a capability is available,
    // so every id must resolve to a registered surface the shell can mount.
    // This is what keeps the catalog from re-growing rows for things that do not
    // exist, now that it is allowed to be wider than the segment nav.
    const known = new Set((UI_SURFACES as Array<{ id: string }>).map((s) => s.id));
    expect(seeded.filter((id) => !known.has(id))).toEqual([]);
  });

  it('lists one module once — never the same surface under two ids', () => {
    /*
     * A catalog row IS an entitlement toggle, so listing one surface twice lets
     * an organization switch it on under one id and off under the other. That
     * really happened: 'ind-lifecycle' was seeded as a new module while the same
     * `IndLifecycle` component was already catalogued as 'ind-checklist'
     * (labelled "IND lifecycle"), because surfaceViews mounts it at both ids and
     * DEEP_LINK_ALIASES canonicalises one to the other.
     *
     * Resolving through the alias table before counting is what catches it — an
     * id-only comparison sees two different strings and passes.
     */
    const canonical = seeded.map((id) => DEEP_LINK_ALIASES[id] ?? id);
    const seen = new Map<string, string[]>();
    for (let i = 0; i < seeded.length; i++) {
      const list = seen.get(canonical[i]) ?? [];
      list.push(seeded[i]);
      seen.set(canonical[i], list);
    }
    const duplicated = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicated, 'these catalog ids resolve to the same surface').toEqual([]);
  });

  it('never makes a Part 11 compliance control licensable', () => {
    // Regression guard for the real hazard: regenerating this seed straight from
    // the shell's app list would silently re-introduce an "Audit trail" toggle.
    for (const id of NEVER_LICENSABLE) {
      expect(shell.has(id), `${id} should still be a real shell app`).toBe(true);
      expect(seeded, `${id} must not be entitlement-gated`).not.toContain(id);
    }
  });

  it('seeds no duplicate module ids (module_id is UNIQUE)', () => {
    expect(seededRows.length).toBe(new Set(seededRows).size);
  });

  it('gives every module its true deep link, unique per module', () => {
    // The legacy seed pointed six different modules at one dead '/ind-workspace'.
    // Keying paths off the surface id makes that collision impossible.
    const paths = Array.from(sql.matchAll(/'(\/concept2cure\/[a-z0-9-]+)'/g)).map((m) => m[1]);
    expect(paths.length).toBe(seededRows.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const id of seededRows) expect(paths).toContain(`/concept2cure/${id}`);
  });

  it('invents no commercial packaging — every module is seeded unrestricted', () => {
    // Tiers/industries are a business decision. Until one is made, no module may
    // ship gated by a tier this migration guessed.
    const policies = Array.from(sql.matchAll(/'(\{"tiers":[^']*\})'::json/g)).map((m) => m[1]);
    expect(policies.length).toBe(seededRows.length);
    for (const p of policies) expect(JSON.parse(p)).toEqual({ tiers: [], industries: [] });
  });

  it('retires legacy rows instead of deleting them (ON DELETE CASCADE would take subscriptions)', () => {
    // A property of the base migration, which is the one that retired the
    // legacy id space; follow-ups only add.
    expect(baseSql).toMatch(/UPDATE available_modules/);
    expect(baseSql).toMatch(/"deprecated":\s*true/);
    // Assert on EXECUTABLE sql, not prose: the migration's header documents the
    // rollback and explains why it must not be written as a DELETE, so the
    // literal appears in a comment. Checking the raw file would fail on the very
    // documentation that warns against the hazard.
    const executable = sql.replace(/^\s*--.*$/gm, '');
    expect(executable).not.toMatch(/DELETE\s+FROM\s+available_modules/i);
  });
});
