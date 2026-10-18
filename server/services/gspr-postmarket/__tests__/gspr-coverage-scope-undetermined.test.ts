/**
 * A GSPR clause whose scope depends on a device fact nobody recorded is "scope
 * undetermined" and blocks the gate. The facts come from the program record,
 * not from the request.
 *
 * Before (to 2026-10-15): requirementInScope dropped a sterile-only or
 * implantable-only clause unless the profile said `true`, and dropped a
 * product-type-scoped clause unless a tag matched, so an UNKNOWN fact removed
 * the clause from the denominator exactly as a stated `false` would. The
 * coverage route built that profile from the query string (`isSterile ===
 * 'true'` …) and the client sends only `?regulation=`, so every fact read
 * false: a sterile implant passed the gate at "100%" with Annex I §11 and §19
 * never listed, let alone examined.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  perTable: new Map<unknown, unknown[]>(),
  programIds: [] as string[],
}));

vi.mock('../../../db', () => {
  const makeChain = () => {
    let table: unknown = null;
    const rows = () => h.perTable.get(table) ?? [];
    const chain: any = {
      from(t: unknown) {
        table = t;
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(rows()),
      then: (resolve: (r: unknown[]) => void) => resolve(rows()),
    };
    return chain;
  };
  // requireProgramAccess: SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2
  const query = (sql: string, params: unknown[] = []) =>
    Promise.resolve(
      /FROM regulatory_programs/.test(sql) && h.programIds.includes(String(params[0]))
        ? { rows: [{ id: params[0] }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
  return { db: { select: () => makeChain() }, pool: { query }, getPool: () => ({ query }) };
});

vi.mock('../../../middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));

import { computeCoverage } from '../gspr.service';
import { gsprProgramMappings, gsprRequirements } from '../../../../shared/schema/gspr-postmarket';
import { regulatoryPrograms } from '../../../../shared/schema/programs';

const ORG = 5;
const PROGRAM = 'aaaaaaaa-0000-4000-8000-000000000001';

const req = (overrides: Record<string, unknown>) => ({
  regulation: 'MDR',
  annex: 'I',
  chapter: 'I',
  title: 'requirement',
  productTypeScope: null,
  isImplantableOnly: false,
  isSterileOnly: false,
  status: 'active',
  ...overrides,
});

const CATALOG = [
  req({ id: 'req-1', clause: '1', productTypeScope: ['device', 'samd', 'ai_ml', 'combination', 'implantable'] }),
  req({ id: 'req-11', clause: '11', chapter: 'II', title: 'Infection and microbial contamination', isSterileOnly: true }),
  req({ id: 'req-19', clause: '19', chapter: 'II', title: 'Active implantable devices', isImplantableOnly: true }),
];

/** Clause 1 is decided and conformant; nobody decided §11 or §19. */
const MAPPINGS = [
  {
    id: 'm-1',
    organizationId: ORG,
    programId: PROGRAM,
    requirementId: 'req-1',
    applicability: 'applies',
    primaryEvidenceId: 'ev-1',
    conformanceStatus: 'conformant',
  },
];

beforeEach(() => {
  h.perTable.clear();
  h.perTable.set(gsprRequirements, CATALOG);
  h.perTable.set(gsprProgramMappings, MAPPINGS);
  h.programIds = [PROGRAM];
});

