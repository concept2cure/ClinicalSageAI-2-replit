// @vitest-environment jsdom
/**
 * eCTD Compile carries the eCTD reference (D2, 2026-10-29, the ectd-publishing fold).
 *
 * The founder's direction: move "apps" into core. `ectd-publishing`
 * (PublishingCenter.tsx) was a read-only screen over three reads of
 * server/routes/ectd-v4.ts: the spec versions the product is qualified
 * against, the controlled-vocabulary listing, and one v4.0 code list. The
 * placement map (.design/client-journey/FUNCTION_PARITY.md, "Into eCTD compile
 * / From ectd-publishing") sends every one of its functions here:
 *
 *   - the eCTD version choice and the FDA Regional IG OID → a reference panel,
 *     opening at the version this compile assembles (v3.2.2: the packager
 *     writes `<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">`, and no
 *     sequence records a version of its own);
 *   - the spec versions → beside the validation findings;
 *   - the v3.2.2 vocabularies with counts, a v4.0 code list, its filter → the panel;
 *   - Try again on every failed read, the code list's included;
 *   - AnA's view of all of it → eCTD Compile's own published context;
 *   - its three view-only actions → re-keyed under ectd-compile, driven here
 *     through the real bus as a drive does.
 *
 * These mount the REAL surface over the routes' real response shapes
 * (server/services/ectd/qualification/qualify.ts SPEC_VERSIONS; the listing as
 * ectd-v4.ts builds it).
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { STATUS } from './ectdCompile.fixtures';

const SPEC_URL = '/api/ectd/qualification/spec-versions';
const LISTING_URL = '/api/ectd/controlled-vocab';
const LIST_URL = (id: string) => `/api/ectd/controlled-vocab/${id}`;

const SPEC_VERSIONS = {
  'v3.2.2': {
    ichBackbone: 'ICH eCTD v3.2.2',
    fdaRegionalDtd: 'FDA US Regional DTD v3.3 (eCTD Backbone Files Specification for Module 1)',
    validationCriteria: 'FDA Specifications for eCTD Validation Criteria v4.5 (2025-10-01)',
    fileFormats: 'FDA Specifications for File Format Types v9.3 (2025-08-20)',
    transmission: 'FDA Transmitting eCTD Submissions v2.0 (2026-07)',
  },
  'v4.0': {
    message: 'ICH eCTD v4.0 / HL7 RPS message (PORP_IN000001UV)',
    fdaRegionalIg: 'FDA eCTD v4.0 Regional IG OID 2.16.840.1.113883.3.989.5.1.2.2.1.18.8',
    controlledVocab: 'FDA eCTD v4.0 Controlled Vocabulary Package v1.1 (2026-06)',
    validationCriteria: 'FDA Specifications for eCTD v4.0 Validation Criteria v1.5',
  },
};
const OID = '2.16.840.1.113883.3.989.5.1.2.2.1.18.8';
const LISTING = {
  regionalIgOid: OID,
  // In the server's order (cv-v4-data.ts V4_CODE_LISTS): contextOfUse is not first.
  v4: [
    { id: 'submissionType', shortName: 'submissionType', oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.4', codeCount: 1 },
    { id: 'contextOfUse', shortName: 'contextOfUse', oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.6', codeCount: 2 },
  ],
  v3: [
    { id: 'applicationType', codeCount: 5 },
    { id: 'submissionSubType', codeCount: 7 },
    { id: 'applicantContactType', codeCount: 3 },
  ],
};
const CODES: Record<string, unknown> = {
  contextOfUse: {
    id: 'contextOfUse', shortName: 'contextOfUse', oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.6',
    codes: [{ code: 'us_1.1', description: 'm1.1 forms' }, { code: 'us_1.2', description: 'm1.2 cover letters' }],
  },
  submissionType: {
    id: 'submissionType', shortName: 'submissionType', oid: '2.16.840.1.113883.3.989.5.1.2.2.1.2.4',
    codes: [{ code: 'us_original', description: 'Original application' }],
  },
};

const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response;
const fail = () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as Response;
const props = () => ({ surface: { id: 'ectd-compile', label: 'eCTD' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const text = () => document.body.textContent ?? '';

type Answer = Response | (() => Response | Promise<Response>);
const answer = async (a: Answer) => (typeof a === 'function' ? a() : a);

/** Route every read the surface issues; the reference reads are what vary. */
function routeReads(opts: { spec?: Answer; listing?: Answer; list?: (id: string) => Answer } = {}) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const p = String(url);
    if (p === SPEC_URL) return answer(opts.spec ?? ok(SPEC_VERSIONS));
    if (p === LISTING_URL) return answer(opts.listing ?? ok(LISTING));
    if (p.startsWith(`${LISTING_URL}/`)) {
      const id = decodeURIComponent(p.slice(LISTING_URL.length + 1));
      return answer(opts.list ? opts.list(id) : CODES[id] ? ok(CODES[id]) : fail());
    }
    if (p === '/api/ectd-compile/42/status') return ok(STATUS);
    if (p === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    return ok({});
  });
}

