// @vitest-environment jsdom
/**
 * A review returned for changes is said where the document opens (J3 human test, R2:
 * docs/evidence/HUMAN-TEST/J3/README.md). After a reviewer chose "Request changes", opening the document
 * showed nothing about it; the reason was only under More › Review tasks.
 *
 * The workbench reads the document's review route (GET /api/authoring/documents/:id/review-route, RR5) and,
 * when its latest round was returned, states it under the bar in the route's own words ("Returned by …: …")
 * with the way to the Review tasks rail. An open or completed route, or none, adds nothing. A route that could
 * not be read says so, never that nothing was returned.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()), useAuth: () => ({ user: { displayName: 'Avery Author', email: 'author@test.co' } }) }));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const DOC = 'dddddddd-0000-4000-8000-000000000031';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000031';
const PID = 'bbbbbbbb-0000-4000-8000-000000000031';
const AT = '2026-11-09T10:00:00Z';
const ROUND_URL = `/api/authoring/documents/${DOC}/review-route`;
const REASON = 'Section 2.5.4 cites the interim analysis; cite the final one before approval.';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

function round(status: 'open' | 'returned' | 'complete') {
  return {
    route: { id: 'route-1', round: 1, senderId: 5, senderName: 'Avery Author', order: 'parallel', status,
      statusReason: status === 'returned' ? REASON : null, statusBy: status === 'returned' ? 7 : null,
      statusAt: status === 'returned' ? '2026-11-09T09:30:00.000Z' : null, reviewDueAt: '2026-11-20T04:59:59.999Z',
      approvalDueAt: null, createdAt: '2026-11-08T09:00:00.000Z' },
    members: [{ taskId: 'ROUTE-route-1-7', userId: 7, role: 'reviewer', step: 1, printedName: 'Dana Chen',
      outcome: status === 'returned' ? 'returned' : status === 'complete' ? 'signed' : 'pending', stepOpen: true,
      dueDate: '2026-11-20T04:59:59.999Z', signature: null, actId: status === 'returned' ? 'act-1' : null }],
    reviewComplete: status === 'complete', approvalComplete: false, history: [],
  };
}

let reviewRoute: unknown = null;
function serve() {
  const doc = { id: DOC, title: 'Clinical overview', module: 'M2', status: 'draft', updated_at: AT, section_count: 1, client_program_id: PID };
  const section = { id: SEC, doc_id: DOC, code: '2.5.4', title: 'Overview of efficacy', content: '<p>Efficacy text.</p>', order_index: 0, updated_at: AT };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === ROUND_URL) return reviewRoute === 'fail' ? ok({ success: false }, 503) : ok({ success: true, round: reviewRoute });
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ ...doc, program_id: PID }] });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
    if (url.startsWith('/api/c2c/documents?')) return ok({ documents: [] });
    if (method === 'GET' && url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', registry_id: 'US_IND' });
    return ok({ success: true });
  });
}

async function open() {
  render(<DocumentAuthoring onNav={vi.fn()} segment="biotech" surface={{ id: 'document-authoring', label: 'Authoring' } as never} />);
  await screen.findAllByText('Overview of efficacy');
}

beforeEach(() => {
  localStorage.clear();
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
  reviewRoute = null;
});
afterEach(() => { cleanup(); localStorage.clear(); delete window.C2C_PROJECT; });

describe('a returned review, where the document opens (J3 R2)', () => {
  it('says who returned it and why, in the route\'s words, with the way to Review tasks', async () => {
    reviewRoute = round('returned');
    serve();
    await open();
    const note = await screen.findByTestId('ed-review-returned');
    expect(note.textContent).toContain(`Returned by Dana Chen: ${REASON}`);
    fireEvent.click(screen.getByRole('button', { name: 'Review tasks' }));
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Review tasks' })).toBeTruthy());
  });

  it.each(['open', 'complete'] as const)('adds nothing for a route that is %s', async (status) => {
    reviewRoute = round(status);
    serve();
    await open();
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === ROUND_URL)).toBe(true));
    expect(screen.queryByTestId('ed-review-returned')).toBeNull();
    expect(screen.queryByTestId('ed-review-unread')).toBeNull();
  });

  it('adds nothing for a document never sent for review', async () => {
    serve();
    await open();
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === ROUND_URL)).toBe(true));
    expect(screen.queryByTestId('ed-review-returned')).toBeNull();
  });

  it('a route that could not be read says so, never that nothing was returned', async () => {
    reviewRoute = 'fail';
    serve();
    await open();
    const note = await screen.findByTestId('ed-review-unread');
    expect(note.textContent).toMatch(/review could not be read/i);
    expect(screen.queryByTestId('ed-review-returned')).toBeNull();
  });
});
