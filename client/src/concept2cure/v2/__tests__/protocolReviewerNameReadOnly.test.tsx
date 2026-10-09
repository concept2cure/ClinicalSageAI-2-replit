// @vitest-environment jsdom
/**
 * Once an account is chosen, the reviewer name is the account's, shown
 * read-only, and it is the name sent (periodic review 2026-09-28, editor
 * family, SEC-C-7 follow-on (b)).
 *
 * SEC-C-7 made the server store an account's own name on an account-bound
 * review and refuse any other. The request drawer still showed a free
 * "Reviewer name" field beside the account select, and filled the account's
 * name in only at submit time, only when the field was blank. So a person could
 * type one name, choose someone else's account, and submit a form showing a
 * name the review would never be listed under. The field now takes the chosen
 * account's name and cannot be edited while it does.
 *
 * The first block pins the C2CForm contract the drawer relies on: a derived
 * field is read-only, its value satisfies a required field, and it is what is
 * submitted.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => session.user,
}));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { C2CForm, type C2CFormConfig } from '../C2CForm';
import { ProtocolDevForm } from '../surfaces/ProtocolDevForms';

const REASON = 'Independent statistical review before finalization';

afterEach(() => { cleanup(); apiRequest.mockReset(); session.user = null; });

describe('a derived C2CForm field', () => {
  const CONFIG: C2CFormConfig = {
    title: 'Assign an owner',
    submitLabel: 'Assign',
    fields: [
      { key: 'ownerId', label: 'Owner account', type: 'select', options: [{ value: '7', label: 'Dr Iyer · member' }] },
      {
        key: 'ownerName', label: 'Owner name', type: 'text', required: true,
        derive: (vals) => (vals.ownerId === '7' ? 'Dr Iyer' : null),
      },
    ],
  };

  it('is the person’s to fill while nothing derives it', () => {
    const onSubmit = vi.fn();
    render(<C2CForm config={CONFIG} onCancel={vi.fn()} onSubmit={onSubmit} />);
    const name = screen.getByLabelText(/Owner name/) as HTMLInputElement;
    expect(name.readOnly).toBe(false);
    expect(name.getAttribute('aria-readonly')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(screen.getByRole('alert').textContent).toBe('Complete the required field: Owner name');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is read-only once derived, and its value alone satisfies the required check', () => {
    const onSubmit = vi.fn();
    render(<C2CForm config={CONFIG} onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Owner account/), { target: { value: '7' } });
    const name = screen.getByLabelText(/Owner name/) as HTMLInputElement;
    expect(name.value).toBe('Dr Iyer');
    expect(name.readOnly).toBe(true);
    expect(name.getAttribute('aria-readonly')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: '7', ownerName: 'Dr Iyer' });
  });

  it('submits the derived value, never what was typed there before it applied', () => {
    const onSubmit = vi.fn();
    render(<C2CForm config={CONFIG} onCancel={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Owner name/), { target: { value: 'Dr Someone Else' } });
    fireEvent.change(screen.getByLabelText(/Owner account/), { target: { value: '7' } });
    expect((screen.getByLabelText(/Owner name/) as HTMLInputElement).value).toBe('Dr Iyer');
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(onSubmit).toHaveBeenCalledWith({ ownerId: '7', ownerName: 'Dr Iyer' });
  });
});

describe('the reviewer name once an account is chosen', () => {
  beforeEach(() => {
    session.user = { id: '11', email: 'me@c2c.test', organizationId: '42' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/tenant-users/42') {
        return { ok: true, status: 200, json: async () => [{ id: 21, name: 'Dr Amara Okafor', email: 'okafor@c2c.test', role: 'member' }] } as Response;
      }
      return { ok: true, status: 201, json: async () => ({ assignmentId: 1 }) } as Response;
    });
  });

  async function open() {
    const onDone = vi.fn();
    const onError = vi.fn();
    render(<ProtocolDevForm kind="review-request" documentId={2} onCancel={vi.fn()} onDone={onDone} onError={onError} />);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Dr Amara Okafor/ })).toBeTruthy());
    return { dialog, onDone, onError };
  }
  const nameField = (dialog: HTMLElement) => within(dialog).getByLabelText(/Reviewer name/) as HTMLInputElement;
  const chooseAccount = (dialog: HTMLElement, value: string) =>
    fireEvent.change(within(dialog).getByLabelText(/Reviewer account/), { target: { value } });
  const lastWrite = () => apiRequest.mock.calls.filter((c) => c[0] !== 'GET').slice(-1)[0];

  it('is the account’s name, read-only', async () => {
    const { dialog } = await open();
    expect(nameField(dialog).readOnly).toBe(false);
    fireEvent.change(nameField(dialog), { target: { value: 'Dr Someone Else' } });
    chooseAccount(dialog, '21');
    expect(nameField(dialog).value).toBe('Dr Amara Okafor');
    expect(nameField(dialog).readOnly).toBe(true);
    expect(nameField(dialog).getAttribute('aria-readonly')).toBe('true');
  });

  it('is what is sent, never a name typed before the account was chosen', async () => {
    const { dialog, onDone, onError } = await open();
    fireEvent.change(nameField(dialog), { target: { value: 'Dr Someone Else' } });
    chooseAccount(dialog, '21');
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Request review/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('review-request'));
    expect(onError).not.toHaveBeenCalled();
    expect(lastWrite()[2]).toMatchObject({ reviewerUserId: 21, reviewerName: 'Dr Amara Okafor' });
  });

  it('becomes a free field again when "no account" is chosen', async () => {
    const { dialog, onDone } = await open();
    chooseAccount(dialog, '21');
    chooseAccount(dialog, '');
    expect(nameField(dialog).readOnly).toBe(false);
    expect(nameField(dialog).getAttribute('aria-readonly')).toBeNull();
    fireEvent.change(nameField(dialog), { target: { value: 'Dr Iyer' } });
    fireEvent.change(within(dialog).getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Request review/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('review-request'));
    expect(lastWrite()[2]).toMatchObject({ reviewerName: 'Dr Iyer' });
    expect(lastWrite()[2]).not.toHaveProperty('reviewerUserId');
  });
});
