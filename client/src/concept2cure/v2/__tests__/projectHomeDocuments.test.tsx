// @vitest-environment jsdom
/**
 * Author holds the project's documents; Evidence holds intake.
 *
 * docs/design/FILING_SPINE.md §2 ("Evidence", "Author"), §6 rows 4–6 and slice
 * F3. On the project page:
 *   - "Every capability, scoped to this project" launched organisation-level
 *     apps from inside the project;
 *   - "Recent drafts" listed governed sections filtered on a status editor work
 *     never moves, and a row opened the editor without the draft;
 *   - a Module completion row opened the editor's list, not the module;
 *   - the data room sat under Author, and its "Write from these sources"
 *     opened the editor with no document and no sources.
 *
 * Now:
 *   - Author lists the project's documents from GET /api/authoring/docs?
 *     programId=<uuid>, and a row opens THAT document through the editor
 *     target (docId and programId); a failed read is an error with a retry;
 *   - a module row opens the editing copy of the filing it measures, by the
 *     copy's binding (F3, 2026-10-29); it named the newest document TAGGED with
 *     its module, so the home Module 1 row could open an added market's copy;
 *   - the grid is gone, and its two filing doors went to Submit: "Compile and
 *     download" (ectd-compile) and "Check what stops sending" (dispatch-readiness;
 *     "Open readiness" until slice A.1 named each door for its job). F10
 *     removed the second: each market row shows the readiness itself;
 *   - the data room is on Evidence, and "Write from these sources" hands the
 *     readable sources to AnA, as "Draft with N pinned" does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '7c4e2a90-3333-4444-8555-666677778888';
const DOCS_URL = `/api/authoring/docs?programId=${PID}`;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const down = () => ({ ok: false, status: 503, json: async () => ({ error: 'The authoring store is unavailable.' }) }) as unknown as Response;

const doc = (over: Record<string, unknown>) => ({
  id: 'doc', title: 'Untitled', module: 'M2', status: 'draft', section_count: 1,
  updated_at: '2026-10-01T09:00:00Z', provenance_source: null, conversation_id: null, program_id: PID, ...over,
});
/* Newest first, as the route orders them. */
const DOCS = [
  doc({ id: 'doc-25', title: 'Clinical overview (2.5)', module: 'M2', status: 'IN_REVIEW', section_count: 3, updated_at: '2026-10-07T10:00:00Z', provenance_source: 'ana' }),
  doc({ id: 'doc-32s', title: 'Drug substance (3.2.S)', module: 'M3', updated_at: '2026-10-05T10:00:00Z' }),
  doc({ id: 'doc-24', title: 'Nonclinical overview (2.4)', module: 'M2', updated_at: '2026-10-01T10:00:00Z' }),
];
/* The two editing copies: the home filing's (one module tag, as the server
   defaults it) and an added market's (F22b creates it tagged M1), newest. */
const HOME_COPY = doc({ id: 'doc-copy', title: 'IND editing copy', module: 'M3', updated_at: '2026-09-20T10:00:00Z', c2c_document_id: 'doc_home' });
const EMA_COPY = doc({ id: 'doc-ema-copy', title: 'EMA MAA editing copy', module: 'M1', updated_at: '2026-10-08T10:00:00Z', c2c_document_id: 'doc_ema' });
/* GET /:id/dossier (F23): one row per module of the home filing. */
const dossierRow = (module: string, label: string, counted: number, documentId = 'doc_home', agency: string | null = null) => ({
  group: 'module', module, agency, label, documentId, counted, complete: 0, inReview: 0, drafted: 0,
  figure: { state: 'measured', pct: 0, counted, complete: 0 }, lastUpdated: null,
});
const DOSSIER = {
  projectId: PID, measuredAt: '2026-10-22T09:00:00.000Z', home: { state: 'measured', pct: 0, counted: 6, complete: 0 }, markets: [],
  rows: [dossierRow('1', 'Module 1 · Regional', 2), dossierRow('2', 'Module 2 · Summaries', 1), dossierRow('3', 'Module 3 · Quality (CMC)', 3), dossierRow('5', 'Module 5 · Clinical', 2),
    dossierRow('1', 'Module 1 · Regional · EMA MAA', 4, 'doc_ema', 'ema')],
};
const source = (id: number, title: string, extractionStatus: string) => ({
  id, title, checksum: `sha-${id}`, ingestionStatus: 'ingested', extractionStatus, createdAt: '2026-10-01T09:00:00Z',
  mimeType: 'application/pdf', fileSize: 1000, artifactId: null, origin: 'chat_upload', extractionMethod: 'pdf-text',
  // The fields GET /:id/sources answers (shapeSource). Grounding requires each
  // to be positively true; an absent one is unknown, and unknown never grounds.
  isCurrent: true, dataEligible: true, disposition: null, textAvailable: extractionStatus === 'extracted',
});

