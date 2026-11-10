// @vitest-environment jsdom
/**
 * Projects shows each project's last activity, in both views (D2, fold F6,
 * 2026-10-30; decision P-61 item 5; .design/client-journey/FUNCTION_PARITY.md,
 * "From `device-workstream`": "Owners, description and last activity ... Goes
 * to: render p.activity on Projects").
 *
 * The kit portfolio (mdx/surfaces/Overview.tsx) showed when each device project
 * last moved. Projects is where the device workstream folded, and the server
 * already sends the figure on every card: `activity`, read from the project's
 * own record (`'Updated ' || to_char(p.updated_at, 'Mon DD')`,
 * server/services/c2c/project-portfolio.ts). It was never drawn. It is now, on
 * the card and on the list row; a card the server sent none for shows none.
 *
 * Only the transport (`apiRequest`) and the signed-in user are replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { Projects } from '../surfaces/Projects';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' });
const row = (id: string, activity: string | null) => ({
  id, title: `Program ${id}`, ws: 'MDX', code: id.toUpperCase(), stage: 'Planning', readiness: null,
  status: 'active', lead: 'Rae Okafor', blocker: null, due: '—', due_date: null, activity,
});
const card = (title: string) =>
  Array.from(document.querySelectorAll('.pj-card')).find((c) => c.textContent?.includes(title)) as HTMLElement;
const listRow = (title: string) =>
  Array.from(document.querySelectorAll('.ct-row')).find((c) => c.textContent?.includes(title)) as HTMLElement;

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/c2c/projects'
      ? ok({ data: [row('k510', 'Updated Oct 29'), row('pma', null)] })
      : ok({ data: [] }),
  );
});

describe('Projects shows the last activity its record holds', () => {
  it('on the card, and on the list row', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program k510')).toBeTruthy());
    expect(card('Program k510').textContent).toContain('Updated Oct 29');
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(listRow('Program k510')).toBeTruthy());
    expect(listRow('Program k510').textContent).toContain('Updated Oct 29');
  });

  it('shows none where the record holds none, in either view', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program pma')).toBeTruthy());
    expect(card('Program pma').textContent).not.toMatch(/Updated/);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(listRow('Program pma')).toBeTruthy());
    expect(listRow('Program pma').textContent).not.toMatch(/Updated/);
  });
});
