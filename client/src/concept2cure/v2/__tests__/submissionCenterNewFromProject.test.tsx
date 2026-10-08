// @vitest-environment jsdom
/**
 * New submission takes the project's filing (docs/design/FILING_SPINE.md F20).
 *
 * The form opened on IND · FDA · Biotech for every project: a hard-coded
 * default (`SubmissionCenter.tsx`, `default: 'ind'`, `'fda'`, `'biotech'`). An
 * EMA MAA project's new submission started as a US IND, and a person who did
 * not look filed the wrong market.
 *
 * After F20:
 *   - with a project open, the application type and region come from the
 *     project's own record (`program_type`, `primary_agency`), and the client
 *     type from the open project's workspace;
 *   - if that market already exists on the project, no region is preselected:
 *     a second submission in the same market is a choice, not a default;
 *   - a value the form does not offer (a J-NDA) is not guessed;
 *   - with no project open, nothing is preselected;
 *   - each region option carries what the platform can carry for that market
 *     (F19), for the application type chosen, in the server's words.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const PID = '4c2a9e1b-7d3f-4a51-9b8e-2f6d0c1a3f20';
const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const SUMMARY: Record<string, Record<string, string>> = {
  maa: { eu: 'Flat Module 1, no channel', fda: 'No outline, no channel', ca: 'No outline, no channel' },
  nda: { fda: 'Structured Module 1', eu: 'No outline, no channel', ca: 'No outline, no channel' },
};

type ServeOpts = {
  program?: Record<string, unknown> | null;
  existing?: Array<{ applicationType: string; primaryRegion: string }>;
  /** The project's submissions cannot be read. */
  failSubmissions?: boolean;
};

function marketSupportReply(url: string) {
  const type = new URL(url, 'http://x').searchParams.get('applicationType') ?? '';
  const rows = Object.entries(SUMMARY[type] ?? {}).map(([region, summary]) => ({
    applicationType: type, market: region, region: { fda: 'US', eu: 'EU', ca: 'CA' }[region], agency: null,
    summary, line: summary, buildable: summary.startsWith('Structured'), offered: true,
  }));
  return res({ applicationType: type, asOf: '2026-10-08', markets: rows });
}

function projectReply(opts: ServeOpts) {
  if (opts.program === null) throw Object.assign(new Error('Server error'), { status: 500 });
  return res(opts.program ?? { id: PID, name: 'ONC-221', program_type: 'NDA', primary_agency: 'FDA', product_type: 'drug' });
}

function submissionsReply(opts: ServeOpts) {
  if (opts.failSubmissions) throw Object.assign(new Error('Server error'), { status: 500 });
  return res({
    data: (opts.existing ?? []).map((e, i) => ({
      id: 90 + i, title: `existing ${i}`, clientType: 'pharma', status: 'planning', lifecycleStage: 'original', programId: PID, ...e,
    })),
    meta: { notOffered: 0 },
  });
}

function serve(opts: ServeOpts = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method !== 'GET') return res({ data: [] });
    if (url === `/api/c2c/projects/${PID}`) return projectReply(opts);
    if (url === `/api/submissions?programId=${PID}`) return submissionsReply(opts);
    if (url === '/api/submissions') return res([]);
    if (url === '/api/c2c/projects') return res({ data: [{ id: PID, title: 'ONC-221', code: 'ONC-221' }] });
    if (url.startsWith('/api/submissions/market-support')) return marketSupportReply(url);
    return res({ data: [] });
  });
}

const select = (label: RegExp) => screen.getByLabelText(label) as HTMLSelectElement;
const desc = (label: RegExp) => document.getElementById(select(label).getAttribute('aria-describedby')?.split(' ')[0] ?? '')?.textContent ?? '';
const optionText = (label: RegExp, value: string) =>
  Array.from(select(label).options).find((o) => o.value === value)?.textContent ?? '';

