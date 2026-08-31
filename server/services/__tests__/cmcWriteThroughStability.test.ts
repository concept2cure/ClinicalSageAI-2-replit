/**
 * The stability write-through maps the ROW the product actually stores.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * mapStabilityPayload read keys the Drizzle `stability_studies` row has NEVER
 * had (studyName / storageCondition / results / shelfLifeClaim /
 * batchesStudied), while the row carries studyTitle / storageConditions[] /
 * stabilityData / shelfLife / batchNumber. Every one of those payload fields
 * stored '' or null, so the composer's required fields for 3.2.S.7
 * ('storageCondition') and 3.2.P.8 ('shelfLifeClaim') were PERMANENTLY
 * unsatisfiable — years of recorded pull-point results and the claimed shelf
 * life silently never reached the compiled dossier. These tests feed the
 * mapper the exact shape the create route passes it (the .returning() row)
 * and assert the composer's own rules are satisfiable from the output.
 */
import { describe, expect, it } from 'vitest';

import { mapStabilityPayload } from '../cmc-write-through';
import { MODULE3_SECTION_RULES } from '../module3Composer';

/** The row exactly as db.insert(stabilityStudies).returning() hands it over
 *  (camelCase Drizzle model keys — shared/schema.ts `stabilityStudies`). */
const DRIZZLE_ROW = {
  id: 12,
  organizationId: 42,
  studyTitle: 'Long-term stability of BX-701 tablets',
  productName: 'BX-701',
  batchNumber: 'L2026-014',
  dosageForm: 'Tablet',
  strength: '25 mg',
  scope: 'DP',
  climaticZone: 'II',
  studyType: 'long-term',
  storageConditions: ['LT', 'ACC'],
  duration: 24,
  testParameters: ['Assay', 'Related Substances'],
  testingSchedule: null,
  timePoints: ['0', '3', '6', '12'],
  stabilityData: { results: [{ timePoint: '6', parameter: 'Assay', value: '99.1%', withinSpecification: true }] },
  notes: null,
  shelfLife: '24 months at 25°C/60%RH',
  status: 'ACTIVE',
  startDate: new Date('2026-01-15T00:00:00Z'),
  plannedEndDate: null,
  studyDirector: null,
};

describe('mapStabilityPayload — the Drizzle row feeds the composer contract', () => {
  const payload = mapStabilityPayload(DRIZZLE_ROW);

  it("satisfies the composer's OWN required fields for 3.2.S.7 and 3.2.P.8", () => {
    // Read the requirements from the live rules, so this pin tracks the
    // contract instead of a copy of it.
    const required = MODULE3_SECTION_RULES.filter(
      (r) => (r.sectionKey === '3.2.S.7' || r.sectionKey === '3.2.P.8') && r.requiredSourceTypes.includes('stability'),
    ).flatMap((r) => r.requiredFields);
    expect(required).toContain('storageCondition');
    expect(required).toContain('shelfLifeClaim');
    for (const field of required) {
      // comparabilityStatus belongs to the comparability source, not this one.
      if (field === 'comparabilityStatus') continue;
      const v = payload[field];
      expect(v, `payload.${field} must be non-empty for the composer`).toBeTruthy();
    }
  });

  it('carries the recorded data, not blanks: storage, shelf life, batch, results', () => {
    expect(payload.storageCondition).toBe('LT, ACC');
    expect(payload.shelfLifeClaim).toBe('24 months at 25°C/60%RH');
    expect(payload.batchesStudied).toEqual(['L2026-014']);
    expect(payload.studyName).toBe('Long-term stability of BX-701 tablets');
    // The pull-point results the composer's data inspection reads.
    expect(payload.results).toEqual(DRIZZLE_ROW.stabilityData);
    expect(payload.timePoints).toEqual(['0', '3', '6', '12']);
    expect(payload.stabilityParameters).toEqual(['Assay', 'Related Substances']);
  });

  it('still honours the canonical payload keys when a caller sends them directly', () => {
    const direct = mapStabilityPayload({
      studyName: 'Direct',
      storageCondition: '25C/60RH',
      shelfLifeClaim: '36 months',
      batchesStudied: ['A', 'B'],
      results: { x: 1 },
    });
    expect(direct.studyName).toBe('Direct');
    expect(direct.storageCondition).toBe('25C/60RH');
    expect(direct.shelfLifeClaim).toBe('36 months');
    expect(direct.batchesStudied).toEqual(['A', 'B']);
    expect(direct.results).toEqual({ x: 1 });
  });

  it('an empty study still maps to honest blanks, never fabricated values', () => {
    const empty = mapStabilityPayload({});
    expect(empty.storageCondition).toBe('');
    expect(empty.shelfLifeClaim).toBeNull();
    expect(empty.batchesStudied).toBeNull();
    expect(empty.results).toBeNull();
  });
});
