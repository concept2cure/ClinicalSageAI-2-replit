// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn(), revision: 0, listeners: new Set<() => void>() }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: api.request, apiUpload: api.upload }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => ({ id: 7, organizationId: 1 }),
  captureSessionReadGuard: () => { const revision = api.revision; return { sameRevision: () => revision === api.revision }; },
  on: (_event: string, listener: () => void) => { api.listeners.add(listener); return () => api.listeners.delete(listener); },
} }));
import { IndFormsPanel } from '../surfaces/IndFormsPanel';
import { publishShellProject } from '../shellProject';

const ID = '709edd20-9af6-41e7-a206-c00ecb4671b9';
const OTHER = '709edd20-9af6-41e7-a206-c00ecb4671ba';
const SID = '819edd20-9af6-41e7-a206-c00ecb4671b9';
const VERSION = '2026-10-21T15:20:03.123456Z';
const NEXT = '2026-10-21T15:20:04.123456Z';
const AUDIT = { persisted: true, chained: true };
const SPONSOR = { id: SID, name: 'Recorded test sponsor', duns: '123456789', contactName: 'Test contact', contactPhone: '+1 212 555 0100', contactEmail: 'contact@example.test', signatoryName: null as string | null, signatoryTitle: null as string | null, revision: VERSION };
const PROGRAM = {
  id: ID, code: 'TEST-IND', name: 'Recorded test program', programType: 'IND', primaryAgency: 'FDA',
  sponsorName: 'Recorded organization', productName: 'Recorded test product', indication: 'Test indication',
  applicationNumber: null as string | null, sponsorAddress: null as string | null, indType: null as string | null,
  applicantSponsorId: null as string | null, boundSponsor: null as typeof SPONSOR | null, factsVersion: VERSION, formMetadata: {},
};
let program = { ...PROGRAM };
let sponsors = [SPONSOR];
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body }) as Response;
const listing = () => ({ forms: ['FDA_1571'], formDefinitions: [{ formId: 'FDA_1571', fields: [{ id: 'ind_type', options: ['Commercial IND', 'Research IND'] }] }], renderPlans: [], placements: [], program });
function mockReads() {
  api.request.mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && path.startsWith('/api/ind-forms/?')) return response(listing());
    if (method === 'GET' && path === '/api/ind-master-data/sponsors') return response(sponsors);
    if (method === 'PUT' && path === '/api/ind-forms/program-facts') {
      program = { ...program, ...body, boundSponsor: sponsors.find(row => row.id === body?.applicantSponsorId) ?? null, sponsorName: sponsors.find(row => row.id === body?.applicantSponsorId)?.name ?? program.sponsorName, factsVersion: NEXT } as typeof program;
      return response({ ...program, programId: program.id, auditTrail: AUDIT });
    }
    return response([]);
  });
}
async function open(note = vi.fn()) {
  render(<IndFormsPanel note={note} />);
  await screen.findByLabelText('Agency application number');
  return note;
}
function editFacts() {
  fireEvent.change(screen.getByLabelText('Agency application number'), { target: { value: '000512' } });
  fireEvent.change(screen.getByLabelText('Reason for project facts change'), { target: { value: 'Record confirmed applicant facts' } });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  api.request.mockReset(); api.upload.mockReset(); api.revision = 0;
  program = { ...PROGRAM }; sponsors = [{ ...SPONSOR }];
  publishShellProject({ id: ID }); mockReads();
});
afterEach(() => { cleanup(); delete window.C2C_PROJECT; });

