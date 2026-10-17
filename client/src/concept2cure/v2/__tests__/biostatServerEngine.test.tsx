// @vitest-environment jsdom
/**
 * Biostatistics computes NOTHING in the browser.
 *
 * ── The defect this file pins shut ───────────────────────────────────────────
 * `client/src/concept2cure/v2/surfaces/Biostatistics.tsx` exported
 * `BiostatEngine`, a ~220-line in-browser re-implementation of
 * server/services/ana-biostats/* — its own normal CDF (Abramowitz & Stegun,
 * error 7.5e-8, against the server's Cody at ~1e-16), its own quantile, its own
 * sizing formulas, its own scenario loop, and four copies of the sizing
 * arithmetic in total. It was the engine users actually touched, it was pinned
 * to no published reference value, and it carried every defect that was fixed
 * server-side on 2026-10-05:
 *
 *   • computeSurvival did `hr = 1 - effectSize` then `Math.log(hr > 0 ? hr : 0.5)`
 *     — a SILENT hazard ratio of 0.5 whenever the effect reached 1 — and then
 *     `n = Math.ceil(events / (2 * eventRate))`, which halves the subjects;
 *   • equivalence was sized with z(1−α/2) and z(1−β) where TOST needs z(1−α)
 *     and z(1−β/2);
 *   • computeDiagnostic hard-coded a 0.05 margin and silently defaulted
 *     sensitivity 0.90 / specificity 0.90 / prevalence 0.50;
 *   • computeDevicePerformance silently defaulted the performance goal to 0.85.
 *
 * Two divergent implementations of one computation, with the unvalidated one
 * under the user's cursor. Under computer-system validation that is
 * disqualifying, and the working agreement allows exactly one canonical
 * implementation per capability.
 *
 * ── The reference case these numbers come from ───────────────────────────────
 * The surface's default design is the "Pivotal OS (survival)" preset: a = 0.05,
 * power 0.90, HR reduction 0.38, event rate 0.55, attrition 0.15. Run through
 * the DELETED browser copy that preset produced 184 events, 168 per group, 336
 * subjects and 396 after attrition, with the 90% power TARGET reported as the
 * achieved power and a 'marginal' verdict. (Its four copies of the sizing
 * arithmetic did not even agree with each other: the scenario loop's
 * time-to-event branch used `(z_a+z_b)^2 * 4 / ln(HR)^2` and then divided the
 * events by the event rate once, not twice.) Every case below serves a mocked
 * server response whose figures — 247 events, 622 subjects, 733 adjusted, 84.2%
 * achieved power — cannot be produced by any formula in the browser, then
 * asserts that what is on screen is the server's set and that 396 / 184 / 90%
 * are nowhere.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * `apiRequest` is the only way out of the browser, so it is the injection
 * point: it is mocked here, and `POST /api/ana-biostats/compute` either answers
 * with the engine's real response shape, refuses with the engine's own
 * `ComputationRefusal` sentence (422), returns a normalizer validation failure
 * (200, `valid: false`), or stays in flight.
 *
 * RED on the pre-fix head: `'BiostatEngine' in surfaceModule` is true, no POST
 * to the compute endpoint is ever made, and the screen reads
 * "396 subjects / 90% power / 184 events / marginal" from the browser copy.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* The mock spreads the real module, so this is the real error class — the one
   `apiRequest` throws for every non-OK status but 401. */
import { ApiRequestError } from '@/lib/queryClient';
import * as surfaceModule from '../surfaces/Biostatistics';

const Surface = surfaceModule.Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;

const COMPUTE = '/api/ana-biostats/compute';
const DOCUMENT = '/api/ana-biostats/document';

/* ── The server's own contract (server/services/ana-biostats/types.ts) ── */

const COMPUTATION = {
  method: 'Log-rank test (Schoenfeld formula)',
  sampleSize: { perGroup: 311, total: 622, groups: 2 },
  power: 0.8423,
  effectSize: 0.38,
  alpha: 0.05,
  adjustedSampleSize: 366,
  adjustedTotal: 733,
  attritionAdjusted: true,
  criticalValue: 1.959963984540054,
  testStatistic: 'Log-rank',
  formula: 'Events = (z_a + z_b)^2 * (1+r)^2 / (r * ln(HR)^2), HR=0.620, events=247',
  assumptions: [
    { parameter: 'event_rate', value: 0.55, source: 'user_provided', sensitivity: 'high' },
    { parameter: 'alpha', value: 0.05, source: 'default', sensitivity: 'moderate' },
  ],
  scenarios: [],
};

