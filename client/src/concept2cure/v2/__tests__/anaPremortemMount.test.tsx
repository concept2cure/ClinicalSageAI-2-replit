// @vitest-environment jsdom
/**
 * The pre-mortem artifact reaches a screen.
 *
 * WHAT WENT WRONG
 * `CrlPremortemPanel` — the board-ready CRL/RTF decision artifact: an
 * approval-probability ESTIMATE with its denominator and confidence, the ranked
 * risks each bound to the precedent that grounds it, and a prioritised fix list
 * — was built for E14, given its own test suite, and mounted NOWHERE. Zero call
 * sites outside itself. `useAnaChat` has assembled `crlPremortem` onto the
 * message the whole time.
 *
 * A committee-grade artifact the product could not show anyone is the same
 * defect as the tool calls, the reasoning, the caveats, the steers and the
 * grounding verdict: built at both ends, connected at neither.
 *
 * THE HONESTY HALF
 * The panel's export button keyed its disabled state off `artifact.exportable`
 * alone. Mounted by a host with no export handler — this rail, which has no
 * DOCX route for the artifact — it rendered ENABLED and its click ran
 * `onExport?.(…)` on undefined. A control that looks available and silently
 * does nothing is exactly what this codebase keeps being bitten by, so the
 * panel now disables it and says where export actually lives.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../dataConnect', () => ({
  connected: () => false,
}));
vi.mock('../../../utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));

import { AnaRail, type AnaMessage } from '../Shell';

afterEach(cleanup);

const artifact = () => ({
  title: 'CRL/RTF pre-mortem — BX-204 NDA',
  status: 'estimated' as const,
  approvalProbability: {
    value: 0.62, class: 'moderate' as const, denominator: 34, approved: 21, denied: 13,
    unknown: 0, confidence: 'medium' as const,
    framing: 'An estimate grounded in 34 cited precedents, not a guarantee.',
  },
  topRisks: [{
    rank: 1, title: 'Single pivotal trial without confirmatory evidence',
    severity: 'critical' as const, category: 'Clinical',
    reviewerQuestion: 'Does one trial support substantial evidence of effectiveness?',
    regulatoryBasis: '21 CFR 314.126',
    grounding: { citationId: 'c-1', citationLabel: 'CRL 2019-0442', fromCorpus: true },
  }],
  fixList: [{ order: 1, priority: 'critical' as const, action: 'Add the confirmatory analysis', addressesRisk: 'Single pivotal trial', citationId: 'c-1' }],
  /* riskLevel is required — the panel renders it with .toUpperCase(), so a
     fixture missing it throws rather than rendering. */
  riskLevel: 'high' as const,
  honestyNote: 'Estimated from cited precedent.',
  exportable: true,
  sealable: false,
  sealStatus: 'unsealed' as const,
  generatedAt: '2026-08-21T00:00:00Z',
});

function renderRail(messages: AnaMessage[]) {
  return render(
    <AnaRail
      open setOpen={() => {}} surface={{ id: 'cmc', label: 'CMC' }} segment="biotech"
      mode="standard" setMode={() => {}} messages={messages}
      onSend={vi.fn()} onAct={vi.fn()} projectId={42}
    />,
  );
}

describe('the pre-mortem artifact is mounted', () => {
  it('renders the panel when the turn produced one', () => {
    renderRail([{ role: 'ana', body: 'Here is the pre-mortem.', crlPremortem: artifact() } as AnaMessage]);
    expect(screen.getByRole('region', { name: 'CRL/RTF pre-mortem decision artifact' })).toBeTruthy();
  });

  it('shows the ranked risk bound to the precedent that grounds it', () => {
    renderRail([{ role: 'ana', body: 'x', crlPremortem: artifact() } as AnaMessage]);
    expect(screen.getByText(/Single pivotal trial without confirmatory evidence/)).toBeTruthy();
    expect(screen.getByText(/CRL 2019-0442/)).toBeTruthy();
  });

  it('offers no export the rail cannot perform', () => {
    // The rail has no DOCX route. An enabled button here would be a control
    // that looks available and does nothing.
    renderRail([{ role: 'ana', body: 'x', crlPremortem: artifact() } as AnaMessage]);
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Export is not available from here/)).toBeTruthy();
  });

  it('adds no pre-mortem furniture to a turn that produced none', () => {
    const { container } = renderRail([{ role: 'ana', body: 'A plain answer.' } as AnaMessage]);
    expect(container.querySelector('.ana-premortem')).toBeNull();
  });
});
