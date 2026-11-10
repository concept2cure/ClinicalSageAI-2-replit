/**
 * A register GET must return every column its own PUT can write — or say why not.
 *
 * ## The class, which this repository has now had three times
 *
 * Most CMC register GETs `select()` the whole row. Four name their columns, and
 * each request body is `withoutTenantKey(insert<Table>Schema)` — every column of
 * the table. So a column added to the table, collected by the drawer and left
 * out of the projection is written and never read back, and the product behaves
 * in one of two ways, neither of them honest:
 *
 *  - the drawer rebuilds the field from blank and the PUT writes the blank over
 *    it, deleting recorded data on an edit of something else entirely; or
 *  - the blank field is omitted from the body, the PUT's `.partial()` leaves the
 *    column alone, and the drawer simply lies: it shows nothing where the
 *    register holds a value, and a WRONG value can never be corrected or
 *    cleared through the product at all.
 *
 * Found and fixed on `drugProducts.batchFormula` (first form; the route's own
 * comment: "a field the product can capture and cannot read back is a field it
 * loses"), on `analyticalMethods.ichQ2Parameters` ("carried so an edit
 * round-trips: without it the client can only send back an empty validation
 * record and would erase the one on file"), and on 2026-11-09 on all six of the
 * drug substance's §3.2.A.2 columns at once — `modality` among them, which is
 * the field P-110 refuses a Module 3 composition over. The register held
 * `biologic` on C2C-101 and the drawer showed nothing.
 *
 * ## What this case holds
 *
 * For each of the four, the columns the projection omits must equal the list
 * below exactly, and every entry in it carries a written reason. A new column
 * is then a decision — project it, or say here why it is withheld — rather than
 * a silent third instance. Read from the route source, so it cannot pass by
 * being stubbed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import * as schema from '../../../../shared/schema';

const ROUTES = path.join(__dirname, '..', 'routes.ts');

/** Not a column: drizzle's own helper on the table object. */
const NOT_A_COLUMN = new Set(['enableRLS']);

/**
 * Columns each explicit projection may omit, and why. A reason is required: an
 * entry without one is the thing this file exists to prevent.
 */
const WITHHELD: Record<string, { table: string; omit: Record<string, string> }> = {
  '/analytical-methods': {
    table: 'analyticalMethods',
    omit: {
      systemSuitability: 'ICH Q2 system-suitability criteria; no drawer field collects them, so nothing can send a blank over them.',
      acceptance_criteria: 'Same: no drawer field. Kept out of the method list, which is read as a method index.',
      robustness_data: 'Same: no drawer field.',
      developedBy: 'Attribution written by the create (§11.10(e)), never by a body.',
      validatedBy: 'Written by the validation signature only; `withoutSignatureFields` strips it from every edit.',
    },
  },
  '/stability-studies': {
    table: 'stabilityStudies',
    omit: {
      testingSchedule: 'The per-timepoint plan; the drawer records timePoints and testParameters, not this.',
      studyDirector: 'Attribution written by the create.',
      shelfLifeSignedBy: 'Written by the shelf-life signature only; stripped from every edit.',
      shelfLifeSignedAt: 'Written by the shelf-life signature only; stripped from every edit.',
    },
  },
  '/drug-substances': {
    table: 'drugSubstances',
    omit: {
      specifications: 'Owned by the specifications register (cmc_specifications); this json column is legacy and no drawer field writes it.',
      impuritiesProfile: 'Owned by the impurity-profiles register.',
      stability: 'Owned by the stability-studies register.',
      controlOfMaterials: 'Owned by the raw-material specs register.',
    },
  },
  '/drug-products': {
    table: 'drugProducts',
    omit: {
      processControls: 'No drawer field collects it; the in-process controls live on the manufacturing-processes register.',
      specifications: 'Owned by the specifications register.',
      stability: 'Owned by the stability-studies register.',
    },
  },
};

/** The keys of the `db.select({ … })` literal in the handler for `routePath`. */
function projectionOf(source: string[], routePath: string): string[] {
  const start = source.findIndex((l) => l.includes(`router.get('${routePath}'`));
  expect(start, `no GET handler for ${routePath}`).toBeGreaterThanOrEqual(0);
  const open = source.findIndex((l, i) => i > start && /\.select\(\{\s*$/.test(l));
  expect(open, `${routePath} has no explicit projection`).toBeGreaterThan(start);
  expect(open - start, `${routePath}'s select is too far from its handler to be its own`).toBeLessThan(15);
  const keys: string[] = [];
  let depth = 1;
  for (let i = open + 1; i < source.length; i++) {
    depth += (source[i].match(/\{/g) ?? []).length - (source[i].match(/\}/g) ?? []).length;
    const m = /^\s*([a-zA-Z][\w]*):/.exec(source[i]);
    if (m && depth === 1) keys.push(m[1]);
    if (depth <= 0) break;
  }
  return keys;
}

describe('a CMC register GET returns every column its PUT can write', () => {
  const source = readFileSync(ROUTES, 'utf8').split('\n');

  it('finds the route file and its four explicit projections, so an empty sweep cannot pass', () => {
    expect(source.length).toBeGreaterThan(2000);
    for (const route of Object.keys(WITHHELD)) {
      expect(projectionOf(source, route).length, route).toBeGreaterThan(5);
    }
  });

  for (const [route, { table, omit }] of Object.entries(WITHHELD)) {
    it(`${route} omits only what is written down`, () => {
      const t = (schema as Record<string, unknown>)[table] as Record<string, unknown>;
      expect(t, `${table} is not exported from shared/schema`).toBeTruthy();
      const columns = Object.keys(t).filter((k) => !NOT_A_COLUMN.has(k));
      const projected = projectionOf(source, route);
      const missing = columns.filter((c) => !projected.includes(c)).sort();
      expect(missing).toEqual(Object.keys(omit).sort());
    });
  }

  it('every withheld column carries a reason', () => {
    for (const [route, { omit }] of Object.entries(WITHHELD)) {
      for (const [column, reason] of Object.entries(omit)) {
        expect(reason.trim().length, `${route}.${column} has no reason`).toBeGreaterThan(20);
      }
    }
  });

  /* The six that were the third instance. Named, so a projection edit that
     drops one again fails on the field rather than on a set difference. */
  it('projects the drug substance’s §3.2.A.2 columns, including the modality P-110 refuses over', () => {
    const projected = projectionOf(source, '/drug-substances');
    for (const column of ['modality', 'biologicalOrigin', 'sourceOrganism', 'cellLine', 'viralSafetyEvaluation', 'tseStatus']) {
      expect(projected, column).toContain(column);
    }
  });
});
