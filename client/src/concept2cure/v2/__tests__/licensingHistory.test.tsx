// @vitest-environment jsdom
/**
 * Licensing decisions panel — the read side of licensing governance.
 *
 * This surface answers compliance questions, so the failure modes that matter
 * are not crashes; they are CONFIDENT WRONG ANSWERS. Three of them are pinned
 * here, each by asserting the opposite behaviour cannot be reached:
 *
 *   1. A failed read must never render as an empty history. "This platform has
 *      never made a licensing decision" is a claim about a Part 11 record; it
 *      may only be made when the service actually said so.
 *   2. A truncated page must say it is truncated. A page presented as the whole
 *      record is how somebody concludes a decision was never made.
 *   3. No green tick may be invented. A row is shown as verified only when the
 *      service reported a verification that happened; where verification did
 *      not run, the row says so in those words.
 *
 * `apiRequest` THROWS for every non-OK status except 401, so the failure paths
 * are exercised by throwing, exactly as the transport does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import LicensingHistoryPanel from '../surfaces/licensing/LicensingHistoryPanel';

const MATRIX = {
  tiers: ['free', 'standard', 'professional', 'enterprise'],
  modules: [{ moduleId: 'cmc', name: 'CMC and quality' }],
  organizations: [{ id: 7, name: 'Bright Biosciences' }],
};

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'aud-1',
    occurredAt: '2026-08-20T10:00:00.000Z',
    action: 'module.repackage',
    readable: true,
    actorId: 3,
    actorEmail: 'owner@platform.io',
    organizationId: 7,
    organizationName: 'Bright Biosciences',
    moduleId: 'cmc',
    moduleName: 'CMC and quality',
    reason: 'moved with the Q3 packaging review',
    changed: { previousTier: 'standard', minTier: 'professional' },
    integrity: { chain: 'verified', seal: 'verified' },
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  return {
    entries: [entry()],
    page: { limit: 25, offset: 0, returned: 1, total: 1, hasMore: false },
    filters: { organizationId: null, moduleId: null },
    unreadable: 0,
    integrity: {
      status: 'verified',
      reason: 'chain-and-seals-verified',
      rowsChecked: 12,
      checkedAt: '2026-08-24T09:00:00.000Z',
    },
    ...over,
  };
}

/** Serve the matrix, and whatever the test wants for the history read. */
function serve(history: () => Promise<unknown> | unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/admin/master/licensing/history')) {
      const body = await history();
      return { ok: true, status: 200, json: async () => body } as Response;
    }
    if (url === '/api/admin/master/licensing') {
      return { ok: true, status: 200, json: async () => MATRIX } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

/** The transport's real behaviour for a failing status. */
function apiError(status: number, message: string) {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

const historyCalls = () =>
  apiRequest.mock.calls.filter((c) => String(c[1]).startsWith('/api/admin/master/licensing/history'));

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
});

describe('the decisions themselves', () => {
  it('shows what changed, on which workspace and module, by whom, when, and why', async () => {
    serve(() => payload());
    render(<LicensingHistoryPanel />);

    expect(await screen.findByText('Module tier changed')).toBeTruthy();
    expect(screen.getByText('moved with the Q3 packaging review')).toBeTruthy();
    expect(screen.getByText('owner@platform.io')).toBeTruthy();
    // Also the label of a filter option, hence "all": the row is one of them.
    expect(screen.getAllByText('Bright Biosciences').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CMC and quality').length).toBeGreaterThan(0);
    // The recorded fields are readable, not a token dump.
    expect(document.body.textContent).toContain('Previous tier');
    expect(document.body.textContent).toContain('Lowest tier that includes it');
    // Absolute time, never "3 days ago".
    expect(document.body.textContent).not.toMatch(/\bago\b/);
    // The internal action token is never what the operator reads.
    expect(document.body.textContent).not.toContain('module.repackage');
    expect(document.body.textContent).not.toContain('masterAdminAction');
  });

  it('names an action it has never heard of, instead of dropping or dumping it', async () => {
    serve(() =>
      payload({
        entries: [
          entry({
            id: 'aud-new',
            action: 'access_request.approve',
            moduleId: null,
            moduleName: null,
            changed: { requestId: 99, grantedModules: ['ectd'] },
            reason: 'approved after the security review',
          }),
        ],
      }),
    );
    render(<LicensingHistoryPanel />);

    expect(await screen.findByText('Access request · approve')).toBeTruthy();
    expect(screen.getByText('approved after the security review')).toBeTruthy();
    expect(document.body.textContent).toContain('Granted modules');
    expect(document.body.textContent).not.toContain('access_request.approve');
  });

  it('filters to one workspace and one module', async () => {
    serve(() => payload());
    render(<LicensingHistoryPanel />);
    await screen.findByText('Module tier changed');

    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: '7' } });
    await waitFor(() => {
      expect(historyCalls().some((c) => String(c[1]).includes('organizationId=7'))).toBe(true);
    });

    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'cmc' } });
    await waitFor(() => {
      expect(historyCalls().some((c) => String(c[1]).includes('moduleId=cmc'))).toBe(true);
    });
  });
});

