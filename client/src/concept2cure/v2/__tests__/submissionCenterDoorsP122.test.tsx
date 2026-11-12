// @vitest-environment jsdom
/**
 * Submission readiness and Gateway transmittals each have a door in Submission Center's header (P-122, 2026-11-10).
 *
 * Both are in the release and features of the Submission Center app (shared/constants/launch-scope.ts), and neither
 * had a button anywhere in the product: only ⌘K and AnA reached them (P-122 inventory,
 * vault-authoring-submission.md §2.3, §2.4 and §4 #1b). Per §2's work-area pattern they are quiet secondary actions
 * beside Forms and letters and Compile & export, and New submission stays the one primary action.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const SUBS = [{
  id: 41, title: 'ZX-9 first-in-human (IND)', productName: 'ZX-9', applicationType: 'ind',
  clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: null,
}];

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return { ok: true, status: 200, json: async () => SUBS } as Response;
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
});

describe('Submission Center: the doors to its own features', () => {
  it('Submission readiness opens each market\'s dispatch verdict', async () => {
    const onNav = vi.fn();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Submission readiness' }));
    expect(onNav).toHaveBeenCalledWith('dispatch-readiness');
  });

  it('Gateway transmittals opens the log of what was sent and acknowledged', async () => {
    const onNav = vi.fn();
    render(<SubmissionCenter onAsk={vi.fn()} onNav={onNav} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Gateway transmittals' }));
    expect(onNav).toHaveBeenCalledWith('gateway-transmittals');
  });

  it('they are quiet secondary actions in the header, and New submission stays the one primary', async () => {
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    const readiness = await screen.findByRole('button', { name: 'Submission readiness' });
    const acts = readiness.closest('.ph-acts') as HTMLElement;
    expect(acts).toBeTruthy();
    expect(acts.querySelectorAll('.btn.primary')).toHaveLength(1);
    expect(readiness.className).toContain('ghost');
    expect(screen.getByRole('button', { name: 'Gateway transmittals' }).className).toContain('ghost');
  });
});
