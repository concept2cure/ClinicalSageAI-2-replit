// @vitest-environment jsdom
/**
 * A viewer is not offered the Vault's write controls (D3, role-scoped
 * visibility). Every write route behind these panels carries
 * `requireEditorAccess`, and the session derives `governed:write` from the
 * same role set, so the controls follow the permission. A viewer used to be
 * offered every control: upload, confirm, move and unfile, edit details,
 * annotate, relate, check stored files, upload a new version, file Data Room
 * sources, and file into a coverage gap. Each was refused after the click.
 *
 * What a viewer can read stays on the page: the recorded details, the filing,
 * the annotations and relationships, and the gap in coverage.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null as null | { id: string; permissions?: string[] } }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { Vault } from '../surfaces/Vault';
import { DataRoomFileBar, RoomPick, type DataRoomFiling } from '../surfaces/VaultDataRoomFiling';
import { PID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const VIEWER = { id: '7', permissions: [] };
const MEMBER = { id: '8', permissions: ['governed:write'] };

const COVERAGE = {
  state: 'available',
  provenance: { source: 'rule_pack', docType: 'ind', agency: 'FDA', packVersion: '2.1' },
  required: 2,
  covered: 1,
  modules: [{ code: 'm3', name: 'Quality (CMC)', covered: ['3.2.P.8'], missing: ['3.2.S'] }],
};
const DETAILS = { documentTitle: 'Stability summary', documentType: 'OTHER', classification: 'INTERNAL' };

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') {
      return ok(vaultPayload({ tree: cabinetTree([uploadDoc({ details: DETAILS })]), coverage: COVERAGE }));
    }
    return ok({});
  });
});
afterEach(() => { cleanup(); auth.user = null; delete (window as any).C2C_PROJECT; });

async function openVault() {
  render(<Vault {...props()} />);
  await screen.findByTestId('vault-edit-details');
  await screen.findByTestId('vault-relationships');
  fireEvent.click(await screen.findByText('Show sections'));
}

describe('the Vault offers its write controls to the writing roles only', () => {
  it('a viewer reads the document and its filing, and is offered no write', async () => {
    auth.user = VIEWER;
    await openVault();
    for (const id of ['vault-upload-button', 'vault-confirm-filing', 'vault-edit-details-open',
      'vault-annotations-open', 'vault-relationships-open']) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    for (const name of [/^Move$/, /^Unfile$/, /Check stored files/, /Upload new version/, /Ask AnA to import/]) {
      expect(screen.queryByRole('button', { name }), String(name)).toBeNull();
    }
    for (const id of ['vault-filing-view-only', 'vault-edit-details-view-only', 'vault-annotations-view-only',
      'vault-relationships-view-only', 'vault-fixity-view-only']) {
      expect(screen.getByTestId(id).textContent, id).toMatch(/^View only\. Your role can read this but not .+\. A member or administrator can\.$/);
    }
    // What a viewer may read is still there.
    expect(screen.getByTestId('vault-edit-details').textContent).toContain('Stability summary');
    const gap = screen.getByTestId('vault-coverage-missing-3.2.S');
    expect(gap.textContent).toContain('No confirmed document');
    expect(within(gap).queryByRole('button')).toBeNull();
  });

  it('a member is offered each control, and no view-only note', async () => {
    auth.user = MEMBER;
    await openVault();
    for (const id of ['vault-upload-button', 'vault-confirm-filing', 'vault-edit-details-open',
      'vault-annotations-open', 'vault-relationships-open']) {
      expect(screen.getByTestId(id), id).toBeTruthy();
    }
    await waitFor(() => expect(screen.getByRole('button', { name: /Upload new version/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Check stored files/ })).toBeTruthy();
    expect(within(screen.getByTestId('vault-coverage-missing-3.2.S')).getByRole('button', { name: /Upload/ })).toBeTruthy();
    expect(screen.queryAllByText(/^View only\./)).toHaveLength(0);
  });

  it('a session that carries no permissions is offered the controls; the server decides', async () => {
    auth.user = { id: '9' };
    await openVault();
    expect(screen.getByTestId('vault-edit-details-open')).toBeTruthy();
    expect(screen.queryAllByText(/^View only\./)).toHaveLength(0);
  });
});

describe('Data Room filing', () => {
  const filing: DataRoomFiling = {
    selected: new Set<number>(), toggle: vi.fn(), selectMany: vi.fn(), clear: vi.fn(), busy: false,
    outcome: null, error: null, fileSelected: vi.fn(), addAsVersion: vi.fn(),
  };
  const room = () => render(
    <>
      <RoomPick id={1} title="CSR" filed={false} filing={filing} />
      <DataRoomFileBar filing={filing} unfiledIds={[1]} titleOf={() => 'CSR'} />
    </>,
  );

  it('a viewer selects nothing and files nothing, and is told why', () => {
    auth.user = VIEWER;
    room();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('vault-data-room-file-view-only').textContent).toContain('file Data Room sources into the Vault');
  });

  it('a member selects and files', () => {
    auth.user = MEMBER;
    room();
    expect(screen.getByRole('checkbox', { name: 'Select CSR to file into the Vault' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select 1 not yet filed' })).toBeTruthy();
  });
});
