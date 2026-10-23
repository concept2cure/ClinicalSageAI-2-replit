// @vitest-environment jsdom
/** The mounted official exporter reaches the existing authorized Vault picker. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { ATTACHMENT_MANIFEST_SEED } from '@shared/regulatory/estar-attachment-manifest';
import { OfficialEstarPanel, officialEstarVariantFor, type OfficialEstarPanelProps } from '../OfficialEstarPanel';
import type { OfficialEstarType, OfficialEstarVariant } from '../../hooks/useEstarOfficialFields';
import { downloadBase64 } from '../../../v2/download';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../../v2/download', async original => ({ ...(await original<typeof import('../../../v2/download')>()), downloadBase64: vi.fn(() => true) }));

const PROGRAM = { id: '11111111-1111-4111-8111-111111111111', code: 'DX-101', title: 'Diagnostic program' };
const OTHER = { id: '22222222-2222-4222-8222-222222222222', title: 'Another program' };
const DOC = '33333333-3333-4333-8333-333333333333';
const NEXT = '44444444-4444-4444-8444-444444444444';
const SHA = 'a'.repeat(64);
const COVER = 'root.CoverLetter.CLAddAttachment110';
const CLINICAL = 'root.ClinicalStudies.AddAttachment';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const catalog = (type = '510k', variant = 'device') => ({ descriptorId: `${type}-${variant}`, type, variant, templateVersion: '6.1', slots: [
  { somPath: COVER, field: 'CLAddAttachment110', description: 'Administrative Documentation | Cover Letter', chapters: ['/CHAPTER 1/CH1.01/'], singleAttachment: 'Only a single cover letter is needed.' },
  { somPath: CLINICAL, field: 'AddAttachment', description: 'Clinical evidence', chapters: ['/CHAPTER 3/CH3.01/'], singleAttachment: null },
] });
const searchPage = (offset = 0, changes: Record<string, unknown> = {}) => ({ data: { query: 'summary', total: 26, limit: 25, offset, results: [{
  id: offset ? NEXT : DOC, title: offset ? 'Later evidence' : 'Approved clinical summary', version: '2.0', current: true,
  contentHash: SHA, snippet: null, ...changes,
}] } });
type Posted = { attachments?: Array<{ slot: string; source: { kind: string; documentId: string } }> };
const exported = (body: Posted, extra: Record<string, unknown> = {}) => json({ governed: true, officialEstarPdf: true, erasedFields: [],
  downloadable_output_ref: { encoding: 'base64', mime_type: 'application/pdf', filename: 'official.pdf', data: 'JVBERi0=' },
  ...(body.attachments?.length ? { attachmentReport: { requested: body.attachments.length,
    attached: body.attachments.map(a => ({ ...a, fileName: 'Clinical-summary.pdf', sha256: SHA, byteLength: 128, chapter: a.slot === COVER ? '/CHAPTER 1/CH1.01/' : '/CHAPTER 3/CH3.01/' })),
    refused: [], manifest: ATTACHMENT_MANIFEST_SEED + body.attachments.map(a => `<<Clinical-summary.pdf|${a.slot === COVER ? '/CHAPTER 1/CH1.01/' : '/CHAPTER 3/CH3.01/'}>>`).join('') } } : {}), ...extra,
});
const deferred = () => { let resolve!: (r: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; };
let slotReply: (type: string, variant: string) => Response | Promise<Response>;
let searchReply: (path: string) => Response | Promise<Response>;
let postReply: (body: Posted) => Response | Promise<Response>;
let posted: Posted[];

beforeEach(() => {
  authService.setToken('fixture-estar-author', { id: '7', organizationId: '1' }, 'fixture-estar-refresh', 3600);
  vi.mocked(downloadBase64).mockClear(); posted = [];
  slotReply = (type, variant) => json(catalog(type, variant));
  searchReply = path => json(searchPage(Number(new URL(path, 'https://fixture.invalid').searchParams.get('offset') ?? 0)));
  postReply = body => exported(body);
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    const url = new URL(path, 'https://fixture.invalid');
    if (url.pathname.endsWith('/attachment-slots')) return slotReply(url.searchParams.get('type')!, url.searchParams.get('variant')!);
    if (url.pathname === `/api/c2c/project-vault/${PROGRAM.id}/search` || url.pathname === `/api/c2c/project-vault/${OTHER.id}/search`) return searchReply(path);
    throw new Error(`Unexpected fixture request ${path}`);
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: { method?: string; body?: string }) => {
    const url = new URL(String(input), 'https://fixture.invalid');
    if (url.pathname.endsWith('/readiness')) return json({ ready: true, templateAvailable: true, fieldMapPopulated: true, blockers: [] });
    if (url.pathname.endsWith('/official-fields')) return json({ descriptorId: 'official', type: url.searchParams.get('type'), variant: url.searchParams.get('variant'), mappedCount: 0, sourcedCount: 0, fields: [] });
    if (url.pathname.endsWith('/official') && init?.method === 'POST') { const body = JSON.parse(String(init.body)) as Posted; posted.push(body); return postReply(body); }
    return json({});
  }));
});
afterEach(() => { cleanup(); authService.endSession(null); vi.unstubAllGlobals(); });
const props = (): OfficialEstarPanelProps => ({ program: PROGRAM, variant: 'device', type: '510k' });
const generate = () => screen.getByRole('button', { name: /Generate official eSTAR/ });
const add = () => fireEvent.click(screen.getByRole('button', { name: 'Add Vault attachment' }));
const row = (n = 1) => screen.getByRole('group', { name: `Attachment ${n}` });
async function ready(p = props()) { const view = render(<OfficialEstarPanel {...p} />); await waitFor(() => expect(generate()).toHaveProperty('disabled', false)); return view; }
async function choose(n = 1, slot = COVER) {
  const group = within(row(n));
  fireEvent.change(await group.findByLabelText('FDA destination'), { target: { value: slot } });
  fireEvent.change(group.getByLabelText("Search this project's Vault"), { target: { value: 'summary' } });
  fireEvent.click(group.getByRole('button', { name: 'Search Vault' }));
  fireEvent.click(await group.findByRole('button', { name: 'Select document' }));
}

describe('optional explicit official eSTAR attachments', () => {
  it('starts with no attachment rows or metadata/source reads, and retains export without attachments', async () => {
    await ready(); expect(screen.queryByRole('group', { name: 'Attachment 1' })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled(); fireEvent.click(generate());
    await waitFor(() => expect(posted).toHaveLength(1)); expect(posted[0]).not.toHaveProperty('attachments');
  });
  it('blocks an incomplete row while destinations load, and removal restores export without attachments', async () => {
    const pending = deferred(); slotReply = () => pending.promise;
    await ready(); add(); expect(generate()).toHaveProperty('disabled', true);
    expect(await screen.findByText('Reading FDA attachment destinations…')).toBeTruthy();
    fireEvent.click(within(row()).getByRole('button', { name: 'Remove attachment' }));
    expect(generate()).toHaveProperty('disabled', false);
    await act(async () => { pending.resolve(json(catalog())); });
    expect(screen.queryByRole('group', { name: 'Attachment 1' })).toBeNull();
  });
  it.each([['510k', 'device'], ['de_novo', 'ivd'], ['pma', 'ivd']] as const)('selects exact program-scoped versions and posts explicit destinations for %s/%s', async (type, variant) => {
    await ready({ ...props(), type, variant }); add(); await choose();
    expect(row().textContent).toContain('2.0'); expect(row().textContent).toContain(SHA);
    await waitFor(() => expect(generate()).toHaveProperty('disabled', false)); fireEvent.click(generate());
    await screen.findByTestId('official-estar-attachment-receipts');
    expect(posted[0].attachments).toEqual([{ slot: COVER, source: { kind: 'vault_document', documentId: DOC } }]);
    expect(JSON.stringify(posted[0])).not.toContain('expectedSha256');
    expect(screen.getByTestId('official-estar-attachment-receipts').textContent).toContain('Clinical-summary.pdf');
    expect(screen.getByTestId('official-estar-attachment-receipts').textContent).toContain('/CHAPTER 1/CH1.01/');
    expect(screen.getByTestId('official-estar-attachment-receipts').textContent).toContain(SHA);
    expect(screen.getByTestId('official-estar-attachment-receipts').textContent).toContain(DOC);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PROGRAM.id}/search?q=summary&limit=25`);
    expect(vi.mocked(downloadBase64)).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['companion diagnostic', 'cdx', 'ivd'],
    ['case-varied companion diagnostic', 'CDx', 'ivd'],
    ['complementary diagnostic', 'ivd', 'ivd'],
    ['software as a medical device', 'SaMD', 'device'],
    ['medical device', 'device', 'device'],
  ] as const)('carries the %s product family through destination reads and the official export', async (_label, productType, variant) => {
    const program = { ...PROGRAM, productType };
    await ready({ ...props(), program, variant: officialEstarVariantFor(program) });
    add(); await choose();
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/510k/estar/attachment-slots?type=510k&variant=${variant}`);
    fireEvent.click(generate());
    await screen.findByTestId('official-estar-attachment-receipts');
    expect(posted[0]).toMatchObject({ variant, attachments: [{ slot: COVER, source: { kind: 'vault_document', documentId: DOC } }] });
    expect(vi.mocked(downloadBase64)).toHaveBeenCalledTimes(1);
  });
  it('uses the existing picker pages instead of hiding matches after the first page', async () => {
    await ready(); add(); const group = within(row());
    fireEvent.change(await group.findByLabelText('FDA destination'), { target: { value: CLINICAL } });
    fireEvent.change(group.getByLabelText("Search this project's Vault"), { target: { value: 'summary' } });
    fireEvent.click(group.getByRole('button', { name: 'Search Vault' }));
    await group.findByText('Approved clinical summary'); fireEvent.click(group.getByRole('button', { name: 'Next Vault results' }));
    await group.findByText('Later evidence'); fireEvent.click(group.getByRole('button', { name: 'Select document' }));
    await waitFor(() => expect(generate()).toHaveProperty('disabled', false)); fireEvent.click(generate());
    await waitFor(() => expect(posted[0]?.attachments?.[0].source.documentId).toBe(NEXT));
  });
  it('blocks duplicate single-file destinations and preserves a deliberate change or removal', async () => {
    await ready(); add(); await choose(); add(); await choose(2);
    expect(generate()).toHaveProperty('disabled', true); expect(screen.getByTestId('official-estar-attachments').textContent).toContain('Only a single cover letter is needed.');
    fireEvent.change(within(row(2)).getByLabelText('FDA destination'), { target: { value: CLINICAL } });
    expect(generate()).toHaveProperty('disabled', false);
    fireEvent.click(within(row(2)).getByRole('button', { name: 'Remove attachment' }));
    expect(generate()).toHaveProperty('disabled', false);
    fireEvent.click(within(row()).getByRole('button', { name: 'Change document' })); expect(generate()).toHaveProperty('disabled', true);
  });
  it('caps even queued Add activations at the server’s 150-assignment limit', async () => {
    await ready(); const button = screen.getByRole('button', { name: 'Add Vault attachment' });
    act(() => { for (let index = 0; index < 155; index += 1) fireEvent.click(button); });
    expect(screen.getAllByRole('group', { name: /^Attachment \d+$/ })).toHaveLength(150);
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByText(/Up to 150 Vault attachments/)).toBeTruthy();
  });
});

describe('attachment source and catalog refusals', () => {
  it('rejects a selectable Vault result without a recorded hash', async () => {
    searchReply = () => json(searchPage(0, { contentHash: null })); await ready(); add(); await choose();
    expect(await screen.findByText(/Choose a current Vault version with a valid document id and recorded SHA-256/)).toBeTruthy();
    expect(generate()).toHaveProperty('disabled', true); expect(posted).toHaveLength(0);
  });
  it('keeps earlier versions unavailable in the reused picker', async () => {
    searchReply = () => json(searchPage(0, { current: false })); await ready(); add(); const group = within(row());
    fireEvent.change(group.getByLabelText("Search this project's Vault"), { target: { value: 'summary' } });
    fireEvent.click(group.getByRole('button', { name: 'Search Vault' }));
    expect(await group.findByRole('button', { name: 'Select document' })).toHaveProperty('disabled', true);
    expect(generate()).toHaveProperty('disabled', true);
  });
  it.each(['wrong type', 'wrong variant', 'missing template version', 'duplicate slot'] as const)('rejects a successful catalog with %s instead of offering unverified destinations', async kind => {
    const body = catalog();
    slotReply = () => json(kind === 'wrong type' ? { ...body, type: 'pma' } : kind === 'wrong variant' ? { ...body, variant: 'ivd' }
      : kind === 'missing template version' ? { ...body, templateVersion: null } : { ...body, slots: [body.slots[0], body.slots[0]] });
    await ready(); add(); await screen.findByRole('button', { name: 'Retry attachment destinations' });
    expect(generate()).toHaveProperty('disabled', true); expect(screen.queryByRole('option', { name: /Cover Letter/ })).toBeNull();
  });
  it('retries a failed slot read without discarding the row or treating failure as empty', async () => {
    slotReply = () => json({ message: 'Template metadata unavailable.' }, 503); await ready(); add();
    await screen.findByRole('button', { name: 'Retry attachment destinations' });
    slotReply = (type, variant) => json(catalog(type, variant));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry attachment destinations' }));
    await within(row()).findByRole('option', { name: /Cover Letter/ }); expect(generate()).toHaveProperty('disabled', true);
  });
  it('describes a verified catalog with no destinations and permits removing the optional row', async () => {
    slotReply = () => json({ ...catalog(), slots: [] }); await ready(); add();
    await screen.findByText(/This template has no attachment destinations/);
    expect(generate()).toHaveProperty('disabled', true);
    fireEvent.click(within(row()).getByRole('button', { name: 'Remove attachment' }));
    expect(generate()).toHaveProperty('disabled', false);
  });
  it('renders actual server refusal reasons and keeps the chosen version reviewable', async () => {
    postReply = () => json({ error: 'ESTAR_NOT_PRODUCIBLE', blockers: ['The selected version is no longer current.'], attachmentReport: {
      requested: 1, attached: [], refused: [{ slot: COVER, reasons: ['The selected version is no longer current.'] }], manifest: null,
    } }, 422);
    await ready(); add(); await choose(); fireEvent.click(generate());
    const refused = await screen.findByTestId('official-estar-attachment-refusals');
    expect(refused.textContent).toContain('The selected version is no longer current.');
    expect(row().textContent).toContain('Approved clinical summary'); expect(vi.mocked(downloadBase64)).not.toHaveBeenCalled();
  });
});

describe('attachment request ownership', () => {
  it.each(['program', 'pathway', 'variant', 'session'] as const)('resets selected rows when the %s changes', async change => {
    const view = await ready(); add(); await choose();
    if (change === 'session') act(() => { authService.setToken('fixture-other-author', { id: '8', organizationId: '1' }, 'fixture-other-refresh', 3600); });
    else view.rerender(<OfficialEstarPanel {...props()} program={change === 'program' ? OTHER : PROGRAM}
      type={(change === 'pathway' ? 'pma' : '510k') as OfficialEstarType} variant={(change === 'variant' ? 'ivd' : 'device') as OfficialEstarVariant} />);
    expect(screen.queryByRole('group', { name: 'Attachment 1' })).toBeNull();
    expect(screen.queryByText('Approved clinical summary')).toBeNull();
  });
  it('disables assignment edits while an attachment-bearing export is pending', async () => {
    const pending = deferred(); postReply = () => pending.promise;
    await ready(); add(); await choose(); fireEvent.click(generate());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(within(row()).getByLabelText('FDA destination')).toHaveProperty('disabled', true);
    expect(within(row()).getByRole('button', { name: 'Change document' })).toHaveProperty('disabled', true);
    expect(within(row()).getByRole('button', { name: 'Remove attachment' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add Vault attachment' })).toHaveProperty('disabled', true);
    await act(async () => { pending.resolve(exported(posted[0])); });
  });
  it('does not expose attachment controls for PreSTAR preparation', async () => {
    render(<OfficialEstarPanel {...props()} type="q_sub" />);
    await screen.findByRole('button', { name: /Prepare PreSTAR fields/ });
    expect(screen.queryByRole('button', { name: 'Add Vault attachment' })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
