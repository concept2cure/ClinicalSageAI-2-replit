// @vitest-environment jsdom
/**
 * Enterprise onboarding requests panel — the platform owner's read of the
 * sales intake (GET /api/admin/master/enterprise-requests).
 *
 * The failure that matters is a confident wrong answer: "No pending requests"
 * shown when the list could not be read. A prospect who asked would then be
 * told, in effect, that nobody asked. Pinned here with the other two honest
 * states — a truncated list says it is truncated; an empty one says where
 * requests come from.
 *
 * `apiRequest` THROWS for every non-OK status except 401, so failure is
 * exercised by throwing, exactly as the transport does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import EnterpriseRequestsPanel from '../surfaces/licensing/EnterpriseRequestsPanel';

const PATH = '/api/admin/master/enterprise-requests';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    createdAt: '2026-09-24T09:30:00.000Z',
    name: 'Dana Prospect',
    email: 'dana@bright-bio.example',
    organization: 'Bright Biosciences',
    message: 'Enterprise onboarding request — 25 seats.',
    status: 'pending',
    reviewedAt: null,
    ...over,
  };
}

function serve(body: (url: string) => unknown) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const b = await body(url);
    return { ok: true, status: 200, json: async () => b } as Response;
  });
}

function apiError(status: number, message: string) {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

const calls = () => apiRequest.mock.calls.map((c) => String(c[1]));

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
});

describe('the requests themselves', () => {
  it('shows who asked, from which organisation, what they said, and when', async () => {
    serve(() => ({ status: 'pending', requests: [row()], count: 1, truncated: false, limit: 200 }));
    render(<EnterpriseRequestsPanel />);

    expect(await screen.findByText('Dana Prospect')).toBeTruthy();
    expect(screen.getByText('Bright Biosciences')).toBeTruthy();
    expect(screen.getByText('Enterprise onboarding request — 25 seats.')).toBeTruthy();
    const mail = screen.getByText('dana@bright-bio.example').closest('a');
    expect(mail?.getAttribute('href')).toBe('mailto:dana@bright-bio.example');
    expect(document.body.textContent).not.toMatch(/\bago\b/);
    expect(calls()).toContain(`${PATH}?status=pending`);
  });

  it('asks the server for every request when the filter is changed', async () => {
    serve(() => ({ status: 'pending', requests: [row()], count: 1, truncated: false, limit: 200 }));
    render(<EnterpriseRequestsPanel />);
    await screen.findByText('Dana Prospect');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'all' } });
    await waitFor(() => expect(calls()).toContain(`${PATH}?status=all`));
  });

  it('says a list is truncated rather than presenting it as all of them', async () => {
    serve(() => ({ status: 'pending', requests: [row()], count: 1, truncated: true, limit: 200 }));
    render(<EnterpriseRequestsPanel />);
    expect(await screen.findByTestId('ml-enterprise-truncated')).toBeTruthy();
  });
});

describe('honest empty and failed states', () => {
  it('an empty list says so, and where requests come from', async () => {
    serve(() => ({ status: 'pending', requests: [], count: 0, truncated: false, limit: 200 }));
    render(<EnterpriseRequestsPanel />);
    expect(await screen.findByTestId('ml-enterprise-empty')).toBeTruthy();
    expect(screen.getByText('No pending requests')).toBeTruthy();
  });

  it('a failed read is an error with a retry — never "No pending requests"', async () => {
    apiRequest.mockImplementation(async () => {
      throw apiError(500, 'Failed to read enterprise onboarding requests.');
    });
    render(<EnterpriseRequestsPanel />);
    expect(await screen.findByTestId('ml-enterprise-error')).toBeTruthy();
    expect(screen.queryByTestId('ml-enterprise-empty')).toBeNull();
    expect(screen.queryByText('No pending requests')).toBeNull();
  });

  it('a body without a requests list is treated as a failure, not as empty', async () => {
    serve(() => ({ error: 'unexpected' }));
    render(<EnterpriseRequestsPanel />);
    expect(await screen.findByTestId('ml-enterprise-error')).toBeTruthy();
    expect(screen.queryByTestId('ml-enterprise-empty')).toBeNull();
  });
});
