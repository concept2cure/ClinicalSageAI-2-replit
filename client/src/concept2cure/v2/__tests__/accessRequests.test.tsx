// @vitest-environment jsdom
/**
 * The step after the lock: asking, and being answered.
 *
 * THREE FAILURES THESE TESTS EXIST TO CATCH, all of which are silent.
 *
 *   1. A SECOND ASK THAT LOOKS LIKE A FIRST. The de-duplication rule lives in
 *      the database, so the client cannot create a duplicate row — but it can
 *      still show a button whose press is absorbed into the request already on
 *      file and reported as success. That teaches somebody that pressing does
 *      nothing, which is precisely the dead end this whole feature exists to
 *      remove. The panel must SAY a request is open, name the date, and not
 *      offer the press.
 *   2. A FAILED READ RENDERED AS "NOTHING HERE". On the panel that means
 *      inviting a duplicate and denying a pending request; on the queue it
 *      means an administrator reading "nobody is waiting" and stopping
 *      checking. Both must render an error with a retry.
 *   3. AN UNGOVERNED ANSWER. Approve and decline must not reach the server
 *      without a reason.
 *
 * `apiRequest` THROWS for every non-OK status except 401, so the mock below
 * throws too. A mock that resolved `{ ok: false }` would leave every error path
 * in these components unreached while the tests still passed.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';

/* ── Transport ─────────────────────────────────────────────────────────────── */

const api = vi.hoisted(() => ({
  fn: vi.fn(async (_m: string, _u: string, _b?: unknown) => new Response('{}')),
}));

class FakeApiError extends Error {
  name = 'ApiRequestError';
  constructor(
    public status: number,
    public payload: unknown,
  ) {
    super('request failed');
  }
}

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: unknown) => api.fn(m, u, b),
  redactInternals: (s: string) => s,
  serverMessage: (body: any) => (typeof body?.error === 'string' ? body.error : null),
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'token' }));

import { NavUnlockPanel } from '../NavUnlockPanel';
import { AccessRequestQueue } from '../surfaces/AccessRequests';
import {
  currentRequestFor,
  lockNotice,
  requestNotice,
  type ModuleAccessRequestSummary,
} from '../navEntitlements';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const LOCKED = {
  id: 'pv-cockpit',
  label: 'PV cockpit',
  entitled: false,
  source: 'tier' as const,
  requiredTier: 'professional',
};

const OPEN_REQUEST: ModuleAccessRequestSummary = {
  id: 12,
  moduleId: 'pv-cockpit',
  status: 'open',
  note: 'Needed for the March filing.',
  createdAt: '2026-03-01T09:30:00.000Z',
  decidedAt: null,
  decisionReason: null,
};

beforeEach(() => {
  cleanup();
  api.fn.mockReset();
});

/* ── The pure copy rules ───────────────────────────────────────────────────── */

describe('lockNotice — who is offered the ask', () => {
  /* An administrator holds the control themselves. Offering them a request
     form would be offering them a way to ask themselves for permission. */
  it('offers the ask to a member and never to an org administrator', () => {
    for (const source of ['tier', 'disabled', 'industry'] as const) {
      const verdict = { ...LOCKED, source };
      expect(lockNotice(verdict, { isOrgAdmin: false }).requestable).toBe(true);
      expect(lockNotice(verdict, { isOrgAdmin: true }).requestable).toBe(false);
    }
  });

  /* The existing contract must survive: an admin-only remedy is still never
     offered to a non-admin as a button they cannot use. */
  it('leaves the admin-only call to action untouched for a member', () => {
    const notice = lockNotice({ ...LOCKED, source: 'disabled' }, { isOrgAdmin: false });
    expect(notice.ctaLabel).toBeNull();
    expect(notice.ctaTarget).toBeNull();
  });
});

