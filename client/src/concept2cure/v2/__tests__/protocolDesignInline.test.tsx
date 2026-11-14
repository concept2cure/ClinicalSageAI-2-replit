// @vitest-environment jsdom
/** Existing protocol/design writers stay in the project flow without replacing pending input. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: api }));

import { StudyDesignTab, type PdevStudyDesignView } from '../surfaces/ProtocolDevDesign';
import { ProtocolSelectionBar } from '../surfaces/ProtocolDevSelection';
import { surfaceLeaveRefusal } from '../navParams';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const BOUND: PdevStudyDesignView = {
  studyId: 'sd_existing', resolved: true, title: 'Existing trial design', phase: '2', indication: 'Synthetic indication',
  status: 'draft', linkedAt: '2026-11-14T00:00:00Z', riskLevel: 'critical', canAdvance: false, blocksApproval: true,
  counts: { critical: 1, major: 0, minor: 0, info: 0 }, summary: '', standardsChecked: ['ICH E9(R1)'], findings: [],
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const writes = () => api.mock.calls.filter(([method]) => method !== 'GET');
function selection(unfiled = false) {
  return { index: { rows: [] }, empty: !unfiled,
    doc: unfiled ? { id: '41', programId: null, status: 'draft' } : undefined } as never;
}
function mountSelection(unfiled = false) {
  render(<ProtocolSelectionBar selection={selection(unfiled)} programId={PROGRAM} programName="Synthetic project"
    scope={PROGRAM} setScope={vi.fn()} onCreated={vi.fn()} />);
}
function mountDesign(bound = false) {
  const onError = vi.fn();
  render(<StudyDesignTab doc={{ id: '41', programId: PROGRAM, studyDesign: bound ? BOUND : null }} canWrite onError={onError} />);
  return onError;
}
function inline(name: string) {
  const region = screen.getByRole('region', { name });
  expect(region.classList.contains('de-inline')).toBe(true);
  expect(document.querySelector('.de-bd')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  return region;
}

beforeEach(() => {
  api.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path.startsWith('/api/study-design?')) return ok({ designs: [{ studyId: BOUND.studyId, title: BOUND.title, phase: '2', indication: 'Synthetic indication', status: 'draft' }] });
    if (path === '/api/study-design/sd_existing') return ok({ design: { studyId: BOUND.studyId, title: BOUND.title } });
    return ok({});
  });
});
afterEach(() => cleanup());

describe('study and protocol initiation use the main project flow', () => {
  it('opens protocol initiation inline with project controls still reachable and no launch card', () => {
    mountSelection();
    fireEvent.click(screen.getByRole('button', { name: 'Start study & protocol design' }));
    const region = inline('Start a protocol');
    expect(region.closest('.pde-workflow-entry')).toBeTruthy();
    expect(region.closest('.pde-note')).toBeNull();
    expect(within(region).getByLabelText(/Protocol title/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Protocol scope' })).toBeTruthy();
    expect(surfaceLeaveRefusal()).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Cancel' }));
    expect(surfaceLeaveRefusal()).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('files an existing unfiled protocol in the same flow without a drawer', () => {
    mountSelection(true);
    fireEvent.click(screen.getByRole('button', { name: 'File protocol in open project' }));
    const region = inline('File protocol in open project');
    expect(within(region).getByLabelText(/Reason for change/)).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Cancel' }));
    expect(writes()).toHaveLength(0);
  });
});

describe('the Study design controls stay in their existing pane', () => {
  it('creates a study design inline with all scientific inputs and guarded navigation', () => {
    mountDesign();
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' }));
    const region = inline('Create a study design');
    expect(region.closest('[aria-label="Study design"]')).toBeTruthy();
    for (const label of [/Primary objective/, /Primary endpoint name/, /Target population/, /Reason for change/]) {
      expect(within(region).getByLabelText(label)).toBeTruthy();
    }
    expect(surfaceLeaveRefusal()).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Cancel' }));
    expect(surfaceLeaveRefusal()).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('binds inline after the existing scoped design read and returns focus to its opener on cancel', async () => {
    mountDesign();
    const opener = screen.getByRole('button', { name: 'Bind a study design' });
    opener.focus(); fireEvent.click(opener);
    await screen.findByRole('combobox', { name: 'Study design' });
    const region = inline('Bind a study design');
    expect(api).toHaveBeenCalledWith('GET', `/api/study-design?program_id=${PROGRAM}`, undefined);
    fireEvent.click(within(region).getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(opener);
    expect(writes()).toHaveLength(0);
  });

  it('unbinds inline while retaining the recorded design identity in the main document flow', () => {
    mountDesign(true);
    expect(screen.getByText(BOUND.title).closest('.pj-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unbind study design' }));
    const region = inline('Unbind study design');
    expect(screen.getByText(BOUND.title)).toBeTruthy();
    expect(region.compareDocumentPosition(screen.getByRole('region', { name: 'Recorded study design' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(region).getByLabelText(/Reason for change/)).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Cancel' }));
    expect(writes()).toHaveLength(0);
  });

  it('opens planning inputs inline and keeps another edit action from replacing entered values', async () => {
    const onError = mountDesign(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Record Registration titles' }));
    const region = inline('Registration titles');
    const field = within(region).getByLabelText('Public (lay-language) title');
    fireEvent.change(field, { target: { value: 'Pending trial title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record Site accrual plan' }));
    expect(screen.getByRole('region', { name: 'Registration titles' })).toBe(region);
    expect((field as HTMLInputElement).value).toBe('Pending trial title');
    expect(screen.queryByRole('region', { name: 'Site accrual plan' })).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(String));
    expect(writes()).toHaveLength(0);
  });

  it('keeps the parent unbind action from opening over pending planning inputs', async () => {
    mountDesign(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Record Registration titles' }));
    const region = inline('Registration titles');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind study design' }));
    expect(screen.getByRole('region', { name: 'Registration titles' })).toBe(region);
    expect(screen.queryByRole('region', { name: 'Unbind study design' })).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('keeps planning actions from opening over an active unbind form', async () => {
    mountDesign(true);
    await screen.findByRole('button', { name: 'Record Registration titles' });
    fireEvent.click(screen.getByRole('button', { name: 'Unbind study design' }));
    const region = inline('Unbind study design');
    fireEvent.click(screen.getByRole('button', { name: 'Record Registration titles' }));
    expect(screen.getByRole('region', { name: 'Unbind study design' })).toBe(region);
    expect(screen.queryByRole('region', { name: 'Registration titles' })).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('keeps a pending create form when another design action is requested', () => {
    mountDesign();
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' }));
    const region = inline('Create a study design');
    const field = within(region).getByLabelText(/Study design title/);
    fireEvent.change(field, { target: { value: 'Pending governed design' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bind a study design' }));
    expect(screen.getByRole('region', { name: 'Create a study design' })).toBe(region);
    expect((field as HTMLInputElement).value).toBe('Pending governed design');
    expect(writes()).toHaveLength(0);
    fireEvent.click(within(region).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bind a study design' }));
    inline('Bind a study design');
  });

  it('preserves the scoped read loading and failure states inline without claiming an empty design store', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    api.mockReturnValue(pending);
    mountDesign(); fireEvent.click(screen.getByRole('button', { name: 'Bind a study design' }));
    inline('Bind a study design');
    expect(screen.getByText(/Reading this organisation/)).toBeTruthy();
    await act(async () => { resolve(ok({})); await pending; });
    inline('Bind a study design');
    expect(screen.getByText(/store could not be read/)).toBeTruthy();
    expect(screen.queryByText(/No persisted study design is available/)).toBeNull();
    expect(writes()).toHaveLength(0);
  });
});