/** The first-column text of every row of the "Qualified against" table. */
function specLabels(): string[] {
  const table = Array.from(document.querySelectorAll('table.reg-tbl')).find((t) =>
    (t.querySelector('thead')?.textContent ?? '').includes('Version qualified against'),
  );
  return Array.from(table?.querySelectorAll('tbody tr td:first-child') ?? []).map((td) => td.textContent ?? '');
}
/** Rows of the v3.2.2 coded-attribute table, as [label, count]. */
function codedAttributeRows(): Array<[string, string]> {
  const table = Array.from(document.querySelectorAll('table.reg-tbl')).find((t) =>
    (t.querySelector('thead')?.textContent ?? '').includes('Coded-attribute list'),
  );
  return Array.from(table?.querySelectorAll('tbody tr') ?? []).map((tr) => {
    const cells = tr.querySelectorAll('td');
    return [cells[0]?.textContent ?? '', cells[1]?.textContent ?? ''];
  });
}
/** The codes the v4.0 browser lists. */
function codesShown(): string[] {
  const table = Array.from(document.querySelectorAll('table.reg-tbl')).find((t) =>
    (t.querySelector('thead')?.textContent ?? '').includes('Description'),
  );
  return Array.from(table?.querySelectorAll('tbody tr td:first-child') ?? []).map((td) => td.textContent ?? '');
}
const versionMenu = () => screen.getByLabelText('eCTD version') as HTMLSelectElement;
const listMenu = () => screen.getByLabelText('Controlled vocabulary list') as HTMLSelectElement;
const filterBox = () => screen.getByLabelText('Filter codes') as HTMLInputElement;
const reads = () => apiRequest.mock.calls.map((c) => String(c[1]));

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('ectd-compile');
  return null;
}
const reference = () => (seen?.facts as { reference?: Record<string, unknown> } | undefined)?.reference;

/**
 * Send an action through the real bus, as a drive does. A mounted screen
 * answers at once; one whose read is in flight stashes it and answers through
 * the deferred callback. `settled()` is whichever came.
 */
function send(actionId: string, params: Record<string, string> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`${actionId} does not resolve: ${res.error}`);
  const deferred = vi.fn();
  const immediate = applySurfaceAction(res.directive, vi.fn(), deferred);
  const settledOutcome = () => (immediate.status === 'stashed' ? deferred.mock.calls.at(-1)?.[0] : immediate);
  return { immediate, settled: settledOutcome };
}
type Sent = ReturnType<typeof send>;
const applied = (o: Sent) => waitFor(() => expect(o.settled()).toMatchObject({ status: 'applied' }));
const refusedWith = (o: Sent, reason: RegExp) =>
  waitFor(() => expect(o.settled()).toMatchObject({ status: 'failed', reason: expect.stringMatching(reason) }));

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
  routeReads();
  seen = null;
  (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123', code: 'IND-42' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as any).C2C_PROJECT;
});

describe('the eCTD reference is on eCTD Compile', () => {
  it('opens at v3.2.2, the version this compile assembles, with its specifications and coded-attribute lists', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    expect(versionMenu().value).toBe('v3.2.2');
    expect(specLabels()).toEqual(['ICH backbone', 'FDA regional DTD', 'Validation criteria', 'File formats', 'Transmission']);
    expect(text()).toContain('FDA US Regional DTD v3.3 (eCTD Backbone Files Specification for Module 1)');
    expect(codedAttributeRows()).toEqual([
      ['Application type', '5'],
      ['Submission sub type', '7'],
      ['Applicant contact type', '3'],
    ]);
    expect(text()).toMatch(/the version this compile assembles/i);
    // v3.2.2 has no per-list browser, so no list is read.
    expect(reads().filter((u) => u.startsWith(`${LISTING_URL}/`))).toEqual([]);
  });

  it('says the reference changes nothing the compile assembles', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    expect(text()).toMatch(/Nothing in this panel changes what the compile assembles/);
  });

  it('places the specifications beside the validation findings, ahead of the compilation history', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    const titles = Array.from(document.querySelectorAll('.pj-card-h .t')).map((n) => n.textContent ?? '');
    const qualified = titles.indexOf('Qualified against');
    const history = titles.indexOf('Compilation history');
    expect(qualified).toBeGreaterThan(-1);
    expect(qualified).toBeLessThan(history);
    expect(titles[qualified + 1]).toBe('eCTD reference');
  });
});