const JUDGMENT = {
  overallVerdict: 'adequate',
  overallRisk: 'low',
  actionRecommendation: 'proceed',
  confidence: { level: 'high', score: 88, factors: ['Power meets the target'], limitations: [] },
  dimensions: [
    { name: 'Power Adequacy', verdict: 'adequate', score: 80, rationale: 'Achieved power: 84.2%.', flags: [] },
    { name: 'Assumption Quality', verdict: 'marginal', score: 55, rationale: 'Event rate is an assumption.', flags: ['No prior data cited'] },
  ],
  fragility: { fragilityIndex: 22, category: 'robust', sensitiveParameters: [], narrative: 'Robust to plausible drift.' },
  endpointMethodFit: {
    fit: 'strong',
    suggestedMethod: 'Cox proportional hazards model',
    currentMethod: 'Log-rank test (Schoenfeld formula)',
    rationale: 'A log-rank test is the standard primary analysis for a time-to-event endpoint.',
    alternatives: ['RMST difference'],
  },
  escalationReasons: [],
  roleExplanations: {
    technical: 'Schoenfeld events-driven sizing.',
    clinical: 'The trial can detect the planned survival benefit.',
    regulatory: 'Sizing is defensible to FDA.',
    executive: 'The design is adequately powered.',
  },
};

const DOMAIN = {
  track: 'biotech_pharma',
  methodSuggestions: ['Cox proportional hazards model'],
  designConsiderations: ['Pre-specify the censoring rule'],
  endpointGuidance: ['OS is the regulatory gold standard'],
  regulatoryNotes: ['ICH E9(R1) estimand required'],
  riskFactors: ['Event accrual slower than assumed'],
  templateModifiers: {},
  trackSpecificFields: {},
};

const REGULATORY = {
  body: 'FDA',
  statisticalExpectations: ['Pre-specified SAP before unblinding'],
  documentRequirements: ['SAP', 'Sample size rationale'],
  riskFramingNotes: ['State the assumptions plainly'],
  guidanceReferences: ['ICH E9(R1)'],
  specificConstraints: [],
  templateVariations: {},
};

const VALID = {
  valid: true,
  normalizedInput: {
    clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
    objectiveType: 'efficacy', endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.9,
    effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15, allocationRatio: 1,
    numberOfGroups: 2, numberOfEndpoints: 1, interimAnalyses: 2,
  },
  warnings: [],
  errors: [],
  prefilled: [],
};

const COMPUTE_OK = {
  validation: VALID,
  computation: COMPUTATION,
  judgment: JUDGMENT,
  domain: DOMAIN,
  regulatory: REGULATORY,
  interpretation: {
    summary: 'The superiority study requires 733 subjects total to achieve 84.2% power.',
    roleSpecific: JUDGMENT.roleExplanations,
    suggestedNextSteps: ['Draft the SAP section'],
    confidenceStatement: 'High confidence.',
    limitations: [],
  },
};

/** The server document generator's real opening for a sample size rationale. */
const DOC_MARKDOWN = [
  '# Sample Size Rationale',
  '',
  '## Study Context',
  '- **Track**: Pharma/Biotech',
  '- **Study Type**: superiority',
  '',
  '## Sample Size Determination',
  '',
  '### Statistical Method',
  COMPUTATION.method,
  '',
  '### Formula',
  COMPUTATION.formula,
  '',
  '### Result',
  '',
  '- **Sample size per group**: 311',
  '- **Total (unadjusted)**: 622',
  '- **Total (adjusted)**: 733',
  '- **Achieved power**: 84.2%',
  '',
  '*Generated by the AnA Biostats engine. All numeric results are deterministic.*',
].join('\n');

const DOC_RESPONSE = {
  type: 'sample_size_rationale',
  title: 'Sample Size Rationale — superiority',
  content: DOC_MARKDOWN,
  projectId: 0,
  organizationId: 1,
  createdBy: 1,
  version: 1,
  status: 'draft',
  provenance: { generatedAt: '2026-10-11T00:00:00.000Z', engineVersion: '1.0.0' },
  metadata: { clientTrack: 'biotech_pharma', studyType: 'superiority' },
};

const res = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as Response;

