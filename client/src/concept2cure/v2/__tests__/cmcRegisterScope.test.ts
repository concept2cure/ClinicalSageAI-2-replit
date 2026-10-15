/**
 * A CMC register must read at the scope it writes at.
 *
 * ## What this test is for
 *
 * Every register card files into the OPEN program — the create path threads
 * `cmcProjectUuid()` — while the list read sent the bare path with no project
 * filter. So a staffer filed a drug substance against program X and the
 * register then listed all 27 programs' substances. The two halves of one card
 * disagreeing about scope is the defect, and nothing failed when they did:
 * both halves were individually correct.
 *
 * Measured on the reference database, 2026-09-28:
 *
 *   GET /api/cmc/qc-testing                 -> 189 rows   (whole organisation)
 *   GET /api/cmc/qc-testing?projectId=<X>   ->   7 rows   (the open program)
 *
 * The second assertion below is the durable one: a register added later must
 * declare its scope, or this fails. That is the check that keeps the decision
 * from drifting back to "whatever the handler happens to do".
 *
 * @module client/src/concept2cure/v2/__tests__/cmcRegisterScope
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTER_SCOPE, scopedRegisterPath } from '../surfaces/cmcRegisters';

const PROJECT = 'f50f5093-216b-47a0-8664-d4705493d295';

describe('scopedRegisterPath', () => {
  it('narrows a per-application register to the open program', () => {
    expect(scopedRegisterPath('/api/cmc/qc-testing', PROJECT))
      .toBe(`/api/cmc/qc-testing?projectId=${PROJECT}`);
    expect(scopedRegisterPath('/api/cmc/comparability-studies', PROJECT))
      .toBe(`/api/cmc/comparability-studies?projectId=${PROJECT}`);
  });

  it('leaves an organisation asset unnarrowed, even with a program open', () => {
    expect(scopedRegisterPath('/api/cmc/change-control', PROJECT)).toBe('/api/cmc/change-control');
    expect(scopedRegisterPath('/api/cmc/process-validation', PROJECT)).toBe('/api/cmc/process-validation');
  });

  it('narrows the registers whose tables now record their program', () => {
    /* drug_substances / drug_products / stability_studies / analytical_methods
       carry project_id since migrations/20261005_cmc_core_registers_project.sql.
       Before it, an edit made with another program open filed a second copy of
       the record under that program, and these lists could not be narrowed. */
    for (const path of [
      '/api/cmc/drug-substances', '/api/cmc/drug-products',
      '/api/cmc/stability-studies', '/api/cmc/analytical-methods',
    ]) {
      expect(REGISTER_SCOPE[path]).toBe('program');
      expect(scopedRegisterPath(path, PROJECT)).toBe(`${path}?projectId=${PROJECT}`);
    }
  });

  it('sends no filter when no program is open', () => {
    expect(scopedRegisterPath('/api/cmc/qc-testing', undefined)).toBe('/api/cmc/qc-testing');
  });

  it('percent-encodes the id rather than interpolating it raw', () => {
    expect(scopedRegisterPath('/api/cmc/qc-testing', 'a b&c')).toBe('/api/cmc/qc-testing?projectId=a%20b%26c');
  });
});

describe('every register on the surface declares its scope', () => {
  it('has a REGISTER_SCOPE entry for every RegisterCard path', () => {
    const src = readFileSync(
      join(__dirname, '..', 'surfaces', 'cmcRegisters.tsx'), 'utf8',
    );
    const rendered = [...src.matchAll(/path="(\/api\/cmc\/[a-z-]+)"/g)].map(m => m[1]);
    expect(rendered.length).toBeGreaterThan(0);

    const undeclared = [...new Set(rendered)].filter(p => !(p in REGISTER_SCOPE)).sort();
    expect(
      undeclared,
      'a register with no REGISTER_SCOPE entry silently reads org-wide while filing into the open program',
    ).toEqual([]);
  });
});
