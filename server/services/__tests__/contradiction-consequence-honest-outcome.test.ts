/**
 * A contradiction consequence is carried out or refused — never recorded as
 * executed when nothing was created.
 *
 * review_thread, harmonization_rewrite and dossier_review_attachment returned
 * ids they made up (`thread_contradiction_<id>_<ms>` …), logged them as
 * executed, and the decision was then marked executed with a receipt saying
 * so and the finding's consequence_executed set. A failed supersession
 * returned `supersession_failed_<id>` the same way, an escalation was marked
 * executed by a transition the state machine refuses, and every refused
 * transition was ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({
  query: vi.fn(),
  insertReturning: vi.fn(),
  recordContradictionConsequence: vi.fn(),
  transitionDecision: vi.fn(),
  createReceipt: vi.fn(),
  supersede: vi.fn(),
}));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => H.query(...a) },
  db: {
    insert: () => ({ values: () => ({ returning: () => H.insertReturning() }) }),
  },
}));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../../shared/schema/index', () => ({ concept2cureArtifacts: { id: 'id' } }));
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenanceDrizzle: vi.fn() }));
vi.mock('../concept2cure/governedDocumentContractService', () => ({
  resolveGovernedContext: () => ({
    validation: { valid: true, errors: [] },
    contract: { exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'internal_review' } },
  }),
}));
vi.mock('../decision-lifecycle-service', () => ({
  decisionLifecycleService: {
    recordContradictionConsequence: H.recordContradictionConsequence,
    transitionDecision: H.transitionDecision,
    createReceipt: H.createReceipt,
  },
}));
vi.mock('../assumption-registry-service', () => ({
  assumptionRegistryService: { supersede: H.supersede },
}));

import { contradictionConsequenceService } from '../contradiction-consequence-service';
import type { ContradictionFinding, ConsequenceType } from '../contradiction-engine-service';

const FINDING_ID = '6f1c2b1e-8a4d-4c55-9a51-0d2f3c4b5a69';

function finding(over: Partial<ContradictionFinding> = {}): ContradictionFinding {
  return {
    id: FINDING_ID,
    organizationId: 3,
    projectId: 12,
    objectAType: 'artifact',
    objectAId: '101',
    objectALabel: 'Protocol v2',
    objectBType: 'artifact',
    objectBId: '102',
    objectBLabel: 'IB v4',
    contradictionType: 'cross_artifact_inconsistency',
    severity: 'high',
    confidenceLevel: 'high',
    title: 'Dose differs between protocol and IB',
    description: 'Protocol states 10 mg; IB states 20 mg.',
    authorityState: 'requires_review',
    reviewState: 'detected',
    consequenceType: null,
    consequenceObjectId: null,
    consequenceExecuted: false,
    ...over,
  } as ContradictionFinding;
}

/** SQL text of every pool.query call. */
const sqls = () => H.query.mock.calls.map((c) => String(c[0]));
const findingMarkedExecuted = () => sqls().some((s) => /UPDATE contradiction_findings[\s\S]*consequence_executed = true/.test(s));
const transitionsTo = () => H.transitionDecision.mock.calls.map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  H.query.mockResolvedValue({ rows: [] });
  H.insertReturning.mockResolvedValue([{ id: 4321 }]);
  H.recordContradictionConsequence.mockResolvedValue({ decision: { id: 'dec-1' }, consequencePaths: [] });
  H.transitionDecision.mockResolvedValue({ success: true });
  H.createReceipt.mockImplementation(async (opts: unknown) => ({ id: 'rcpt-1', ...(opts as object) }));
  H.supersede.mockResolvedValue(undefined);
});

describe('consequences with no record to create are refused before anything is recorded', () => {
  it.each(['review_thread', 'harmonization_rewrite', 'dossier_review_attachment'] as ConsequenceType[])(
    '%s',
    async (type) => {
      const r = await contradictionConsequenceService.executeConsequence(finding(), type, '7', { organizationId: 3 });
      expect(r.success).toBe(false);
      expect(r.consequenceObjectId).toBeNull();
      expect(r.error).toMatch(/no record of that kind\. Nothing was recorded\./);
      expect(H.recordContradictionConsequence).not.toHaveBeenCalled();
      expect(H.createReceipt).not.toHaveBeenCalled();
      expect(findingMarkedExecuted()).toBe(false);
      // The attempt is logged as failed — not as executed.
      const logged = H.query.mock.calls.find((c) => /INSERT INTO contradiction_consequence_log/.test(String(c[0])));
      expect(logged?.[1]).toEqual(expect.arrayContaining(['failed']));
      expect(logged?.[1]).not.toEqual(expect.arrayContaining(['executed']));
    },
  );

  it('supersession between objects that are not both assumptions', async () => {
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'assumption_supersession', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/only when both conflicting objects are assumptions/);
    expect(H.recordContradictionConsequence).not.toHaveBeenCalled();
    expect(H.supersede).not.toHaveBeenCalled();
  });

  it('is not offered as a path in the first place', async () => {
    const paths = await contradictionConsequenceService.getAvailableConsequencePaths(
      finding({ consequenceType: 'review_thread' }));
    expect(paths.map((p) => p.actionType)).not.toContain('review_thread');

    const memo = await contradictionConsequenceService.getAvailableConsequencePaths(
      finding({ consequenceType: 'contradiction_memo' }));
    expect(memo.map((p) => p.actionType)).toContain('contradiction_memo');
  });
});

