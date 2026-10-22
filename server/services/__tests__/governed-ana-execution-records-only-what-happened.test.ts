/**
 * Governed AnA execution reports only what happened: no invented confidence, no
 * reference for a capture that failed, no user / organization / project 0.
 *
 * What the code used to do (until 2026-10-15):
 * - the learning signal's confidence was the readiness score clamped to 30-95;
 * - emitGovernedLearningEvent returned RIM's run id whatever the capture's
 *   status, so a failed capture came back as a learning-event reference;
 * - an actor that is not a user id was written as user 0 (tagged 'system');
 * - an absent organization was read as organization 0 (the unresolved-decision
 *   read then answered for org 0), and a uuid project was filed as project 0 in
 *   the learning store;
 * - the decisionId was embedded in the artifact and returned with no word on
 *   whether the governed decision's queued ledger insert had been written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  evaluate: vi.fn(),
  hasUnresolved: vi.fn(),
  integrateSignal: vi.fn(),
  tagArtifact: vi.fn(),
  decisionPersisted: vi.fn(),
}));

vi.mock('../../src/control-plane/governed-document-evaluator.js', () => ({
  evaluateAndInterceptGovernedDocument: m.evaluate,
}));
vi.mock('../governed-decision-repository.js', () => ({ hasUnresolvedGovernedDecisions: m.hasUnresolved }));
vi.mock('../governed-decision-ledger.js', () => ({ governedDecisionPersisted: m.decisionPersisted }));
vi.mock('../intelligence/rim-integration.js', () => ({ integrateSignal: m.integrateSignal }));
vi.mock('../artifact-tagger.js', async (importOriginal) => ({
  ArtifactWriteRefusedError: (await importOriginal<typeof import('../artifact-tagger.js')>()).ArtifactWriteRefusedError,
  tagArtifact: m.tagArtifact,
}));

import { buildCanonicalGovernedState, executeGovernedAnaOperation } from '../governed-ana-execution.js';

type Context = { organizationId: string; projectId: string; actorId: string };

/** The evaluator echoes the context it was given, as the real one does. */
function arrange() {
  vi.resetAllMocks();
  m.evaluate.mockImplementation((input: { context: Context }) => ({
    evaluation: {
      context: { ...input.context, intendedAction: 'create', documentType: 'risk_memo' },
      decision: { outcome: 'allow', rationale: 'ok', blockerCount: 0, warningCount: 0, consequenceCount: 0 },
      readiness: { level: 'review_ready', score: 77, blockers: [], warnings: [] },
      placement: { outcome: 'allowed' },
      exportGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [] },
      publishGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [], dispatchReady: true },
      consequences: [],
      evaluatedAt: '2026-10-15T00:00:00.000Z',
    },
    decisionReference: { decisionId: 'dec_1', projectId: input.context.projectId, intent: 'create', outcome: 'allow', actorId: input.context.actorId, timestamp: '2026-10-15T00:00:00.000Z' },
  }));
  m.hasUnresolved.mockResolvedValue({ hasUnresolved: false, unresolvedCount: 0, escalatedCount: 0, states: {} });
  m.decisionPersisted.mockResolvedValue(true);
  m.integrateSignal.mockReturnValue({
    runId: 'rim_run_1', status: 'completed', signalsGenerated: 1,
    persistenceStatus: 'not_attempted', trendContextIncluded: false, warnings: [],
  });
  m.tagArtifact.mockResolvedValue({ artifactId: 'art_1', versionId: 'ver_1' });
}

