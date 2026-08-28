// @vitest-environment jsdom
/**
 * The IND Readiness document may only claim what the protocol actually supports.
 *
 * ── The findings ─────────────────────────────────────────────────────────────
 * `genIndReadiness(_a)` never read its parameter. The whole document was a
 * constant, so the same four "strengths" and the same "Phase 2" alignment claim
 * were emitted for every protocol pasted into the surface:
 *
 *   "## Strengths -- Well-defined primary and secondary endpoints / Clear
 *    inclusion/exclusion criteria / Appropriate statistical analysis plan /
 *    Adequate safety monitoring provisions"
 *   "## Regulatory Guidance -- Aligns with FDA guidance for Phase 2 trials in
 *    this indication"
 *
 * Two of those are directly checkable from the surface itself:
 *
 *  1. parseProtocol() raises "Primary endpoint not clearly stated" whenever the
 *     pasted text has no `primary endpoint:` line, and the Design
 *     Recommendations tab prints that as a real design risk. The IND Readiness
 *     tab of the SAME analysis called the endpoints well-defined. The first test
 *     drives both tabs off one analysis and pins that contradiction shut.
 *  2. "Phase 2" was printed over a Phase 1 protocol whose phase the parser had
 *     read and displayed in the header strip two panels away.
 *
 * A third finding is the dispatch: `md` fell through to `genIndReadiness` for
 * every doc type except 'recommendations' and 'statistical', so with the
 * Clinical-Regulatory Graph flag on, the Evidence chain / Design risk /
 * Regulatory precedent tabs rendered the generic IND boilerplate under a doc-bar
 * promising sourced, audit-id-carrying evidence — while
 * `genGovernedEvidenceReport`, the function written to say "No trace is
 * available for this document yet", had no call site at all.
 *
 * ── Why these can be behavioural ─────────────────────────────────────────────
 * No API fixture is needed for the analysis itself: with no auth token
 * `connected()` is false, so "Analyze protocol" runs the local parser
 * synchronously and the document renders from the text typed into the textarea.
 * Every assertion below reads the rendered document. The one test that needs the
 * live analyzer (a parse carrying no design parameter at all) mocks the POST.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ReportEngine } from '../surfaces/ReportEngine';

const props = () => ({
  surface: { id: 'report-engine', label: 'Reporting & analytics' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/** A Phase 1 synopsis with NO `primary endpoint:` line — the state parseProtocol
 *  itself flags. Sample size and duration are readable and above both flag
 *  thresholds, so the endpoint is the only risk raised. */
const NO_ENDPOINT_PHASE_1 = [
  'Title: CX-901 first-in-human study',
  'Indication: Refractory anemia',
  'Phase: 1',
  'Sample size: 240',
  'Duration: 24 weeks',
  'Randomized, double-blind, placebo-controlled dose escalation.',
].join('\n');

/** The same synopsis fully specified — every check has a value and none is
 *  flagged. This is the state that MAY read clear. */
const COMPLETE_PHASE_2 = [
  'Title: CX-901 dose-ranging study',
  'Indication: Rheumatoid arthritis',
  'Phase: 2',
  'Sample size: 240',
  'Duration: 24 weeks',
  'Primary endpoint: ACR20 response at week 24',
].join('\n');

/** The four sentences the constant document asserted about every protocol. */
const FABRICATED_STRENGTHS = [
  'Well-defined primary and secondary endpoints',
  'Clear inclusion/exclusion criteria',
  'Appropriate statistical analysis plan',
  'Adequate safety monitoring provisions',
];

/** Text of the rendered document body (markdown → sanitized HTML). */
function doc(): string {
  return document.querySelector('.bs-doc-render')?.textContent || '';
}

/** Label on the document bar — what the reader believes they are reading. */
function docKind(): string {
  return document.querySelector('.bs-doc-kind')?.textContent?.trim() || '';
}

function analyze(text: string) {
  fireEvent.change(screen.getByLabelText('Protocol synopsis'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Analyze protocol/ }));
}

function openDoc(label: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
beforeEach(() => {
  apiRequest.mockReset();
  // The CSR-library panel's own GET; irrelevant to these assertions but it must
  // not throw. No auth token is set, so the protocol analysis stays local.
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response);
});

