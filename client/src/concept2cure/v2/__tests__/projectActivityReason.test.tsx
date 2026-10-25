/** @vitest-environment jsdom */
/**
 * The Project home feed names a governed act and shows its reason
 * (2026-10-21; 21 CFR 11.10(e), "available for review").
 *
 * Adding a market records the person's reason. The feed read the row as
 * "c2c.work.transition · project" and showed no reason. A governed event it
 * knows is now named in words, with the market's agency, and a recorded reason
 * is shown. A row with no event reads as it did.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
import { ProjectHome, activityLabel } from '../surfaces/ProjectHome';

const PID = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const ACTIVITY = [
  { id: 'a2', action: 'c2c.work.transition', resource_type: 'project', actor_id: 11, actor_name: 'Robin RA', occurred_at: '2026-10-20T10:00:00Z',
    reason: 'The EU filing starts this quarter', event: 'market_added', event_agency: 'ema' },
  { id: 'a1', action: 'c2c.project.evidence.unpin', resource_type: 'regulatory_program', actor_id: 11, actor_name: 'Robin RA', occurred_at: '2026-10-19T10:00:00Z',
    reason: null, event: null, event_agency: null },
];

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'Vorelinib NDA', program_type: 'NDA', status: 'active', primary_agency: 'FDA', product_name: 'Vorelinib' });
    if (url.startsWith(`/api/c2c/projects/${PID}/activity`)) return ok({ activity: ACTIVITY });
    return ok({});
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('the Project home feed names a governed act and its reason', () => {
  it('a market added reads as that, with its agency and the reason recorded', async () => {
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    const reason = await screen.findByTestId('pj-act-reason');
    expect(reason.textContent).toBe('. Reason: The EU filing starts this quarter');
    expect(reason.closest('.pj-act')?.textContent).toContain('Market added · EMA');
    expect(screen.getAllByTestId('pj-act-reason')).toHaveLength(1);
  });

  it('a row with no governed event reads as recorded', () => {
    expect(activityLabel(ACTIVITY[1])).toBe('c2c.project.evidence.unpin · regulatory_program');
    expect(activityLabel({ ...ACTIVITY[0], event_agency: null })).toBe('Market added');
    // A market's own application number recorded (P-44) is named in words.
    expect(activityLabel({ action: 'SUBMISSION_APPLICATION_NUMBER_RECORDED', resource_type: 'submission', event: null, event_agency: null }))
      .toBe('Market application number recorded');
  });
});
