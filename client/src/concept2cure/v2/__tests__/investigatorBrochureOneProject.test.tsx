// @vitest-environment jsdom
/**
 * The Investigator's Brochure readiness belongs to the open project (S12 sweep finding 92, 2026-11-12).
 *
 * The page read GET /api/investigator-brochure with no project, and the server answered for the whole
 * organisation: "36% required sections ready" with no project open, and the same 36% with C2C-101 open, on the
 * strength of C2C-201's Module 3 sections. A readiness figure with no project behind it is a number nobody
 * computed for anything (RULE 2). This pins:
 *   - with no project open, the page says so, shows no figure and no sections, and reads nothing;
 *   - with a project open, the read names that project, and the page names it;
 *   - the figure counts only the sections that need project data, and a section that needs none is labelled so,
 *     not "Ready".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InvestigatorBrochure } from '../surfaces/InvestigatorBrochure';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROJECT = '66277053-752f-4806-8112-85be3e9d1aea';

const ok = (body: unknown) => ({
  ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body),
});

const row = (number: string, title: string, status: 'rendered' | 'partial' | 'missing', needsData: boolean, gaps: string[] = []) =>
  ({ number, title, required: number !== '7', status, gaps, description: '', depth: number.includes('.') ? 1 : 0, needsData });

/** A project whose Module 3 is recorded and nothing else: §3 has its data, §4 and §5 do not. */
const ROWS = [
  row('0', 'Title Page', 'rendered', false),
  row('0a', 'Confidentiality Statement', 'rendered', false),
  row('0b', 'Table of Contents', 'rendered', false),
  row('3', 'Physical, Chemical, and Pharmaceutical Properties and Formulation', 'rendered', true),
  row('4', 'Nonclinical Studies', 'missing', true, ['nonclinical pharmacology/PK/toxicology summary (M2.4/M2.6)']),
  row('5', 'Effects in Humans', 'missing', true, ['clinical summary (M2.5/M2.7)']),
  row('7', 'References', 'rendered', false),
];

const props = () => ({ surface: { id: 'investigator-brochure' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const reads = () => apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && String(url).startsWith('/api/investigator-brochure'));

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({ data: ROWS, meta: { programId: PROJECT, completeness: 33, storesWithoutProject: [] } }) as unknown as Response);
});
afterEach(() => { cleanup(); clearShellProject(); });

describe('Investigator\'s Brochure readiness, with no project open', () => {
  it('says to open a project, shows no figure and no sections, and reads nothing', async () => {
    clearShellProject();
    const p = props();
    render(<InvestigatorBrochure {...p} />);
    expect(await screen.findByText('Open a project to see its Investigator’s Brochure readiness')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText('required sections ready')).toBeNull();
    expect(screen.queryByText('Title Page')).toBeNull();
    expect(reads()).toEqual([]);
    // Nothing to draft for no project: the ask is not offered.
    expect(screen.queryByRole('button', { name: /Ask AnA/ })).toBeNull();
    // The way out is the Projects list.
    screen.getByRole('button', { name: 'Open Projects' }).click();
    expect(p.onNav).toHaveBeenCalledWith('projects');
  });
});

describe('Investigator\'s Brochure readiness, with a project open', () => {
  beforeEach(() => { publishShellProject({ id: PROJECT, title: 'C2C-101 anti-IL-23p19 mAb', code: 'C2C-101' }); });

  it('reads the open project\'s readiness and names the project', async () => {
    render(<InvestigatorBrochure {...props()} />);
    await screen.findByText('Title Page');
    expect(reads().map(([, url]) => url)).toEqual([`/api/investigator-brochure?programId=${PROJECT}`]);
    expect(screen.getByText(/C2C-101/)).toBeTruthy();
  });

  it('counts only the sections that need project data', async () => {
    render(<InvestigatorBrochure {...props()} />);
    await screen.findByText('Title Page');
    // Three sections need project data (3, 4, 5); one has it. The four that need none are not counted.
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.getByText('1 of 3 sections that need project data have it')).toBeTruthy();
  });

  it('labels a section that needs no project data as that, not as Ready', async () => {
    render(<InvestigatorBrochure {...props()} />);
    const title = (await screen.findByText('Title Page')).closest('[data-ib-section]') as HTMLElement;
    expect(within(title).getByText('No project data needed')).toBeTruthy();
    expect(within(title).queryByText('Ready')).toBeNull();
    const formulation = screen.getByText('Physical, Chemical, and Pharmaceutical Properties and Formulation').closest('[data-ib-section]') as HTMLElement;
    expect(within(formulation).getByText('Ready')).toBeTruthy();
  });

  it('says which registers were not read for a project', async () => {
    apiRequest.mockImplementation(async () => ok({ data: ROWS, meta: { programId: PROJECT, storesWithoutProject: ['clinical_ops.studies'] } }) as unknown as Response);
    render(<InvestigatorBrochure {...props()} />);
    await screen.findByText('Title Page');
    await waitFor(() => expect(screen.getByText(/One study register in this workspace does not record which project a study belongs to, so it is not counted here\./)).toBeTruthy());
  });

  it('a failed read shows no figure', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: { code: 'INTERNAL', message: 'x' } }), text: async () => '' }) as unknown as Response);
    render(<InvestigatorBrochure {...props()} />);
    expect(await screen.findByText('Couldn’t load the Investigator’s Brochure readiness')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
