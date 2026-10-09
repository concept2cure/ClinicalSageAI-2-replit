// @vitest-environment jsdom
/**
 * Admin → Setup: the client type is a governed change like every other field
 * on the page — pending until "Save to organization", saved under the page's
 * reason for change, and named in words (launch sweep findings 122 and 123).
 *
 * One click on a chip used to PATCH /api/mdx/industry-profile immediately,
 * with no reason and no confirmation, on a page whose header says changes are
 * "saved to the organization record and written to the audit trail" and
 * which asks for a "Reason for change (audited)". The chips read "medtech",
 * "cro", "health".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Setup } from '../surfaces/AdminSurfaces';

const Surface = Setup as unknown as React.ComponentType<Record<string, unknown>>;
const TOKEN_ORG = 7;
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const tokenFor = (orgId: number) => `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', organizationId: orgId })}.sig`;
const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) }) as Response;

let sent: Array<{ url: string; method: string; body: any }>;

beforeEach(() => {
  sent = [];
  sessionStorage.setItem('trialsage_access_token', tokenFor(TOKEN_ORG));
  vi.stubGlobal('fetch', vi.fn(async (input: any, init: any = {}) => {
    const url = String(input);
    const method = String(init.method || 'GET');
    const body = init.body ? JSON.parse(init.body) : null;
    sent.push({ url, method, body });
    if (url.includes('/api/mdx/industry-profile')) {
      return method === 'PATCH'
        ? json(200, { data: { organizationId: TOKEN_ORG, primaryIndustry: body.primaryIndustry } })
        : json(200, { data: { organizationId: TOKEN_ORG, primaryIndustry: 'biotech_pharma', mdxSpecialization: null } });
    }
    if (url.includes('/settings')) return json(200, { success: true, settings: {} });
    if (url.includes('/api/organizations/')) return json(200, { success: true, organization: { id: '7', name: 'Northwind Bio' } });
    return json(404, { error: 'unexpected ' + url });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
  </QueryClientProvider>,
);
const chip = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll('button.txw-pchip')).find((b) => (b.textContent || '').trim() === text) as HTMLButtonElement | undefined;
const saveButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find((b) => /Save to organization|No unsaved changes|Saving/.test(b.textContent || '')) as HTMLButtonElement;
const reasonInput = (c: HTMLElement) => c.querySelector('input[aria-label="Reason for change"]') as HTMLInputElement;
const profilePatches = () => sent.filter((r) => r.method === 'PATCH' && r.url.includes('/api/mdx/industry-profile'));

describe('the client type chips', () => {
  it('are named in words, not keys', async () => {
    const { container } = mount();
    await waitFor(() => expect(chip(container, 'Medical device')).toBeTruthy());
    expect(chip(container, 'Regulatory consulting')).toBeTruthy();
    expect(chip(container, 'medtech')).toBeUndefined();
    expect(chip(container, 'health')).toBeUndefined();
  });

  it('write nothing on click — the choice is pending until saved', async () => {
    const { container } = mount();
    await waitFor(() => expect(chip(container, 'CRO')).toBeTruthy());
    await waitFor(() => expect(chip(container, 'CRO')!.disabled).toBe(false));
    fireEvent.click(chip(container, 'CRO')!);
    await new Promise((r) => setTimeout(r, 30));
    expect(profilePatches()).toHaveLength(0);
    expect(saveButton(container).textContent).toMatch(/Save to organization/);
  });

  it('are saved by "Save to organization" with the page’s reason for change', async () => {
    const { container } = mount();
    await waitFor(() => expect(chip(container, 'CRO')!.disabled).toBe(false));
    fireEvent.click(chip(container, 'CRO')!);
    fireEvent.change(reasonInput(container), { target: { value: 'We are a CRO' } });
    fireEvent.click(saveButton(container));
    await waitFor(() => expect(profilePatches()).toHaveLength(1));
    expect(profilePatches()[0].body).toMatchObject({ primaryIndustry: 'cro', reason: 'We are a CRO' });
  });

  it('are not saved without a reason', async () => {
    const { container } = mount();
    await waitFor(() => expect(chip(container, 'CRO')!.disabled).toBe(false));
    fireEvent.click(chip(container, 'CRO')!);
    fireEvent.click(saveButton(container));
    await new Promise((r) => setTimeout(r, 30));
    expect(profilePatches()).toHaveLength(0);
  });
});
