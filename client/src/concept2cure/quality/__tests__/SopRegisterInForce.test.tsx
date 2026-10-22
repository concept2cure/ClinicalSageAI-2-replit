// @vitest-environment jsdom
/**
 * A row under revision says which version is in force (MR-12 Stage 2): the
 * server names the signed predecessor beside the draft (in_force), and the
 * register shows it, counts it as effective, and dates it by its own
 * effective date. A row without one shows its own status only.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: '7', organizationId: '12', permissions: [] }) }));
import { SopRegister } from '../SopRegister';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const row = (over: Record<string, unknown>) => ({ doc_type: 'sop', category: null, next_review_date: null, updated_at: null, ...over });

beforeEach(() => {
  localStorage.setItem('currentOrganizationId', '12');
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: '7', organizationId: '12' }))}.fixture`);
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const path = url.split('?')[0];
    if (path === '/api/mdx/qms/documents') return Promise.resolve(json({ data: [
      row({ id: 1, doc_number: 'SOP-001', title: 'Document control', version: '2.0', status: 'draft', effective_date: null,
        in_force: { version: '1.0', effectiveDate: '2026-09-01' } }),
      row({ id: 2, doc_number: 'SOP-002', title: 'New procedure', version: '1.0', status: 'draft', effective_date: null, in_force: null }),
    ] }));
    return Promise.resolve(json({ data: [] }));
  }));
});
afterEach(() => { cleanup(); clearAuthToken(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('a controlled document under revision', () => {
  it('shows the version in force beside its draft, dated by that version', async () => {
    render(<SopRegister onAsk={() => {}} filter="all" onFilterChange={() => {}} />);
    const revising = (await screen.findByText('Document control', { selector: '.qms-title' })).closest('.qms-row') as HTMLElement;
    expect(within(revising).getByTestId('qms-in-force').textContent).toBe('v1.0 in force');
    expect(within(revising).getByTitle('Version 1.0 stays in force until version 2.0 is approved.')).toBeTruthy();
    expect(revising.textContent).toMatch(/2026|Sep/);
    const fresh = screen.getByText('New procedure', { selector: '.qms-title' }).closest('.qms-row') as HTMLElement;
    expect(within(fresh).queryByTestId('qms-in-force')).toBeNull();
    // The KPI counts what is in force: the revised SOP, not the new draft.
    expect(screen.getByText('Effective documents').parentElement?.textContent).toMatch(/^Effective documents1/);
  });
});
