// @vitest-environment jsdom
/**
 * SubmissionTwin — proves the surface is wired to the real /api/submission-twin
 * engine: loads readiness/challenges/drift/impacts for a package, runs a real
 * assessment, resolves a drift alert against the real endpoint, and shows an
 * honest empty state with no package selected (never a fixture).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { SubmissionTwin } from '../surfaces/SubmissionTwin';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}
const props = () => ({ surface: { id: 'submission-twin', label: 'Twin' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const READINESS = { readinessScore: 72.5, fragilityScore: 40, weakZones: [{ section: '3.2.P.8', score: 12 }] };
const CHALLENGES = [{ id: 5, reviewerLens: 'Clinical', challengeText: 'Justify the primary endpoint', targetSection: '2.5', severity: 'high', deficiencyLikelihood: 'likely', suggestedResponse: 'Add sensitivity analysis', suggestedArtifact: null }];
const DRIFT = [{ id: 9, driftType: 'dose_mismatch', severity: 'critical', description: 'Dose differs between 2.5 and 3.2.P', suggestedFix: 'Reconcile the dose', resolved: false }];

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === '/api/submission-twin/readiness/1024') return ok(READINESS);
    if (url === '/api/submission-twin/challenges/1024') return ok(CHALLENGES);
    if (url === '/api/submission-twin/drift/1024') return ok(DRIFT);
    if (url === '/api/submission-twin/change-impacts/1024') return ok([]);
    if (url === '/api/submission-twin/next-artifact/1024') return ok({ artifactType: 'Support Gap Memo', rationale: 'Unsupported claims detected', priority: 'high' });
    if (method === 'POST' && url === '/api/submission-twin/assess/1024') return ok({ assessmentId: 77 });
    if (method === 'POST' && url === '/api/submission-twin/drift/9/resolve') return ok({ id: 9, resolved: true });
    return ok({});
  });
});

describe('SubmissionTwin — real twin engine', () => {
  it('loads readiness, challenges and drift for the open package', async () => {
    (window as any).C2C_PROJECT = { id: 1024 };
    render(<SubmissionTwin {...props()} />);
    expect(await screen.findByText('72.5')).toBeTruthy();           // readiness score
    expect(screen.getByText(/Justify the primary endpoint/)).toBeTruthy(); // real challenge
    expect(screen.getByText(/Dose differs between/)).toBeTruthy();   // real drift alert
  });

  it('runs a real assessment via POST /assess', async () => {
    (window as any).C2C_PROJECT = { id: 1024 };
    render(<SubmissionTwin {...props()} />);
    await screen.findByText('72.5');
    fireEvent.click(screen.getByRole('button', { name: /Run assessment/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/submission-twin/assess/1024')).toBe(true));
    expect(await screen.findByText(/assessment complete/i)).toBeTruthy();
  });

  it('resolves a drift alert against the real endpoint', async () => {
    (window as any).C2C_PROJECT = { id: 1024 };
    render(<SubmissionTwin {...props()} />);
    await screen.findByText(/Dose differs between/);
    fireEvent.click(screen.getAllByRole('button', { name: /Resolve/ })[0]);
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/submission-twin/drift/9/resolve')).toBe(true));
  });

  it('shows an honest empty state with no package (no fixture, no calls)', () => {
    render(<SubmissionTwin {...props()} />);
    expect(screen.getByText(/Enter a submission package to assess/)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
