// @vitest-environment jsdom
/**
 * Reporting & analytics speaks about the OPEN program, or says why it cannot.
 *
 * QA 2026-10-08 (j1, "Project screens show other programs' documents and
 * records"): with HLV-333 open, the canvas said "C2C-001's submission
 * readiness is not yet computed" — the organisation's flagship, under the
 * program the person had open. The canvas now names the open program to the
 * overview (?programId=<regulatory_programs UUID>); the server leads with that
 * program's anchored project, and when it cannot, the canvas says so for that
 * program instead of showing another one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const lead = (code: string, projectId: number) => ({
  projectId, code, label: code, filing: null, indication: null, readiness: null,
  scope: 'project', scopeId: String(projectId), agency: null, pdufa: null,
  confidence: 0, status: 'missing', riskLevel: 'low', criticalBlockerCount: 0,
});
const overview = (leadProgram: unknown, openProgram: unknown) => ({
  data: {
    organizationId: 1, tier: 'standard', segments: ['pharma'], reportTypes: [],
    leadProgram, openProgram,
    portfolio: { entitled: false, requiredTier: 'enterprise', summary: null, programs: null },
  },
});

let answer: unknown;
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => (url.startsWith('/api/insights-canvas/overview') ? ok(answer) : ok({})));
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const renderCanvas = () =>
  render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="pharma" onNav={() => {}} />);
const overviewUrls = () => apiRequest.mock.calls.map((c) => String(c[1])).filter((u) => u.startsWith('/api/insights-canvas/overview'));

describe('Insights — the open program', () => {
  it('names the open program to the overview and leads with it', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'HLV-333', code: 'HLV-333' };
    answer = overview(lead('HLV-333', 11), { programId: PROGRAM, state: 'lead' });
    renderCanvas();
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    expect(overviewUrls()).toEqual([`/api/insights-canvas/overview?programId=${PROGRAM}`]);
    expect(document.body.textContent).toMatch(/HLV-333/);
    expect(document.body.textContent).not.toMatch(/C2C-001/);
  });

  it('a program with no project record is stated for that program, not replaced by another', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'BX-256 · lupus (IND)', code: 'BX-256' };
    answer = overview(null, { programId: PROGRAM, state: 'unanchored' });
    renderCanvas();
    expect(await screen.findByText(/BX-256 has no readiness or reports here yet/)).toBeTruthy();
    expect(screen.queryByText('No program readiness yet')).toBeNull();
  });

  it('with no program open, the organisation view is read as before', async () => {
    answer = overview(lead('C2C-001', 1), null);
    renderCanvas();
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    expect(overviewUrls()).toEqual(['/api/insights-canvas/overview']);
  });
});