type Opts = { docs?: () => Response; program?: Record<string, unknown>; sources?: () => Response };
function serve(opts: Opts = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PID}`) {
      return ok({ id: PID, name: 'BX-410', product_name: 'Torvanib', program_type: 'IND', status: 'active', ...opts.program });
    }
    if (url === DOCS_URL) return (opts.docs ?? (() => ok({ documents: DOCS })))();
    if (url === `/api/c2c/projects/${PID}/dossier`) return ok(DOSSIER);
    if (url === `/api/c2c/projects/${PID}/sources`) {
      if (opts.sources) return opts.sources();
      return ok({ projectId: PID, sources: [source(11, 'csr-study-101.pdf', 'extracted'), source(12, 'scan.pdf', 'failed')] });
    }
    if (url.startsWith('/api/chat/threads?program_id=')) return ok({ threads: [] });
    // The project's Skills card (ProjectSkills.tsx): nothing deployed, read-only.
    if (url === `/api/ana-skills/projects/${PID}`) return ok({ projectId: 1, settings: [], skills: [], alwaysMax: 3, canChange: false });
    return ok({});
  });
}

const props = () =>
  ({ surface: { id: 'project-home', label: 'Project home' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const tab = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find((b) => b.textContent?.trim() === label);
async function open(label: string) {
  await waitFor(() => expect(tab(label), `the ${label} tab`).toBeTruthy());
  fireEvent.click(tab(label)!);
  await waitFor(() => expect(tab(label)!.getAttribute('data-status')).toBe('active'));
}
const target = () => (window as unknown as { C2C_EDITOR_TARGET?: Record<string, unknown> }).C2C_EDITOR_TARGET;
const moduleRow = (startsWith: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.pj-lmod')).find((r) => r.textContent?.startsWith(startsWith));

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  for (const k of ['C2C_PROJECT', 'C2C_EDITOR_TARGET', 'C2C_SOURCE_PINS', 'C2C_CONVO']) {
    delete (window as unknown as Record<string, unknown>)[k];
  }
});

describe('Author — the project\'s documents', () => {
  it('lists the project\'s documents from the program-scoped read, with status in words', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText('Clinical overview (2.5)')).toBeTruthy();
    expect(screen.getByText('Drug substance (3.2.S)')).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[1] === DOCS_URL), 'read by the program, every source').toBe(true);
    expect(screen.getByText('In review')).toBeTruthy();
  });

  it('a row opens THAT document, by id, in this program', async () => {
    serve();
    const p = props();
    render(<ProjectHome {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Clinical overview (2.5)' }));
    expect(target()).toMatchObject({ docId: 'doc-25', programId: PID });
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
  });

  it('a failed read is an error with a retry, never an empty list, and the retry reads again', async () => {
    let failures = 1;
    serve({ docs: () => (failures-- > 0 ? down() : ok({ documents: DOCS })) });
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText('Couldn’t list this project’s documents')).toBeTruthy();
    expect(screen.getByText(/The authoring store is unavailable\. This is a failed read, not an empty list\./)).toBeTruthy();
    expect(screen.queryByText(/No documents in this project yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Clinical overview (2.5)')).toBeTruthy();
  });

  it('an empty project says so in words', async () => {
    serve({ docs: () => ok({ documents: [] }) });
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/No documents in this project yet/)).toBeTruthy();
  });

  it('"Recent drafts" and the Workspace grid are gone, and nothing reads the drafts', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(moduleRow('Module 2')).toBeTruthy());
    expect(screen.queryByText(/Every capability, scoped to this project/)).toBeNull();
    expect(document.querySelector('.pj-toolgrp'), 'a workspace tool group').toBeNull();
    expect(screen.queryByText('Recent drafts')).toBeNull();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).endsWith('/drafts'))).toBe(false);
  });

  it('a module row opens the editing copy of the filing it measures, never the newest document tagged with its module', async () => {
    serve({ docs: () => ok({ documents: [EMA_COPY, ...DOCS, HOME_COPY] }) });
    const p = props();
    render(<ProjectHome {...p} />);
    await waitFor(() => expect(moduleRow('Module 2 · Summaries')?.tagName).toBe('BUTTON'));
    // Module 2: at head, the newest M2-tagged document (doc-25), an unbound working document.
    fireEvent.click(moduleRow('Module 2 · Summaries')!);
    expect(target(), 'the row named no document').toMatchObject({ docId: 'doc-copy', programId: PID, sectionWithin: 'M2' });
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
    // Module 1: at head, the EMA market's copy, the newest M1-tagged document.
    fireEvent.click(moduleRow('Module 1 · Regional ·')!);
    expect(target()).toMatchObject({ docId: 'doc-copy' });
    // Module 5: no document is tagged M5, and it is the same filing's copy.
    fireEvent.click(moduleRow('Module 5 · Clinical')!);
    expect(target()).toMatchObject({ docId: 'doc-copy' });
    expect(screen.getAllByText('Opens IND editing copy').length).toBe(4);
  });

  it('an added market\'s rows open that market\'s editing copy', async () => {
    serve({ docs: () => ok({ documents: [EMA_COPY, ...DOCS, HOME_COPY] }) });
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(moduleRow('Module 1 · Regional · EMA MAA')?.tagName).toBe('BUTTON'));
    fireEvent.click(moduleRow('Module 1 · Regional · EMA MAA')!);
    expect(target()).toMatchObject({ docId: 'doc-ema-copy', programId: PID, sectionWithin: 'M1' });
  });

  it('with no editing copy the row says so and has nothing to click; a market\'s says where one is made', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(moduleRow('Module 2 · Summaries')).toBeTruthy());
    expect(moduleRow('Module 2 · Summaries')?.tagName, 'a filing with no copy is not a button').toBe('DIV');
    expect(screen.getAllByText('No editing copy of this filing yet.').length).toBe(4);
    expect(screen.getByText(/No editing copy of this market.s documents yet\. Create one from the filing list in the editor\./)).toBeTruthy();
  });

  it('two documents bound to one filing: said, and neither is opened', async () => {
    const second = doc({ id: 'doc-copy-2', title: 'Second copy', c2c_document_id: 'doc_home' });
    serve({ docs: () => ok({ documents: [...DOCS, HOME_COPY, second] }) });
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(screen.getAllByText('2 documents are bound to this filing, so none is opened from here.').length).toBe(4));
    expect(moduleRow('Module 2 · Summaries')?.tagName).toBe('DIV');
  });

  it('when the documents could not be read, the row says its copy is not known, never that there is none', async () => {
    serve({ docs: down });
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(screen.getAllByText('The project\'s documents could not be read, so its editing copy is not known.').length).toBe(5));
    expect(screen.queryByText('No editing copy of this filing yet.')).toBeNull();
    expect(moduleRow('Module 2 · Summaries')?.tagName).toBe('DIV');
  });

  it('offers the editor and the protocol workspace as doors', async () => {
    serve();
    const p = props();
    (window as unknown as { C2C_EDITOR_TARGET?: unknown }).C2C_EDITOR_TARGET = { docId: 'stale', setAt: Date.now() };
    render(<ProjectHome {...p} />);
    /* Slice A.1: "Open in Authoring" named only where it went (section 9, Door names). */
    fireEvent.click(await screen.findByRole('button', { name: 'Find or start a document in the editor' }));
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
    expect(target(), 'an older target does not ride along').toBeUndefined();
    /* Slice 0: the door said "Protocols (organisation-wide)". Protocols carry the project's key since
       20261014_protocol_program_scope.sql, and the workspace lists the open project's, so the door names
       the job, not a scope that stopped being true. */
    expect(screen.queryByText(/organisation-wide|organization-wide/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Write the protocol in the protocol workspace/ }));
    expect(p.onNav).toHaveBeenCalledWith('protocol-dev');
  });
});

describe('Evidence — every way a source comes in', () => {
  it('Evidence has the data room and Author does not', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(moduleRow('Module 2')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Data room' }), 'the data room under Author').toBeNull();
    await open('Evidence');
    expect(await screen.findByRole('heading', { name: 'Data room' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Project files' })).toBeTruthy();
  });

  it('"Write from these sources" hands the readable sources to AnA and never opens the editor', async () => {
    serve();
    const p = props();
    render(<ProjectHome {...p} />);
    // Wherever the data room is: the claim here is what its button does.
    await waitFor(() => expect(moduleRow('Module 2')).toBeTruthy());
    if (!screen.queryByRole('heading', { name: 'Data room' })) await open('Evidence');
    await screen.findByText('csr-study-101.pdf');
    fireEvent.click(screen.getByRole('button', { name: /Write from these sources/ }));
    expect(p.onNav).not.toHaveBeenCalledWith('document-authoring');
    expect((window as unknown as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS, 'only the readable source').toEqual(['11']);
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    expect(String(p.onAsk.mock.calls[0][0])).toMatch(/1 readable source/);
  });

  it('the project files\' door names its job: "Add or find files in Vault" opens the Vault', async () => {
    serve();
    const p = props();
    render(<ProjectHome {...p} />);
    await open('Evidence');
    /* Slice A.1: it read "Open in Vault", a door that named only where it went (section 9, Door names). */
    fireEvent.click(await screen.findByRole('button', { name: 'Add or find files in Vault' }));
    expect(p.onNav).toHaveBeenCalledWith('vault');
  });

  it('the Evidence blurb says what the tab holds', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await open('Evidence');
    expect(document.querySelector('.pj-stageband-blurb')?.textContent).toBe('Project files and the data room the documents are written from');
  });
});

describe('Submit — the grid\'s filing doors', () => {
  it('"Compile and download" opens eCTD compile; readiness has no door of its own', async () => {
    serve();
    const p = props();
    render(<ProjectHome {...p} />);
    await open('Submit');
    fireEvent.click(await screen.findByRole('button', { name: /Compile and download/ }));
    expect(p.onNav).toHaveBeenCalledWith('ectd-compile');
    // F10 (P-33): "Check what stops sending" opened a second readiness screen; each market row shows it now
    // (submitHoldsReadiness.test.tsx).
    expect(screen.queryByRole('button', { name: 'Check what stops sending' })).toBeNull();
  });
});

describe('Review findings — the row, the handoff and the filing type say what they do', () => {
  it('a module row names the sections as the figure and the document it opens in words', async () => {
    serve({ docs: () => ok({ documents: [...DOCS, HOME_COPY] }) });
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(moduleRow('Module 2 · Summaries')?.tagName).toBe('BUTTON'));
    // The figure is the module's sections approved or locked, not the document's progress.
    expect(moduleRow('Module 2 · Summaries')!.getAttribute('aria-label'))
      .toBe('Module 2 · Summaries: 0 of 1 approved or locked, 0%. Open IND editing copy');
    // The document is visible in words, not only in a hover title; a row with no copy says so.
    const named = Array.from(document.querySelectorAll('[data-testid="pj-lmod-doc"]')).map((e) => e.textContent);
    expect(named).toEqual([
      'Opens IND editing copy', 'Opens IND editing copy', 'Opens IND editing copy', 'Opens IND editing copy',
      'No editing copy of this market\'s documents yet. Create one from the filing list in the editor.',
    ]);
  });

  it('"Write from these sources" hands over the 10 newest readable sources, and says "newest"', async () => {
    const many = Array.from({ length: 12 }, (_, i) => source(100 + i, `source-${100 + i}.pdf`, 'extracted'));
    serve({ sources: () => ok({ projectId: PID, sources: many }) });
    const p = props();
    render(<ProjectHome {...p} />);
    await open('Evidence');
    await screen.findByText('source-100.pdf');
    const btn = screen.getByRole('button', { name: /Write from these sources/ });
    expect(btn.getAttribute('title')).toBe('Ask AnA to draft from the 10 newest readable sources in this data room');
    fireEvent.click(btn);
    // The route lists newest first: the first ten.
    expect((window as unknown as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS)
      .toEqual(Array.from({ length: 10 }, (_, i) => String(100 + i)));
    expect(String(p.onAsk.mock.calls[0][0])).toBe("Use the 10 newest readable sources in this project's data room as the context for drafting.");
  });

  it('a data room cut by the server window says "newest", even under the limit', async () => {
    serve({
      sources: () => ok({
        projectId: PID,
        sources: [source(21, 'a.pdf', 'extracted'), source(22, 'b.pdf', 'extracted')],
        window: { shown: 2, truncated: true },
      }),
    });
    const p = props();
    render(<ProjectHome {...p} />);
    await open('Evidence');
    await screen.findByText('a.pdf');
    fireEvent.click(screen.getByRole('button', { name: /Write from these sources/ }));
    expect(String(p.onAsk.mock.calls[0][0])).toBe("Use the 2 newest readable sources in this project's data room as the context for drafting.");
  });

  it('a device project is not offered the eCTD compiler, and its coming-later line names no IND work', async () => {
    serve({ program: { product_type: 'device', program_type: '510(k)', regulatory_path: '510k' } });
    render(<ProjectHome {...props()} />);
    await open('Submit');
    await screen.findByRole('button', { name: 'See every sequence in Submission Center' });
    expect(screen.queryByRole('button', { name: /Compile and download/ }), 'an eCTD compile door on a 510(k)').toBeNull();
    const later = screen.getByTestId('pj-coming-later').textContent ?? '';
    expect(later).not.toMatch(/IND/);
    expect(later).not.toMatch(/variation classifier/);
    // The device line's wording (PJ_LIFECYCLE laterDevice), not the drug line's.
    expect(later).toBe('Coming later: Each market’s registration status and renewal date; renewals and post-market obligations tracked as they fall due.');
  });

  it('a drug project names what Submit does not show yet, and nothing IND forms already does', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await open('Submit');
    await screen.findByRole('button', { name: /Compile and download/ });
    const later = screen.getByTestId('pj-coming-later').textContent ?? '';
    /* Slice A.1: it named "IND annual-report tracking", which IND forms assembles, downloads and files
       into a sequence today, and AnA's variation classifier and regulatory intelligence. */
    expect(later).toBe(
      'Coming later: Each approved market’s registration status and renewal date; renewals and post-approval ' +
      'obligations tracked as they fall due; safety reports with their reporting clock.',
    );
    expect(later).not.toMatch(/annual[- ]report|variation classifier|intelligence/i);
  });
});
