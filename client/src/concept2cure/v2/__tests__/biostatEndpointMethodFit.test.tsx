// @vitest-environment jsdom
/**
 * WO-16C #59, follow-up found by an adversarial review of the #59 fix.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Three lines below the judgment table that #59 repaired, and inside the same
 * returned object, `BiostatEngine.judge()` built:
 *
 *   endpointMethodFit = { fit: 'acceptable', … ,
 *     rationale: `${method} is appropriate for a ${endpointType} endpoint in a
 *                 ${studyType} design; …` }
 *
 * `fit` was the literal `'acceptable'` on every call, with no branch on any
 * input, and the rationale asserted unconditionally that the chosen method "is
 * appropriate" for the endpoint. Both are printed into the documents this
 * surface files into the dossier: the Statistical Risk Memo prints
 * "- **Fit**: acceptable" one section below the Dimension Analysis table, and
 * the SAP and SAP-section drafts print the rationale under "Endpoint-Method
 * Assessment".
 *
 * A real assessment of this exists and is not here: the canonical
 * `assessEndpointMethodFit` in server/services/ana-biostats/judgment-engine.ts
 * compares the suggested method against the current one and answers
 * strong / acceptable / weak / mismatch.
 *
 * ── Why the fix is the third state and not a client-side comparison ──────────
 * The surface already computes `suggestedMethod` and `currentMethod`, so a
 * naive repair would compare them here. That would be a SECOND implementation
 * of a capability the server already owns — the comparison turns on
 * `areMethodsCompatible`, a server-side table — and the working agreement is
 * one canonical implementation per capability. This surface has no route to the
 * canonical assessor, so the honest answer is that it did not assess the fit,
 * stated plainly, with both methods still shown so a reader can see them.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * No dependency to fail: the defect is a literal in a pure function, so the
 * input is the injection. Two designs whose methods differ are handed to the
 * engine; pre-fix both returned the identical 'acceptable' verdict.
 *
 * RED on the pre-fix head: `expected 'acceptable' to be 'not_assessed'`, and
 * the rendered memo contained "is appropriate for a".
 */
import { describe, expect, it } from 'vitest';
import { BiostatEngine } from '../surfaces/Biostatistics';

type Design = Record<string, unknown>;

/** Continuous endpoint — the engine's own suggestion is an ANCOVA. */
const CONTINUOUS: Design = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
  objectiveType: 'efficacy', endpointType: 'continuous',
  alpha: 0.05, powerTarget: 0.8, effectSize: 0.5, variance: 1,
  attritionRate: 0.1, allocationRatio: 1, numberOfGroups: 2,
};

/** Time-to-event — a different suggested method entirely. */
const TIME_TO_EVENT: Design = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
  objectiveType: 'efficacy', endpointType: 'time_to_event',
  alpha: 0.05, powerTarget: 0.8, effectSize: 0.7, attritionRate: 0.1,
  allocationRatio: 1, numberOfGroups: 2,
};

const judgeOf = (d: Design) => {
  const res = (BiostatEngine as never as { compute(d: Design): unknown }).compute(d);
  return (BiostatEngine as never as { judge(d: Design, r: unknown): { endpointMethodFit: Record<string, string | string[]> } })
    .judge(d, res);
};

describe('Biostatistics endpoint-method fit: not assessed here, and said so', () => {
  it('does not grade a fit it never compared, for either endpoint type', () => {
    for (const design of [CONTINUOUS, TIME_TO_EVENT]) {
      const fit = judgeOf(design).endpointMethodFit;
      expect(fit.fit).toBe('not_assessed');
      expect(fit.fit).not.toBe('acceptable');
    }
  });

  it('never asserts the chosen method is appropriate for the endpoint', () => {
    for (const design of [CONTINUOUS, TIME_TO_EVENT]) {
      const rationale = String(judgeOf(design).endpointMethodFit.rationale);
      expect(rationale).not.toMatch(/is appropriate for a/i);
      // It must still say what it DID and did not do, not simply go quiet.
      expect(rationale).toMatch(/not compared|did not compare|not assessed/i);
    }
  });

  it('still shows both methods, so the reader can see what was not compared', () => {
    const fit = judgeOf(CONTINUOUS).endpointMethodFit;
    expect(String(fit.currentMethod).length).toBeGreaterThan(0);
    expect(String(fit.suggestedMethod)).toMatch(/ANCOVA/i);
    expect(Array.isArray(fit.alternatives)).toBe(true);
    expect((fit.alternatives as string[]).length).toBeGreaterThan(0);
  });

  it('points at the canonical assessor rather than leaving the gap unexplained', () => {
    /* The gap has to be named in terms the reader can act on. This assertion used
       to require the module path (`ana-biostats` / `judgment-engine`), which was
       the copy at the time; `ci:internals-in-copy` forbids exactly that, because
       this rationale prints into the SAP draft and the Statistical Risk Memo and
       a regulatory director cannot act on a server path. The intent is unchanged
       and now pinned on both sides: name the capability and the action, not the
       module. */
    const rationale = String(judgeOf(TIME_TO_EVENT).endpointMethodFit.rationale);
    expect(rationale).toMatch(/biostatistics assessment/i);
    expect(rationale).toMatch(/statistician|run that assessment/i);
    expect(rationale).not.toMatch(/judgment-engine|ana-biostats|server\//i);
  });
});