describe('recorded applicant facts in the existing forms panel', () => {
  it('requires a reason and binds the explicit sponsor with the exact program revision', async () => {
    const note = await open();
    fireEvent.change(screen.getByLabelText('Agency application number'), { target: { value: '000512' } });
    expect((screen.getByRole('button', { name: 'Save to project' }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.change(screen.getByLabelText('Applicant sponsor record'), { target: { value: SID } });
    fireEvent.change(screen.getByLabelText('Reason for project facts change'), { target: { value: 'Record confirmed applicant facts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('PUT', '/api/ind-forms/program-facts', {
      projectIdent: ID, expectedFactsVersion: VERSION, reason: 'Record confirmed applicant facts', applicationNumber: '000512', applicantSponsorId: SID, sponsorAddress: null, indType: null,
    }));
    await waitFor(() => expect(note).toHaveBeenCalledWith(expect.stringMatching(/Project facts saved/)));
  });

  it.each([204, 200])('an HTTP %s answer without a matching receipt holds further saves', async status => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PUT' ? Promise.resolve(response(status === 204 ? null : { programId: OTHER }, status)) : base(method, path, body));
    const note = await open(); editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await screen.findByText(/could not confirm whether the project facts were saved/i);
    expect((screen.getByRole('button', { name: 'Save to project' }) as HTMLButtonElement).disabled).toBe(true);
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/Project facts saved/));
    expect(screen.getByRole('button', { name: 'Reload recorded project facts' })).toBeTruthy();
  });

  it('says when a confirmed program save has no retrievable audit entry', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation(async (method, path, body) => {
      const res = await base(method, path, body);
      if (method === 'PUT') return response({ ...(await res.json()), auditTrail: { persisted: true, chained: false } });
      return res;
    });
    await open(); editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await screen.findByText(/audit entry is not confirmed in retrievable history/i);
  });

  it('shows a failed registry read instead of an empty sponsor selector', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => path === '/api/ind-master-data/sponsors' ? Promise.reject(new Error('connection lost')) : base(method, path, body));
    await open();
    await screen.findByText(/Sponsor records could not be read/i);
    expect(screen.queryByText('No sponsor records have been recorded.')).toBeNull();
  });

  it('creates an existing-registry record without silently binding it to the program', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' && path === '/api/ind-master-data/sponsors'
      ? Promise.resolve(response({ ...SPONSOR, ...body, revision: NEXT, auditTrail: AUDIT }, 201)) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.click(screen.getByRole('button', { name: 'Record a sponsor' }));
    const editor = screen.getByRole('group', { name: 'Sponsor registry record' });
    fireEvent.change(within(editor).getByLabelText('Sponsor legal name'), { target: { value: SPONSOR.name } });
    fireEvent.change(within(editor).getByLabelText('DUNS number'), { target: { value: SPONSOR.duns } });
    fireEvent.change(within(editor).getByLabelText('Regulatory contact name'), { target: { value: SPONSOR.contactName } });
    fireEvent.change(within(editor).getByLabelText('Regulatory contact telephone'), { target: { value: SPONSOR.contactPhone } });
    fireEvent.change(within(editor).getByLabelText('Regulatory contact email'), { target: { value: SPONSOR.contactEmail } });
    fireEvent.change(within(editor).getByLabelText('Authorized representative name'), { target: { value: 'Recorded test representative' } });
    fireEvent.change(within(editor).getByLabelText('Authorized representative title'), { target: { value: 'Authorized officer' } });
    fireEvent.change(within(editor).getByLabelText('Reason for sponsor record change'), { target: { value: 'Record verified sponsor identity' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save sponsor record' }));
    await screen.findByText(/Sponsor record saved.*not bound to this project/i);
    expect(api.request).toHaveBeenCalledWith('POST', '/api/ind-master-data/sponsors', expect.objectContaining({ signatoryName: 'Recorded test representative', signatoryTitle: 'Authorized officer' }));
    expect(api.request.mock.calls.filter(c => c[0] === 'PUT')).toHaveLength(0);
    expect((screen.getByLabelText('Applicant sponsor record') as HTMLSelectElement).value).toBe('');
  });

  it('sends a versioned shared registry edit and reports its audit uncertainty', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PATCH'
      ? Promise.resolve(response({ ...SPONSOR, ...body, revision: NEXT, auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } })) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.change(screen.getByLabelText('Applicant sponsor record'), { target: { value: SID } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected sponsor' }));
    expect(screen.getByText(/Every project bound to this sponsor uses changes/i)).toBeTruthy();
    const editor = screen.getByRole('group', { name: 'Sponsor registry record' });
    fireEvent.change(within(editor).getByLabelText('Regulatory contact name'), { target: { value: 'Changed test contact' } });
    fireEvent.change(within(editor).getByLabelText('Authorized representative name'), { target: { value: 'Updated test representative' } });
    fireEvent.change(within(editor).getByLabelText('Authorized representative title'), { target: { value: 'Regulatory director' } });
    fireEvent.change(within(editor).getByLabelText('Reason for sponsor record change'), { target: { value: 'Update the confirmed contact' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save sponsor record' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('PATCH', `/api/ind-master-data/sponsors/${SID}`, expect.objectContaining({ expectedRevision: VERSION, reason: 'Update the confirmed contact', contactName: 'Changed test contact', signatoryName: 'Updated test representative', signatoryTitle: 'Regulatory director' })));
    await screen.findByText(/sponsor record was saved.*audit entry could not be confirmed/i);
  });

  it('does not publish an old program write receipt after an A to B to A visit', async () => {
    const pending = deferred<Response>();
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PUT' ? pending.promise : base(method, path, body));
    const note = await open(); editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await waitFor(() => expect(api.request.mock.calls.some(c => c[0] === 'PUT')).toBe(true));
    act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: ID }); });
    await act(async () => { pending.resolve(response({ ...program, applicationNumber: '000512', factsVersion: NEXT, programId: ID, auditTrail: AUDIT })); });
    expect(note).not.toHaveBeenCalled();
  });
});

