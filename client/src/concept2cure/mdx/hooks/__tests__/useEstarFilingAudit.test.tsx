// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEstarRegistration, useEstarSubmissions } from '../useEstarFiling';
import { GlobalMutationErrors } from '../../../v2/GlobalMutationErrors';

const lost = { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'The audit entry could not be written.' };
const submission = { id: 'filing-1', status: 'draft' };
const registration = { registered: true, registration: { id: 'registration-1' }, clientRegistration: null };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stub(status: number, outcome: unknown = lost) {
  const mutations: RequestInit[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const writing = init?.method && init.method !== 'GET';
    if (writing) mutations.push(init);
    const body = writing
      ? { ...(String(input).includes('/registration') ? registration : submission), meta: { auditTrail: outcome } }
      : String(input).includes('/registration') ? registration : { submissions: [submission] };
    return new Response(JSON.stringify(body), { status: writing ? status : 200,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'estar-audit-request' } });
  }));
  return mutations;
}

describe('actual eSTAR mutation hooks carry the audit outcome into the shared notice', () => {
  it.each(['registration', 'tracking', 'advance'] as const)('%s succeeds with its real result while a lost audit is visible', async kind => {
    const mutations = stub(200);
    render(<GlobalMutationErrors />);
    const hook = renderHook(() => ({ registration: useEstarRegistration(), filings: useEstarSubmissions() }));
    await act(async () => {
      const result = kind === 'registration'
        ? await hook.result.current.registration.save({ fdaEsgAccount: true })
        : kind === 'tracking'
          ? await hook.result.current.filings.startTracking({ catalogKey: '510k' })
          : await hook.result.current.filings.advance('filing-1', 'withdrawn');
      expect(result).toMatchObject(kind === 'registration' ? registration : submission);
    });
    await waitFor(() => expect(screen.getByTestId('global-audit-row-notice').textContent).toContain('estar-audit-request'));
    expect(screen.getByTestId('global-audit-row-notice').textContent).toContain('completed');
    expect(mutations).toHaveLength(1);
    expect(screen.queryByTestId('global-mutation-error')).toBeNull();
  });

  it.each([403, 503])('a %s business refusal remains a failed save and does not announce a completed mutation', async status => {
    stub(status);
    render(<GlobalMutationErrors />);
    const hook = renderHook(useEstarRegistration);
    await act(async () => expect(await hook.result.current.save({ fdaEsgAccount: true })).toBeNull());
    expect(hook.result.current.saveFailure).toBe(status === 403 ? 'forbidden' : 'unavailable');
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
  });

  it('a persisted chained audit does not create a warning or consume the response', async () => {
    stub(201, { persisted: true, chained: true });
    render(<GlobalMutationErrors />);
    const hook = renderHook(() => useEstarSubmissions());
    await act(async () => expect(await hook.result.current.startTracking({ catalogKey: '510k' })).toMatchObject(submission));
    expect(screen.queryByTestId('global-audit-row-notice')).toBeNull();
  });
});
