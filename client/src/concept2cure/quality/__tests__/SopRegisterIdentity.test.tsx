// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const H = vi.hoisted(() => ({ user: { id: '7', organizationId: '12', permissions: [] as string[] } }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));
import { SopRegister } from '../SopRegister';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function adopt(userId: string, organizationId: string) {
  H.user = { id: userId, organizationId, permissions: [] };
  localStorage.setItem('currentOrganizationId', organizationId);
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId, organizationId }))}.fixture`);
}
function payload(path: string, organizationId: string) {
  const old = organizationId === '12';
  const id = old ? 6 : 9;
  const title = old ? 'Previous tenant procedure' : 'Current tenant procedure';
  const docNumber = old ? 'SOP-015' : 'SOP-019';
  if (path === '/api/mdx/qms/documents') return { data: [{ id, doc_number: docNumber, title,
    doc_type: 'sop', category: null, version: '1.0', status: 'effective', effective_date: '2026-09-01', next_review_date: null, updated_at: null }] };
  if (path === '/api/mdx/qms/training/compliance') return { data: [{ id, doc_number: docNumber, title,
    document_version: '1.0', eligible: true, unavailable_reason: null, current: old ? 1 : 0, of: old ? 1 : 2, last_cycle: null }] };
  if (path === '/api/mdx/qms/training/expiring') return { data: [{ userId: old ? 30 : 31, userName: old ? 'Previous tenant member' : 'Current tenant member',
    documentId: id, docNumber, title, documentVersion: '1.0', expiresAt: '2026-11-20T00:00:00.000Z', daysLeft: 10, lapsed: false }] };
  return { data: [] };
}
type Pending = { path: string; organizationId: string; signal?: { aborted: boolean }; resolve: (value: ReturnType<typeof json>) => void };
function stubReads(deferredOrganization: string) {
  const pending: Pending[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string, options: { headers: Record<string, string>; signal?: { aborted: boolean } }) => {
    const path = url.split('?')[0];
    const organizationId = options.headers['x-organization-id'];
    if (organizationId !== deferredOrganization) return Promise.resolve(json(payload(path, organizationId)));
    return new Promise<ReturnType<typeof json>>(resolve => pending.push({ path, organizationId, signal: options.signal, resolve }));
  }));
  return pending;
}
const register = () => <SopRegister onAsk={() => {}} filter="all" onFilterChange={() => {}} />;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); adopt('7', '12'); });
afterEach(() => { cleanup(); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('the register retires all tenant-owned reads when identity changes', () => {
  it('clears previously loaded procedure and roster rows before the replacement tenant reads settle', async () => {
    const pending = stubReads('13');
    const view = render(register());
    expect(await screen.findByText('Previous tenant procedure', { selector: '.qms-title' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.qms-train-pct')?.textContent?.trim()).toBe('1/1'));
    adopt('8', '13');
    view.rerender(register());
    expect(screen.queryByText('Previous tenant procedure', { selector: '.qms-title' })).toBeNull();
    expect(document.querySelector('.qms-train-pct')).toBeNull();
    expect(screen.queryByText('Previous tenant member')).toBeNull();
    await waitFor(() => expect(pending).toHaveLength(5));
    await act(async () => { for (const read of pending) read.resolve(json(payload(read.path, read.organizationId))); });
    expect(await screen.findByText('Current tenant procedure', { selector: '.qms-title' })).toBeTruthy();
    expect(document.querySelector('.qms-train-pct')?.textContent?.trim()).toBe('0/2');
  });

  it('aborts old reads and ignores their late successful bodies after the new tenant renders', async () => {
    const pending = stubReads('12');
    const view = render(register());
    await waitFor(() => expect(pending).toHaveLength(5));
    adopt('8', '13');
    view.rerender(register());
    expect(await screen.findByText('Current tenant procedure', { selector: '.qms-title' })).toBeTruthy();
    expect(pending.every(read => read.signal?.aborted)).toBe(true);
    await act(async () => { for (const read of pending) read.resolve(json(payload(read.path, read.organizationId))); });
    expect(screen.queryByText('Previous tenant procedure', { selector: '.qms-title' })).toBeNull();
    expect(screen.queryByText('Previous tenant member')).toBeNull();
    expect(screen.getByText('Current tenant member')).toBeTruthy();
    expect(document.querySelector('.qms-train-pct')?.textContent?.trim()).toBe('0/2');
  });
});