describe('v4.0 in the reference panel', () => {
  it('shows the Regional IG OID, the v4.0 specifications, and browses and filters a code list', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });

    await waitFor(() => expect(specLabels()).toEqual(['Message', 'FDA regional IG', 'Controlled vocabulary', 'Validation criteria']));
    // A label is shown as written, never a raw key title-cased by CSS (the retired screen's finding).
    const firstCell = document.querySelector<HTMLElement>('section[aria-label="Qualified against"] tbody tr td:first-child');
    expect(firstCell?.style.textTransform ?? '').toBe('');
    expect(text()).toContain(`Regional IG OID ${OID}`);
    // Shown as a reference, never as what this compile builds.
    expect(text()).toMatch(/Reference only\. This compile assembles eCTD v3\.2\.2, not v4\.0\./);

    // It opens at the CTD sections list, as the retired screen did, wherever the listing puts it.
    await waitFor(() => expect(codesShown()).toEqual(['us_1.1', 'us_1.2']));
    expect(listMenu().value).toBe('contextOfUse');
    expect(Array.from(listMenu().options).map((o) => o.textContent)).toEqual(['Submission type (1)', 'Context of use (CTD sections) (2)']);

    fireEvent.change(listMenu(), { target: { value: 'submissionType' } });
    await waitFor(() => expect(codesShown()).toEqual(['us_original']));
    expect(reads()).toContain(LIST_URL('submissionType'));

    fireEvent.change(listMenu(), { target: { value: 'contextOfUse' } });
    await waitFor(() => expect(codesShown()).toEqual(['us_1.1', 'us_1.2']));
    fireEvent.change(filterBox(), { target: { value: 'cover' } });
    await waitFor(() => expect(codesShown()).toEqual(['us_1.2']));
    fireEvent.change(filterBox(), { target: { value: 'nothing-like-this' } });
    await waitFor(() => expect(text()).toMatch(/No codes match your filter/));
  });

  it('a slower answer for an earlier pick never paints over the list now picked', async () => {
    routeReads({
      list: (id) => (id === 'contextOfUse'
        ? () => new Promise<Response>((resolve) => setTimeout(() => resolve(ok(CODES.contextOfUse)), 200))
        : ok(CODES[id])),
    });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });
    await waitFor(() => expect(listMenu().value).toBe('contextOfUse'));
    fireEvent.change(listMenu(), { target: { value: 'submissionType' } });
    await waitFor(() => expect(codesShown()).toEqual(['us_original']));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(listMenu().value).toBe('submissionType');
    expect(codesShown()).toEqual(['us_original']);
  });

  it('reads only a code list the listing supplied', async () => {
    routeReads({ listing: ok({ ...LISTING, v4: LISTING.v4.filter((l) => l.id === 'submissionType') }) });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });
    await waitFor(() => expect(codesShown()).toEqual(['us_original']));
    expect(reads()).not.toContain(LIST_URL('contextOfUse'));
  });
});

