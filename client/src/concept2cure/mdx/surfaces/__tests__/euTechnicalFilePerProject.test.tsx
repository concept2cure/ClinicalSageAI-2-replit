// @vitest-environment jsdom
/**
 * The EU technical file is assembled per project, and an EU project is not
 * offered the FDA eSTAR (P-114 item 3, decided 2026-11-09 under the founder's
 * delegation; MDX journey M3, `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * Seen live on 2026-11-02 (`docs/evidence/MDX-JOURNEY/2026-11-02-slice-5b-pma-ivdr-walked/`):
 * an EU IVDR project's door "Assemble the technical documentation" opened the
 * IVD screen, where "Assemble technical file" only put an ask to AnA, and the
 * one producible output was "Official eSTAR · 510(k) · IVD eSTAR", an FDA filing.
 *
 * The assembler for the project's own governed MDR or IVDR document already
 * existed with no caller: POST /api/submissions/programs/:programId/technical-file/export
 * (`server/routes/submissions.ts`). This mounts the real host and the real
 * useMdxPrograms, and holds the screens to that route.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../../MdxSurfaceHost';
import { technicalFileStatusLine, type TechnicalFileOutcome } from '../../hooks/useCerExport';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import type { SurfaceViewProps } from '../../../v2/surfaceViews';

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/authToken')>(),
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const downloads = vi.hoisted(() => ({ calls: [] as Array<{ filename: string; mime: string }>, taken: true }));
vi.mock('../../../v2/download', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../v2/download')>(),
  downloadBase64: (filename: string, _data: string, mime: string) => {
    downloads.calls.push({ filename, mime });
    return downloads.taken;
  },
}));

const ID = '55555555-5555-4555-8555-555555555555';
const EXPORT_URL = `/api/submissions/programs/${ID}/technical-file/export`;

/** A `/api/regulatory-programs` row, as the route returns it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Dx-1 Assay',
  code: 'DX-1',
  description: null,
  programType: 'IVDR',
  productType: 'ivd',
  deviceClass: 'C',
  regulatoryPath: null,
  primaryAgency: 'Notified_Body',
  productName: 'Dx-1 Assay',
  status: 'active',
  phase: 'authoring',
  priority: null,
  targetSubmissionDate: null,
  progressPercent: 40,
  completedMilestones: 0,
  totalMilestones: 0,
  leadUserId: null,
  leadUserName: null,
  teamMembers: null,
  metadata: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z',
  ...over,
});
const IVDR = row();
const MDR = row({ name: 'Helix cage', productName: 'Helix cage', programType: 'MDR', productType: 'device' });
const CER = row({ name: 'Helix cage CER', productName: 'Helix cage CER', programType: 'CER', productType: 'device' });
const US_IVD_510K = row({ programType: '510K', regulatoryPath: '510k', primaryAgency: 'FDA' });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** What the route answers for an assembled file (`deliverTechnicalFile`, audited and unplaced). */
const assembled = (regulation: 'mdr' | 'ivdr', over: Record<string, unknown> = {}) => ({
  ok: true,
  regulation,
  programId: ID,
  ready: true,
  sha256: 'a'.repeat(64),
  fileCount: 9,
  materialized: 7,
  leafCount: 7,
  skipped: [],
  unresolvedLeaves: [],
  unmappedLeaves: [],
  matchedByTitleOnly: [],
  unfinalized: 0,
  unfinalizedSections: [],
  governed: false,
  audited: true,
  downloadable_output_ref: {
    encoding: 'base64', mime_type: 'application/zip', filename: `PROG-55555555-technical-file-${regulation}.zip`, data: 'UEs=',
  },
  ...over,
});

interface Posted { url: string; body: unknown }

function stubFetch(program: Record<string, unknown>, answer: () => Response = () => json(assembled('ivdr'))) {
  const posted: Posted[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
        posted.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return url.endsWith(EXPORT_URL) ? answer() : json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
      }
      if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [program] });
      if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) return json({ data: program });
      return json({ data: [] });
    }),
  );
  return posted;
}