describe('computeCoverage: an unrecorded scope fact never removes a clause', () => {
  it('sterile-only and implantable-only clauses are scope undetermined and block the gate', async () => {
    const r = await computeCoverage(ORG, PROGRAM, { regulation: 'MDR', productType: 'device', deviceClass: null });
    expect(r.passesGate).toBe(false);
    expect(r.scopeUndetermined).toBe(2);
    expect(r.totalApplicable).toBe(3);
    expect(r.unmapped).toBe(2);
    expect(r.coveragePercent).toBe(33.3);
    expect(r.undeterminedFacts).toEqual(['sterile', 'implantable']);
    const undetermined = r.findings.filter((f) => f.code === 'GSPR-006');
    expect(undetermined.map((f) => f.clause)).toEqual(['11', '19']);
    expect(undetermined.every((f) => f.severity === 'critical')).toBe(true);
    expect(undetermined[0].message).toMatch(/sterile/);
  });

  it('a stated false still takes the clause out of scope', async () => {
    const r = await computeCoverage(ORG, PROGRAM, {
      regulation: 'MDR',
      productType: 'device',
      deviceClass: null,
      isSterile: false,
      isImplantable: false,
    });
    expect(r.scopeUndetermined).toBe(0);
    expect(r.totalApplicable).toBe(1);
    expect(r.passesGate).toBe(true);
  });

  it('an applicability decision on an undetermined clause settles it', async () => {
    h.perTable.set(gsprProgramMappings, [
      ...MAPPINGS,
      { ...MAPPINGS[0], id: 'm-11', requirementId: 'req-11', applicability: 'not_applicable', conformanceStatus: null },
      { ...MAPPINGS[0], id: 'm-19', requirementId: 'req-19', applicability: 'not_applicable', conformanceStatus: null },
    ]);
    const r = await computeCoverage(ORG, PROGRAM, { regulation: 'MDR', productType: 'device', deviceClass: null });
    expect(r.scopeUndetermined).toBe(0);
    expect(r.mappedNotApplicable).toBe(2);
    expect(r.passesGate).toBe(true);
  });

  it('a product-type tag that depends on an unrecorded fact is undetermined, not a miss', async () => {
    h.perTable.set(gsprRequirements, [req({ id: 'req-17', clause: '17', productTypeScope: ['samd', 'ai_ml'] })]);
    h.perTable.set(gsprProgramMappings, []);
    const r = await computeCoverage(ORG, PROGRAM, { regulation: 'MDR', productType: 'device', deviceClass: null });
    expect(r.totalApplicable).toBe(1);
    expect(r.scopeUndetermined).toBe(1);
    expect(r.passesGate).toBe(false);
  });
});

describe('GET /api/gspr/programs/:id/coverage reads the device facts from the program record', () => {
  async function get(query: string) {
    const { default: router } = await import('../../../routes/gspr-postmarket');
    const a = express();
    a.use((rq, _rs, next) => {
      (rq as any).user = { id: 7, organizationId: ORG };
      next();
    });
    a.use('/api/gspr', router);
    return request(a).get(`/api/gspr/programs/${PROGRAM}/coverage?${query}`);
  }

  it('what the client sends (regulation only) no longer reads every fact as false', async () => {
    h.perTable.set(regulatoryPrograms, [{ productType: 'device', euMdrClass: 'III', euIvdrClass: null, metadata: {} }]);
    const res = await get('regulation=MDR');
    expect(res.status).toBe(200);
    expect(res.body.passesGate).toBe(false);
    expect(res.body.scopeUndetermined).toBe(2);
    expect(res.body.totalApplicable).toBe(3);
  });

  it('the intake answers decide: sterile answered yes is in scope, implantable not selected is out', async () => {
    h.perTable.set(regulatoryPrograms, [
      { productType: 'device', euMdrClass: 'III', euIvdrClass: null, metadata: { deviceFlags: ['sterile'] } },
    ]);
    const res = await get('regulation=MDR');
    expect(res.status).toBe(200);
    expect(res.body.scopeUndetermined).toBe(0);
    expect(res.body.totalApplicable).toBe(2);
    expect(res.body.findings.map((f: { code: string; clause: string }) => `${f.code} §${f.clause}`)).toEqual([
      'GSPR-001 §11',
    ]);
    expect(res.body.passesGate).toBe(false);
  });

  it('a device fact in the query is refused, not used', async () => {
    h.perTable.set(regulatoryPrograms, [{ productType: 'device', euMdrClass: 'III', euIvdrClass: null, metadata: {} }]);
    const res = await get('regulation=MDR&isSterile=false&isImplantable=false');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/isSterile, isImplantable/);
  });
});