describe('honest reads', () => {
  it('a failed reference read is an error with Try again, never an empty list, and Try again reads again', async () => {
    let healthy = false;
    routeReads({ spec: () => (healthy ? ok(SPEC_VERSIONS) : fail()), listing: () => (healthy ? ok(LISTING) : fail()) });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
    expect(text()).toMatch(/Couldn’t load the controlled vocabulary/);
    expect(text()).not.toMatch(/No spec versions|No v3\.2\.2 coded-attribute lists/);

    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });
    await waitFor(() => expect(text()).toMatch(/Couldn’t load the controlled vocabulary/));
    // A failed listing is not a picker with nothing in it.
    expect(screen.queryByLabelText('Controlled vocabulary list')).toBeNull();
    expect(reads().filter((u) => u.startsWith(`${LISTING_URL}/`))).toEqual([]);

    healthy = true;
    const panel = screen.getByRole('region', { name: 'eCTD reference' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(specLabels()).toHaveLength(4));
    await waitFor(() => expect(codesShown()).toEqual(['us_1.1', 'us_1.2']));
  });

  it('the spec table has its own Try again', async () => {
    let healthy = false;
    routeReads({ spec: () => (healthy ? ok(SPEC_VERSIONS) : fail()) });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
    healthy = true;
    const card = screen.getByRole('region', { name: 'Qualified against' });
    fireEvent.click(within(card).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(specLabels()).toHaveLength(5));
  });

  it('a failed code-list read has its own Try again, which reads that list again', async () => {
    let attempts = 0;
    routeReads({ list: (id) => (id === 'contextOfUse' && ++attempts === 1 ? fail() : ok(CODES[id])) });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });
    await waitFor(() => expect(text()).toMatch(/Couldn’t load this code list/));
    expect(codesShown()).toEqual([]);
    expect(text()).not.toMatch(/No codes/);

    const panel = screen.getByRole('region', { name: 'eCTD reference' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(codesShown()).toEqual(['us_1.1', 'us_1.2']));
    expect(reads().filter((u) => u === LIST_URL('contextOfUse'))).toHaveLength(2);
  });

  it('a body in the wrong shape is a failed read, not a crashed surface', async () => {
    routeReads({ spec: ok({ data: [] }), listing: ok({ v4: {}, v3: [] }) });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
    expect(text()).toMatch(/Couldn’t load the controlled vocabulary/);
    expect(text()).toContain('Compile & Export eCTD');
  });

  it('the first frame and an in-flight read never render an empty verdict', async () => {
    const late = () => new Promise<Response>((resolve) => setTimeout(() => resolve(fail()), 150));
    routeReads({ spec: late, listing: late });
    render(<EctdCompile {...props()} />);
    expect(text()).toMatch(/Loading spec versions/);
    expect(text()).not.toMatch(/No spec versions/);
    expect(text()).not.toMatch(/No codes/);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
  });

  it('an empty answer says it is what the service returned, not a failed read', async () => {
    routeReads({ spec: ok({ 'v3.2.2': null, 'v4.0': null }), listing: ok({ regionalIgOid: '', v4: [], v3: [] }) });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(text()).toMatch(/No spec versions/));
    expect(text()).toMatch(/lists no versions qualified for v3\.2\.2.*not a failed read/);
    expect(text()).toMatch(/answered with no v3\.2\.2 lists.*not a failed read/);
    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });
    await waitFor(() => expect(text()).toMatch(/answered with no v4\.0 lists.*not a failed read/));
    expect(reads().filter((u) => u.startsWith(`${LISTING_URL}/`))).toEqual([]);
  });
});

describe('with no project open', () => {
  it('the reference is still there, and nothing project-scoped is read', async () => {
    delete (window as any).C2C_PROJECT;
    render(<EctdCompile {...props()} />);
    expect(screen.getByText(/Open a project to compile its eCTD/)).toBeTruthy();
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    expect([...new Set(reads())].sort()).toEqual([LISTING_URL, SPEC_URL]);
  });
});

describe("AnA's view of the reference, in eCTD Compile's own context", () => {
  it('names the version, the specifications and the lists it shows', async () => {
    render(<><EctdCompile {...props()} /><Probe /></>);
    await waitFor(() => expect(reference()?.readState).toBe('ready'));
    expect(reference()).toMatchObject({
      version: 'v3.2.2',
      compiledVersion: 'v3.2.2',
      specVersions: { 'ICH backbone': 'ICH eCTD v3.2.2', 'FDA regional DTD': SPEC_VERSIONS['v3.2.2'].fdaRegionalDtd },
      codedAttributeListCount: 3,
    });
    expect(String(reference()?.readOnly)).toMatch(/changes nothing the compile assembles/);
    expect(seen?.summary).toMatch(/eCTD reference shows v3\.2\.2, the version this compile assembles/);

    fireEvent.change(versionMenu(), { target: { value: 'v4.0' } });
    await waitFor(() => expect(reference()?.codeListState).toBe('ready'));
    fireEvent.change(filterBox(), { target: { value: 'cover' } });
    await waitFor(() => expect(reference()?.filteredCodeCount).toBe(1));
    expect(reference()).toMatchObject({ version: 'v4.0', regionalIgOid: OID, selectedList: 'contextOfUse', filter: 'cover' });
    expect(seen?.summary).toMatch(/reference only/i);
  });

  it('a failed read reaches AnA as a failed read, with no counts', async () => {
    routeReads({ spec: fail(), listing: fail() });
    render(<><EctdCompile {...props()} /><Probe /></>);
    await waitFor(() => expect(reference()?.readState).toBe('error'));
    expect(reference()).not.toHaveProperty('specVersions');
    expect(reference()).not.toHaveProperty('codedAttributeListCount');
    expect(seen?.summary).toMatch(/did not load.*failed read, not an empty register/);
  });
});

