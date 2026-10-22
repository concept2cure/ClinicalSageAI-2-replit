/**
 * AnA's post_market.document.create refuses a reporting period it cannot store
 * as declared (INVALID_INPUT, naming the field) and writes nothing.
 *
 * Before (to 2026-10-15): the handler's own parseDate turned an unparseable
 * reportingPeriodStart / reportingPeriodEnd into undefined, i.e. "not
 * declared", so a period the model did state was dropped and the draft was
 * created with success: true; and a start after the end was stored as given.
 *
 * The authoring engine is real here; the store under it is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ createDocument: vi.fn() }));

vi.mock('../../../db', () => ({ db: {}, getPool: () => ({}) }));
vi.mock('../../gspr-postmarket/post-market.service', () => ({
  createDocument: (...a: unknown[]) => h.createDocument(...a),
  listProgramDocuments: async () => [],
  validateDocument: () => ({ passesGate: false, criticalCount: 1, warningCount: 0, findings: [] }),
  approveDocument: vi.fn(),
  supersedeDocument: vi.fn(),
  updateDocument: vi.fn(),
  getDocument: vi.fn(),
}));
vi.mock('../../gspr-postmarket/gspr.service', () => ({ upsertMapping: vi.fn() }));
vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({ assessSufficiency: vi.fn() }));
vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({ runReviewerSimulation: vi.fn() }));
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
}));
vi.mock('../../c2c/program-access.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async () => true,
}));

import { postMarketDocumentCreate } from '../mdx-command-handlers-phase2';

const CTX = { userId: 7, organizationId: 11 };
const args = {
  confirm: 'yes',
  reason: 'a sufficient explanatory reason',
  programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  documentType: 'psur',
  deviceName: 'Acme Stent',
  regulation: 'MDR',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.createDocument.mockImplementation(async (v: Record<string, unknown>) => ({ id: 'd-1', version: 1, ...v }));
});

describe('post_market.document.create: a declared period is stored as declared or refused', () => {
  it.each([
    ['reportingPeriodEnd', 'not-a-date'],
    ['reportingPeriodStart', 'Q1 2025'],
    ['reportingPeriodEnd', '2025-02-30'],
    ['reportingPeriodStart', 20250101],
  ])('%s = %j is INVALID_INPUT naming the field, and nothing is written', async (field, value) => {
    const r = await postMarketDocumentCreate(CTX, { ...args, [field]: value });
    expect(r.success).toBe(false);
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toContain(field);
    expect(h.createDocument).not.toHaveBeenCalled();
  });

  it('a start after the end is INVALID_INPUT, and nothing is written', async () => {
    const r = await postMarketDocumentCreate(CTX, {
      ...args,
      reportingPeriodStart: '2025-12-31',
      reportingPeriodEnd: '2025-01-01',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/reportingPeriodStart.*before.*reportingPeriodEnd/);
    expect(h.createDocument).not.toHaveBeenCalled();
  });

  it('a real period is stored as declared', async () => {
    const r = await postMarketDocumentCreate(CTX, {
      ...args,
      reportingPeriodStart: '2025-01-01',
      reportingPeriodEnd: '2025-12-31',
    });
    expect(r.success).toBe(true);
    expect(h.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        reportingPeriodStart: new Date('2025-01-01T00:00:00Z'),
        reportingPeriodEnd: new Date('2025-12-31T00:00:00Z'),
      }),
    );
  });
});