describe('an escalation escalates the decision and is not marked executed', () => {
  it('confirmed → escalated, with the RA-lead approval pending on the receipt', async () => {
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'escalation', '7', { organizationId: 3 });
    expect(r.success).toBe(true);
    expect(transitionsTo()).toEqual(['confirmed', 'escalated']);
    expect(H.transitionDecision.mock.calls[1][2]).toMatchObject({ escalatedToRole: 'ra_lead', actorId: '7' });
    // The escalated decision is the consequence; no invented id.
    expect(r.consequenceObjectId).toBe('dec-1');
    const receipt = H.createReceipt.mock.calls[0][0];
    expect(receipt.execution.executed).toBe(false);
    expect(receipt.pendingApprovals).toEqual([expect.objectContaining({ requiredRole: 'ra_lead', status: 'pending' })]);
    expect(receipt.affectedObjects.map((o: { objectId: string }) => o.objectId)).toEqual([FINDING_ID]);
  });

  it('a refused escalation fails the consequence', async () => {
    H.transitionDecision
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Invalid transition: confirmed → escalated' });
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'escalation', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('Invalid transition: confirmed → escalated');
    expect(H.createReceipt).not.toHaveBeenCalled();
    expect(findingMarkedExecuted()).toBe(false);
  });
});

describe('a refusal anywhere in the chain is a failure, not an executed consequence', () => {
  const assumptions = () => finding({
    objectAType: 'assumption', objectAId: 'a-old', objectBType: 'assumption', objectBId: 'a-new',
  });

  it('a supersession the registry refuses', async () => {
    H.supersede.mockRejectedValue(new Error('assumption a-old is locked'));
    const r = await contradictionConsequenceService.executeConsequence(
      assumptions(), 'assumption_supersession', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('assumption a-old is locked');
    expect(r.consequenceObjectId).toBeNull();
    expect(transitionsTo()).toEqual(['confirmed']);
    expect(findingMarkedExecuted()).toBe(false);
  });

  it('a supersession that happened names the superseded assumption on the receipt', async () => {
    const r = await contradictionConsequenceService.executeConsequence(
      assumptions(), 'assumption_supersession', '7', { organizationId: 3 });
    expect(r.success).toBe(true);
    expect(r.consequenceObjectId).toBe('a-new');
    expect(transitionsTo()).toEqual(['confirmed', 'executed']);
    const receipt = H.createReceipt.mock.calls[0][0];
    expect(receipt.execution.executed).toBe(true);
    expect(receipt.affectedObjects).toContainEqual(
      expect.objectContaining({ objectType: 'assumption', objectId: 'a-old', newState: 'superseded' }));
    expect(findingMarkedExecuted()).toBe(true);
  });

  it('a decision that could not be confirmed', async () => {
    H.transitionDecision.mockResolvedValueOnce({ success: false, error: 'Decision dec-1 could not be transitioned to confirmed durably.' });
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'contradiction_memo', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/could not be transitioned to confirmed durably/);
    expect(H.insertReturning).not.toHaveBeenCalled();
    expect(findingMarkedExecuted()).toBe(false);
  });

  it('a decision that could not be marked executed', async () => {
    H.transitionDecision
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Invalid transition: confirmed → executed' });
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'contradiction_memo', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    // The memo that was stored is reported, not hidden.
    expect(r.consequenceObjectId).toBe('4321');
    expect(H.createReceipt).not.toHaveBeenCalled();
    expect(findingMarkedExecuted()).toBe(false);
  });

  it('a memo the database did not return an id for', async () => {
    H.insertReturning.mockResolvedValue([]);
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'contradiction_memo', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('the contradiction memo was not stored');
    expect(r.consequenceObjectId).toBeNull();
    expect(findingMarkedExecuted()).toBe(false);
  });

  it('a memo with no user to attribute it to', async () => {
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'contradiction_memo', 'system', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/needs the id of the user/);
    expect(H.insertReturning).not.toHaveBeenCalled();
  });

  it('a link that could not be stored', async () => {
    H.query.mockImplementation(async (sql: string) => {
      if (/INSERT INTO contradiction_decision_links/.test(sql)) throw new Error('relation does not exist');
      return { rows: [] };
    });
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'contradiction_memo', '7', { organizationId: 3 });
    expect(r.success).toBe(false);
    expect(findingMarkedExecuted()).toBe(false);
  });

  it('a memo that was stored is the consequence', async () => {
    const r = await contradictionConsequenceService.executeConsequence(
      finding(), 'contradiction_memo', '7', { organizationId: 3 });
    expect(r.success).toBe(true);
    expect(r.consequenceObjectId).toBe('4321');
    const receipt = H.createReceipt.mock.calls[0][0];
    expect(receipt.affectedObjects).toContainEqual(
      expect.objectContaining({ objectType: 'artifact', objectId: '4321' }));
    expect(findingMarkedExecuted()).toBe(true);
  });
});
