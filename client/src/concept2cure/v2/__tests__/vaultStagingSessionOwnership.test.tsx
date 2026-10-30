// @vitest-environment jsdom
/** Actual Vault wrapper and staging owner; credentials, files and HTTP records are synthetic. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/queryClient')>(), apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { ingestReceipt, stubIngestXhr, type IngestInit } from './_ingest-xhr-fake';
import { PID, ok, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';
import { endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

beforeEach(() => {
  window.C2C_PROJECT = { id: PID, title: 'Synthetic staging ownership project' };
  seedCompanySession({}, 'staging-owner');
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) return ok(vaultPayload({ tree: cabinetTree() }));
    return ok({ success: true, data: {} });
  });
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; });

async function stagePrivateFile() {
  const selectedFile = new File(['synthetic private source bytes'], 'prior-account-private.pdf', { type: 'application/pdf' });
  render(<Vault {...props()} />);
  fireEvent.change(await screen.findByTestId('vault-upload-zone-files'), { target: { files: [selectedFile] } });
  const panel = await screen.findByTestId('vault-upload-staging');
  const row = within(panel).getByTestId('vault-stage-row');
  fireEvent.change(within(row).getByLabelText('Title'), { target: { value: 'Prior account private title' } });
  fireEvent.change(within(row).getByLabelText('Classification'), { target: { value: 'CONFIDENTIAL' } });
  fireEvent.change(within(row).getByLabelText('Folder'), { target: { value: 'module-3' } });
  fireEvent.change(within(row).getByLabelText('CTD section (optional)'), { target: { value: '3.2.P.8' } });
  return { selectedFile, panel, row };
}

const answer = () => stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => ({
  status: 201, json: async () => ingestReceipt(init.body as FormData),
})));

describe('the Vault staging body belongs to its canonical account session', () => {
  it.each(['account', 'same-account session', 'organization', 'logout', 'session ABA'] as const)(
    'withdraws chosen bytes and private metadata after %s replacement without dispatch', async (transition) => {
      const request = answer();
      const { panel } = await stagePrivateFile();
      const previousUpload = within(panel).getByTestId('vault-stage-upload');
      act(() => {
        if (transition === 'account') seedCompanySession({ id: '43', email: 'replacement@example.test' }, 'replacement');
        if (transition === 'same-account session') seedCompanySession({}, 'replacement');
        if (transition === 'organization') seedCompanySession({ organizationId: '2' }, 'replacement');
        if (transition === 'logout' || transition === 'session ABA') endCompanySession();
        if (transition === 'session ABA') seedCompanySession({}, 'returned');
        // A retained UI action cannot send the old bytes in the transition frame.
        fireEvent.click(previousUpload);
      });
      await waitFor(() => expect(screen.queryByTestId('vault-upload-staging')).toBeNull());
      expect(document.body.textContent).not.toContain('prior-account-private.pdf');
      expect(screen.queryByDisplayValue('Prior account private title')).toBeNull();
      expect(request).not.toHaveBeenCalled();
      await screen.findByTestId('vault-upload-zone-files');
      expect(screen.queryByTestId('vault-stage-upload')).toBeNull();
    },
  );

  it('preserves the chosen File and edited fields across real same-session bearer refresh, then sends with the refreshed credential', async () => {
    const request = answer();
    const { selectedFile, panel, row } = await stagePrivateFile();
    let rotatedBearer = '';
    await act(async () => { rotatedBearer = await rotateCompanyBearer(); });
    expect(screen.getByTestId('vault-upload-staging')).toBe(panel);
    expect((within(row).getByLabelText('Title') as HTMLInputElement).value).toBe('Prior account private title');
    expect((within(row).getByLabelText('Classification') as HTMLSelectElement).value).toBe('CONFIDENTIAL');
    expect((within(row).getByLabelText('CTD section (optional)') as HTMLInputElement).value).toBe('3.2.P.8');
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const init = request.mock.calls[0][1];
    const submitted = init.body as FormData;
    expect(submitted.get('file')).toBe(selectedFile);
    expect(submitted.get('programId')).toBe(PID);
    expect(submitted.get('documentTitle')).toBe('Prior account private title');
    expect(submitted.get('classification')).toBe('CONFIDENTIAL');
    expect(submitted.get('folderId')).toBe('module-3');
    expect(submitted.get('ctdSection')).toBe('3.2.P.8');
    expect(init.headers.Authorization).toBe(`Bearer ${rotatedBearer}`);
    expect(init.headers['x-organization-id']).toBe('1');
    await within(row).findByText(/Recorded as v1.0/);
  });
});