/** Serve the engine, and an honest empty for every other read the surface makes. */
function serveEngine(over: (m: string, u: string, b?: any) => Response | Promise<Response> | null = () => null) {
  apiRequest.mockImplementation(async (m: string, u: string, b?: any) => {
    const o = over(m, u, b);
    if (o) return o;
    if (m === 'POST' && u === COMPUTE) return res(COMPUTE_OK);
    if (m === 'POST' && u === DOCUMENT) return res(DOC_RESPONSE);
    // Confirmed receipts: the writer proceeds only on `success: true` and a row
    // echoing the request's identity (authoringHandoff, since 9bd3ee734).
    if (m === 'POST' && u === '/api/authoring/docs')
      return res({ success: true, document: { id: 'D-1', title: b?.title, client_program_id: b?.client_program_id } }, 201);
    if (m === 'POST' && u === '/api/authoring/sections')
      return res({ success: true, section: { id: 'S-1', doc_id: b?.doc_id, code: b?.code, title: b?.title } }, 201);
    return res({ data: [] });
  });
}

const computeCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === COMPUTE);
const documentCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === DOCUMENT);

const mini = () => (document.querySelector('.bs-mini') as HTMLElement | null)?.textContent ?? '';
const rendered = () => (document.querySelector('.bs-doc-render') as HTMLElement | null)?.textContent ?? '';

const mount = (onNav = vi.fn()) => {
  render(<Surface surface={{ id: 'biostatistics' }} onAsk={vi.fn()} onNav={onNav} />);
  return onNav;
};

/** The screen has the server's result on it. */
const engineAnswered = () => waitFor(() => expect(mini()).toContain('733'));

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'a1b2c3d4-1111-4222-8333-444455556666' };
  serveEngine();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Biostatistics — the statistics come from the server engine', () => {
  it('exports no in-browser statistics engine at all', () => {
    expect(
      'BiostatEngine' in surfaceModule,
      'the surface still exports a browser copy of the statistics engine',
    ).toBe(false);
    expect(Object.keys(surfaceModule)).toEqual(['Biostatistics']);
  });

  it('posts the design to the engine in its StatisticalInput shape', async () => {
    mount();
    await waitFor(() => expect(computeCalls().length).toBeGreaterThan(0));

    expect(computeCalls()[0][2]).toMatchObject({
      clientTrack: 'biotech_pharma',
      regulatoryBody: 'FDA',
      studyType: 'superiority',
      objectiveType: 'efficacy',
      endpointType: 'time_to_event',
      alpha: 0.05,
      powerTarget: 0.9,
      effectSize: 0.38,
      eventRate: 0.55,
      attritionRate: 0.15,
      allocationRatio: 1,
    });
  });

  it('renders the engine’s figures and none the browser could have produced', async () => {
    mount();
    await engineAnswered();

    // The server's set.
    expect(mini()).toContain('733');
    expect(mini()).toMatch(/84%/);
    expect(await screen.findByText(/733 subjects/)).toBeTruthy();

    /* The deleted browser copy's set for this exact preset: 184 events, 396
       subjects after attrition, and the 90% TARGET reported as achieved power.
       If any of these is on screen, something in the browser is still
       computing. */
    expect(mini(), 'the browser copy’s attrition-adjusted total is still rendered').not.toMatch(/\b396\b/);
    expect(mini(), 'the browser copy’s event count is still rendered').not.toMatch(/\b184\b/);
    expect(mini(), 'the power TARGET is still being reported as achieved power').not.toMatch(/90%/);
  });

  it('renders the engine’s verdict, not a second judgment written in the browser', async () => {
    mount();
    await engineAnswered();
    // From JUDGMENT above — a browser rule set could not have produced the
    // 'strong' endpoint-method fit, which the old copy answered 'not_assessed'.
    expect(mini()).toContain('adequate');
    expect(await screen.findByText(/reads as/)).toBeTruthy();
  });

  it('re-asks the engine when a design input changes, and never answers locally', async () => {
    mount();
    await engineAnswered();
    const before = computeCalls().length;

    const effect = screen.getByLabelText(/HR reduction/) as HTMLInputElement;
    fireEvent.change(effect, { target: { value: '0.25' } });

    await waitFor(() => expect(computeCalls().length).toBeGreaterThan(before));
    expect(computeCalls().at(-1)![2]).toMatchObject({ effectSize: 0.25 });
    // The figures on screen are still the mocked server's — nothing recomputed
    // a new sample size from the new effect size in the browser.
    await waitFor(() => expect(mini()).toContain('733'));
  });

  it('takes the governed document from the engine, built on the engine’s own result', async () => {
    mount();
    await waitFor(() => expect(rendered()).toMatch(/Sample Size Determination/));

    expect(documentCalls().length).toBeGreaterThan(0);
    const body = documentCalls()[0][2];
    expect(body).toMatchObject({ documentType: 'sample_size_rationale' });
    // The document is generated FROM the server's computation and judgment, so
    // the prose and the figures cannot disagree.
    expect(body.computation).toMatchObject({ adjustedTotal: 733 });
    expect(body.judgment).toMatchObject({ overallVerdict: 'adequate' });
    expect(body.domainAdaptation).toMatchObject({ track: 'biotech_pharma' });
    expect(body.input).toMatchObject({ endpointType: 'time_to_event' });

    expect(rendered()).toContain('733');
    expect(rendered()).toContain('events=247');
    expect(rendered(), 'the deleted browser generator’s number is in the document').not.toMatch(/\b396\b/);
  });

  it('hands the engine’s document — not a browser draft — to the authoring store', async () => {
    mount();
    await waitFor(() => expect(rendered()).toMatch(/Sample Size Determination/));

    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => c[1] === '/api/authoring/sections')).toBe(true),
    );
    const section = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/sections')![2];
    expect(section.content).toBe(DOC_MARKDOWN);
  });
});

