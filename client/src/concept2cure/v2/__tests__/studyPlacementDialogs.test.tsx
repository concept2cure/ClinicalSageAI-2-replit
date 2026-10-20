// @vitest-environment jsdom
/** Human study metadata reaches the existing Vault and saved-copy placement chains. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { VaultPlaceIntoSubmission } from '../surfaces/VaultPlaceIntoSubmission';
import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';
import { authService } from '@/services/portal/authService';

type Lane = 'vault' | 'authoring';
const REASON = 'File the sponsor reviewed study report';
const VALUES = { studyId: 'STUDY-101', stfFileTag: 'human-reviewed-tag' };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
let region: string;
let putResponse: ((body: Record<string, unknown>) => Response | Promise<Response>) | null;
let snapshotResponse: Response | Promise<Response> | null;
let sequencesResponse: Promise<Response> | null;
let sectionsResponse: Promise<Response> | null;
const onPlaced = vi.fn();
const fireToast = vi.fn();
const posts = () => apiRequest.mock.calls.filter(call => call[0] === 'POST');
const puts = () => apiRequest.mock.calls.filter(call => call[0] === 'PUT');
function route(method: string, url: string, body: Record<string, unknown>): Response | Promise<Response> {
  if (method === 'PUT') return putResponse ? putResponse(body) : response({ ...body, id: 69, sequenceId: Number(url.split('/')[4]), auditTrail: { persisted: true, chained: true } });
  if (method === 'POST') return snapshotResponse ?? response({ success: true, written: true, document: { id: 52, status: 'draft', metadata: { source: 'authoring-document', docId: 'D1' } } });
  if (url === '/api/submissions') return response([{ id: 9, title: 'Trial filing', applicationType: 'ind', primaryRegion: region }]);
  if (url === '/api/submissions/9/sequences') return sequencesResponse ?? response([
    { id: 31, sequenceNumber: '0000', type: 'original', status: 'draft', region },
    { id: 32, sequenceNumber: '0001', type: 'amendment', status: 'draft', region },
  ]);
  if (url.endsWith('/sections')) return sectionsResponse ?? response({ success: true, sections: [{ code: '5.3.5.1', title: 'Study report', content: 'Saved sponsor reviewed report content.' }] });
  return response([]);
}
function seam(lane: Lane, code = '5.3.5.1') {
  const vaultProps: React.ComponentProps<typeof VaultPlaceIntoSubmission> = {
    documentUuid: 'vault-document', documentTitle: 'Study report', onClose: vi.fn(), onNav: vi.fn(), onPlaced,
    filing: { ctdSection: code, placementStatus: 'confirmed' },
  };
  const authoringProps: React.ComponentProps<typeof AuthoringPlaceIntoFiling> = {
    docId: 'D1', docTitle: 'Study report', activeSectionCode: code, dirty: false, onNav: vi.fn(), fireToast,
  };
  return lane === 'vault' ? <VaultPlaceIntoSubmission {...vaultProps} /> : <AuthoringPlaceIntoFiling {...authoringProps} />;
}
async function open(lane: Lane, code?: string) {
  const view = render(seam(lane, code));
  if (lane === 'authoring') fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
  await screen.findByRole('option', { name: /Trial filing/ });
  fireEvent.change(screen.getByLabelText('Target submission'), { target: { value: '9' } });
  await screen.findByRole('option', { name: /0000/ });
  fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '31' } });
  fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: REASON } });
  return view;
}
function placeButton(lane: Lane) {
  return within(screen.getByRole('dialog')).getByRole('button', { name: lane === 'vault' ? 'Place into filing' : /Place leaf in the sequence/ });
}
function values(studyId = VALUES.studyId, stfFileTag = VALUES.stfFileTag) {
  fireEvent.change(screen.getByLabelText(/^Study id/), { target: { value: studyId } });
  fireEvent.change(screen.getByLabelText(/^STF file-tag/), { target: { value: stfFileTag } });
}
beforeEach(() => {
  authService.setToken('study-placement-user-a', { id: '7', organizationId: '1' }, 'study-placement-refresh', 3600);
  region = 'fda'; putResponse = null; snapshotResponse = null; sequencesResponse = null; sectionsResponse = null;
  onPlaced.mockClear(); fireToast.mockClear();
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, body = {}) => route(method, url, body));
});
afterEach(() => { cleanup(); authService.endSession(null); delete window.C2C_PROJECT; });

describe.each(['vault', 'authoring'] as const)('%s placement study input gates', lane => {
  it('requires both human values before any saved-content read, copy or leaf write', async () => {
    await open(lane); expect(placeButton(lane)).toHaveProperty('disabled', true);
    fireEvent.click(placeButton(lane));
    expect(apiRequest.mock.calls.some(call => call[1].endsWith('/sections'))).toBe(false);
    expect(posts()).toHaveLength(0); expect(puts()).toHaveLength(0);
    values('STUDY-101', ''); fireEvent.click(placeButton(lane));
    expect(posts()).toHaveLength(0); expect(puts()).toHaveLength(0);
  });
  it('rejects an invalid study filename before any copy or write', async () => {
    await open(lane); values('../unsafe-study'); fireEvent.click(placeButton(lane));
    expect(placeButton(lane)).toHaveProperty('disabled', true);
    expect(posts()).toHaveLength(0); expect(puts()).toHaveLength(0);
    expect(apiRequest.mock.calls.some(call => call[1].endsWith('/sections'))).toBe(false);
  });
  it('resets manual study values when the target sequence changes', async () => {
    await open(lane); values();
    fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '32' } });
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/^STF file-tag/)).toHaveProperty('value', '');
    expect(placeButton(lane)).toHaveProperty('disabled', true); expect(puts()).toHaveLength(0);
  });
  it('resets manual study values when the canonical section changes', async () => {
    await open(lane); values();
    fireEvent.change(screen.getByLabelText(/Section code/), { target: { value: '5.3.5.2' } });
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/^STF file-tag/)).toHaveProperty('value', '');
    expect(puts()).toHaveLength(0);
  });
  it('resets manual study values when the target submission changes', async () => {
    await open(lane); values();
    fireEvent.change(screen.getByLabelText('Target submission'), { target: { value: '' } });
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/^STF file-tag/)).toHaveProperty('value', '');
    expect(puts()).toHaveLength(0);
  });
  it('resets manual study values when the source canonical section changes', async () => {
    const view = await open(lane); values(); view.rerender(seam(lane, '5.3.5.2'));
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/^STF file-tag/)).toHaveProperty('value', '');
    expect(puts()).toHaveLength(0);
  });
  it('keeps exempt placements free of hidden study metadata', async () => {
    await open(lane, '5.3.6'); expect(screen.queryByLabelText(/^Study id/)).toBeNull();
    fireEvent.click(placeButton(lane)); await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][2]).not.toHaveProperty('studyId'); expect(puts()[0][2]).not.toHaveProperty('stfFileTag');
  });
  it('preserves other regions advisory placement with an empty metadata pair', async () => {
    region = 'eu'; await open(lane); expect(placeButton(lane)).toHaveProperty('disabled', false);
    fireEvent.click(placeButton(lane)); await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][2]).not.toHaveProperty('studyId');
  });
  it('omits previously entered metadata when placing a Delete leaf', async () => {
    await open(lane); fireEvent.change(screen.getByLabelText('Sequence'), { target: { value: '32' } }); values();
    fireEvent.change(screen.getByLabelText('Lifecycle operation'), { target: { value: 'delete' } });
    expect(screen.queryByLabelText(/^Study id/)).toBeNull();
    fireEvent.click(placeButton(lane)); await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][2]).toMatchObject({ lifecycleOp: 'delete' });
    expect(puts()[0][2]).not.toHaveProperty('studyId'); expect(puts()[0][2]).not.toHaveProperty('stfFileTag');
  });
});

describe.each(['vault', 'authoring'] as const)('%s exact study placement receipt', lane => {
  it('sends the exact human values through the existing source chain and confirms them', async () => {
    await open(lane); values(' STUDY-101 ', ' human-reviewed-tag '); fireEvent.click(placeButton(lane));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0][2]).toMatchObject({ ...VALUES, sectionCode: '5.3.5.1', reason: REASON,
      documentTable: lane === 'vault' ? 'vault_documents' : 'coauthor_documents',
    });
    expect(posts()).toHaveLength(lane === 'vault' ? 0 : 1);
    expect(await screen.findByRole('button', { name: 'Open in Submission Center' })).toBeTruthy();
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('disabled', true);
  });
  it.each(['mismatch', 'missing', '204'] as const)('holds an unconfirmed %s receipt with no replay', async kind => {
    putResponse = body => {
      if (kind === '204') return new Response(null, { status: 204 });
      const receipt = { ...body, id: 69, sequenceId: 31, studyId: kind === 'mismatch' ? 'OTHER-STUDY' : undefined };
      return response(receipt);
    };
    await open(lane); values(); fireEvent.click(placeButton(lane));
    expect(await screen.findByText(/cannot confirm whether/i)).toBeTruthy();
    expect(placeButton(lane)).toHaveProperty('disabled', true);
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', VALUES.studyId);
    fireEvent.click(placeButton(lane)); expect(puts()).toHaveLength(1);
    expect(posts()).toHaveLength(lane === 'vault' ? 0 : 1);
    expect(screen.queryByRole('button', { name: 'Open in Submission Center' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check filing status' })).toBeTruthy();
  });
});

describe.each(['vault', 'authoring'] as const)('%s delayed automatic target selection', lane => {
  it('resets manual study values entered before the singleton sequence response arrives', async () => {
    let finish!: (reply: Response) => void;
    sequencesResponse = new Promise<Response>(resolve => { finish = resolve; });
    render(seam(lane));
    if (lane === 'authoring') fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
    await screen.findByRole('option', { name: /Trial filing/ });
    fireEvent.change(screen.getByLabelText('Target submission'), { target: { value: '9' } }); values();
    finish(response([{ id: 31, sequenceNumber: '0000', type: 'original', status: 'draft', region }]));
    await screen.findByRole('option', { name: /0000/ });
    expect(screen.getByLabelText('Sequence')).toHaveProperty('value', '31');
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', '');
    expect(screen.getByLabelText(/^STF file-tag/)).toHaveProperty('value', '');
    expect(posts()).toHaveLength(0); expect(puts()).toHaveLength(0);
  });
});

describe('authoring snapshot outcome reconciliation', () => {
  it('holds a bodyless snapshot204 response without requesting a leaf or replaying the copy', async () => {
    snapshotResponse = new Response(null, { status: 204 });
    await open('authoring'); values(); fireEvent.click(placeButton('authoring'));
    await screen.findByText(/filing snapshot could not/i);
    expect(posts()).toHaveLength(1); expect(puts()).toHaveLength(0);
    expect(placeButton('authoring')).toHaveProperty('disabled', true);
    fireEvent.click(placeButton('authoring')); expect(posts()).toHaveLength(1);
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', VALUES.studyId);
    expect(screen.getByRole('button', { name: 'Check filing status' })).toBeTruthy();
  });
  it('keeps an unknown placement held across closing and reopening the same document dialog', async () => {
    putResponse = () => new Response(null, { status: 204 });
    await open('authoring'); values(); fireEvent.click(placeButton('authoring'));
    await screen.findByText(/cannot confirm whether/i);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Place into filing' }));
    expect(screen.getByRole('button', { name: 'Check filing status' })).toBeTruthy();
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', VALUES.studyId);
    expect(screen.getByLabelText('Sequence')).toHaveProperty('value', '31');
    expect(placeButton('authoring')).toHaveProperty('disabled', true);
    fireEvent.click(placeButton('authoring')); expect(posts()).toHaveLength(1); expect(puts()).toHaveLength(1);
  });
});

describe('placement chains belong to their initiating session', () => {
  const changeActor = () => act(() => authService.setToken('study-placement-user-b', { id: '8', organizationId: '1' }, 'study-placement-refresh-b', 3600));
  async function finishRead(finish: (reply: Response) => void, reply: Response) {
    await act(async () => { finish(reply); await new Promise(resolve => setTimeout(resolve, 0)); });
  }
  it('stops Authoring before any copy or PUT when session changes during the saved-sections read', async () => {
    let finish!: (reply: Response) => void; sectionsResponse = new Promise<Response>(resolve => { finish = resolve; });
    await open('authoring'); values(); fireEvent.click(placeButton('authoring'));
    await waitFor(() => expect(apiRequest.mock.calls.some(call => call[1].endsWith('/sections'))).toBe(true));
    changeActor();
    await finishRead(finish, response({ sections: [{ code: '5.3.5.1', title: 'Report', content: 'Saved report content.' }] }));
    expect(posts()).toHaveLength(0); expect(puts()).toHaveLength(0); expect(fireToast).not.toHaveBeenCalled();
  });
  it('stops Authoring before the leaf PUT when session changes during snapshot creation', async () => {
    let finish!: (reply: Response) => void; snapshotResponse = new Promise<Response>(resolve => { finish = resolve; });
    await open('authoring'); values(); fireEvent.click(placeButton('authoring'));
    await waitFor(() => expect(posts()).toHaveLength(1)); changeActor();
    await finishRead(finish, response({ success: true, document: { id: 52, metadata: { source: 'authoring-document', docId: 'D1' } } }));
    expect(puts()).toHaveLength(0); expect(fireToast).not.toHaveBeenCalled();
  });
  it('discards a late Vault receipt after the actor revision changes', async () => {
    let finish!: (reply: Response) => void; const pending = new Promise<Response>(resolve => { finish = resolve; });
    putResponse = () => pending; await open('vault'); values(); fireEvent.click(placeButton('vault'));
    await waitFor(() => expect(puts()).toHaveLength(1)); changeActor();
    await finishRead(finish, response({ ...puts()[0][2], id: 69, sequenceId: 31, auditTrail: { persisted: true, chained: true } }));
    expect(onPlaced).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open in Submission Center' })).toBeNull();
    expect(screen.getByLabelText(/^Study id/)).toHaveProperty('value', '');
  });
});