describe('requestNotice — an absolute date, and the real state', () => {
  it('names the day the open request was made', () => {
    const text = requestNotice(OPEN_REQUEST) ?? '';
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/administrators/i);
    // Never relative: a page left open would make that wrong.
    expect(text).not.toMatch(/ago|yesterday|today/i);
  });

  it('reports a decline with the reason the administrator gave', () => {
    const text =
      requestNotice({
        ...OPEN_REQUEST,
        status: 'declined',
        decidedAt: '2026-03-04T10:00:00.000Z',
        decisionReason: 'Not in this budget period.',
      }) ?? '';
    expect(text).toMatch(/Declined/);
    expect(text).toMatch(/Not in this budget period\./);
  });

  it('says nothing when there is no request on file', () => {
    expect(requestNotice(null)).toBeNull();
    expect(currentRequestFor(null, 'pv-cockpit')).toBeNull();
    expect(currentRequestFor([OPEN_REQUEST], 'risk')).toBeNull();
    expect(currentRequestFor([OPEN_REQUEST], 'pv-cockpit')).toEqual(OPEN_REQUEST);
  });
});

/* ── The panel ─────────────────────────────────────────────────────────────── */

describe('NavUnlockPanel — the member who cannot buy', () => {
  function renderPanel(isOrgAdmin = false) {
    return render(
      <NavUnlockPanel
        verdict={LOCKED}
        isOrgAdmin={isOrgAdmin}
        onClose={() => {}}
        onNav={() => {}}
      />,
    );
  }

  it('offers a member a way to ask, and sends the note with the request', async () => {
    api.fn.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return json({ requests: [] });
      return json({ request: { ...OPEN_REQUEST, note: 'For the March filing.' } }, 201);
    });

    renderPanel();
    const button = await screen.findByRole('button', { name: /ask an administrator/i });

    fireEvent.change(screen.getByLabelText(/why you need it/i), {
      target: { value: 'For the March filing.' },
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(api.fn).toHaveBeenCalledWith('POST', '/api/module-access-requests', {
        moduleId: 'pv-cockpit',
        note: 'For the March filing.',
      }),
    );
    // The outcome is reported, not assumed: the form is replaced by the state.
    expect(await screen.findByText(/it is with your administrators/i)).toBeTruthy();
  });

  /* THE DUPLICATE. A request already on file must close the form and say when
     it was made, rather than offering a press that changes nothing. */
  it('says a request is already open, with its date, and offers no second press', async () => {
    api.fn.mockImplementation(async (_m: string, _u: string) => json({ requests: [OPEN_REQUEST] }));

    renderPanel();
    expect(await screen.findByText(/it is with your administrators/i)).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ask an administrator/i })).toBeNull();
    expect(screen.queryByLabelText(/why you need it/i)).toBeNull();
  });

  /* Fail closed. Rendering "no request on file" over a failed read invites a
     duplicate and denies a pending one. */
  it('reports a failed check as a failure, never as no request on file', async () => {
    api.fn.mockImplementation(async () => {
      throw new FakeApiError(503, { error: 'Could not load your requests.' });
    });

    renderPanel();
    expect(await screen.findByText(/could not check your earlier requests/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ask an administrator/i })).toBeNull();
  });

  it('shows a refused write as a refusal and keeps the form', async () => {
    api.fn.mockImplementation(async (method: string) => {
      if (method === 'GET') return json({ requests: [] });
      throw new FakeApiError(404, { error: 'Unknown app.' });
    });

    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /ask an administrator/i }));

    expect(await screen.findByText(/unknown app/i)).toBeTruthy();
    expect(screen.getByLabelText(/why you need it/i)).toBeTruthy();
  });

  it('never asks the server about requests for an administrator', async () => {
    api.fn.mockImplementation(async () => json({ requests: [] }));
    renderPanel(true);
    await screen.findByRole('button', { name: /view plans/i });
    expect(api.fn).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /ask an administrator/i })).toBeNull();
  });
});

/* ── The queue ─────────────────────────────────────────────────────────────── */

