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
 * It is a pure file+registry test on purpose: no database, so it runs in the
 * normal unit suite and guards the SOURCE of the seed rather than one deployment.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SEGMENTS, getSegmentModules } from '../registryModel';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

const MIGRATION = path.resolve(
  __dirname,
  '../../../../../db/migrations/20260810_reconcile_module_catalog.sql',
);

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
function seededModuleIds(sql: string): string[] {
  const insertAt = sql.indexOf('INSERT INTO available_modules');
  expect(insertAt, 'migration must carry an INSERT INTO available_modules').toBeGreaterThan(-1);
  const body = sql.slice(insertAt);
  const end = body.indexOf('ON CONFLICT');
  expect(end, 'INSERT must be an upsert (ON CONFLICT)').toBeGreaterThan(-1);
  return Array.from(body.slice(0, end).matchAll(/^\s*\('([a-z0-9-]+)'/gim)).map((m) => m[1]);
}

describe('Apps catalog ↔ shell taxonomy', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const seeded = seededModuleIds(sql);
  const shell = shellAppIds();

  it('seeds one catalog row per app the shell presents, minus the compliance controls', () => {
    const expected = new Set([...shell].filter((id) => !NEVER_LICENSABLE.has(id)));
    expect(new Set(seeded)).toEqual(expected);
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
    expect(seeded.length).toBe(new Set(seeded).size);
  });

  it('every seeded module id resolves to a real registry surface', () => {
    const known = new Set((UI_SURFACES as Array<{ id: string }>).map((s) => s.id));
    expect(seeded.filter((id) => !known.has(id))).toEqual([]);
  });

  it('gives every module its true deep link, unique per module', () => {
    // The legacy seed pointed six different modules at one dead '/ind-workspace'.
    // Keying paths off the surface id makes that collision impossible.
    const paths = Array.from(sql.matchAll(/'(\/concept2cure\/[a-z0-9-]+)'/g)).map((m) => m[1]);
    expect(paths.length).toBe(seeded.length);
    expect(new Set(paths).size).toBe(paths.length);
    for (const id of seeded) expect(paths).toContain(`/concept2cure/${id}`);
  });

  it('invents no commercial packaging — every module is seeded unrestricted', () => {
    // Tiers/industries are a business decision. Until one is made, no module may
    // ship gated by a tier this migration guessed.
    const policies = Array.from(sql.matchAll(/'(\{"tiers":[^']*\})'::json/g)).map((m) => m[1]);
    expect(policies.length).toBe(seeded.length);
    for (const p of policies) expect(JSON.parse(p)).toEqual({ tiers: [], industries: [] });
  });

  it('retires legacy rows instead of deleting them (ON DELETE CASCADE would take subscriptions)', () => {
    expect(sql).toMatch(/UPDATE available_modules/);
    expect(sql).toMatch(/"deprecated":\s*true/);
    // Assert on EXECUTABLE sql, not prose: the migration's header documents the
    // rollback and explains why it must not be written as a DELETE, so the
    // literal appears in a comment. Checking the raw file would fail on the very
    // documentation that warns against the hazard.
    const executable = sql.replace(/^\s*--.*$/gm, '');
    expect(executable).not.toMatch(/DELETE\s+FROM\s+available_modules/i);
  });
});