function mount(nav: 'device-diagnostics' | 'device-cer') {
  publishShellProject({ id: ID });
  const onAsk = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: nav }, onAsk, onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
  const view = render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={nav} />
    </QueryClientProvider>,
  );
  return { ...view, onAsk };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearShellProject();
  sessionStorage.clear();
  downloads.calls.length = 0;
  downloads.taken = true;
});

const assembleButton = () => screen.findByRole('button', { name: /^Assemble technical file/ });
const status = () => screen.getByTestId('technical-file-status').textContent ?? '';

describe('an EU IVDR project, on the IVD screen', () => {
  it("assembles the project's own IVDR technical file: the per-project route, not an ask to AnA", async () => {
    const posted = stubFetch(IVDR);
    const { onAsk } = mount('device-diagnostics');
    fireEvent.click(await assembleButton());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].url.endsWith(EXPORT_URL)).toBe(true);
    expect(posted[0].body).toEqual({ regulation: 'ivdr' });
    expect(onAsk).not.toHaveBeenCalled();
    await waitFor(() => expect(status()).toMatch(/^Downloaded PROG-55555555-technical-file-ivdr\.zip/));
    expect(downloads.calls).toEqual([{ filename: 'PROG-55555555-technical-file-ivdr.zip', mime: 'application/zip' }]);
    // Audited without a registry placement is said, as the other device exports say it.
    expect(status()).toMatch(/audit-logged; artifact registry placement pending/);
    expect(status()).not.toMatch(/not yet a complete/);
  });

  it('is not offered the FDA eSTAR', async () => {
    stubFetch(IVDR);
    mount('device-diagnostics');
    await assembleButton();
    expect(screen.queryByText(/Official eSTAR/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Generate official eSTAR/ })).toBeNull();
    expect(screen.queryByText('eSTAR filing readiness')).toBeNull();
  });

  it('still offers the ask to AnA, beside the button (P-122)', async () => {
    const posted = stubFetch(IVDR);
    const { onAsk } = mount('device-diagnostics');
    await assembleButton();
    fireEvent.click(screen.getByRole('button', { name: /^Ask AnA about the technical file/ }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(String(onAsk.mock.calls[0][0])).toMatch(/IVDR technical file/);
    expect(posted).toHaveLength(0);
  });

  it('says a file is not yet complete, and how many of its sections are not approved', async () => {
    stubFetch(IVDR, () => json(assembled('ivdr', { ready: false, unfinalized: 3 })));
    mount('device-diagnostics');
    fireEvent.click(await assembleButton());
    await waitFor(() => expect(status()).toMatch(/^Downloaded /));
    expect(status()).toMatch(/not yet a complete technical file: the manifest in the ZIP lists each required Annex II and III section/);
    expect(status()).toMatch(/3 of its sections are still in draft or review/);
  });

  it('says nothing was written when the project has no written IVDR section, and downloads nothing', async () => {
    stubFetch(IVDR, () => json({ error: { code: 'NO_AUTHORED_CONTENT', message: `No authored IVDR technical-documentation section exists for project ${ID} in this organization — there is nothing to package. Author and save at least one Annex II/III section first.` } }, 422));
    mount('device-diagnostics');
    fireEvent.click(await assembleButton());
    await waitFor(() => expect(status()).toMatch(/^Nothing to assemble yet\./));
    expect(status()).toMatch(/IVDR technical documentation/);
    // The project is named on the screen already; its id is not read out to the user.
    expect(status()).not.toContain(ID);
    expect(downloads.calls).toEqual([]);
  });

  it("gives the server's sentence when a filed copy is not the text its document holds", async () => {
    const sentence = 'The technical file was not assembled. Section II.1.a was changed in the filing and not in its document.';
    stubFetch(IVDR, () => json({ error: { code: 'FILING_DIVERGED', message: sentence } }, 409));
    mount('device-diagnostics');
    fireEvent.click(await assembleButton());
    await waitFor(() => expect(status()).toBe(sentence));
    expect(downloads.calls).toEqual([]);
  });

  it('says the browser blocked a file it was sent', async () => {
    downloads.taken = false;
    stubFetch(IVDR);
    mount('device-diagnostics');
    fireEvent.click(await assembleButton());
    await waitFor(() => expect(status()).toMatch(/was produced but the browser blocked the download/));
  });
});

