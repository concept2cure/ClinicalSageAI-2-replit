// @vitest-environment jsdom
/**
 * The change-control register's "Raise change request" offers the open project
 * (founder decision P-60, D2 / D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-per-product/).
 *
 * A product's design changes are per product (21 CFR 820.30(j), ISO 13485
 * §7.3.10), and that product's Engineering screen reads them by the project key
 * the change carries (20261029l). The form offers the project the person has
 * open, beside an organisation-wide change, and starts on organisation-wide, as
 * every change was raised before. The server admits the project before it
 * writes (POST /api/mdx/qms/changes, admitProject).
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const PROGRAM = '40000000-0000-4000-8000-000000000001';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  shell: null as null | { id: string; title?: string; code?: string },
}));

vi.mock('../hooks', () => ({
  useSopTemplates: () => ({ templates: [], loading: false, error: null }),
}));
vi.mock('../changeHooks', async () => {
  const { CHANGE_SUMMARY } = await import('./changeRows');
  return { useChangeSummary: () => ({ summary: CHANGE_SUMMARY, loading: false, error: null }) };
});
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ id: 9, organizationId: 3, name: 'Q. Author', role: 'editor' }),
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
}));
vi.mock('../../v2/shellProject', () => ({
  useShellProject: () => H.shell,
  shellProgramId: (p: { id: string } | null) => (p && /^[0-9a-f-]{36}$/.test(p.id) ? p.id : null),
}));
vi.mock('../ControlledDocumentWorkbench', () => ({ ControlledDocumentWorkbench: () => null }));

import { ChangeControl } from '../ChangeControl';
import { CHANGE_ROWS } from './changeRows';

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  H.shell = { id: PROGRAM, title: 'Sensor patch', code: 'SP-1' };
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body: Record<string, unknown>) =>
    method === 'POST' && url === '/api/mdx/qms/changes'
      ? json(201, { data: { id: 40, change_number: body.changeNumber } })
      : json(200, { data: {} }));
});
afterEach(cleanup);

function openRaise() {
  render(
    <ChangeControl onAsk={() => {}} stage="all" onStageChange={() => {}} openId={null} onOpenIdChange={() => {}}
      changes={CHANGE_ROWS} loading={false} onRetry={() => {}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Raise change request/ }));
  const d = screen.getByRole('dialog', { name: /Raise change request/ });
  const fill = (label: RegExp, value: string) => fireEvent.change(within(d).getByLabelText(label), { target: { value } });
  fill(/Change number/, 'CC-2026-033');
  fill(/^Title/, 'Change the sensor adhesive');
  fill(/Reason for the change/, 'The current adhesive fails peel testing at 7 days.');
  return d;
}
const posted = () => H.apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/mdx/qms/changes')?.[2] as Record<string, unknown> | undefined;

describe('Raise change request — the project a change belongs to', () => {
  it('offers the open project beside an organisation-wide change, and starts on organisation-wide', () => {
    const d = openRaise();
    const group = within(d).getByRole('radiogroup', { name: /Project/ });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['Organisation-wide', 'SP-1 · Sensor patch']);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
  });

  it('sends the open project when the person files the change under it', async () => {
    const d = openRaise();
    fireEvent.click(within(d).getByRole('radio', { name: 'SP-1 · Sensor patch' }));
    fireEvent.click(within(d).getByRole('button', { name: /Raise change/ }));
    await waitFor(() => expect(posted()).toEqual(expect.objectContaining({ changeNumber: 'CC-2026-033', programId: PROGRAM })));
  });

  it('sends no project for an organisation-wide change', async () => {
    const d = openRaise();
    fireEvent.click(within(d).getByRole('button', { name: /Raise change/ }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()).not.toHaveProperty('programId');
  });

  it('offers no project when none is open, and sends none', async () => {
    H.shell = null;
    const d = openRaise();
    expect(within(d).queryByRole('radiogroup', { name: /Project/ })).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: /Raise change/ }));
    await waitFor(() => expect(posted()).toBeDefined());
    expect(posted()).not.toHaveProperty('programId');
  });
});
