// @vitest-environment jsdom
/**
 * Audit & compliance reports and the audit trail say what is true about the
 * state a reader is in (QA 2026-10-08, journey j8, four minor findings):
 *
 *   - an inverted period is refused and the previous run's result leaves the
 *     screen, so the refusal never sits beside a result for another period;
 *   - a member who may read the catalog but not run it is told so in the
 *     selected report's own pane, not only in the banner above the cards;
 *   - a seal made under the development fallback key says so, instead of
 *     calling it "a platform-held key";
 *   - a member refused the audit trail (403) is told who reads it, never that
 *     the ledger "didn't respond".
 *
 * Only the transports are replaced (`apiCall` for the reports surface,
 * `apiRequest` for the audit trail's live read).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiCall = vi.hoisted(() => vi.fn());
vi.mock('../apiCall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apiCall')>()),
  apiCall,
}));

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { AuditTrail } from '../surfaces/AdminSurfaces';
import { JWT_SECRET_FALLBACK_KEY_ID } from '@shared/constants/audit-export-key';
import {
  CATALOG, MANIFEST, READERS, SECTIONED, exportBody, mount, ok, runSelected, selectReport,
} from './_compliance-reports-fixtures';

let route: (url: string) => ReturnType<typeof ok>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : ok(exportBody(SECTIONED)));
  apiCall.mockReset();
  apiCall.mockImplementation(async (_method: string, url: string) => route(url));
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('an inverted period', () => {
  it('clears the previous result when the refusal is shown', async () => {
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    expect(await screen.findByRole('table', { name: 'Events' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
    await runSelected();

    expect((await screen.findByRole('alert')).textContent).toMatch(/start date is after the end date/i);
    // The earlier run is for another period; it is not left beside the refusal.
    expect(screen.queryByRole('table', { name: 'Events' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });
});

describe('a member who may read the catalog but not run it', () => {
  it('is told in the selected report pane who runs it', async () => {
    route = (url) => (url === '/api/audit/reports' ? ok({ ...CATALOG, canRun: false }) : ok(exportBody(SECTIONED)));
    mount();
    await selectReport(/Sign-in and session events/);
    const pane = await screen.findByTestId('cr-detail-readers');
    expect(pane.textContent).toBe(`Available to ${READERS}.`);
    expect(screen.queryByRole('button', { name: 'Run report' })).toBeNull();
  });

  it('shows no such note to someone who can run the report', async () => {
    mount();
    await selectReport(/Sign-in and session events/);
    expect(screen.queryByTestId('cr-detail-readers')).toBeNull();
  });
});

describe('the seal statement', () => {
  it('names a dedicated key as the platform-held key it is', async () => {
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    const seal = await screen.findByText(/^Sealed by the platform/);
    expect(seal.textContent).toMatch(/under a platform-held key \(k1\)/);
  });

  it('says a development-fallback seal is one, never "a platform-held key"', async () => {
    const fallback = { ...MANIFEST, signingKeyId: JWT_SECRET_FALLBACK_KEY_ID };
    route = (url) => (url === '/api/audit/reports' ? ok(CATALOG) : ok(exportBody(SECTIONED, fallback)));
    mount();
    await selectReport(/Sign-in and session events/);
    await runSelected();
    const seal = await screen.findByText(/^Sealed by the platform/);
    expect(seal.textContent).not.toMatch(/platform-held key/);
    expect(seal.textContent).toMatch(/development fallback key/);
    expect(seal.textContent).toMatch(/no dedicated audit export key is configured/);
    expect(screen.getByTestId('cr-signing-key').textContent).toMatch(/development fallback/);
  });
});

describe('the audit trail refused to a member', () => {
  const noop = () => {};
  const mountTrail = () =>
    render(
      <AuditTrail
        {...({ surface: { id: 'audit-trail' }, onAsk: noop, onNav: noop, segment: 'biotech' } as unknown as React.ComponentProps<typeof AuditTrail>)}
      />,
    );

  it('says who reads the trail, not that the ledger did not respond', async () => {
    const message = 'The audit trail is read by organisation administrators and managers.';
    apiRequest.mockImplementation(async () => {
      throw new ApiRequestError(message, 403, { error: 'AUDIT_READ_RESTRICTED', message }, 'AUDIT_READ_RESTRICTED');
    });
    mountTrail();
    expect(await screen.findByText('The audit trail is not available to your role')).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(/didn.t respond/)).toBeNull();
    expect(screen.queryByText(/Couldn.t load the audit trail/)).toBeNull();
  });

  it('keeps the outage copy for a read that failed', async () => {
    apiRequest.mockImplementation(async () => {
      throw new ApiRequestError('The server could not complete this request. Try again.', 500, null);
    });
    mountTrail();
    expect(await screen.findByText("Couldn't load the audit trail")).toBeTruthy();
  });
});