describe('ReportEngine — IND readiness reads the protocol it was given', () => {
  it('does not call the endpoints well-defined on a protocol that states none', () => {
    render(<ReportEngine {...props()} />);
    analyze(NO_ENDPOINT_PHASE_1);
    openDoc('IND Readiness');

    const body = doc();
    // The claim that was false, and the three beside it that nothing on this
    // path reads at all.
    for (const claim of FABRICATED_STRENGTHS) {
      expect(body.includes(claim), `must not assert "${claim}"`).toBe(false);
    }
    // It must say what IS true — the same thing the parse concluded.
    expect(body).toContain('Primary endpoint not clearly stated');
    // And it must name the unassessed items as unassessed rather than as
    // findings of adequacy.
    expect(body).toMatch(/Not Assessed/i);
    expect(body).toMatch(/not a finding of adequacy/i);
  });

  it('agrees with the Design Recommendations document about the same protocol', () => {
    render(<ReportEngine {...props()} />);
    analyze(NO_ENDPOINT_PHASE_1);

    // The recommendations tab (the default) already reported the risk.
    expect(doc()).toContain('Primary endpoint not clearly stated');

    // The IND tab of the same analysis must not contradict it.
    openDoc('IND Readiness');
    const ind = doc();
    expect(ind).toContain('Primary endpoint not clearly stated');
    expect(ind.includes('Well-defined primary and secondary endpoints')).toBe(false);
  });

  it('never asserts Phase 2 guidance over a Phase 1 protocol', () => {
    render(<ReportEngine {...props()} />);
    analyze(NO_ENDPOINT_PHASE_1);
    openDoc('IND Readiness');

    const body = doc();
    expect(body.includes('Aligns with FDA guidance for Phase 2 trials'), 'the literal claim').toBe(false);
    // Nothing in this document may mention Phase 2 for a Phase 1 study.
    expect(/Phase 2/.test(body), 'no Phase 2 anywhere in a Phase 1 readiness memo').toBe(false);
    // The phase it does name is the one that was parsed.
    expect(body).toMatch(/Phase 1/);
    // And guidance is named as applicable, not as conformed to.
    expect(body).toMatch(/has not been assessed|is not evaluated/i);
  });

  /**
   * The over-correction guard.
   *
   * A fix that simply deleted the Strengths section would pass every test above
   * and destroy the document. Here all three checks have a value and none is
   * flagged, so the strengths list must appear AND must be reachable clear copy.
   *
   * Each asserted string is a value taken from the pasted text — the endpoint
   * sentence, N=240, 24 weeks — so this cannot be satisfied by a new constant:
   * a hardcoded document could not know what was typed into the textarea.
   */
  it('still reports strengths, derived from the text, when they are earned', () => {
    render(<ReportEngine {...props()} />);
    analyze(COMPLETE_PHASE_2);
    openDoc('IND Readiness');

    const body = doc();
    expect(body).toMatch(/Strengths/);
    // Derived from the input, not from a literal.
    expect(body).toContain('ACR20 response at week 24');
    expect(body).toContain('N=240');
    expect(body).toContain('24 weeks');
    // Full coverage, and the one reassuring sentence the assessed-clear state
    // is allowed to carry.
    expect(body).toMatch(/3 of 3 design checks/);
    expect(body).toMatch(/raised nothing to address/i);
    // Earned clearance still does not borrow the retired boilerplate.
    for (const claim of FABRICATED_STRENGTHS) {
      expect(body.includes(claim), `must not assert "${claim}"`).toBe(false);
    }
    // A Phase 2 protocol is where "Phase 2" is legitimate.
    expect(body).toMatch(/Phase 2/);
  });

  /**
   * The not-assessed state, reached the only way it can be: the live analyzer
   * returns a protocol_data carrying no design parameter and no risk factors.
   * Emptiness on both sides is exactly the state the old document answered with
   * four strengths and a guidance alignment.
   */
  it('says nothing was assessed when the analyzer returns no design parameter', async () => {
    localStorage.setItem('trialsage_access_token', 'test-token');
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/analytics/analyze-protocol-text') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              protocol_data: {
                title: 'Untitled Protocol',
                indication: 'Unspecified',
                phase: 'Unknown',
                sample_size: 0,
                duration_weeks: 0,
                primary_endpoint: '',
                risk_factors: [],
              },
              similar_protocols: [],
            },
          }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    render(<ReportEngine {...props()} />);
    analyze('A pasted page of prose with none of the design parameters this reader looks for.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'IND Readiness' })).toBeTruthy());
    openDoc('IND Readiness');

    const body = doc();
    expect(body).toMatch(/0 of 3 design checks/);
    expect(body).toMatch(/No design parameter could be read/i);
    expect(body).toMatch(/An empty list is not a finding that the design is sound/i);
    // Not one of the constant claims, and no reassurance.
    for (const claim of FABRICATED_STRENGTHS) {
      expect(body.includes(claim), `must not assert "${claim}"`).toBe(false);
    }
    expect(/raised nothing to address/i.test(body), 'must not reassure').toBe(false);
    expect(/Aligns with FDA guidance/i.test(body)).toBe(false);
  });
});

describe('ReportEngine — a governed-evidence tab renders the governed-evidence document', () => {
  beforeEach(() => {
    // The flag's own sticky override (clinicalRegulatoryGraphFlag.ts), cleared
    // in afterEach. This is the state a user reaches with ?crl-graph=1.
    localStorage.setItem('c2c-crl-graph', '1');
  });

  it('shows the honest no-trace explanation, not the IND boilerplate', () => {
    render(<ReportEngine {...props()} />);
    analyze(COMPLETE_PHASE_2);
    openDoc('Evidence chain');

    // The bar says Evidence chain, so the body must be the evidence document.
    expect(docKind()).toBe('Evidence chain');
    const body = doc();
    expect(body).toMatch(/No trace is available for this document yet/i);
    expect(body.includes('IND Readiness Assessment'), 'must not be the IND memo').toBe(false);
    for (const claim of FABRICATED_STRENGTHS) {
      expect(body.includes(claim), `must not assert "${claim}"`).toBe(false);
    }
  });

  it('routes Design risk and Regulatory precedent the same way', () => {
    render(<ReportEngine {...props()} />);
    analyze(COMPLETE_PHASE_2);

    openDoc('Design risk');
    expect(docKind()).toBe('Design risk');
    expect(doc()).toMatch(/No trace is available for this document yet/i);
    expect(doc().includes('IND Readiness Assessment')).toBe(false);

    openDoc('Regulatory precedent');
    expect(docKind()).toBe('Regulatory precedent');
    expect(doc()).toMatch(/No trace is available for this document yet/i);
    expect(doc().includes('IND Readiness Assessment')).toBe(false);
  });

  it('leaves the three real generators on their own tabs', () => {
    render(<ReportEngine {...props()} />);
    analyze(COMPLETE_PHASE_2);

    openDoc('Statistical Insights');
    expect(doc()).toMatch(/Statistical Analysis Insights/);
    openDoc('IND Readiness');
    expect(doc()).toMatch(/IND Readiness Assessment/);
    openDoc('Design Recommendations');
    expect(doc()).toMatch(/Protocol Design Recommendations/);
  });
});
