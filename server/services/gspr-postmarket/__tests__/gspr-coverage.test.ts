/**
 * GSPR coverage / gap report tests.
 *
 * Mocks db.select chain to return fixture catalog + mappings.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

interface State {
  perTable: Map<unknown, unknown[]>;
}
const state: State = { perTable: new Map() };

function setRows(t: unknown, rows: unknown[]) {
  state.perTable.set(t, rows);
}

function makeChain() {
  let activeTable: unknown = null;
  const chain: any = {
    from(t: unknown) {
      activeTable = t;
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    limit() {
      return Promise.resolve(state.perTable.get(activeTable) ?? []);
    },
    then(resolve: (rows: unknown[]) => void) {
      resolve(state.perTable.get(activeTable) ?? []);
    },
  };
  return chain;
}

vi.mock('../../../db', () => ({
  db: { select: () => makeChain() },
}));

import { computeCoverage } from '../gspr.service';
import {
  gsprRequirements,
  gsprProgramMappings,
} from '../../../../shared/schema/gspr-postmarket';

const PROGRAM = 'prog-uuid-1';
const ORG = 5;

const req = (overrides: Partial<any> = {}) => ({
  id: `req-${overrides.clause ?? '1'}`,
  regulation: 'MDR',
  annex: 'I',
  chapter: 'I',
  clause: '1',
  title: 'requirement',
  summary: null,
  deviceClassScope: null,
  productTypeScope: null,
  isImplantableOnly: false,
  isSterileOnly: false,
  relatedStandards: null,
  status: 'active',
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mapping = (overrides: Partial<any> = {}) => ({
  id: `m-${overrides.requirementId ?? 'x'}`,
  organizationId: ORG,
  programId: PROGRAM,
  requirementId: 'req-1',
  applicability: 'applies',
  rationale: null,
  primaryEvidenceId: 'ev-1',
  methodOfDemonstration: 'declaration_of_conformity',
  conformanceStatus: 'conformant',
  gapDescription: null,
  decidedBy: null,
  decidedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  state.perTable.clear();
});

describe('computeCoverage', () => {
  test('all in-scope requirements mapped applies + conformant → passes', async () => {
    setRows(gsprRequirements, [req({ id: 'req-1', clause: '1' }), req({ id: 'req-2', clause: '2' })]);
    setRows(gsprProgramMappings, [
      mapping({ id: 'm1', requirementId: 'req-1' }),
      mapping({ id: 'm2', requirementId: 'req-2' }),
    ]);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
    });
    expect(r.unmapped).toBe(0);
    expect(r.mappedApplies).toBe(2);
    expect(r.passesGate).toBe(true);
    expect(r.coveragePercent).toBe(100);
  });

  test('empty in-scope catalog fails closed — 0% coverage, gate blocked (assessed nothing)', async () => {
    // Unseeded gspr_requirements catalog, or a regulation/product-type with no
    // catalog rows: nothing is in scope. Reporting 100% + a passing conformity
    // gate here would put an unsubstantiated Annex I / GSPR claim into a CER.
    setRows(gsprRequirements, []);
    setRows(gsprProgramMappings, []);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'IVDR',
      productType: 'ivd',
      deviceClass: 'B',
    });
    expect(r.totalApplicable).toBe(0);
    expect(r.coveragePercent).toBe(0); // was 100 before the fix
    expect(r.passesGate).toBe(false); // was true before the fix
  });

  test('unmapped in-scope requirement raises GSPR-001 critical', async () => {
    setRows(gsprRequirements, [req({ id: 'req-1', clause: '1' }), req({ id: 'req-2', clause: '2' })]);
    setRows(gsprProgramMappings, [mapping({ id: 'm1', requirementId: 'req-1' })]);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
    });
    expect(r.unmapped).toBe(1);
    expect(r.findings.some(f => f.code === 'GSPR-001')).toBe(true);
    expect(r.passesGate).toBe(false);
  });

  test('TBD applicability raises GSPR-002 warning and blocks gate', async () => {
    setRows(gsprRequirements, [req({ id: 'req-1', clause: '1' })]);
    setRows(gsprProgramMappings, [
      mapping({ id: 'm1', requirementId: 'req-1', applicability: 'tbd' }),
    ]);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
    });
    expect(r.findings.some(f => f.code === 'GSPR-002')).toBe(true);
    expect(r.passesGate).toBe(false);
  });

  test('non-conformant raises GSPR-003 critical', async () => {
    setRows(gsprRequirements, [req({ id: 'req-1', clause: '1' })]);
    setRows(gsprProgramMappings, [
      mapping({ id: 'm1', requirementId: 'req-1', conformanceStatus: 'non_conformant' }),
    ]);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
    });
    expect(r.findings.some(f => f.code === 'GSPR-003')).toBe(true);
    expect(r.passesGate).toBe(false);
  });

  test('applies but no primary evidence raises GSPR-005 warning', async () => {
    setRows(gsprRequirements, [req({ id: 'req-1', clause: '1' })]);
    setRows(gsprProgramMappings, [
      mapping({ id: 'm1', requirementId: 'req-1', primaryEvidenceId: null }),
    ]);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
    });
    expect(r.findings.some(f => f.code === 'GSPR-005')).toBe(true);
  });

  test('regulation filter excludes other regulation rows', async () => {
    // catalog includes both MDR and IVDR rows, but listCatalog is filtered by reg.
    // Our mock returns whatever is in perTable[gsprRequirements] regardless,
    // so this test verifies that requirementInScope still respects regulation
    // when both flavors are present.
    setRows(gsprRequirements, [
      req({ id: 'req-mdr', clause: '1', regulation: 'MDR' }),
      req({ id: 'req-ivdr', clause: '1', regulation: 'IVDR' }),
    ]);
    setRows(gsprProgramMappings, []);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
    });
    // Only the MDR row is in scope; the IVDR row is filtered out by
    // requirementInScope.regulation match.
    expect(r.totalApplicable).toBe(1);
  });

  test('implantable-only requirement skipped for non-implantable program', async () => {
    setRows(gsprRequirements, [
      req({ id: 'req-1', clause: '19', isImplantableOnly: true }),
      req({ id: 'req-2', clause: '1', isImplantableOnly: false }),
    ]);
    setRows(gsprProgramMappings, []);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
      isImplantable: false,
    });
    expect(r.totalApplicable).toBe(1);
  });

  test('sterile-only requirement skipped for non-sterile program', async () => {
    setRows(gsprRequirements, [
      req({ id: 'req-1', clause: '11', isSterileOnly: true }),
      req({ id: 'req-2', clause: '1', isSterileOnly: false }),
    ]);
    setRows(gsprProgramMappings, []);
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: 'II',
      isSterile: false,
    });
    expect(r.totalApplicable).toBe(1);
  });
});
