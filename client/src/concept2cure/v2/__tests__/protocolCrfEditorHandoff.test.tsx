// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { apiRequest, intake } = vi.hoisted(() => ({ apiRequest: vi.fn(), intake: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('../editor/SourceImportDialog', () => ({
  SourceImportDialog: (props: unknown) => { intake(props); return <div role="dialog">Verified source intake</div>; },
  openImportedDocument: vi.fn(),
}));
import { ProjectionsPanel } from '../surfaces/ProtocolDevProjections';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const shell = { crfShell: {
  standard: 'CDISC CDASH', completeness: { percent: 60 }, gaps: ['Required choices are not defined.'],
  forms: [{ name: 'Vitals', origin: 'design', cdashDomain: 'VS', visitIds: ['baseline'], note: 'Review units.',
    items: [{ prompt: 'Systolic blood pressure', type: 'number', cdashVar: 'VSORRES', units: 'mmHg', derivedFrom: 'activity:vitals', placeholder: true }] }],
} };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const props = () => ({ studyId: 'sd_one', designTitle: 'One', programId: PROGRAM, onNav: vi.fn() });
beforeEach(() => { apiRequest.mockReset().mockResolvedValue(ok(shell)); intake.mockReset(); });
afterEach(cleanup);

describe('saved-design CRF projection reaches the one editor', () => {
  it('shows actual item details and opens exact saved source intake, without creating on a projection read', async () => {
    render(<ProjectionsPanel {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'CRF shell' }));
    expect(await screen.findByText(/Systolic blood pressure/)).toBeTruthy();
    expect(screen.getByText(/mmHg/)).toBeTruthy();
    expect(screen.getByText(/baseline/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open blank CRFs in editor' }));
    expect(intake.mock.lastCall?.[0]).toMatchObject({ programId: PROGRAM, source: { kind: 'study-design-crf', studyId: 'sd_one' } });
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('does not offer a handoff without a recorded target project', async () => {
    render(<ProjectionsPanel {...props()} programId={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'CRF shell' }));
    await screen.findByText(/Systolic blood pressure/);
    expect(screen.queryByRole('button', { name: 'Open blank CRFs in editor' })).toBeNull();
    expect(screen.getByText(/Select a target project/)).toBeTruthy();
  });

  it('ignores an old study response and clears old intake on a source change', async () => {
    let resolve!: (response: Response) => void;
    apiRequest.mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; }));
    const p = props();
    const view = render(<ProjectionsPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'CRF shell' }));
    view.rerender(<ProjectionsPanel {...p} studyId="sd_two" />);
    await act(async () => { resolve(ok(shell)); });
    expect(screen.queryByText(/Systolic blood pressure/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CRF shell' }));
    await screen.findByText(/Systolic blood pressure/);
    fireEvent.click(screen.getByRole('button', { name: 'Open blank CRFs in editor' }));
    expect(intake.mock.lastCall?.[0].source).toEqual({ kind: 'study-design-crf', studyId: 'sd_two' });
    view.rerender(<ProjectionsPanel {...p} studyId="sd_three" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