describe('recorded applicant read ownership and reconciliation', () => {
  it('distinguishes an empty registry from malformed records', async () => {
    sponsors = [];
    await open();
    await screen.findByText('No sponsor records have been recorded.');
    expect((screen.getByRole('button', { name: 'Record a sponsor' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('refuses malformed registry records without offering them', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => path === '/api/ind-master-data/sponsors' ? Promise.resolve(response([{ ...SPONSOR, revision: null }])) : base(method, path, body));
    await open();
    await screen.findByText(/Sponsor records could not be read/i);
    expect((screen.getByRole('button', { name: 'Record a sponsor' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['unchanged revision', 'inconsistent sponsor name'])('holds an otherwise successful program receipt with %s', async fault => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation(async (method, path, body) => {
      const res = await base(method, path, body);
      if (method !== 'PUT') return res;
      const row = await res.json();
      return response(fault === 'unchanged revision' ? { ...row, factsVersion: VERSION } : { ...row, applicantSponsorId: SID, boundSponsor: SPONSOR, sponsorName: 'A different applicant' });
    });
    await open(); editFacts();
    if (fault === 'inconsistent sponsor name') {
      await screen.findByRole('option', { name: /Recorded test sponsor/ });
      fireEvent.change(screen.getByLabelText('Applicant sponsor record'), { target: { value: SID } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await screen.findByText(/could not confirm whether the project facts were saved/i);
    expect((screen.getByRole('button', { name: 'Save to project' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('requires explicit successful read reconciliation after a lost program write answer', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PUT' ? Promise.reject(new Error('lost answer')) : base(method, path, body));
    await open(); editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await screen.findByText(/could not confirm whether the project facts were saved/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reload recorded project facts' }));
    await screen.findByText(/Recorded project facts reloaded/i);
    expect((screen.getByLabelText('Agency application number') as HTMLInputElement).value).toBe('');
    expect(api.request.mock.calls.filter(c => c[0] === 'PUT')).toHaveLength(1);
  });

  it('keeps an uncertain sponsor write held after closing its editor until the registry is explicitly read', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' ? Promise.resolve(response(null, 204)) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.click(screen.getByRole('button', { name: 'Record a sponsor' }));
    fireEvent.change(screen.getByLabelText('Sponsor legal name'), { target: { value: 'An unconfirmed test sponsor' } });
    fireEvent.change(screen.getByLabelText('Reason for sponsor record change'), { target: { value: 'Record verified sponsor identity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sponsor record' }));
    await screen.findByText(/could not confirm whether the sponsor record was saved/i);
    fireEvent.click(screen.getByRole('button', { name: 'Close sponsor editor' }));
    expect((screen.getByRole('button', { name: 'Record a sponsor' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload sponsor records' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Record a sponsor' }) as HTMLButtonElement).disabled).toBe(false));
    expect(api.request.mock.calls.filter(c => c[0] === 'POST')).toHaveLength(1);
  });

  it('does not publish an old program listing after opening another program', async () => {
    const pending = deferred<Response>();
    api.request.mockImplementation((method, path) => {
      if (method === 'GET' && path === `/api/ind-forms/?projectIdent=${ID}`) return pending.promise;
      if (method === 'GET' && path === `/api/ind-forms/?projectIdent=${OTHER}`) return Promise.resolve(response({ ...listing(), program: { ...program, id: OTHER, code: 'OTHER-IND', productName: 'Other recorded product' } }));
      return Promise.resolve(response([]));
    });
    render(<IndFormsPanel note={vi.fn()} />);
    act(() => publishShellProject({ id: OTHER }));
    await screen.findByText('Other recorded product');
    await act(async () => { pending.resolve(response(listing())); });
    expect(screen.queryByText('Recorded test product')).toBeNull();
    expect(screen.getByText('Other recorded product')).toBeTruthy();
  });

  it('does not publish a late write receipt after session retirement', async () => {
    const pending = deferred<Response>();
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PUT' ? pending.promise : base(method, path, body));
    const note = await open(); editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await waitFor(() => expect(api.request.mock.calls.some(c => c[0] === 'PUT')).toBe(true));
    act(() => { api.revision += 1; api.listeners.forEach(listener => listener()); });
    await act(async () => { pending.resolve(response({ ...program, applicationNumber: '000512', factsVersion: NEXT, programId: ID, auditTrail: AUDIT })); });
    expect(note).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Agency application number') as HTMLInputElement).value).toBe('');
  });

  it('clears previous field checks when recorded form inputs change', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' && path.endsWith('/build') ? Promise.resolve(response({ formId: 'FDA_1571', fields: {}, missingRequired: [] })) : base(method, path, body));
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await screen.findByText('required fields present');
    editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await screen.findByText('Project facts saved.');
    expect(screen.queryByText('required fields present')).toBeNull();
    expect(screen.getByText('Not checked yet')).toBeTruthy();
  });

});


describe('applicant editor interaction lifecycle', () => {
  it('continues to save after StrictMode effect replay', async () => {
    const note = vi.fn();
    render(<React.StrictMode><IndFormsPanel note={note} /></React.StrictMode>);
    await screen.findByLabelText('Agency application number');
    editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await waitFor(() => expect(note).toHaveBeenCalledWith('Project facts saved to the project record.'));
    expect(api.request.mock.calls.filter(c => c[0] === 'PUT')).toHaveLength(1);
  });
  it('preserves spaces while a person types a multiword sponsor address', async () => {
    await open();
    const address = screen.getByLabelText('Sponsor address');
    await userEvent.type(address, '1 Main St');
    expect((address as HTMLInputElement).value).toBe('1 Main St');
  });
});

describe('field checks follow recorded input ownership', () => {
  it('does not repaint an old field check after a concurrent identity save', async () => {
    const write = deferred<Response>(); const build = deferred<Response>();
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PUT' ? write.promise : method === 'POST' && path.endsWith('/build') ? build.promise : base(method, path, body));
    await open(); editFacts(); fireEvent.click(screen.getByRole('button', { name: 'Save to project' }));
    await waitFor(() => expect(api.request.mock.calls.some(c => c[0] === 'PUT')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await waitFor(() => expect(api.request.mock.calls.some(c => c[0] === 'POST' && String(c[1]).endsWith('/build'))).toBe(true));
    await act(async () => write.resolve(response({ ...program, applicationNumber: '000512', factsVersion: NEXT, programId: ID, auditTrail: AUDIT })));
    await screen.findByText('Project facts saved.');
    await act(async () => build.resolve(response({ formId: 'FDA_1571', fields: {}, missingRequired: [] })));
    expect(screen.queryByText('required fields present')).toBeNull();
  });
  it('clears an old check when an explicit reload reads changed program facts', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' && path.endsWith('/build') ? Promise.resolve(response({ formId: 'FDA_1571', fields: {}, missingRequired: [] })) : base(method, path, body));
    await open(); fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await screen.findByText('required fields present');
    program = { ...program, factsVersion: NEXT, applicationNumber: '000512' };
    fireEvent.click(screen.getByRole('button', { name: 'Reload recorded project facts' }));
    await screen.findByText(/Recorded project facts reloaded/i);
    expect(screen.queryByText('required fields present')).toBeNull();
  });
  it('clears an old check when the per-form serial number changes', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' && path.endsWith('/build') ? Promise.resolve(response({ formId: 'FDA_1571', fields: {}, missingRequired: [] })) : base(method, path, body));
    await open(); fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await screen.findByText('required fields present');
    fireEvent.change(screen.getByLabelText('Serial number'), { target: { value: '0001' } });
    expect(screen.queryByText('required fields present')).toBeNull();
  });
});

describe('form check and sponsor receipt proof', () => {
  it.each([{}, [], { formId: 'FDA_1571', fields: {} }, { formId: 'FDA_1572', fields: {}, missingRequired: [] }, { formId: 'FDA_1571', fields: {}, missingRequired: [null] }].map(payload => ({ payload })))('does not call a malformed HTTP 200 build clean: %j', async ({ payload }) => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' && path.endsWith('/build') ? Promise.resolve(response(payload)) : base(method, path, body));
    const note = await open(); fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await waitFor(() => expect(note).toHaveBeenCalled());
    expect(screen.queryByText('required fields present')).toBeNull();
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/no required fields missing/));
  });
  it('refuses a 1572 array when any investigator result is malformed', async () => {
    api.request.mockImplementation((method, path) => method === 'POST' ? Promise.resolve(response([{ formId: 'FDA_1572', fields: {}, missingRequired: [] }, {}])) : Promise.resolve(response(path.startsWith('/api/ind-forms/') ? { ...listing(), forms: ['FDA_1572'] } : [])));
    const note = await open(); fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await waitFor(() => expect(note).toHaveBeenCalled());
    expect(screen.queryByText('required fields present')).toBeNull();
  });
  it('requires an updated revision on a shared sponsor PATCH receipt', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PATCH' ? Promise.resolve(response({ ...SPONSOR, ...body, revision: VERSION, auditTrail: AUDIT })) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.change(screen.getByLabelText('Applicant sponsor record'), { target: { value: SID } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected sponsor' }));
    fireEvent.change(screen.getByLabelText('Regulatory contact name'), { target: { value: 'Updated contact' } });
    fireEvent.change(screen.getByLabelText('Reason for sponsor record change'), { target: { value: 'Record the confirmed contact' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sponsor record' }));
    await screen.findByText(/could not confirm whether the sponsor record was saved/i);
  });
});


describe('all recorded sponsor and investigator inputs reach field checks', () => {
  it('retires a check when the bound sponsor changes without a program revision change', async () => {
    program = { ...program, applicantSponsorId: SID, boundSponsor: SPONSOR, sponsorName: SPONSOR.name };
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' && path.endsWith('/build') ? Promise.resolve(response({ formId: 'FDA_1571', fields: {}, missingRequired: [] })) : base(method, path, body));
    await open(); fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await screen.findByText('required fields present');
    program = { ...program, boundSponsor: { ...SPONSOR, revision: NEXT, contactName: 'A newly recorded contact' } };
    fireEvent.click(screen.getByRole('button', { name: 'Reload recorded project facts' }));
    await screen.findByText(/Recorded project facts reloaded/i);
    expect(screen.queryByText('required fields present')).toBeNull();
  });
  it('shows missing fields from the second investigator instead of calling a 1572 array clean', async () => {
    const builds = [{ formId: 'FDA_1572', fields: {}, missingRequired: [] }, { formId: 'FDA_1572', fields: {}, missingRequired: ['investigator_email'] }];
    api.request.mockImplementation((method, path) => method === 'POST' ? Promise.resolve(response(builds)) : Promise.resolve(response(path.startsWith('/api/ind-forms/') ? { ...listing(), forms: ['FDA_1572'] } : [])));
    const note = await open(); fireEvent.click(screen.getByRole('button', { name: /Build & check/ }));
    await screen.findByText('1 required missing');
    expect(screen.getByText('Investigator 2: investigator_email')).toBeTruthy();
    expect(note).not.toHaveBeenCalledWith(expect.stringMatching(/no required fields missing/));
  });
});


describe('existing sponsor authorized representative facts', () => {
  it.each(['signatoryName', 'signatoryTitle'])('holds a sponsor save when the receipt omits %s', async missing => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'POST' ? Promise.resolve(response({ ...SPONSOR, ...body, [missing]: undefined, revision: NEXT, auditTrail: AUDIT }, 201)) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.click(screen.getByRole('button', { name: 'Record a sponsor' }));
    fireEvent.change(screen.getByLabelText('Sponsor legal name'), { target: { value: 'Recorded representative test sponsor' } });
    fireEvent.change(screen.getByLabelText('Authorized representative name'), { target: { value: 'Recorded representative' } });
    fireEvent.change(screen.getByLabelText('Authorized representative title'), { target: { value: 'Authorized officer' } });
    fireEvent.change(screen.getByLabelText('Reason for sponsor record change'), { target: { value: 'Record confirmed representative' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sponsor record' }));
    await screen.findByText(/could not confirm whether the sponsor record was saved/i);
    expect((screen.getByRole('button', { name: 'Save sponsor record' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('holds a sponsor update when the returned representative differs from the submitted fact', async () => {
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PATCH' ? Promise.resolve(response({ ...SPONSOR, ...body, signatoryTitle: 'A different title', revision: NEXT, auditTrail: AUDIT })) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    fireEvent.change(screen.getByLabelText('Applicant sponsor record'), { target: { value: SID } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected sponsor' }));
    fireEvent.change(screen.getByLabelText('Authorized representative name'), { target: { value: 'Recorded representative' } });
    fireEvent.change(screen.getByLabelText('Authorized representative title'), { target: { value: 'Authorized officer' } });
    fireEvent.change(screen.getByLabelText('Reason for sponsor record change'), { target: { value: 'Record confirmed representative' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sponsor record' }));
    await screen.findByText(/could not confirm whether the sponsor record was saved/i);
    expect((screen.getByRole('button', { name: 'Save sponsor record' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('reads and clears an existing representative title while retaining other recorded facts', async () => {
    sponsors = [{ ...SPONSOR, signatoryName: 'Recorded representative', signatoryTitle: 'Authorized officer' }];
    program = { ...program, applicantSponsorId: SID, boundSponsor: sponsors[0], sponsorName: SPONSOR.name };
    const base = api.request.getMockImplementation()!;
    api.request.mockImplementation((method, path, body) => method === 'PATCH' ? Promise.resolve(response({ ...sponsors[0], ...body, revision: NEXT, auditTrail: AUDIT })) : base(method, path, body));
    await open(); await screen.findByRole('option', { name: /Recorded test sponsor/ });
    expect(screen.getByText(/Authorized representative: Recorded representative.*Authorized officer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected sponsor' }));
    expect((screen.getByLabelText('Authorized representative name') as HTMLInputElement).value).toBe('Recorded representative');
    expect((screen.getByLabelText('Authorized representative title') as HTMLInputElement).value).toBe('Authorized officer');
    fireEvent.change(screen.getByLabelText('Authorized representative title'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Reason for sponsor record change'), { target: { value: 'Clear the superseded title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sponsor record' }));
    await screen.findByText('Sponsor record saved.');
    expect(api.request).toHaveBeenCalledWith('PATCH', `/api/ind-master-data/sponsors/${SID}`, expect.objectContaining({ signatoryName: 'Recorded representative', signatoryTitle: null, expectedRevision: VERSION }));
  });

});
