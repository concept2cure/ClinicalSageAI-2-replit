/**
 * A governed fact change reports its 21 CFR Part 11 §11.10(e) audit row.
 *
 * `establishGovernedFact` and `applyFactChange` awaited `auditService.logAction`
 * and discarded what it resolved. `logAction` never rejects on a persistence
 * failure — by policy — so a governed value could be established or re-versioned,
 * its citations flagged and a resolution plan opened, with no record of who
 * changed it, and neither the REST route (routes/change-propagation.ts, which
 * answers the result as-is) nor AnA's `establish_governed_fact` /
 * `apply_fact_change` could tell. WO-16C hand-on item 2 noted the tools would
 * drop an outcome their services carried; the services carried none.
 *
 * The store is stubbed: what is under test is the outcome, not the SQL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  logAction: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true }) as unknown),
}));

vi.mock('../../auditService', () => ({ default: { logAction: (...a: unknown[]) => h.logAction(...a) } }));
vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}) }));
vi.mock('../program-link', () => ({ resolveLegacyProgram: async () => null }));
vi.mock('../../living-file/change-router.service', () => ({ propagateRegulatoryChange: async () => undefined }));
vi.mock('../../resolution/resolution-planner', () => ({ createResolutionPlan: async () => null }));

const FACT = {
  id: 'fact-1',
  organizationId: 7,
  programId: 'prog-1',
  entity: 'study',
  field: 'enrollment',
  valueNum: 186,
  valueText: null,
  unit: 'subjects',
  valueType: 'count',
  comparator: null,
  status: 'active',
  version: 1,
  confidence: 1,
};

vi.mock('../canonical-fact-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canonical-fact-store')>();
  return {
    ...actual,
    resolveActiveFact: async () => null,
    upsertCanonicalFact: async () => ({ ...FACT }),
    getFact: async () => ({ ...FACT }),
    supersedeAndReversion: async () => ({ ...FACT, id: 'fact-2', valueNum: 120, version: 2 }),
    listBindingsForFact: async () => [],
    listOpenDriftForFact: async () => [],
  };
});

import { applyFactChange, establishGovernedFact } from '../fact-change-orchestrator';

const lost = { persisted: false, chained: false, tamperProof: false, error: 'relation "audit_logs" is unavailable' };

const establish = () =>
  establishGovernedFact({
    organizationId: 7,
    programId: 'prog-1',
    entity: 'study',
    field: 'enrollment',
    value: { valueNum: 186, unit: 'subjects' },
    reason: 'Protocol v3',
    actor: 3,
  });

const change = () =>
  applyFactChange({
    factId: 'fact-1',
    organizationId: 7,
    newValue: { valueNum: 120 },
    reason: 'Protocol amendment 2',
    actor: 3,
  });

beforeEach(() => {
  h.logAction.mockReset();
  h.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});

describe('establishGovernedFact reports its audit row', () => {
  it('carries a recorded row', async () => {
    const r = await establish();
    expect(r.ok).toBe(true);
    expect((r as { auditTrail?: unknown }).auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('says so when the row was not written, without the store text', async () => {
    h.logAction.mockResolvedValueOnce(lost);
    const r = await establish();
    expect(r.ok, 'the fact itself is established').toBe(true);
    expect((r as { auditTrail?: unknown }).auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(JSON.stringify(r)).not.toMatch(/audit_logs/);
  });
});

describe('applyFactChange reports its audit row', () => {
  it('carries a recorded row', async () => {
    const r = await change();
    expect(r.ok).toBe(true);
    expect((r as { auditTrail?: unknown }).auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('says so when the row was not written, without the store text', async () => {
    h.logAction.mockResolvedValueOnce(lost);
    const r = await change();
    expect(r.ok, 'the change itself stands').toBe(true);
    expect((r as { auditTrail?: unknown }).auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(JSON.stringify(r)).not.toMatch(/audit_logs/);
  });
});

describe("AnA's governed-fact tools pass the outcome on", () => {
  async function tool(name: string, input: Record<string, unknown>) {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    const handler = getToolHandler(name);
    expect(handler, `${name} must be registered`).toBeTypeOf('function');
    return JSON.parse(await handler!(input, { organizationId: 7, userId: 3 } as never));
  }

  it('establish_governed_fact tells AnA the record was not written', async () => {
    h.logAction.mockResolvedValueOnce(lost);
    const res = await tool('establish_governed_fact', {
      programId: 'prog-1', entity: 'study', field: 'enrollment', valueNum: 186, unit: 'subjects',
    });
    expect(res.status).toBe('established');
    expect(res.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(String(res.message)).toMatch(/audit entry .* could not be written/i);
  });

  it('apply_fact_change tells AnA the record was not written', async () => {
    h.logAction.mockResolvedValueOnce(lost);
    const res = await tool('apply_fact_change', { factId: 'fact-1', reason: 'Protocol amendment 2', valueNum: 120 });
    expect(res.status).toBe('applied');
    expect(res.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(String(res.message)).toMatch(/audit entry .* could not be written/i);
  });
});
