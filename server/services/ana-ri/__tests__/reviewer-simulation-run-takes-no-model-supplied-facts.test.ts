/**
 * AnA's reviewer_simulation.run hands the simulator only the inputs it reads:
 * the program's facts, the personas, and the ids of the records it reads
 * (defensePacketId, ctdProgramId).
 *
 * What the handler used to do: it refused a call without an `intel` object
 * ("intel object is required.") and passed the model's `intel`, `packet` and
 * `reports` to runReviewerSimulation, and its tool metadata asked the model for
 * them — although the simulator reads packet facts from the defense packet on
 * record and nonclinical facts from the program's studies (ctdProgramId), and
 * sets caller-supplied figures aside. ctdProgramId was never passed, so the
 * preclinical persona could only ever say "data not loaded". And the simulator's
 * refusal of a named packet (not on record, or no packet store on the database)
 * reached the model as EXECUTION_FAILED "Action failed: …", inviting a retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { svc, audit, pool } = vi.hoisted(() => ({
  svc: { runReviewerSimulation: vi.fn() },
  audit: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
  pool: { query: vi.fn() },
}));

vi.mock('../../gspr-postmarket/gspr.service', () => ({ upsertMapping: vi.fn() }));
vi.mock('../../gspr-postmarket/post-market.service', () => ({
  approveDocument: vi.fn(),
  supersedeDocument: vi.fn(),
  updateDocument: vi.fn(),
  validateDocument: vi.fn(),
  getDocument: vi.fn(),
}));
vi.mock('../../gspr-postmarket/post-market-authoring', () => ({
  authorPostMarketDocument: vi.fn(),
  AUTHORABLE_DOCUMENT_TYPES: [],
}));
vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({ assessSufficiency: vi.fn() }));
vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({
  runReviewerSimulation: (...a: unknown[]) => svc.runReviewerSimulation(...a),
}));
vi.mock('../../../db', () => ({ pool }));
vi.mock('../../auditService', () => ({ default: audit }));
// The handler proves program ownership through the one program check
// (server/services/c2c/program-access.ts) since 2026-10-15; these cases
// exercise what happens after it answers yes.
vi.mock('../../c2c/program-access', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async () => true,
}));
vi.mock('../../c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async () => true,
}));

import { MDX_COMMAND_METADATA_PHASE2, reviewerSimulationRun } from '../mdx-command-handlers-phase2';

const CTX = { userId: 7, organizationId: 11 };
const PROGRAM_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const gate = { confirm: 'yes', reason: 'a sufficient explanatory reason' };
const program = { programType: 'IND', productType: 'drug', deviceClass: null, primaryAgency: 'FDA' };

const simulatorRequest = () => svc.runReviewerSimulation.mock.calls[0]?.[0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  svc.runReviewerSimulation.mockResolvedValue({ runId: 'rs-1', inputsSource: { setAside: [] } });
});

describe('reviewer_simulation.run: the simulator gets only what it reads', () => {
  it('runs on the program facts alone: no intel object is required', async () => {
    const r = await reviewerSimulationRun(CTX, { ...gate, programId: PROGRAM_UUID, program });
    expect(r.error, `refused: ${r.message}`).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it("does not hand the simulator the model's packet, intel or reports, and says they were not used", async () => {
    const r = await reviewerSimulationRun(CTX, {
      ...gate,
      programId: PROGRAM_UUID,
      program,
      packet: { defenseReadinessScore: 40, topRisks: [], riskCodesUsed: [], predicateKNumber: 'K1' },
      intel: { contradictionCount: 3, orphanClaimCount: 0, unsupportedClaimCount: 9, defensibilityScore: 42, missingSections: [] },
      reports: { defensibility: { score: 31 } },
    });
    const req = simulatorRequest();
    expect(req, 'model-supplied intel reached the simulator').not.toHaveProperty('intel');
    expect(req, 'model-supplied packet reached the simulator').not.toHaveProperty('packet');
    expect(req, 'model-supplied reports reached the simulator').not.toHaveProperty('reports');
    expect(r.message).toMatch(/packet, intel, reports/);
    expect(r.message).toMatch(/not used/i);
  });

  it("passes ctdProgramId so the nonclinical facts are read from the program's studies", async () => {
    await reviewerSimulationRun(CTX, { ...gate, programId: PROGRAM_UUID, program, ctdProgramId: 42 });
    expect(simulatorRequest()?.ctdProgramId, 'ctdProgramId was dropped').toBe(42);
  });

  it('refuses, by name, a ctdProgramId that is not a positive integer, and runs nothing', async () => {
    for (const bad of ['OR-801', -1, 1.5, 0, true]) {
      const r = await reviewerSimulationRun(CTX, { ...gate, programId: PROGRAM_UUID, program, ctdProgramId: bad });
      expect(r.error, `ctdProgramId ${String(bad)}`).toBe('INVALID_INPUT');
      expect(r.message).toMatch(/ctdProgramId/);
    }
    expect(svc.runReviewerSimulation).not.toHaveBeenCalled();
  });

  it("the simulator's refusal of a named packet reaches the model as that refusal", async () => {
    const refusal = Object.assign(new Error('No defense packet store exists on this database, so …'), {
      name: 'ReviewerSimulationInputError',
      code: 'DEFENSE_PACKET_STORE_NOT_AVAILABLE',
    });
    svc.runReviewerSimulation.mockRejectedValueOnce(refusal);
    const r = await reviewerSimulationRun(CTX, {
      ...gate,
      programId: PROGRAM_UUID,
      program,
      defensePacketId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    });
    expect(svc.runReviewerSimulation.mock.calls[0][1]).toEqual({ executor: pool, userId: CTX.userId });
    expect(r.error, 'a refusal was reported as a failed action').toBe('DEFENSE_PACKET_STORE_NOT_AVAILABLE');
    expect(r.message).toBe(refusal.message);
  });

  it('asks the model only for the inputs the simulator reads', () => {
    const meta = MDX_COMMAND_METADATA_PHASE2.find(m => m.name === 'reviewer_simulation.run');
    expect(meta?.parameters).toBe(
      'programId (UUID), program (object), personas?, defensePacketId?, ctdProgramId?, confirm="yes", reason',
    );
  });
});