function operation(context: Partial<Context> = {}) {
  return {
    evaluationInput: {
      context: { organizationId: '1', projectId: '2', actorId: '3', intendedAction: 'create', documentType: 'risk_memo', ...context },
      documentState: {
        hasContent: true, hasEvidence: true, hasBeenReviewed: false, hasApproval: false, hasPlacement: true,
        placementValid: true, hasProvenance: false, unresolvedContradictionCount: 0, criticalContradictionCount: 0,
      },
    },
    artifactMutation: {
      projectId: 2, organizationId: 1, documentType: 'risk_memo', artifactClass: 'ana_ri_generated_document',
      title: 'Risk memo',
      content: '[KNOWN] Sterilisation validation covers all three lots. [INFERRED] Shelf life is supported to 24 months. [MISSING] No summative data.',
      status: 'draft', source: 'AnA', intentLens: 'risk', originSurface: 'test', provenance: {}, structureSections: [],
      qualityGate: { grade: 'A', pass: true, issues: [] }, versioningMode: 'create',
    },
  } as unknown as Parameters<typeof executeGovernedAnaOperation>[0];
}

beforeEach(arrange);

describe('the learning signal carries only what was measured (finding 22)', () => {
  it('emits no confidence — a readiness score is not one', async () => {
    await executeGovernedAnaOperation(operation());
    expect(m.integrateSignal).toHaveBeenCalledTimes(1);
    expect(m.integrateSignal.mock.calls[0][1].confidence).toBeNull();
  });

  it('a capture RIM reports as failed has no reference, and the failure comes back with its run', async () => {
    m.integrateSignal.mockReturnValue({
      runId: 'rim_run_9', status: 'failed', signalsGenerated: 0,
      persistenceStatus: 'not_attempted', trendContextIncluded: false, warnings: ['Signal capture failed: store full'],
    });
    const result = await executeGovernedAnaOperation(operation());
    expect(result.learningEventReference).toBeNull();
    expect((result as { learningEventFailure?: string }).learningEventFailure).toMatch(/rim_run_9.*store full/);
  });

  it('a captured signal is referenced by its run (control)', async () => {
    const result = await executeGovernedAnaOperation(operation());
    expect(result.learningEventReference).toBe('rim_run_1');
  });

  it('a project with no integer id is not filed as project 0 in the learning store', async () => {
    const result = await executeGovernedAnaOperation(operation({ projectId: '0f5e7c1a-3b2d-4c5e-8f9a-1b2c3d4e5f60' }));
    expect(m.integrateSignal).not.toHaveBeenCalled();
    expect(result.learningEventReference).toBeNull();
    expect((result as { learningEventFailure?: string }).learningEventFailure).toMatch(/no integer id/);
  });
});

describe('a governed write names a real user and organization (finding 22)', () => {
  it.each(['system', '0', 'undefined', ''])('refuses the mutation for actor %j rather than writing it as user 0', async (actorId) => {
    const result = await executeGovernedAnaOperation(operation({ actorId }));
    expect(m.tagArtifact).not.toHaveBeenCalled();
    expect(result.persistenceStatus).toBe('rejected');
    expect(result.persistenceRefusal?.code).toBe('UNATTRIBUTABLE_ACTOR');
  });

  it('writes as the identified user (control)', async () => {
    const result = await executeGovernedAnaOperation(operation({ actorId: '3' }));
    expect(m.tagArtifact).toHaveBeenCalledWith(expect.objectContaining({ userId: 3 }));
    expect(result.persistenceStatus).toBe('persisted');
  });

  it('refuses an evaluation with no organization instead of reading organization 0', async () => {
    await expect(buildCanonicalGovernedState(operation({ organizationId: '' }).evaluationInput)).rejects.toThrow(/organization/);
    expect(m.hasUnresolved).not.toHaveBeenCalled();
  });
});

describe('the governed decision id says whether its ledger row was written (finding 14, via finding 22)', () => {
  it('reports decisionPersisted:false and files that in the artifact when the insert was not written', async () => {
    m.decisionPersisted.mockResolvedValue(false);
    const result = await executeGovernedAnaOperation(operation());
    expect((result as { decisionPersisted?: unknown }).decisionPersisted).toBe(false);
    expect(m.tagArtifact.mock.calls[0][0].metadata).toMatchObject({ decisionReference: 'dec_1', decisionRecorded: false });
  });

  it('and true when it was (control)', async () => {
    const result = await executeGovernedAnaOperation(operation());
    expect((result as { decisionPersisted?: unknown }).decisionPersisted).toBe(true);
  });
});
