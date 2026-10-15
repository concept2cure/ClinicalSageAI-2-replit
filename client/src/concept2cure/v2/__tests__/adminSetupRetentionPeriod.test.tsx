// @vitest-environment jsdom
/**
 * Admin → Setup → Records retention (P1-22 remainder, DP-20; ADR-0014 §6).
 *
 * The organisation's retention period is set by its owner or administrators
 * through GET|PUT /api/vault/legal-holds/retention
 * (server/routes/vault-retention-period.ts). Setup is the organisation's
 * existing governed settings surface, so the period is shown and set there —
 * no new surface (CLAUDE.md Rule 2).
 *
 * What is pinned, because each one looks right in a screenshot when wrong:
 *   - A failed read is an error, never the 25-year default presented as this
 *     organisation's period.
 *   - A member is told who sets the period, and is offered no control.
 *   - Shorter than the default sends the reason and the governing rule; a
 *     refusal leaves the period in force on screen unchanged and says why.
 *   - "Saved" is shown only from the server's answer, and the period in force
 *     is the one the server returned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { Setup } from '../surfaces/AdminSurfaces';

const Surface = Setup as unknown as React.ComponentType<Record<string, unknown>>;
const RETENTION = '/api/vault/legal-holds/retention';

interface Sent {
  url: string;
  method: string;
  body: any;
}
let sent: Sent[];
let retentionGet: { status: number; body: unknown };
let retentionPut: { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const period = (over: Record<string, unknown> = {}) => ({
  retention: {
    years: 25,
    defaultYears: 25,
    isDefault: true,
    reason: null,
    governingRule: null,
    setBy: null,
    setAt: null,
    ...over,
  },
});

function tokenFor(organizationId: number): string {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256' })}.${b64url({ organizationId })}.sig`;
}

beforeEach(() => {
  sent = [];
  retentionGet = { status: 200, body: period() };
  retentionPut = { status: 200, body: { ...period({ years: 30, isDefault: false, setBy: 5, setAt: '2026-10-01T08:00:00Z' }), audited: true } };
  sessionStorage.setItem('trialsage_access_token', tokenFor(7));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init: any = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET');
      sent.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
      if (url.includes(RETENTION)) {
        const r = method === 'PUT' ? retentionPut : retentionGet;
        return json(r.status, r.body);
      }
      if (url.includes('/api/mdx/industry-profile')) return json(200, { data: null });
      if (url.includes('/settings')) return json(200, { success: true, settings: {} });
      if (url.includes('/api/organizations/')) return json(200, { success: true, organization: { id: '7', name: 'Northwind Bio' } });
      return json(404, { success: false, error: 'unexpected ' + url });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

function renderSetup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
    </QueryClientProvider>,
  );
}

/** The card, once it has rendered. */
async function card() {
  const view = renderSetup();
  const el = await waitFor(() => {
    const found = view.container.querySelector('[data-testid="retention-period-card"]');
    expect(found, 'Setup renders no Records retention card').not.toBeNull();
    return found as HTMLElement;
  });
  return { view, el, q: within(el) };
}

const puts = () => sent.filter((r) => r.method === 'PUT' && r.url.includes(RETENTION));

describe('Setup → Records retention', () => {
  it('reads the period from the server and says when it is the 25-year default', async () => {
    const { el } = await card();
    await waitFor(() => expect(el.textContent).toContain('25 years'));
    expect(el.textContent).toMatch(/default/i);
    expect(sent.some((r) => r.method === 'GET' && r.url.includes(RETENTION))).toBe(true);
  });

  it('a failed read is an error, never the default presented as this organisation’s period', async () => {
    retentionGet = { status: 500, body: { error: 'Internal server error' } };
    const { el, q } = await card();
    await waitFor(() => expect(el.textContent).toContain("Couldn't load the retention period"));
    expect(el.textContent).not.toContain('25 years');
    expect(q.queryByRole('button', { name: /save retention period/i })).toBeNull();
  });

  it('a member is told who sets the period and is offered no control', async () => {
    retentionGet = { status: 403, body: { error: { code: 'AUTH_004', message: 'Insufficient permissions' } } };
    const { el, q } = await card();
    await waitFor(() => expect(el.textContent).toMatch(/owner or administrators/i));
    expect(el.textContent).toContain('Insufficient permissions');
    expect(q.queryByLabelText(/retention period in years/i)).toBeNull();
    expect(q.queryByRole('button', { name: /save retention period/i })).toBeNull();
  });

  it('a 403 that is not about role is shown in the server’s words, never as “your role cannot”', async () => {
    // The API gate's refusal of a path outside the release (moduleEntitlementGate.ts) is a 403
    // too. An administrator who gets it must not be told their role is the reason.
    retentionGet = { status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } } };
    const { el, q } = await card();
    await waitFor(() => expect(el.textContent).toContain('This part of the product is not in this release.'));
    expect(el.textContent).not.toMatch(/your role/i);
    expect(q.queryByRole('button', { name: /save retention period/i })).toBeNull();
  });

  it('shortening sends the reason and the governing rule; a refusal leaves the period in force and says why', async () => {
    retentionPut = {
      status: 400,
      body: { error: 'RETENTION_REASON_REQUIRED', message: 'A period shorter than the 25-year default is recorded only with a reason. Nothing was changed.' },
    };
    const { el, q } = await card();
    await waitFor(() => expect(el.textContent).toContain('25 years'));
    fireEvent.change(q.getByLabelText(/retention period in years/i), { target: { value: '10' } });
    fireEvent.change(q.getByLabelText(/governing rule/i), { target: { value: '21 CFR 312.62(c)' } });
    fireEvent.change(q.getByLabelText(/reason for the change/i), { target: { value: 'too short' } });
    fireEvent.click(q.getByRole('button', { name: /save retention period/i }));
    await waitFor(() => expect(el.textContent).toContain('Nothing was changed'));
    expect(puts()).toHaveLength(1);
    expect(puts()[0].body).toEqual({ years: 10, reason: 'too short', governingRule: '21 CFR 312.62(c)' });
    expect(within(q.getByTestId('retention-in-force')).getByText(/25 years/)).toBeTruthy();
    expect(el.textContent).not.toMatch(/saved/i);
  });

  it('a lengthened period is shown from the server’s answer, and only then reported as saved', async () => {
    const { el, q } = await card();
    await waitFor(() => expect(el.textContent).toContain('25 years'));
    expect(q.queryByLabelText(/governing rule/i), 'a longer period asks for no governing rule').toBeNull();
    fireEvent.change(q.getByLabelText(/retention period in years/i), { target: { value: '30' } });
    fireEvent.change(q.getByLabelText(/reason for the change/i), { target: { value: 'Sponsor SOP QA-014' } });
    fireEvent.click(q.getByRole('button', { name: /save retention period/i }));
    await waitFor(() => expect(el.textContent).toMatch(/saved/i));
    expect(puts()[0].body).toEqual({ years: 30, reason: 'Sponsor SOP QA-014' });
    expect(within(q.getByTestId('retention-in-force')).getByText(/30 years/)).toBeTruthy();
  });
});
