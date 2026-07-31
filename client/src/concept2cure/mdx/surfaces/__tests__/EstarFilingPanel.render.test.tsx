// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EstarFilingPanel } from '../EstarFilingPanel';

/**
 * Mount tests for the eSTAR filing panel.
 *
 * Type-checking proves the component compiles; it does not prove the component
 * SURVIVES FIRST PAINT. This panel renders before any of its three fetches
 * resolve, and in a real session those fetches can 401 (not signed in), fail
 * outright, or return an empty org. Each of those paths must render something
 * rather than throw, because a crash here takes the whole PMA surface with it.
 *
 * These pin exactly that: mount under each degraded condition and assert the
 * panel is still on screen.
 */

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

function mockFetch(handler: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => handler(String(input))));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('EstarFilingPanel — survives first paint', () => {
  it('renders while every request is still pending (no data at all)', () => {
    mockFetch(() => new Promise<Response>(() => {})); // never resolves
    render(<EstarFilingPanel />);
    expect(screen.getByText('eSTAR filing readiness')).toBeTruthy();
  });

  it('renders when the user is NOT signed in (401 on every endpoint)', async () => {
    mockFetch(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) } as Response),
    );
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText('eSTAR filing readiness')).toBeTruthy());
    // The four FDA prerequisites still render, all unheld — never a crash.
    expect(screen.getAllByText('Mark held').length).toBe(4);
  });

  it('renders when the network throws outright', async () => {
    mockFetch(() => Promise.reject(new Error('network down')));
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText('eSTAR filing readiness')).toBeTruthy());
  });

  it('renders an unregistered org with an empty catalog and no filings', async () => {
    mockFetch((url) => {
      if (url.includes('/registration')) {
        return okJson({ registered: false, registration: null, clientRegistration: { clientId: 'o1', satisfied: [] } });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      if (url.includes('/submissions')) return okJson({ submissions: [] });
      return okJson({});
    });
    render(<EstarFilingPanel />);
    await waitFor(() =>
      expect(screen.getByText(/Not yet registered/i)).toBeTruthy(),
    );
  });

  it('renders a registered org with a catalog and a tracked filing', async () => {
    mockFetch((url) => {
      if (url.includes('/registration')) {
        return okJson({
          registered: true,
          registration: {},
          clientRegistration: {
            clientId: 'o1',
            satisfied: ['fda_esg_account', 'cdrh_portal_account', 'organization_identity', 'mdufa_fee_account'],
          },
        });
      }
      if (url.includes('/catalog')) {
        return okJson({ catalog: [{ key: '510k', label: '510(k)', programType: '510k', center: 'CDRH', regulatoryRef: '21 CFR 807' }] });
      }
      if (url.includes('/submissions')) {
        return okJson({
          submissions: [
            {
              id: 'sub-1', catalogKey: 'pma_original', programType: 'pma', variant: 'device',
              title: 'CV-330 PMA', status: 'under_review', decision: null,
              fdaTrackingNumber: 'P260001', filedAt: '2026-02-01T00:00:00.000Z',
              reviewGoalDays: 180, decisionDueAt: '2026-08-01T00:00:00.000Z',
            },
          ],
        });
      }
      return okJson({});
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText(/4\/4 FDA prerequisites held/)).toBeTruthy());
    expect(screen.getByText('CV-330 PMA')).toBeTruthy();
    // The review clock is shown, not silently dropped.
    expect(screen.getByText(/Decision due/)).toBeTruthy();
  });

  it('renders a filing with NO review clock without printing a bogus date', async () => {
    mockFetch((url) => {
      if (url.includes('/submissions')) {
        return okJson({
          submissions: [
            {
              id: 's2', catalogKey: 'qsub_pre_submission', programType: 'q_sub', variant: 'device',
              title: 'Pre-Sub', status: 'draft', decision: null, fdaTrackingNumber: null,
              filedAt: null, reviewGoalDays: null, decisionDueAt: null,
            },
          ],
        });
      }
      if (url.includes('/catalog')) return okJson({ catalog: [] });
      return okJson({ registered: false, registration: null, clientRegistration: { clientId: 'o', satisfied: [] } });
    });
    render(<EstarFilingPanel />);
    await waitFor(() => expect(screen.getByText('No review clock')).toBeTruthy());
  });
});