async function openNew() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /New submission/ }));
  await screen.findByLabelText(/Title/);
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('New submission takes the open project\'s filing (F20)', () => {
  beforeEach(() => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221', ws: 'Pharma' };
  });

  it("an NDA · FDA project opens on NDA · FDA (US), with the project's client type", async () => {
    serve();
    await openNew();
    expect(select(/Application type/).value).toBe('nda');
    expect(select(/Primary region/).value).toBe('fda');
    expect(select(/Client type/).value).toBe('pharma');
  });

  it('an MAA · EMA project opens on MAA · EU (EMA), not on a US IND', async () => {
    serve({ program: { id: PID, name: 'ONC-221', program_type: 'MAA', primary_agency: 'EMA' } });
    await openNew();
    expect(select(/Application type/).value).toBe('maa');
    expect(select(/Primary region/).value).toBe('eu');
  });

  it('a Health Canada project preselects Health Canada, whatever its spelling', async () => {
    serve({ program: { id: PID, name: 'ONC-221', program_type: 'NDA', primary_agency: 'Health_Canada' } });
    await openNew();
    expect(select(/Primary region/).value).toBe('ca');
  });

  it("a project opened from a link (no workspace on the shell) takes its client type from the project's product type", async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
    serve({ program: { id: PID, name: 'ONC-221', program_type: 'IND', primary_agency: 'FDA', product_type: 'biologic' } });
    await openNew();
    expect(select(/Client type/).value).toBe('biotech');
  });

  it('an IVD product is an IVD client, whatever bucket its filing type falls in', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'DX-9', ws: 'MDX' };
    serve({ program: { id: PID, name: 'DX-9', program_type: '510k', primary_agency: 'FDA', product_type: 'ivd' } });
    await openNew();
    expect(select(/Client type/).value).toBe('ivd');
  });

  it('when that market already exists on the project, no region is preselected, and the field says why', async () => {
    serve({ existing: [{ applicationType: 'nda', primaryRegion: 'fda' }] });
    await openNew();
    expect(select(/Application type/).value).toBe('nda');
    expect(select(/Primary region/).value).toBe('');
    expect(desc(/Primary region/)).toMatch(/^NDA in the project's region already exists on this project, so no region is preselected\./);
  });

  /* Design review 2026-10-08 (Part 11 lens): a defaulted value looked like a
     choice already made. Each one says where it came from. */
  it("each defaulted field says it came from the project's record", async () => {
    serve();
    await openNew();
    expect(desc(/Application type/)).toBe("From this project's record.");
    expect(desc(/Primary region/)).toMatch(/^From this project's record\. /);
    expect(desc(/Client type/)).toBe("From this project's product type.");
    // The region description changes as its read lands: a polite live region.
    expect(document.getElementById(select(/Primary region/).getAttribute('aria-describedby')!.split(' ')[0])!.getAttribute('aria-live')).toBe('polite');
  });

  /* Design review 2026-10-08 (honest-state lens): the filing type's bucket put
     every IND under Biotech. The recorded product type decides. */
  it("a small-molecule IND is a Pharma client: the product type decides, not the filing type's bucket", async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
    serve({ program: { id: PID, name: 'ONC-221', program_type: 'IND', primary_agency: 'FDA', product_type: 'drug' } });
    await openNew();
    expect(select(/Client type/).value).toBe('pharma');
  });

  /* Design review 2026-10-08 (motion and a11y lenses): while the reads were in
     flight a placeholder sat in the page, moved it twice and was never
     announced. The drawer opens at once and says it is reading. */
  it('opens at once while the project is read: the dialog says so, with no fields and no submit', async () => {
    serve();
    apiRequest.mockImplementation(async (method: string, url: string) =>
      url === `/api/c2c/projects/${PID}` ? new Promise(() => {}) : res({ data: [] }));
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /New submission/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('status').textContent).toBe("Loading the project's filing…");
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    expect(within(dialog).queryByLabelText(/Title/)).toBeNull();
    expect(within(dialog).getByRole('button', { name: /Create submission/ })).toHaveProperty('disabled', true);
  });

  it('a type the form does not offer (J-NDA) is not guessed', async () => {
    serve({ program: { id: PID, name: 'ONC-221', program_type: 'JNDA', primary_agency: 'PMDA' } });
    await openNew();
    expect(select(/Application type/).value).toBe('');
    expect(select(/Primary region/).value).toBe('jp');
  });

  it('a project record that could not be read preselects nothing, and says why', async () => {
    serve({ program: null });
    await openNew();
    expect(select(/Application type/).value).toBe('');
    expect(select(/Primary region/).value).toBe('');
    const notice = within(screen.getByRole('dialog')).getByText(/project record could not be read, so nothing is preselected/i).closest('p')!;
    // Read with the dialog (it describes it), not raised as an alert competing with its name.
    expect(notice.getAttribute('role')).toBe('status');
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBe(notice.id);
  });

  it("when the project's submissions cannot be read, no region is preselected, and the drawer says why", async () => {
    serve({ failSubmissions: true });
    await openNew();
    expect(select(/Application type/).value).toBe('nda');
    expect(select(/Primary region/).value).toBe('');
    expect(within(screen.getByRole('dialog')).getByText(/whether that market already exists is not known/)).toBeTruthy();
  });

  it("each region option carries the server's statement for the chosen application type, and follows a change of type", async () => {
    serve();
    await openNew();
    await waitFor(() => expect(optionText(/Primary region/, 'fda')).toContain('Structured Module 1'));
    expect(optionText(/Primary region/, 'eu')).toContain('No outline, no channel');
    fireEvent.change(select(/Application type/), { target: { value: 'maa' } });
    await waitFor(() => expect(optionText(/Primary region/, 'eu')).toContain('Flat Module 1, no channel'));
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/market-support?applicationType=maa');
  });
});

describe('New submission with no project open (F20)', () => {
  it('preselects no application type, region or client type', async () => {
    serve();
    await openNew();
    expect(select(/Application type/).value).toBe('');
    expect(select(/Primary region/).value).toBe('');
    expect(select(/Client type/).value).toBe('');
  });
});