describe('AccessRequestQueue — the administrator answering', () => {
  const ROW = {
    id: 12,
    organizationId: 7,
    organizationName: 'Northwind Bio',
    moduleId: 'pv-cockpit',
    moduleName: 'PV cockpit',
    requestedBy: 43,
    requesterEmail: 'member@example.test',
    requesterName: 'A Member',
    note: 'Needed for the March filing.',
    status: 'open' as const,
    decidedByEmail: null,
    decidedAt: null,
    decisionReason: null,
    createdAt: '2026-03-01T09:30:00.000Z',
    updatedAt: '2026-03-01T09:30:00.000Z',
  };

  it('shows who asked, for what, and their own words', async () => {
    api.fn.mockImplementation(async () =>
      json({ scope: 'organization', requests: [ROW], openCount: 1, truncated: false }),
    );
    render(<AccessRequestQueue scope="organization" />);

    expect(await screen.findByText('A Member')).toBeTruthy();
    expect(screen.getByText('PV cockpit')).toBeTruthy();
    expect(screen.getByText('Needed for the March filing.')).toBeTruthy();
    // The state is in words on the row itself, not only in a colour. Scoped to
    // the table because the filter control legitimately uses the same word.
    expect(within(screen.getByRole('table')).getByText('Waiting')).toBeTruthy();
  });

  /* The reason gate. An approval must not reach the server without one. */
  it('will not approve until a reason has been given', async () => {
    api.fn.mockImplementation(async (method: string) => {
      if (method === 'GET') {
        return json({ scope: 'organization', requests: [ROW], openCount: 1, truncated: false });
      }
      return json({ request: { ...ROW, status: 'approved' }, granted: true });
    });
    render(<AccessRequestQueue scope="organization" />);

    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));

    // The dialog is open and the server has not been written to.
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toBeTruthy();
    expect(api.fn.mock.calls.filter((c) => c[0] === 'POST')).toHaveLength(0);
  });

  it('sends the decision and the reason once both are given', async () => {
    api.fn.mockImplementation(async (method: string) => {
      if (method === 'GET') {
        return json({ scope: 'organization', requests: [ROW], openCount: 1, truncated: false });
      }
      return json({ request: { ...ROW, status: 'approved' }, granted: true });
    });
    render(<AccessRequestQueue scope="organization" />);

    fireEvent.click(await screen.findByRole('button', { name: /^Approve/ }));
    const dialog = await screen.findByRole('dialog');
    const textarea = dialog.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Named on the filing plan.' } });
    const confirmInput = dialog.querySelector('input') as HTMLInputElement;
    fireEvent.change(confirmInput, { target: { value: 'yes' } });
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find((b) =>
        /confirm/i.test(b.textContent ?? ''),
      ) as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(api.fn).toHaveBeenCalledWith(
        'POST',
        '/api/module-access-requests/12/decision',
        { decision: 'approved', reason: 'Named on the filing plan.' },
      ),
    );
  });

  /* Fail closed. An administrator who reads a failed load as "nobody is
     waiting" stops checking the queue. */
  it('reports a failed load as a failure, never as an empty queue', async () => {
    api.fn.mockImplementation(async () => {
      throw new FakeApiError(500, { error: 'Could not load access requests.' });
    });
    render(<AccessRequestQueue scope="organization" />);

    expect(await screen.findByText(/could not load access requests/i)).toBeTruthy();
    expect(screen.queryByText(/no requests waiting/i)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders a genuine zero as an honest empty state', async () => {
    api.fn.mockImplementation(async () =>
      json({ scope: 'organization', requests: [], openCount: 0, truncated: false }),
    );
    render(<AccessRequestQueue scope="organization" />);

    expect(await screen.findByText(/no requests waiting/i)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reads every workspace only in the all scope, and shows the workspace column', async () => {
    api.fn.mockImplementation(async () =>
      json({ scope: 'all', requests: [ROW], openCount: 1, truncated: false }),
    );
    render(<AccessRequestQueue scope="all" />);

    expect(await screen.findByText('Northwind Bio')).toBeTruthy();
    expect(api.fn.mock.calls[0][1]).toContain('scope=all');
  });
});