describe('honest about completeness', () => {
  it('says how much of the record this page is NOT showing', async () => {
    // THE MUTATION THIS CATCHES: presenting a page as the whole record. 25 rows
    // of 240 is 10% of the answer to a compliance question.
    serve(() =>
      payload({
        entries: [entry(), entry({ id: 'aud-2' })],
        page: { limit: 25, offset: 0, returned: 2, total: 240, hasMore: true },
      }),
    );
    render(<LicensingHistoryPanel />);

    const note = await screen.findByTestId('lh-page-note');
    expect(note.textContent).toContain('240');
    expect(note.textContent).toContain('238 older decisions are recorded and not shown on this page');
    expect(note.textContent).not.toContain('This is the end of the record');
    expect((screen.getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says a complete page is complete', async () => {
    serve(() => payload());
    render(<LicensingHistoryPanel />);

    const note = await screen.findByTestId('lh-page-note');
    expect(note.textContent).toContain('This is the end of the record');
    expect((screen.getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('flags entries it could not fully read, and still lists them', async () => {
    serve(() =>
      payload({
        entries: [entry({ id: 'bad', action: null, readable: false, reason: null, changed: {} })],
        unreadable: 1,
      }),
    );
    render(<LicensingHistoryPanel />);

    expect(await screen.findByTestId('lh-unreadable')).toBeTruthy();
    expect(screen.getByTestId('lh-unreadable').textContent).toContain('could not be fully read');
    // The row is still on screen with what survived — dropping it would
    // understate the record with nothing to say so.
    expect(screen.getByText('Decision could not be read')).toBeTruthy();
    expect(screen.getByText('No reason was recorded with this entry.')).toBeTruthy();
  });

  it('a failed read renders an error, never an empty history', async () => {
    // THE MUTATION THIS CATCHES: routing a failed read into the empty state.
    // "No licensing decisions are recorded yet" is a false statement about a
    // Part 11 record when the truth is that the read failed.
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith('/api/admin/master/licensing/history')) {
        throw apiError(500, 'Failed to load the licensing decision history.');
      }
      return { ok: true, status: 200, json: async () => MATRIX } as Response;
    });

    render(<LicensingHistoryPanel />);

    expect(await screen.findByTestId('lh-error')).toBeTruthy();
    expect(screen.queryByTestId('lh-empty')).toBeNull();
    expect(document.body.textContent).not.toContain('No licensing decisions are recorded yet');
    expect(document.body.textContent).not.toContain('This is the end of the record');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('shows the honest empty state only when the service reports nothing', async () => {
    serve(() =>
      payload({
        entries: [],
        page: { limit: 25, offset: 0, returned: 0, total: 0, hasMore: false },
      }),
    );
    render(<LicensingHistoryPanel />);

    expect(await screen.findByTestId('lh-empty')).toBeTruthy();
    expect(screen.getByText('No licensing decisions are recorded yet')).toBeTruthy();
    expect(screen.queryByTestId('lh-error')).toBeNull();
  });
});

describe('honest about integrity', () => {
  it('shows a verified row as verified when the chain AND the seal were checked', async () => {
    serve(() => payload());
    render(<LicensingHistoryPanel />);

    await screen.findByText('Module tier changed');
    expect(screen.getByTestId('lh-integrity').textContent).toContain('Record chain and seals verified');
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('does not imply a seal check that could not happen', async () => {
    serve(() =>
      payload({
        entries: [entry({ integrity: { chain: 'verified', seal: 'unverified' } })],
        integrity: {
          status: 'verified',
          reason: 'chain-verified-seals-not-configured',
          rowsChecked: 12,
          checkedAt: '2026-08-24T09:00:00.000Z',
        },
      }),
    );
    render(<LicensingHistoryPanel />);

    await screen.findByText('Module tier changed');
    // The chain WAS verified and says so; the seal was not and says that too.
    expect(screen.getByText('Chain verified')).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
    expect(document.body.textContent).toContain('record sealing is not configured on this deployment');
    // A configuration key never reaches the screen.
    expect(document.body.textContent).not.toContain('AUDIT_HMAC_KEY');
  });

  it('claims no verification at all when none was performed', async () => {
    // THE MUTATION THIS CATCHES: a green tick on rows nobody verified.
    serve(() =>
      payload({
        entries: [entry({ integrity: { chain: 'not-checked', seal: 'unverified' } })],
        integrity: {
          status: 'unavailable',
          reason: 'check-failed',
          rowsChecked: 0,
          checkedAt: '2026-08-24T09:00:00.000Z',
        },
      }),
    );
    render(<LicensingHistoryPanel />);

    await screen.findByText('Module tier changed');
    expect(screen.getByTestId('lh-integrity').textContent).toContain(
      'Record integrity was not verified for this view',
    );
    expect(screen.getByText('Not checked')).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
    expect(screen.queryByText('Chain verified')).toBeNull();
  });

  it('reports a broken chain, and does not vouch for what follows the break', async () => {
    serve(() =>
      payload({
        entries: [
          entry({ id: 'late', integrity: { chain: 'after-break', seal: 'verified' } }),
          entry({ id: 'mid', integrity: { chain: 'broken', seal: 'verified' } }),
          entry({ id: 'early', integrity: { chain: 'verified', seal: 'verified' } }),
        ],
        page: { limit: 25, offset: 0, returned: 3, total: 3, hasMore: false },
        integrity: {
          status: 'broken',
          reason: 'chain-broken',
          rowsChecked: 5,
          checkedAt: '2026-08-24T09:00:00.000Z',
        },
      }),
    );
    render(<LicensingHistoryPanel />);

    expect(await screen.findByText('Does not match')).toBeTruthy();
    expect(screen.getByText('Cannot be proven')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByTestId('lh-integrity').textContent).toContain(
      'A break was found in the record chain',
    );
  });

  it('says when an entry was never committed to the chain', async () => {
    serve(() =>
      payload({ entries: [entry({ integrity: { chain: 'not-recorded', seal: 'not-sealed' } })] }),
    );
    render(<LicensingHistoryPanel />);

    expect(await screen.findByText('Not in the chain')).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
  });
});
