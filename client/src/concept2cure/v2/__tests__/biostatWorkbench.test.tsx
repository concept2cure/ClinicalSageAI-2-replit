// @vitest-environment jsdom
/**
 * BiostatWorkbench — proves the surface drives the REAL statistical engine:
 * a reviewer-risk defensibility assessment via /api/statistical-defensibility
 * and an assurance calculation via /api/biostat/assurance, rendering only the
 * server's response (not the in-browser normal approximation).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}
const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string, body?: any) => {
    if (url === '/api/statistical-defensibility/assess') return ok({ overallScore: 78, overallRating: 'Moderate', reviewerRiskLevel: 'Medium', criticalIssues: ['No multiplicity adjustment for the key secondary'], majorIssues: [], recommendations: ['Pre-specify the estimand per ICH E9(R1)'] });
    if (url === '/api/biostat/assurance') return ok({ assurance: 0.72, conditionalPower: 0.9, nPerArm: body.nPerArm });
    return ok({});
  });
});

describe('BiostatWorkbench — real statistical engine', () => {
  it('runs a reviewer-risk defensibility assessment and renders the server result', async () => {
    render(<BiostatWorkbench {...props()} />);
    const tb = screen.getAllByRole('textbox'); // indication, studyDesign, primaryEndpoint, sampleSize, + assurance inputs
    fireEvent.change(tb[0], { target: { value: 'NSCLC' } });
    fireEvent.change(tb[1], { target: { value: 'randomized double-blind' } });
    fireEvent.change(tb[2], { target: { value: 'PFS' } });
    fireEvent.click(screen.getByRole('button', { name: /Assess defensibility/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/statistical-defensibility/assess');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ indication: 'NSCLC', studyDesign: 'randomized double-blind', primaryEndpoint: 'PFS' });
    });
    expect(await screen.findByText('78')).toBeTruthy();
    expect(screen.getByText(/No multiplicity adjustment/)).toBeTruthy();
    expect(screen.getByText(/Pre-specify the estimand/)).toBeTruthy();
  });

  it('computes assurance from the real design-stats endpoint', async () => {
    render(<BiostatWorkbench {...props()} />);
    const tb = screen.getAllByRole('textbox');
    // Assurance inputs are the last three textboxes (priorMean, priorSd, nPerArm).
    fireEvent.change(tb[tb.length - 3], { target: { value: '0.4' } });
    fireEvent.change(tb[tb.length - 2], { target: { value: '0.15' } });
    fireEvent.change(tb[tb.length - 1], { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Compute assurance/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/biostat/assurance');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ priorMean: 0.4, priorSd: 0.15, nPerArm: 120 });
    });
    expect(await screen.findByText('0.72')).toBeTruthy(); // assurance value from the server
  });
});