describe('a US IVD 510(k) project, on the IVD screen', () => {
  it('keeps the FDA eSTAR, and its "Assemble technical file" is unchanged: an ask to AnA', async () => {
    const posted = stubFetch(US_IVD_510K);
    const { onAsk } = mount('device-diagnostics');
    fireEvent.click(await assembleButton());
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(posted).toHaveLength(0);
    expect(screen.queryByTestId('technical-file-status')).toBeNull();
    expect(await screen.findByText(/Official eSTAR · 510\(k\) · IVD eSTAR/)).toBeTruthy();
    expect(screen.getByText('eSTAR filing readiness')).toBeTruthy();
  });
});

describe('an EU MDR technical documentation project, on the CER screen', () => {
  it("assembles the project's own MDR technical file", async () => {
    const posted = stubFetch(MDR, () => json(assembled('mdr')));
    const { onAsk } = mount('device-cer');
    fireEvent.click(await assembleButton());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].url.endsWith(EXPORT_URL)).toBe(true);
    expect(posted[0].body).toEqual({ regulation: 'mdr' });
    expect(onAsk).not.toHaveBeenCalled();
    await waitFor(() => expect(status()).toMatch(/^Downloaded PROG-55555555-technical-file-mdr\.zip/));
    // "Generate draft" is still there beside it.
    const header = screen.getByText(/^Clinical Evaluation Report/).closest('.section-hdr') as HTMLElement;
    expect(within(header).getByRole('button', { name: /^Generate draft/ })).toBeTruthy();
  });
});

describe('a CER project, on the CER screen', () => {
  it('is offered no technical file: its filing is the report', async () => {
    stubFetch(CER);
    mount('device-cer');
    await screen.findByRole('button', { name: /^Generate draft/ });
    expect(screen.queryByRole('button', { name: /^Assemble technical file/ })).toBeNull();
  });
});

describe('technicalFileStatusLine', () => {
  const done = (over: Partial<TechnicalFileOutcome> = {}): TechnicalFileOutcome => ({
    ok: true, delivered: true, governed: true, audited: false, filename: 'file.zip', error: null,
    ready: true, unfinalized: 0, code: null, ...over,
  });

  it('says a complete, approved, registered file plainly', () => {
    expect(technicalFileStatusLine(false, done(), 'mdr')).toBe('Downloaded file.zip');
  });

  it('never reads an unreported verdict as complete, or an unreported count as approved', () => {
    const line = technicalFileStatusLine(false, done({ ready: null, unfinalized: null }), 'mdr') ?? '';
    expect(line).toMatch(/the server did not say whether the file is complete/);
    expect(line).toMatch(/the server did not say whether its sections are approved/);
  });

  it('counts one draft section in the singular', () => {
    expect(technicalFileStatusLine(false, done({ unfinalized: 1 }), 'ivdr')).toMatch(/1 of its sections is still in draft or review/);
  });

  it('gives a refusal it has no words of its own for as the server gave it', () => {
    const refused = done({ ok: false, delivered: false, filename: null, ready: null, unfinalized: null, error: 'Project not found.' });
    expect(technicalFileStatusLine(false, refused, 'mdr')).toBe('The technical file was not assembled — Project not found.');
  });

  it('says it is assembling while the request is in flight, and nothing before one is made', () => {
    expect(technicalFileStatusLine(true, null, 'ivdr')).toMatch(/^Assembling the technical file/);
    expect(technicalFileStatusLine(false, null, 'ivdr')).toBeNull();
  });
});
