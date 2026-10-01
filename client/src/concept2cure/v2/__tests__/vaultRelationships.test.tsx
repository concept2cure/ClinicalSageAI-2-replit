// @vitest-environment jsdom
/**
 * Related documents in the Vault detail pane (plan critique 15, D2): the
 * replacement for the parentDocumentId an upload used to accept unchecked.
 * The pane lists what the server returns in both directions, finds a document
 * to relate through the library search, and claims a change only once the
 * server has recorded it. A list that could not be read is never shown as
 * empty. Server half: tests/db/vault-document-relationships.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const REL_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/relationships`;
const OTHER_PROJECT = '33333333-3333-4333-8333-333333333333';
const PROTOCOL = '44444444-4444-4444-8444-444444444444';
const IB = '55555555-5555-4555-8555-555555555555';
const REASON = 'Related to the wrong protocol amendment.';

const rel = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', type: 'supporting', direction: 'outgoing', label: 'Supported by', note: null,
  createdAt: '2026-10-01T10:00:00.000Z', createdBy: 'Rhea Relate',
  other: { documentId: PROTOCOL, title: 'Protocol', version: '1.0', documentType: 'OTHER', programId: PID, programName: 'BX-301', superseded: false },
  ...over,
});

let onList: () => Response;
let onSearch: () => Response;
let onRelate: () => Response;
let onRemove: () => Response;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    if (url === REL_URL && method === 'GET') return onList();
    if (url === REL_URL && method === 'POST') return onRelate();
    if (url.startsWith('/api/c2c/project-vault/search?')) return onSearch();
    if (url === `/api/c2c/project-vault/${PID}/relationships/r-1/remove`) return onRemove();
    return ok({});
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

const pane = () => screen.findByTestId('vault-relationships');

describe('related documents (critique 15)', () => {
  it('lists both directions in their own words, with the project and a later version named', async () => {
    onList = () => ok({ success: true, data: { relationships: [
      rel({ note: 'The protocol the study ran under.' }),
      rel({ id: 'r-2', type: 'references', direction: 'incoming', label: 'Referenced by',
        other: { documentId: IB, title: 'Investigator brochure', version: '2.0', documentType: 'OTHER', programId: OTHER_PROJECT, programName: 'BX-302', superseded: true } }),
    ] } });
    render(<Vault {...props()} />);
    const p = await pane();
    const rows = await within(p).findAllByTestId('vault-relationship');
    expect(rows[0].textContent).toContain('Supported by');
    expect(rows[0].textContent).toContain('Protocol v1.0. The protocol the study ran under.');
    expect(rows[1].textContent).toContain('Referenced by');
    expect(rows[1].textContent).toContain('Investigator brochure v2.0 (in BX-302). A later version of it exists; this relationship names this one');
  });

  it('a list that could not be read says so, and never reads as no related documents', async () => {
    onList = () => { throw new ApiRequestError('Internal error', 500, { success: false, error: 'RELATIONSHIPS_UNAVAILABLE' }, 'RELATIONSHIPS_UNAVAILABLE'); };
    render(<Vault {...props()} />);
    const p = await pane();
    expect((await within(p).findByRole('alert')).textContent).toMatch(/could not be read; none are shown/);
    expect(p.textContent).not.toMatch(/No related documents are recorded/);
  });

  it('finds a document in the library, relates it, and claims it only once the server recorded it', async () => {
    let listed: unknown[] = [];
    onList = () => ok({ success: true, data: { relationships: listed } });
    onSearch = () => ok({ success: true, data: { results: [
      { id: DOC_ID, title: 'This document', version: '1.0', program: { id: PID, name: 'BX-301' } },
      { id: IB, title: 'Investigator brochure', version: '2.0', program: { id: OTHER_PROJECT, name: 'BX-302' } },
    ] } });
    onRelate = () => { listed = [rel({ id: 'r-9', type: 'based_on', label: 'Based on' })]; return { ok: true, status: 201, json: async () => ({ success: true, data: { id: 'r-9' } }) } as Response; };
    render(<Vault {...props()} />);
    const p = await pane();
    await within(p).findByText(/No related documents are recorded/);
    fireEvent.click(within(p).getByTestId('vault-relationships-open'));
    fireEvent.change(within(p).getByTestId('vault-relationships-query'), { target: { value: 'brochure' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Find' }));
    const option = await within(p).findByLabelText('Investigator brochure v2.0 (in BX-302)');
    // The document itself is never offered.
    expect(within(p).queryByLabelText(/This document/)).toBeNull();
    fireEvent.click(option);
    fireEvent.change(within(p).getByTestId('vault-relationships-kind'), { target: { value: 'based_on' } });
    fireEvent.click(within(p).getByTestId('vault-relationships-relate'));

    expect((await within(p).findByRole('status')).textContent).toBe(
      "Related: based on Investigator brochure v2.0. Recorded in both documents' histories.");
    expect(apiRequest).toHaveBeenCalledWith('POST', REL_URL, { toDocumentId: IB, type: 'based_on' });
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/search?q=brochure&limit=10`, undefined);
    await within(p).findByText('Based on');
  });

  it('a refused relate says so and claims nothing', async () => {
    onList = () => ok({ success: true, data: { relationships: [] } });
    onSearch = () => ok({ success: true, data: { results: [{ id: IB, title: 'Investigator brochure', version: '2.0', program: { id: PID, name: 'BX-301' } }] } });
    onRelate = () => { throw new ApiRequestError('conflict', 409, { success: false, error: 'ALREADY_RELATED', message: 'It is already based on that version.' }, 'ALREADY_RELATED'); };
    render(<Vault {...props()} />);
    const p = await pane();
    fireEvent.click(await within(p).findByTestId('vault-relationships-open'));
    fireEvent.change(within(p).getByTestId('vault-relationships-query'), { target: { value: 'brochure' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Find' }));
    fireEvent.click(await within(p).findByLabelText('Investigator brochure v2.0'));
    fireEvent.click(within(p).getByTestId('vault-relationships-relate'));
    expect((await within(p).findByRole('alert')).textContent).toBe('Nothing was related. It is already based on that version.');
    expect(within(p).queryByRole('status')).toBeNull();
  });

  it('removing one needs a reason of the required length, sends it, and then re-reads the list', async () => {
    let listed: unknown[] = [rel()];
    onList = () => ok({ success: true, data: { relationships: listed } });
    onRemove = () => { listed = []; return ok({ success: true }); };
    render(<Vault {...props()} />);
    const p = await pane();
    const row = await within(p).findByTestId('vault-relationship');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    const confirm = within(row).getByTestId('vault-relationship-remove-confirm') as HTMLButtonElement;
    fireEvent.change(within(row).getByTestId('vault-relationship-reason'), { target: { value: 'short' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(row).getByTestId('vault-relationship-reason'), { target: { value: REASON } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(within(p).queryByTestId('vault-relationship')).toBeNull());
    expect(apiRequest).toHaveBeenCalledWith('POST', `/api/c2c/project-vault/${PID}/relationships/r-1/remove`, { reason: REASON });
    expect(within(p).getByRole('status').textContent).toBe(
      "Removed: supported by Protocol v1.0. Your reason is recorded in both documents' histories.");
  });
});
