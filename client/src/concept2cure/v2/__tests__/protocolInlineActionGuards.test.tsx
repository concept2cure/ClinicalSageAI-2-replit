// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { apiRequest, intake, signing } = vi.hoisted(() => ({ apiRequest: vi.fn(), intake: vi.fn(), signing: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('../editor/SourceImportDialog', () => ({
  SourceImportDialog: (props: unknown) => { intake(props); return <div role="dialog" aria-label="Source intake">Verified source intake</div>; },
  openImportedDocument: vi.fn(),
}));
vi.mock('../surfaces/ProtocolDevSigning', () => ({
  ProtocolSignModal: (props: unknown) => { signing(props); return <div role="dialog" aria-label="Protocol signature">Protocol signature</div>; },
}));

import { C2CForm } from '../C2CForm';
import { ProtocolWorkspaceDoc } from '../surfaces/ProtocolDevWorkspace';
import { ProjectionsPanel } from '../surfaces/ProtocolDevProjections';
import { __resetSurfaceActionBus } from '../surfaceActions';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = {
  id: '41', programId: PROGRAM, title: 'Recorded protocol', kind: 'clinical', status: 'draft',
  sections: [], completenessFindings: [], objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [],
  deviations: [{ id: '9', title: 'Recorded deviation', status: 'assessed', capa: [], closeBlockers: [] }], reviews: [],
  reviewComments: [], consent: [], studyDesign: null,
};
const crf = { crfShell: { standard: 'CDISC CDASH', completeness: { percent: 60 }, gaps: [],
  forms: [{ name: 'Vitals', origin: 'design', cdashDomain: 'VS', visitIds: [], items: [] }] } };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function ActiveInput() {
  const [open, setOpen] = useState(true);
  return open && <C2CForm presentation="inline" config={{ title: 'Ongoing planning input',
    fields: [{ key: 'note', label: 'Sponsor planning input', type: 'text' }],
  }} onCancel={() => setOpen(false)} onSubmit={vi.fn()} />;
}

function mountWorkspace(initialTab = 'study-design') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>
    <ProtocolWorkspaceDoc doc={DOC} onAsk={vi.fn()} onNav={vi.fn()} initialTab={initialTab} />
    <ActiveInput />
  </QueryClientProvider>);
  const input = screen.getByLabelText('Sponsor planning input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'Unsaved sponsor assumption' } });
  return input;
}

beforeEach(() => {
  apiRequest.mockReset().mockResolvedValue(ok(crf)); intake.mockReset(); signing.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'Recorded project' };
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

describe('existing protocol actions preserve active inline input', () => {
  it.each([
    ['Edit sponsor and principal investigator', 'Sponsor and principal investigator', 'study-design'],
    ['Export', 'Export protocol', 'study-design'],
    ['Open saved draft in editor', 'Source intake', 'study-design'],
    ['Finalize protocol', 'Protocol signature', 'study-design'],
    ['Add objective', 'Add objective', 'objectives'],
    ['Close deviation', 'Protocol signature', 'deviations'],
  ])('refuses %s until the inline input is cancelled', async (action, destination, initialTab) => {
    const input = mountWorkspace(initialTab);
    fireEvent.click(screen.getByRole('button', { name: action, exact: true }));
    expect(screen.queryByRole('dialog', { name: destination })).toBeNull();
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Unsaved sponsor assumption');
    expect(screen.getByText(/Finish or cancel.*before/i)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
    expect(intake).not.toHaveBeenCalled(); expect(signing).not.toHaveBeenCalled();
    const form = screen.getByRole('region', { name: 'Ongoing planning input' });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: action, exact: true }));
    expect(await screen.findByRole('dialog', { name: destination })).toBeTruthy();
  });

  it('refuses CRF editor intake without hiding the valid projection, then admits it after cancel', async () => {
    render(<><ProjectionsPanel studyId="sd_one" designTitle="Recorded design" programId={PROGRAM} onNav={vi.fn()} /><ActiveInput /></>);
    const input = screen.getByLabelText('Sponsor planning input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Unsaved sponsor assumption' } });
    fireEvent.click(screen.getByRole('button', { name: 'CRF shell', exact: true }));
    expect(await screen.findByText('Vitals')).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Open blank CRFs in editor' });
    fireEvent.click(open);
    expect(intake).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Source intake' })).toBeNull();
    expect(input.value).toBe('Unsaved sponsor assumption');
    expect(screen.getByText('Vitals')).toBeTruthy();
    expect(screen.getByText(/Finish or cancel.*before/i)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Ongoing planning input' })).getByRole('button', { name: 'Cancel', exact: true }));
    expect((open as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(open);
    expect(intake.mock.lastCall?.[0]).toMatchObject({ programId: PROGRAM, source: { kind: 'study-design-crf', studyId: 'sd_one' } });
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