describe("AnA's hands on the reference: the three view-only actions, under ectd-compile", () => {
  it('switches the reference version, and the menu a person reads really moved; the detail says what the compile builds', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    const out = send('ectd-compile.set-reference-version', { version: 'v4.0' });
    await applied(out);
    expect(String(out.settled()?.detail)).toMatch(/Showing the v4\.0 register — reference only; this compile assembles v3\.2\.2/);
    await waitFor(() => expect(versionMenu().value).toBe('v4.0'));
    await waitFor(() => expect(specLabels()).toHaveLength(4));
    const back = send('ectd-compile.set-reference-version', { version: 'v3.2.2' });
    await applied(back);
    await waitFor(() => expect(versionMenu().value).toBe('v3.2.2'));
  });

  it('opens a code list by its id, held while the listing loads, then the browser shows it', async () => {
    let land!: () => void;
    const listingLanded = new Promise<void>((resolve) => (land = resolve));
    routeReads({ listing: async () => { await listingLanded; return ok(LISTING); } });
    render(<EctdCompile {...props()} />);
    await applied(send('ectd-compile.set-reference-version', { version: 'v4.0' }));
    const out = send('ectd-compile.open-code-list', { list: 'submissionType' });
    expect(out.immediate.status).toBe('stashed');
    land();
    await applied(out);
    expect(String(out.settled()?.detail)).toMatch(/Opened the submissionType code list/);
    await waitFor(() => expect(listMenu().value).toBe('submissionType'));
    await waitFor(() => expect(codesShown()).toEqual(['us_original']));
  });

  it('refuses honestly: under v3.2.2, on a name no list has, and when the listing could not be read', async () => {
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(specLabels()).toHaveLength(5));
    await refusedWith(send('ectd-compile.open-code-list', { list: 'contextOfUse' }), /v3\.2\.2 has no per-list code browser/);
    await applied(send('ectd-compile.set-reference-version', { version: 'v4.0' }));
    await refusedWith(send('ectd-compile.open-code-list', { list: 'nothingLikeThis' }), /No controlled-vocabulary list named "nothingLikeThis"/);
    cleanup();
    __resetSurfaceActionBus();

    routeReads({ spec: fail(), listing: fail() });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load the controlled vocabulary/));
    await applied(send('ectd-compile.set-reference-version', { version: 'v4.0' }));
    await refusedWith(send('ectd-compile.open-code-list', { list: 'contextOfUse' }), /could not be read, so no code lists are available/);
  });

  it('filters the open code list by text, and clears it', async () => {
    render(<EctdCompile {...props()} />);
    await applied(send('ectd-compile.set-reference-version', { version: 'v4.0' }));
    await waitFor(() => expect(codesShown()).toEqual(['us_1.1', 'us_1.2']));
    const out = send('ectd-compile.filter-codes', { query: 'cover' });
    await applied(out);
    expect(String(out.settled()?.detail)).toMatch(/Filtered the code list by "cover"/);
    await waitFor(() => expect(codesShown()).toEqual(['us_1.2']));
    expect(filterBox().value).toBe('cover');
    // No query clears it.
    const cleared = send('ectd-compile.filter-codes');
    await applied(cleared);
    expect(String(cleared.settled()?.detail)).toMatch(/Cleared the code filter/);
    await waitFor(() => expect(codesShown()).toEqual(['us_1.1', 'us_1.2']));
  });
});

describe('moved, not copied', () => {
  it('one client module reads the reference routes', () => {
    const root = path.resolve(__dirname, '../../..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
        } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) {
          const src = fs.readFileSync(p, 'utf8');
          // A read names its path as a literal; a comment that mentions one does not count.
          if ([`'${SPEC_URL}'`, `'${LISTING_URL}'`, `\`${LISTING_URL}/`].some((lit) => src.includes(lit))) {
            hits.push(path.relative(root, p));
          }
        }
      }
    };
    walk(root);
    expect(hits).toEqual([path.join('concept2cure', 'v2', 'surfaces', 'EctdCompileReference.tsx')]);
  });
});
