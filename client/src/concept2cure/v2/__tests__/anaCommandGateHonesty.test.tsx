// @vitest-environment jsdom
/**
 * The pre-submission gate panel paints nothing green that was not assessed.
 *
 * Each cell's tone defaulted to 'ok' (green): CRL and RTF risk the gate never
 * assessed showed a green "low · 0"; an ICH check that could not run, or was
 * never asked for, showed green; and the ICH report's own 'non_compliant' and
 * 'warnings' never matched the 'fail' / 'warning' the panel tested for, so a
 * failing ICH result was green too. Only apiRequest is replaced; the whole
 * surface mounts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { AnaCommand } from '../surfaces/AnaCommand';

const PID = 301;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const NOT_ASSESSED = (kind: string) => ({
  overallRisk: 'not_assessed', riskScore: null,
  reason: `${kind} risk is not assessed by this gate: the platform has no ${kind} risk model.`,
});

let gate: Record<string, unknown>;

function route(method: string, url: string) {
  if (url === '/api/report-os/portfolio/org') return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-1' }] });
  if (method === 'POST' && url === '/api/orchestration/recommendations') return ok({ recommendations: [] });
  if (method === 'POST' && url === '/api/orchestration/continuity') {
    return ok({ trajectory: 'stable', metrics: { readinessScore: 70, documentCount: 1, validatedCount: 0, blockerCount: 0, taskCompletionPercent: 50 },
      changes: [], newlyReady: [], needsAttention: [] });
  }
  if (method === 'POST' && url === '/api/orchestration/pre-submission-gate') return ok(gate);
  if (url === '/api/orchestration/templates') return ok({ templates: [] });
  return { ok: false, status: 404, json: async () => ({ error: 'not routed: ' + url }), text: async () => '' };
}

async function openGate() {
  render(<AnaCommand surface={'ana-command' as never} onAsk={() => {}} onNav={() => {}} segment="" />);
  fireEvent.click(await screen.findByText(/Run pre-submission gate/));
}

/** The value element under a gate cell's label. */
async function cell(label: string) {
  const k = await screen.findByText(label);
  return k.parentElement!.querySelector('.ac-gate-cv') as HTMLElement;
}

describe('AnaCommand — pre-submission gate panel', () => {
  beforeEach(() => {
    gate = {
      submissionType: null, verdict: 'ready',
      verdictRationale: ['Readiness on track, no critical blockers; not assessed: CRL/RTF risk, ICH compliance (no CMC project linked)'],
      readiness: { overallScore: 82, status: 'on_track', scores: {} },
      cmc: { contradictionCounts: { critical: 0, open: 0 } },
      crl: NOT_ASSESSED('CRL'), rtf: NOT_ASSESSED('RTF'), ich: null,
    };
    apiRequest.mockImplementation(async (method: string, url: string) => route(method, url));
  });
  afterEach(() => {
    cleanup();
    apiRequest.mockReset();
  });

  it('shows CRL and RTF risk the gate did not assess as not assessed, neutral, with the reason', async () => {
    await openGate();
    for (const label of ['CRL risk', 'RTF risk']) {
      const v = await cell(label);
      expect(v.textContent).toBe('not assessed');
      expect(v.className).not.toMatch(/\bok\b/);
      expect(v.getAttribute('title')).toMatch(/no (CRL|RTF) risk model/);
    }
  });

  it('does not paint an ICH check that never ran green', async () => {
    await openGate();
    const v = await cell('ICH compliance');
    expect(v.textContent).toContain('not evaluated');
    expect(v.className).not.toMatch(/\bok\b/);
  });

  it('paints a non-compliant ICH result as a failure, and a check that could not run as such', async () => {
    gate = { ...gate, ich: { overallStatus: 'non_compliant', counts: { fail: 2 } } };
    await openGate();
    expect((await cell('ICH compliance')).className).toMatch(/\berr\b/);
    cleanup();
    gate = { ...gate, ich: { overallStatus: 'incomplete', counts: null, reason: 'The ICH compliance check could not run.' } };
    await openGate();
    const v = await cell('ICH compliance');
    expect(v.textContent).toBe('could not run');
    expect(v.className).not.toMatch(/\bok\b/);
  });
});
