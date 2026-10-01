// @vitest-environment jsdom
/**
 * SubmissionCenter — the 510(k) device-assembly caption counts sections, not
 * sentences.
 *
 * ── The finding (launch sweep, empty org) ────────────────────────────────────
 * The Device filings header read "510(k) device assembly readiness: nothing
 * assemblable yet · 2 blockers". The two "blockers" were two sentences from
 * POST /api/510k/estar/assemble: one listing the 11 required eSTAR sections
 * missing, one listing the 7 sections whose applicability is not established
 * (server/services/pathway-engines/device-assembly/assemble-device-submission.ts
 * writes each group as ONE entry). The caption printed `blockers.length`.
 *
 * EMPTY_ORG_VERDICT below is the response the dev server returned for a fresh
 * organization (trimmed to the fields this surface reads).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const MISSING = [
  'cover-letter', 'user-fee-cover-sheet', 'indications-for-use', 'truthful-accurate-statement',
  'device-description', 'proposed-labeling', 'risk-management', 'performance-testing',
  'biocompatibility', '510k-summary-or-statement', 'substantial-equivalence',
];
const UNDETERMINED = [
  'sterilization', 'software', 'cybersecurity', 'clinical-financial-disclosure',
  'combination-product', 'implant-labeling', 'clia-waiver',
];

const EMPTY_ORG_VERDICT = {
  pathway: '510k',
  variant: 'device',
  artifactKind: 'none',
  canProduceOfficialEstar: false,
  estar: { type: '510k', summary: { missingRequired: MISSING, undetermined: UNDETERMINED, checkApplicability: [], ready: false } },
  template: { available: true, cleared: true, blockers: [] },
  blockers: [
    `11 required eSTAR section(s) missing: ${MISSING.join(', ')}.`,
    `7 eSTAR section(s) whose applicability is not established: ${UNDETERMINED.join(', ')}. Answer the device questions (sterile, software, connected, implant, combination product) so the required set is known.`,
  ],
};

function serve(verdict: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === '/api/510k/estar/assemble') {
      return { ok: true, status: 200, json: async () => verdict } as Response;
    }
    if (method === 'GET' && url === '/api/510k/estar/submissions') {
      return { ok: true, status: 200, json: async () => ({ submissions: [] }) } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
}

const caption = () =>
  (document.body.textContent ?? '').match(/510\(k\) device assembly readiness[^)]*\)/)?.[0] ?? '';

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('SubmissionCenter — 510(k) device assembly caption', () => {
  it('reports the 11 missing and 7 undetermined sections, not "2 blockers"', async () => {
    serve(EMPTY_ORG_VERDICT);
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(caption()).toMatch(/nothing assemblable yet/));

    expect(caption(), 'the blocker list is two sentences, not two blockers').not.toMatch(/\b2 blockers\b/);
    expect(caption()).toContain('11 required sections missing');
    expect(caption()).toContain('applicability of 7 sections not established');
    expect(caption()).toContain('(other pathways not assessed here)');
  });

  it('counts a template blocker beside the section counts as one more blocker', async () => {
    serve({
      artifactKind: 'content-package-draft',
      estar: { summary: { missingRequired: ['cover-letter'], undetermined: [] } },
      blockers: [
        '1 required eSTAR section(s) missing: cover-letter.',
        'Official eSTAR template eSTAR-510k-non-ivd.pdf is not vendored.',
      ],
    });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(caption()).toMatch(/draft content package only/));
    expect(caption()).toContain('1 required section missing · 1 other blocker');
  });

  it('still reads "0 blockers" for a verdict with nothing blocking (over-correction guard)', async () => {
    serve({
      artifactKind: 'official-estar',
      estar: { summary: { missingRequired: [], undetermined: [] } },
      blockers: [],
    });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(caption()).toMatch(/official eSTAR producible/));
    expect(caption()).toContain('· 0 blockers');
  });
});
