// @vitest-environment jsdom
/**
 * ReportGovernance — proves the sealed-report lifecycle is wired to the real
 * /api/intelligent-reports endpoints: lists governed reports, runs the
 * cryptographic verify (server verdict rendered verbatim), and seals with a
 * justification. C2CForm is stubbed to drive the wiring.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ justification: 'Final QA complete; sealing for release.' })}>{config.submitLabel}</button>
  ),
}));

import { ReportGovernance } from '../surfaces/ReportGovernance';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}
const props = () => ({ surface: { id: 'report-governance', label: 'Reports' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'admin' });

const REPORTS = [
  { id: 11, reportCode: 'RPT-011', title: 'CMC readiness report', domain: 'cmc', sealStatus: 'draft', complianceScore: 88 },
  { id: 12, reportCode: 'RPT-012', title: 'Safety summary', domain: 'pv', sealStatus: 'sealed', complianceScore: 95 },
];

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/intelligent-reports/list/0') return ok(REPORTS);
    if (method === 'GET' && url === '/api/intelligent-reports/12/verify') return ok({ integrityValid: true, contentHashMatch: true, merkleRootMatch: true, verificationCode: 'VC-99' });
    if (method === 'POST' && url === '/api/intelligent-reports/11/seal') return ok({ sealed: true });
    return ok(null);
  });
});

describe('ReportGovernance — real sealed-report lifecycle', () => {
  it('lists governed reports with their seal status', async () => {
    render(<ReportGovernance {...props()} />);
    expect(await screen.findByText('RPT-011')).toBeTruthy();
    expect(screen.getByText('sealed')).toBeTruthy();
    expect(screen.getByText('draft')).toBeTruthy();
  });

  it('runs the cryptographic verify and renders the server verdict verbatim', async () => {
    render(<ReportGovernance {...props()} />);
    await screen.findByText('RPT-012');
    fireEvent.click(screen.getAllByRole('button', { name: /Verify/ })[1]); // the sealed report
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/intelligent-reports/12/verify')).toBe(true));
    expect(await screen.findByText('integrityValid')).toBeTruthy();
    expect(screen.getByText('VC-99')).toBeTruthy();
  });

  it('seals a draft report with a justification via the real endpoint', async () => {
    render(<ReportGovernance {...props()} />);
    await screen.findByText('RPT-011');
    fireEvent.click(screen.getByRole('button', { name: /Seal/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/intelligent-reports/11/seal');
      expect(call).toBeTruthy();
      expect((call![2] as any).justification).toMatch(/Final QA complete/);
    });
    expect(await screen.findByText(/Report sealed/)).toBeTruthy();
  });
});
