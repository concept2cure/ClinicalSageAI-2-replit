// @vitest-environment jsdom
/**
 * The compile screen names the type a sequence is recorded as, and offers no
 * choice it does not have.
 *
 * WO-9 Click 6 (W5/D7): opened on amendment 0001, the "Submission" selector
 * read "initial", and the compile sent that word, which the server recorded as
 * the compilation's type (tests/routes/ectd-compile-recorded-type.test.ts). As
 * with the region, a sequence that records its type is shown with it, and the
 * screen sends no type for it. A sequence that records none keeps the selector.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { stashNavParamsForTarget } from '../navParams';
import { ok, props, SPINE_STATUS, SPINE_COMPILE } from './ectdCompile.fixtures';

function serve(sequence: Record<string, unknown>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/ectd-compile/42/status')) return ok({ ...SPINE_STATUS, sequence });
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(SPINE_COMPILE);
    return ok({});
  });
}
const compileBody = () => apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/ectd-compile/42/compile')?.[2];

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; delete (window as any).C2C_NAV_PARAMS; });
beforeEach(() => {
  apiRequest.mockReset();
  (window as any).C2C_PROJECT = { id: 42, title: 'BX-512' };
});

describe('the compile screen and a sequence’s recorded type', () => {
  it('opened on amendment 0001, it shows the recorded type and sends none', async () => {
    serve({ id: 30, sequenceNumber: '0001', region: 'fda', leafCount: 1, type: 'amendment' });
    stashNavParamsForTarget('ectd-compile', { sequenceId: '30' });
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText('amendment')).toBeTruthy();
    expect(screen.queryByLabelText('Submission')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
    await waitFor(() => expect(compileBody()).toBeDefined());
    expect(compileBody()).not.toHaveProperty('submissionType');
  });

  it('a sequence that records no type keeps the selector, and its choice is sent', async () => {
    serve({ id: 31, sequenceNumber: '0000', region: 'fda', leafCount: 1, type: null });
    render(<EctdCompile {...props()} />);
    expect(await screen.findByLabelText('Submission')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
    await waitFor(() => expect(compileBody()).toBeDefined());
    expect(compileBody()).toMatchObject({ submissionType: 'initial' });
  });
});