describe('Biostatistics — an engine refusal is shown as the engine’s own sentence', () => {
  const REFUSAL =
    'Diagnostic-accuracy sizing needs an assumed sensitivity (sensitivity); none was given, and none is assumed.';

  it('shows a 422 refusal verbatim, with no result and no document beside it', async () => {
    serveEngine((m, u) => {
      if (m === 'POST' && u === COMPUTE) {
        throw new ApiRequestError(REFUSAL, 422, { error: 'VALIDATION_FAILED', message: REFUSAL }, 'VALIDATION_FAILED');
      }
      return null;
    });
    mount();

    expect(await screen.findByText(REFUSAL)).toBeTruthy();

    // Not a blank panel, not a zero, not a generic failure.
    const body = document.body.textContent ?? '';
    expect(/ready to review/i.test(body), 'a refused design still offered a finished document').toBe(false);
    expect(document.querySelector('.bs-mini'), 'a refused design still printed a sample size').toBeNull();
    expect(rendered()).toBe('');
    expect(documentCalls(), 'a document was generated from a refused computation').toHaveLength(0);
    // And the generic sentence did not replace the engine's.
    expect(/Couldn’t complete that request/.test(body)).toBe(false);
  });

  it('shows the normalizer’s own errors when the engine returns no computation', async () => {
    serveEngine((m, u) =>
      m === 'POST' && u === COMPUTE
        ? res({
            validation: {
              valid: false,
              normalizedInput: VALID.normalizedInput,
              warnings: [],
              errors: [
                { field: 'nonInferiorityMargin', message: 'Non-inferiority margin is required for non-inferiority studies', required: true },
              ],
              prefilled: [],
            },
          })
        : null,
    );
    mount();

    expect(
      await screen.findByText(/Non-inferiority margin is required for non-inferiority studies/),
    ).toBeTruthy();
    expect(document.querySelector('.bs-mini')).toBeNull();
    expect(rendered()).toBe('');
  });

  it('says the session is not signed in rather than showing an empty design', async () => {
    serveEngine((m, u) =>
      m === 'POST' && u === COMPUTE ? res({ error: 'Authentication required' }, 401) : null,
    );
    mount();

    expect(await screen.findByText(/Sign in to your tenant to run the statistical engine\./)).toBeTruthy();
    expect(document.querySelector('.bs-mini')).toBeNull();
  });

  it('an in-flight compute is a stated wait, not an empty result', async () => {
    let answer!: (r: Response) => void;
    const inFlight = new Promise<Response>((resolve) => { answer = resolve; });
    serveEngine((m, u) => (m === 'POST' && u === COMPUTE ? inFlight : null));
    mount();

    await waitFor(() => expect(computeCalls().length).toBeGreaterThan(0));
    expect(screen.getByText(/Computing the design/i)).toBeTruthy();
    expect(document.querySelector('.bs-mini'), 'a figure was shown while the engine was still running').toBeNull();

    answer(res(COMPUTE_OK));
    await engineAnswered();
    expect(screen.queryByText(/Computing the design/i)).toBeNull();
  });
});
