// @vitest-environment jsdom
/**
 * Edit details in the Vault detail pane (VR-05, D5): a person changes a
 * version's title, type or classification with a reason, and the pane claims
 * only what the server recorded.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultEditDetails } from '../surfaces/VaultEditDetails';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const DETAILS = { documentTitle: 'Protocol', documentType: 'OTHER', classification: 'INTERNAL' };
const REASON = 'The sponsor renamed the protocol at the pre-IND meeting.';
const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => data }) as Response;

function renderPane() {
  const onSaved = vi.fn();
  render(<VaultEditDetails projectId={PROJECT} documentId={DOC} details={DETAILS} onSaved={onSaved} />);
  return { onSaved };
}
const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const save = () => screen.getByTestId('vault-edit-details-save') as HTMLButtonElement;

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('Edit details', () => {
  it('shows the recorded title, type and classification', () => {
    renderPane();
    const pane = screen.getByTestId('vault-edit-details');
    expect(pane.textContent).toContain('Protocol');
    expect(pane.textContent).toContain('Internal');
  });

  it('will not save without a change and a reason of the required length', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('vault-edit-details-open'));
    expect(save().disabled).toBe(true);
    type('vault-edit-details-title', 'Clinical protocol');
    expect(save().disabled).toBe(true);
    type('vault-edit-details-reason', 'short');
    expect(save().disabled).toBe(true);
    type('vault-edit-details-reason', REASON);
    expect(save().disabled).toBe(false);
  });

  it('sends only the changed fields with the reason, and says it was recorded once the server says so', async () => {
    apiRequest.mockResolvedValue(reply(200, { success: true, unchanged: false, changes: [] }));
    const { onSaved } = renderPane();
    fireEvent.click(screen.getByTestId('vault-edit-details-open'));
    type('vault-edit-details-title', 'Clinical protocol');
    type('vault-edit-details-classification', 'CONFIDENTIAL');
    type('vault-edit-details-reason', REASON);
    fireEvent.click(save());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [method, url, body] = apiRequest.mock.calls[0];
    expect(method).toBe('POST');
    expect(url).toBe(`/api/c2c/project-vault/${PROJECT}/documents/${DOC}/details`);
    expect(body).toEqual({ documentTitle: 'Clinical protocol', classification: 'CONFIDENTIAL', reason: REASON });
    expect(screen.getByTestId('vault-edit-details-note').textContent).toMatch(/recorded in this document's history/);
  });

  it('reports a refusal as a refusal, keeps the form, and claims nothing', async () => {
    apiRequest.mockResolvedValue(
      reply(403, { success: false, error: 'VAULT_WRITE_ROLE_REQUIRED', message: 'Your role in this organization (viewer) can read the Vault but not change it.' }),
    );
    const { onSaved } = renderPane();
    fireEvent.click(screen.getByTestId('vault-edit-details-open'));
    type('vault-edit-details-title', 'Clinical protocol');
    type('vault-edit-details-reason', REASON);
    fireEvent.click(save());

    const note = await screen.findByTestId('vault-edit-details-note');
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toMatch(/not changed/);
    expect(note.textContent).toMatch(/viewer/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-edit-details-save')).toBeTruthy();
  });

  it('says nothing changed when the values were already recorded, and does not reload', async () => {
    apiRequest.mockResolvedValue(reply(200, { success: true, unchanged: true, changes: [] }));
    const { onSaved } = renderPane();
    fireEvent.click(screen.getByTestId('vault-edit-details-open'));
    type('vault-edit-details-type', 'PROTOCOL');
    type('vault-edit-details-reason', REASON);
    fireEvent.click(save());
    const note = await screen.findByTestId('vault-edit-details-note');
    expect(note.textContent).toMatch(/Nothing changed/);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
