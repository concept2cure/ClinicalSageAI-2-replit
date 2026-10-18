// @vitest-environment jsdom
/** Preservation controls must send real targets and never invent an accepted hold or lift. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { LegalHoldsCard, LEGAL_HOLDS_PATH } from '../surfaces/LegalHoldsCard';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const HOLD = '44444444-4444-4444-8444-444444444444';
const reference = 'Inspection 2026-10';
const reason = 'Preserve inspection records';
const hold = (overrides: Record<string, unknown> = {}) => ({
  id: HOLD, reference, reason, scope: 'program', programId: PROJECT, documentId: null,
  placedBy: 7, placedAt: '2026-10-14T09:00:00Z', liftedAt: null, liftedBy: null, liftReason: null, active: true,
  targetLabel: 'First project', targetProjectLabel: 'First project', ...overrides,
});
const lifted = () => hold({ active: false, liftedAt: '2026-10-14T10:00:00Z', liftedBy: 7, liftReason: 'Inspection closed' });
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
interface Sent { url: string; method: string; body: unknown }
let sent: Sent[];
let list: { status: number; body: unknown };
let place: () => Promise<Response>;
let lift: () => Promise<Response>;
let documents: () => Promise<Response>;

beforeEach(() => {
  sent = [];
  list = { status: 200, body: { holds: [] } };
  place = async () => { list.body = { holds: [hold()] }; return response(201, { hold: hold() }); };
  lift = async () => { list.body = { holds: [lifted()] }; return response(200, { hold: lifted() }); };
  documents = async () => response(200, { tree: [{ id: 'uploads', children: [
    { id: 'upload-one', src: 'upload', docId: DOCUMENT, title: 'Inspection report', ver: '1.0' },
    { id: 'authored-one', src: 'authored', title: 'Authored section', ver: '1.0' },
  ] }] });
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init: { method?: string; body?: string } = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    sent.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    if (url === LEGAL_HOLDS_PATH && method === 'GET') return response(list.status, list.body);
    if (url === LEGAL_HOLDS_PATH && method === 'POST') return place();
    if (url === `${LEGAL_HOLDS_PATH}/${HOLD}/lift`) return lift();
    if (url === '/api/regulatory-programs?limit=200') return response(200, { data: [
      { id: PROJECT, name: 'First project', code: 'IND-01' },
      { id: OTHER_PROJECT, name: 'Second project', code: 'IND-02' },
    ], meta: {} });
    if (url.startsWith('/api/c2c/project-vault/')) return documents();
    return response(404, { message: 'Unexpected request' });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

function renderCard() {
  return render(<LegalHoldsCard describeFailure={(error, status) => status === 0 ? 'The server could not be reached.' : error} />);
}
const writes = () => sent.filter((r) => r.method === 'POST');
async function openForm(scope: 'project' | 'document' = 'project') {
  const view = renderCard();
  fireEvent.click(await view.findByRole('button', { name: `Place ${scope} hold` }));
  const dialog = within(view.getByRole('dialog'));
  await waitFor(() => expect(dialog.getByRole('combobox', { name: 'Project' }).querySelectorAll('option')).toHaveLength(3));
  fireEvent.change(dialog.getByRole('combobox', { name: 'Project' }), { target: { value: PROJECT } });
  fireEvent.change(dialog.getByRole('textbox', { name: 'Hold reference' }), { target: { value: reference } });
  fireEvent.change(dialog.getByRole('textbox', { name: 'Reason for the hold' }), { target: { value: reason } });
  return { view, dialog };
}
async function openLift() {
  list.body = { holds: [hold()] };
  const view = renderCard();
  fireEvent.click(await view.findByRole('button', { name: `Lift hold ${reference}` }));
  const element = view.getByRole('dialog');
  const dialog = within(element);
  // Canonical governed-confirm field labels precede the shared a11y migration.
  const reasonField = element.querySelector('textarea') as HTMLTextAreaElement;
  const wordField = element.querySelector('input') as HTMLInputElement;
  return { view, dialog, reasonField, wordField };
}

describe('Setup legal-hold read states', () => {
  it('distinguishes a successful empty register from an unknown hold state', async () => {
    const view = renderCard();
    expect(await view.findByText('No active holds in this list')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Place project hold' })).toBeTruthy();
  });

  it.each([
    { status: 500, body: { message: 'The holds could not be read.' } },
    { status: 200, body: { holds: 'unreadable' } },
    { status: 200, body: { data: { holds: [] }, meta: { pendingStore: true } } },
  ])('failed/malformed/unprovisioned reads offer no hold controls: $status', async (reply) => {
    list = reply;
    const view = renderCard();
    expect(await view.findByText("Couldn't load legal holds")).toBeTruthy();
    expect(view.queryByText('No active holds in this list')).toBeNull();
    expect(view.queryByRole('button', { name: 'Place project hold' })).toBeNull();
  });

  it('preserves an authority refusal in the server’s words and offers no controls', async () => {
    list = { status: 403, body: { error: 'HOLD_AUTHORITY_REQUIRED', message: 'Legal holds are placed and lifted by organisation administrators and managers.' } };
    const view = renderCard();
    expect(await view.findByText('Legal holds were not shown')).toBeTruthy();
    expect(view.getByText('Legal holds are placed and lifted by organisation administrators and managers.')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Place project hold' })).toBeNull();
  });

  it('shows the stored project name instead of a raw identifier in the hold list', async () => {
    list.body = { holds: [hold()] };
    const view = renderCard();
    const row = await view.findByTestId(`legal-hold-${HOLD}`);
    expect(row.textContent).toContain('Project · First project');
    expect(row.textContent).not.toContain(PROJECT);
  });
});

describe('placing a legal hold', () => {
  it('uses a named tenant project and the server’s accepted record; no caller-supplied tenant id', async () => {
    const { view, dialog } = await openForm();
    expect(dialog.getByRole('option', { name: 'First project · IND-01' })).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Place hold' }));
    expect(await view.findByText('Hold placed and recorded with its audit-trail entry.')).toBeTruthy();
    expect(writes()).toEqual([{ url: LEGAL_HOLDS_PATH, method: 'POST', body: { scope: 'program', programId: PROJECT, reference, reason } }]);
    expect(await view.findByRole('button', { name: `Lift hold ${reference}` })).toBeTruthy();
    expect(view.queryByRole('dialog')).toBeNull();
  });

  it('validates the recorded reason before any request leaves the browser', async () => {
    const { dialog } = await openForm();
    fireEvent.change(dialog.getByRole('textbox', { name: 'Reason for the hold' }), { target: { value: 'ab' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Place hold' }));
    expect(await dialog.findByText(/Use a hold reference/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('blocks duplicate writes and dismissal while an accepted hold is still pending', async () => {
    let resolve: (v: Response) => void = () => {};
    place = () => new Promise<Response>((done) => { resolve = done; });
    const { view, dialog } = await openForm();
    const button = dialog.getByRole('button', { name: 'Place hold' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await dialog.findByText('Recording the hold and its audit-trail entry…')).toBeTruthy();
    fireEvent.click(dialog.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(view.getByRole('dialog')).toBeTruthy();
    expect(writes()).toHaveLength(1);
    resolve(response(201, { hold: hold() }));
    expect(await view.findByText('Hold placed and recorded with its audit-trail entry.')).toBeTruthy();
  });

  it('retains a refused draft and never reports it as recorded', async () => {
    place = async () => response(500, { error: 'HOLD_WRITE_FAILED', message: 'The hold could not be recorded. Nothing was changed.' });
    const { view, dialog } = await openForm();
    fireEvent.click(dialog.getByRole('button', { name: 'Place hold' }));
    expect(await dialog.findByText('The hold could not be recorded. Nothing was changed.')).toBeTruthy();
    expect((dialog.getByRole('textbox', { name: 'Reason for the hold' }) as HTMLTextAreaElement).value).toBe(reason);
    expect(view.queryByText('Hold placed and recorded with its audit-trail entry.')).toBeNull();
  });

  it('refuses to claim success from a 200 response without the created active hold', async () => {
    place = async () => response(200, { success: true });
    const { view, dialog } = await openForm();
    fireEvent.click(dialog.getByRole('button', { name: 'Place hold' }));
    expect(await dialog.findByText(/The server returned no recorded active hold/)).toBeTruthy();
    expect(view.queryByText('Hold placed and recorded with its audit-trail entry.')).toBeNull();
  });

  it('selects a stored Vault upload and sends only document scope, excluding authored sections', async () => {
    place = async () => response(201, { hold: hold({ scope: 'document', programId: null, documentId: DOCUMENT }) });
    const { view, dialog } = await openForm('document');
    await waitFor(() => expect(dialog.getByRole('option', { name: 'Inspection report · 1.0' })).toBeTruthy());
    expect(dialog.queryByRole('option', { name: 'Authored section · 1.0' })).toBeNull();
    fireEvent.change(dialog.getByRole('combobox', { name: 'Vault document version' }), { target: { value: DOCUMENT } });
    fireEvent.click(dialog.getByRole('button', { name: 'Place hold' }));
    expect(await view.findByText('Hold placed and recorded with its audit-trail entry.')).toBeTruthy();
    expect(writes()[0].body).toEqual({ scope: 'document', documentId: DOCUMENT, reference, reason });
  });

  it('rejects a document left over after switching project, rather than holding the wrong project’s document', async () => {
    const { dialog } = await openForm('document');
    await waitFor(() => expect(dialog.getByRole('option', { name: 'Inspection report · 1.0' })).toBeTruthy());
    fireEvent.change(dialog.getByRole('combobox', { name: 'Vault document version' }), { target: { value: DOCUMENT } });
    documents = async () => response(200, { tree: [] });
    fireEvent.change(dialog.getByRole('combobox', { name: 'Project' }), { target: { value: OTHER_PROJECT } });
    expect(await dialog.findByText('No uploaded Vault documents are available in this project.')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Place hold' }));
    expect(await dialog.findByText('Choose a target from the project and document lists after they load.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
});

describe('lifting a legal hold', () => {
  it('requires a reason and typed confirmation; cancel sends no mutation', async () => {
    const { view, dialog, reasonField } = await openLift();
    fireEvent.change(reasonField, { target: { value: 'Inspection closed' } });
    expect((dialog.getByRole('button', { name: 'Confirm and log' }) as HTMLButtonElement).disabled).toBe(true);
    expect(writes()).toHaveLength(0);
    fireEvent.click(dialog.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(view.queryByRole('dialog')).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('leaves an active hold visible after a refused lift and preserves the reason for retry', async () => {
    lift = async () => response(500, { message: 'The hold could not be recorded. Nothing was changed.' });
    const { view, dialog, reasonField, wordField } = await openLift();
    fireEvent.change(reasonField, { target: { value: 'Inspection closed' } });
    fireEvent.change(wordField, { target: { value: 'lift' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm and log' }));
    expect(await dialog.findByRole('alert')).toBeTruthy();
    expect(reasonField.value).toBe('Inspection closed');
    expect(within(view.getByTestId(`legal-hold-${HOLD}`)).getByText('Active')).toBeTruthy();
    expect(view.queryByText(/Hold lifted and recorded/)).toBeNull();
  });

  it('refreshes after an accepted lift and exposes the persisted lifted record when requested', async () => {
    const { view, dialog, reasonField, wordField } = await openLift();
    fireEvent.change(reasonField, { target: { value: 'Inspection closed' } });
    fireEvent.change(wordField, { target: { value: 'lift' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Confirm and log' }));
    expect(await view.findByText(/Hold lifted and recorded/)).toBeTruthy();
    expect(writes()).toEqual([{ url: `${LEGAL_HOLDS_PATH}/${HOLD}/lift`, method: 'POST', body: { liftReason: 'Inspection closed' } }]);
    expect(await view.findByText('No active holds in this list')).toBeTruthy();
    fireEvent.change(view.getByLabelText('Show legal holds'), { target: { value: 'all' } });
    expect(view.getByText('Lifted')).toBeTruthy();
    expect(view.getByText(/Reason: Inspection closed/)).toBeTruthy();
    expect(view.queryByRole('button', { name: `Lift hold ${reference}` })).toBeNull();
  });
});
