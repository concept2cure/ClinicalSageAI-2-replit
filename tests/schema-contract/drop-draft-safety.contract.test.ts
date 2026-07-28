/**
 * Contract: the dead-table drop draft cannot quietly become runnable.
 *
 * docs/drop-dead-tables.draft.sql lists 163 `DROP TABLE` statements derived from
 * docs/DEAD_TABLES_INVENTORY.md, which is static-reference analysis. Re-measured
 * against the live 710-table schema, EIGHT of those tables are referenced by
 * shipped code. The worst is `client_access`: server/routes/client-portal.ts
 * reads it to decide which workspace an EXTERNAL CLIENT may see, so dropping it
 * is an authorization failure, not just data loss.
 *
 * The file is a useful lead list and worth keeping. What it must never be is
 * something a hurried operator can paste into psql. Two things keep that true,
 * and both are asserted here:
 *
 *   1. An unconditional RAISE EXCEPTION at the top, so the transaction dies
 *      before the first DROP.
 *   2. The eight live tables stay documented in the header, so removing the
 *      guard means reading why it is there.
 *
 * The reference evidence is pinned too. If someone genuinely deletes
 * client-portal.ts's use of client_access, THAT test fails and the table can be
 * reconsidered — deliberately, with the proof updated, rather than by a grep
 * someone ran once.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRAFT = path.join(REPO_ROOT, 'docs/drop-dead-tables.draft.sql');
const draft = fs.readFileSync(DRAFT, 'utf8');

const droppedTables = [...draft.matchAll(/DROP TABLE IF EXISTS public\.([a-z0-9_]+)/g)].map(m => m[1]);

/**
 * Tables the draft names that shipped code demonstrably reads, each with the
 * call site that proves it. Verified individually — not a grep result.
 */
const LIVE_TABLES_IN_DRAFT: ReadonlyArray<[table: string, file: string, needle: string]> = [
  ['client_access', 'server/routes/client-portal.ts', 'FROM client_access'],
  ['regulatory_obligations', 'server/services/ana/deadline-radar.ts', 'regulatoryObligations'],
  ['charter_sections', 'server/routes/charters.ts', 'charter_sections'],
  ['timeline_phases', 'server/routes/charters.ts', 'timeline_phases'],
  ['project_commitments', 'server/routes/charters.ts', 'project_commitments'],
  ['charter_audit_events', 'server/routes/charters.ts', 'charter_audit_events'],
  [
    'doe_studies',
    'server/services/ana/intelligence-questions/war-game/auditors/cmc-auditor.ts',
    'doe_studies',
  ],
];

describe('the draft is disarmed', () => {
  it('raises before any DROP can execute', () => {
    const guard = draft.indexOf('RAISE EXCEPTION');
    const firstDrop = draft.indexOf('DROP TABLE IF EXISTS');
    expect(guard, 'no RAISE EXCEPTION guard found').toBeGreaterThan(-1);
    expect(firstDrop).toBeGreaterThan(-1);
    expect(guard, 'the guard must precede the first DROP').toBeLessThan(firstDrop);
  });

  it('the guard is unconditional — no IF/WHEN wrapping it', () => {
    // A guard inside `IF <condition> THEN` is a guard someone can satisfy by
    // accident. Take the DO block containing the RAISE and assert it is a bare
    // BEGIN … RAISE … END.
    const block = draft.slice(draft.indexOf('DO $$'), draft.indexOf('END $$;') + 7);
    expect(block).toContain('RAISE EXCEPTION');
    expect(block).not.toMatch(/\bIF\b/);
    expect(block).not.toMatch(/\bCASE\b/);
  });

  it('still carries its statements, so it remains usable as a lead list', () => {
    expect(droppedTables.length).toBeGreaterThan(100);
  });
});

describe('tables the draft names that shipped code still reads', () => {
  it.each(LIVE_TABLES_IN_DRAFT)(
    '%s is referenced by %s, so it must not be dropped unreviewed',
    (table, file, needle) => {
      const source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(source, `${file} no longer mentions ${needle}`).toContain(needle);
      // It is still in the draft — which is exactly why the guard must stay.
      expect(droppedTables).toContain(table);
    },
  );

  it('names every one of them in the header, so the guard is self-explaining', () => {
    const header = draft.slice(0, draft.indexOf('DO $$'));
    for (const [table] of LIVE_TABLES_IN_DRAFT) {
      expect(header, `${table} is dropped but not explained in the header`).toContain(table);
    }
  });
});

describe('foreign-key ordering hazards are recorded', () => {
  it('notes that the list is not FK-ordered while avoiding CASCADE', () => {
    // supply_chain_organizations is dropped while `materials` and `batches`
    // still reference it, and spine_edges (which references spine_nodes) is not
    // in the list at all. Either makes a straight run fail partway through,
    // leaving the schema in a half-dropped state.
    expect(draft).toMatch(/unordered with respect to foreign keys/i);
    expect(droppedTables).toContain('supply_chain_organizations');
  });

  it('records that ind_package_plans is missing while its children are dropped', () => {
    const children = droppedTables.filter(t => t.startsWith('ind_package_plan_'));
    expect(children.length).toBeGreaterThanOrEqual(5);
    // The parent genuinely is absent — that is the defect, so pin it rather than
    // silently "fixing" a file whose every line needs individual verification.
    expect(droppedTables).not.toContain('ind_package_plans');
    expect(draft).toContain('omits `ind_package_plans`');
  });
});
