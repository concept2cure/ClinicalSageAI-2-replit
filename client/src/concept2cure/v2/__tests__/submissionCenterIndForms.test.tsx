// @vitest-environment jsdom
/**
 * The IND forms screen is reached from the US IND it belongs to (decision
 * P-32: the IND lifecycle and forms tools are features of Submission Center).
 *
 * ── The finding (audit 2026-10-17) ──────────────────────────────────────────
 * Nothing called onNav('ind-checklist'): Form FDA 1571, the cover letter and
 * the Letter of Authorization had no door from the submission they are filed
 * in. The screen was reachable only by typing its route.
 *
 * ── What must be true now ───────────────────────────────────────────────────
 *   • a US (FDA) IND submission offers "Forms and letters (1571, cover letter,
 *     LOA)", which opens the IND screen scoped to THAT submission, through the
 *     nav-params hand-off (navParams.ts) the IND screen reads;
 *   • an NDA, or an IND outside the US, is not offered it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const sub = (over: Record<string, unknown>) => ({
  id: 5, title: 'ZX-9 first-in-human (IND)', productName: 'ZX-9', applicationType: 'ind',
  clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null, ...over,
});
let SUBS: unknown[] = [];

afterEach(cleanup);
beforeEach(() => {
  delete (window as any).C2C_NAV_PARAMS;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return { ok: true, status: 200, json: async () => SUBS } as Response;
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
});

const FORMS = /Forms and letters \(1571, cover letter, LOA\)/;

describe('Submission Center — the IND forms screen, from the US IND', () => {
  it('a US IND opens the IND forms screen scoped to that submission', async () => {
    SUBS = [sub({ id: 41 })];
    const onNav = vi.fn();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
    const open = await screen.findByRole('button', { name: FORMS });
    fireEvent.click(open);
    expect(onNav).toHaveBeenCalledWith('ind-checklist');
    expect((window as any).C2C_NAV_PARAMS?.surfaceId).toBe('ind-checklist');
    expect((window as any).C2C_NAV_PARAMS?.params).toEqual({ submissionId: '41' });
  });

  it('an NDA and a non-US IND are not offered it', async () => {
    for (const s of [sub({ id: 3, title: 'ZX-9 NDA', applicationType: 'nda' }), sub({ id: 4, title: 'ZX-9 CTA (EU)', primaryRegion: 'eu' })]) {
      SUBS = [s];
      render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
      await waitFor(() => expect(screen.getAllByText(new RegExp(String((s as any).title).replace(/[()]/g, '.'))).length).toBeGreaterThan(0));
      expect(screen.queryByRole('button', { name: FORMS }), String((s as any).title)).toBeNull();
      cleanup();
    }
  });
});
