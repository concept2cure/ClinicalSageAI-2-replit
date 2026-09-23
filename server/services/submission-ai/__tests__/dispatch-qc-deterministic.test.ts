/**
 * Dispatch QC: the verdict is deterministic; the model only narrates.
 *
 * VSR-001 F-9 (OQ-SRDY-03): POST /:id/dispatch-qc called the model first and
 * answered 502 INVALID_AI_RESPONSE with no provider — a QC verdict that
 * depended on a model (CLAUDE.md Rule 2). Pinned here:
 *
 *   - the verdict is identical with and without a provider;
 *   - without a provider `narrative` is null and no model call is made;
 *   - a model that claims cleared cannot clear a blocked verdict, and one that
 *     claims blocked cannot block a cleared one — the model's own verdict is
 *     never read;
 *   - a model failure (non-JSON, provider error) leaves the verdict intact and
 *     reports why the narrative is absent;
 *   - with a sequence assessment the verdict IS the assessment's dispatch gate.
 *
 * Verified by making it fail: reverting runDispatchQc to read
 * `ai.clearedToDispatch` fails the "never read" cases; removing the provider
 * check fails the "no model call" case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const GW = vi.hoisted(() => ({
  providers: [] as string[],
  deterministic: false,
  route: vi.fn(),
}));

vi.mock('../../ai-gateway', () => ({
  getGateway: () => ({
    getEnabledProviders: () => GW.providers,
    isDeterministic: () => GW.deterministic,
    route: (...a: unknown[]) => GW.route(...a),
  }),
}));
vi.mock('../../auditService', () => ({
  default: { logAction: async () => ({ persisted: true, chained: true }) },
}));
vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>();
  return { ...real, promises: { ...real.promises, readFile: async () => '# dispatch-qc prompt (test)' } };
});

import {
  runDispatchQc,
  computeDispatchQcVerdict,
  DISPATCH_QC_NARRATIVE_LABEL,
  type DispatchQcInput,
  type DispatchQcResult,
} from '../submission-ai-service';
import type { DispatchReadinessAssessment } from '../../ectd/assess-dispatch-readiness';

const CTX = { organizationId: 2, userId: 1, submissionId: 37 };
const BLOCKED_INPUT: DispatchQcInput = {
  region: 'fda', validationErrors: 1, unresolvedShadowCriticals: 0,
  leaves: [{ sectionCode: 'm5.3.5', operation: 'new' }],
};
const CLEAR_INPUT: DispatchQcInput = { ...BLOCKED_INPUT, validationErrors: 0 };

const modelSays = (payload: unknown) => GW.route.mockResolvedValue({ content: JSON.stringify(payload) });

const stripNarrative = (r: DispatchQcResult) => {
  const verdict: Partial<DispatchQcResult> = { ...r };
  delete verdict.narrative;
  delete verdict.narrativeUnavailable;
  return verdict;
};

beforeEach(() => {
  GW.providers = [];
  GW.deterministic = false;
  GW.route.mockReset();
});

describe('runDispatchQc — deterministic verdict, model narrates', () => {
  it('without a provider: returns the deterministic verdict, narrative null, and never calls the model', async () => {
    const r = await runDispatchQc(BLOCKED_INPUT, CTX);
    expect(r.clearedToDispatch).toBe(false);
    expect(r.blockers).toEqual(['1 open error-severity validation finding(s) must be resolved before dispatch.']);
    expect(r.verdictSource).toBe('dispatch-gate');
    expect(r.narrative).toBeNull();
    expect(r.narrativeUnavailable?.code).toBe('PROVIDER_UNAVAILABLE');
    expect(GW.route).not.toHaveBeenCalled();
  });

  it('the verdict is byte-identical with and without a provider', async () => {
    const without = await runDispatchQc(BLOCKED_INPUT, CTX);
    GW.providers = ['anthropic'];
    modelSays({ clearedToDispatch: true, blockers: [], warnings: ['Consider a cover letter.'], checklist: [{ item: 'Forms present', pass: true }] });
    const withProvider = await runDispatchQc(BLOCKED_INPUT, CTX);
    expect(stripNarrative(withProvider)).toEqual(stripNarrative(without));
    expect(GW.route).toHaveBeenCalledTimes(1);
  });

  it('with a provider: the narrative is present, labelled as model prose, and carries only prose', async () => {
    GW.providers = ['anthropic'];
    modelSays({ clearedToDispatch: false, blockers: ['Missing 1.3.1 cover letter'], warnings: ['Check the index.'], checklist: [{ item: 'Forms present', pass: false }, { item: 'bad', pass: 'yes' }] });
    const r = await runDispatchQc(CLEAR_INPUT, CTX);
    expect(r.narrative).not.toBeNull();
    expect(r.narrative?.source).toBe('model');
    expect(r.narrative?.label).toBe(DISPATCH_QC_NARRATIVE_LABEL);
    expect(r.narrative?.observations).toEqual(['Missing 1.3.1 cover letter', 'Check the index.']);
    expect(r.narrative?.checklistNotes).toEqual([{ item: 'Forms present', pass: false }]);
    expect(r.narrative?.summary).toBe('Missing 1.3.1 cover letter');
    expect(r.narrativeUnavailable).toBeNull();
    // The model's observations do not leak into the verdict's blockers.
    expect(r.blockers).toEqual([]);
  });

  it('a model claiming cleared cannot clear a blocked verdict', async () => {
    GW.providers = ['anthropic'];
    modelSays({ clearedToDispatch: true, blockers: [], warnings: [], checklist: [] });
    const r = await runDispatchQc(BLOCKED_INPUT, CTX);
    expect(r.clearedToDispatch).toBe(false);
    expect(r.blockers).toHaveLength(1);
  });

  it('a model claiming blocked cannot block a cleared verdict — its verdict is never read', async () => {
    GW.providers = ['anthropic'];
    modelSays({ clearedToDispatch: false, blockers: ['The model does not like it.'], warnings: [], checklist: [] });
    const r = await runDispatchQc(CLEAR_INPUT, CTX);
    expect(r.clearedToDispatch).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.narrative?.observations).toEqual(['The model does not like it.']);
  });

  it('a non-JSON model response leaves the verdict intact and names why the narrative is absent', async () => {
    GW.providers = ['anthropic'];
    GW.route.mockResolvedValue({ content: 'I am not JSON' });
    const r = await runDispatchQc(BLOCKED_INPUT, CTX);
    expect(r.clearedToDispatch).toBe(false);
    expect(r.narrative).toBeNull();
    expect(r.narrativeUnavailable?.code).toBe('INVALID_AI_RESPONSE');
  });

  it('a provider error leaves the verdict intact', async () => {
    GW.providers = ['anthropic'];
    GW.route.mockRejectedValue(new Error('provider timeout'));
    const r = await runDispatchQc(CLEAR_INPUT, CTX);
    expect(r.clearedToDispatch).toBe(true);
    expect(r.narrative).toBeNull();
    expect(r.narrativeUnavailable).not.toBeNull();
  });

  it('the model is handed the deterministic verdict to narrate, not asked for one', async () => {
    GW.providers = ['anthropic'];
    modelSays({ clearedToDispatch: false, blockers: [], warnings: [], checklist: [] });
    await runDispatchQc(BLOCKED_INPUT, CTX);
    const call = GW.route.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = JSON.parse(call.messages.find((m) => m.role === 'user')!.content);
    expect(userMessage.deterministicVerdict.clearedToDispatch).toBe(false);
  });
});

describe('computeDispatchQcVerdict', () => {
  it('without an assessment: the hard gate over the counts, and a warning naming what was not checked', () => {
    const v = computeDispatchQcVerdict(CLEAR_INPUT);
    expect(v.clearedToDispatch).toBe(true);
    expect(v.verdictSource).toBe('dispatch-gate');
    expect(v.checklist.map((c) => c.pass)).toEqual([true, true]);
    expect(v.warnings.join(' ')).toMatch(/not run because no sequence assessment/);
  });

  it('with an assessment: the verdict IS the assessment dispatch gate, and the checklist reads off its parts', () => {
    const a = {
      sequenceId: 18, region: 'fda', sequenceStatus: 'validated',
      validationErrors: 1, unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 0, shadowReviewMissing: true,
      externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
      releaseSignature: { required: true, verdict: 'unsigned', runId: null, signatureId: null, detail: undefined, cleared: false },
      gate: { cleared: false, blockers: ['structural', 'no shadow review', 'unsigned'] },
      freezeGate: { cleared: false, blockers: ['structural', 'no shadow review'] },
      readiness: {
        errors: 1, warnings: 1, infos: 0,
        findings: [
          { severity: 'error', code: 'UNRESOLVED_DOCUMENT', sectionCode: 'm5.3.5', message: 'no document' },
          { severity: 'warning', code: 'MISSING_REQUIRED_SECTION', sectionCode: '1.1', message: 'Module 1.1 missing' },
        ],
      },
      leafCount: 1,
    } as unknown as DispatchReadinessAssessment;
    const v = computeDispatchQcVerdict(BLOCKED_INPUT, a);
    expect(v.verdictSource).toBe('assess-dispatch-readiness');
    expect(v.clearedToDispatch).toBe(false);
    expect(v.blockers).toEqual(['structural', 'no shadow review', 'unsigned']);
    expect(v.warnings).toEqual(['Module 1.1 missing']);
    expect(v.checklist[0]).toEqual({ item: 'No open error-severity validation findings on the stored leaves', pass: false });
    expect(v.checklist[1]).toEqual({ item: 'No unacknowledged Shadow Review criticals', pass: true });
    expect(v.checklist.map((c) => c.pass)).toEqual([false, true, false, true, false, false, true]);
  });

  it('with an assessment the client-supplied counts are ignored', () => {
    const a = {
      validationErrors: 0, unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1,
      externalValidation: { cleared: true }, releaseSignature: { cleared: true },
      gate: { cleared: true, blockers: [] }, readiness: { findings: [] },
    } as unknown as DispatchReadinessAssessment;
    const v = computeDispatchQcVerdict({ ...BLOCKED_INPUT, validationErrors: 99, unresolvedShadowCriticals: 99 }, a);
    expect(v.clearedToDispatch).toBe(true);
    expect(v.checklist.every((c) => c.pass)).toBe(true);
  });
});
