// @vitest-environment jsdom
/**
 * Compile carries the sequence (docs/design/FILING_SPINE.md F14).
 *
 * eCTD compile read the project's submission by its application type, so an
 * NDA project's MAA sequence, opened in the Submission Center (F10), had no way
 * onto the compile screen: the screen compiled the NDA. The Dispatch tab now
 * opens compile on its own sequence, and every read and write the screen makes
 * names that sequence (the server compiles it only when the project owns it,
 * tests/routes/ectd-compile-sequence.test.ts). Opened with no sequence, the
 * screen asks as it did.
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
import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';
import { stashNavParamsForTarget, consumeNavParams } from '../navParams';
import { ok, props, SPINE_STATUS, SPINE_COMPILE } from './ectdCompile.fixtures';

const MAA_STATUS = { ...SPINE_STATUS, sequence: { id: 21, sequenceNumber: '0000', region: 'eu', leafCount: 2 } };

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; delete (window as any).C2C_NAV_PARAMS; });
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/ectd-compile/42/status')) return ok(url.includes('sequenceId=21') ? MAA_STATUS : SPINE_STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(SPINE_COMPILE);
    if (method === 'POST' && url === '/api/ectd-compile/42/validate') return ok({ valid: true, results: [], summary: { pass: 0, warnings: 0, errors: 0 } });
    return ok({});
  });
  (window as any).C2C_PROJECT = { id: 42, title: 'ONC-221' };
});

const calls = (method: string, path: string) => apiRequest.mock.calls.filter((c) => c[0] === method && String(c[1]).startsWith(path));

describe('compile opened on a sequence (F14)', () => {
  it('reads, validates and compiles the sequence it was opened on, at its recorded region', async () => {
    stashNavParamsForTarget('ectd-compile', { sequenceId: '21' });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(calls('GET', '/api/ectd-compile/42/status')[0]?.[1]).toBe('/api/ectd-compile/42/status?sequenceId=21'));
    expect(await screen.findByText(/recorded on sequence 0000/)).toBeTruthy();
    expect(screen.getByText('EU')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
    await waitFor(() => expect(calls('POST', '/api/ectd-compile/42/compile')).toHaveLength(1));
    expect(calls('POST', '/api/ectd-compile/42/compile')[0][2]).toMatchObject({ sequenceId: 21 });
    expect(calls('POST', '/api/ectd-compile/42/compile')[0][2]).not.toHaveProperty('region');

    fireEvent.click(screen.getByRole('button', { name: /^Validate/ }));
    await waitFor(() => expect(calls('POST', '/api/ectd-compile/42/validate')).toHaveLength(1));
    expect(calls('POST', '/api/ectd-compile/42/validate')[0][2]).toMatchObject({ sequenceId: 21 });
  });

  it('opened with no sequence, it asks as it did: no sequenceId anywhere', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(calls('GET', '/api/ectd-compile/42/status')[0]?.[1]).toBe('/api/ectd-compile/42/status'));
    fireEvent.click(await screen.findByRole('button', { name: /Compile eCTD/ }));
    await waitFor(() => expect(calls('POST', '/api/ectd-compile/42/compile')).toHaveLength(1));
    expect(calls('POST', '/api/ectd-compile/42/compile')[0][2]).not.toHaveProperty('sequenceId');
  });
});

describe("the Dispatch tab opens compile on its own sequence (F14)", () => {
  it('"Validate and compile this sequence" carries the sequence to the compile screen', async () => {
    const onNav = vi.fn();
    const CLEAR = { cleared: true, blockers: [] };
    const READINESS = {
      sequenceId: 21, region: 'eu', sequenceStatus: 'draft', validationErrors: 0, unacknowledgedShadowCriticals: 0,
      shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
      externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
      readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 2, signer: { state: 'independent', sources: [] },
      validatedStage: { holds: true, verdictRecorded: true },
    };
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      ok(String(url).endsWith('/dispatch-readiness') ? READINESS : {}));
    render(
      <DispatchWorkspace
        sub={{ id: 56, title: 'ONC-221 MAA', applicationType: 'maa', primaryRegion: 'eu' } as never}
        seq={{ id: 21, sequenceNumber: '0000', region: 'eu', status: 'draft', type: 'original' } as never}
        onGoverned={vi.fn()}
        onNav={onNav}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Validate and compile this sequence/ }));
    expect(onNav).toHaveBeenCalledWith('ectd-compile');
    expect(consumeNavParams('ectd-compile')).toEqual({ sequenceId: '21' });
  });
});
