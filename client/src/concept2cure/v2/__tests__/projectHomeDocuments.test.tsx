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
 *   - a module row opens the project's newest document in that module;
 *   - the grid is gone, and its two filing doors are on Submit: "Compile and
 *     download" (ectd-compile) and "Open readiness" (dispatch-readiness);
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
/* GET /:id/dossier (F23): one row per module of the home filing. */
const dossierRow = (module: string, label: string, counted: number) => ({
  group: 'module', module, agency: null, label, documentId: 'doc_home', counted, complete: 0, inReview: 0, drafted: 0,
  figure: { state: 'measured', pct: 0, counted, complete: 0 }, lastUpdated: null,
});
const DOSSIER = {
  projectId: PID, measuredAt: '2026-10-22T09:00:00.000Z', home: { state: 'measured', pct: 0, counted: 6, complete: 0 }, markets: [],
  rows: [dossierRow('2', 'Module 2 · Summaries', 1), dossierRow('3', 'Module 3 · Quality (CMC)', 3), dossierRow('5', 'Module 5 · Clinical', 2)],
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

  it('a module row opens the project\'s newest document in that module, not the editor\'s list', async () => {
    serve();
    const p = props();
    render(<ProjectHome {...p} />);
    // A row is a button once there is a document to open.
    await waitFor(() => expect(moduleRow('Module 2 · Summaries')?.tagName).toBe('BUTTON'));
    fireEvent.click(moduleRow('Module 2 · Summaries')!);
    expect(target(), 'the row named no document').toMatchObject({ docId: 'doc-25', programId: PID });
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');

    // Module 3's row opens the Module 3 document.
    fireEvent.click(screen.getByRole('button', { name: /^Module 3 · Quality \(CMC\): 0 of 3 approved or locked, 0%\. Open Drug substance \(3\.2\.S\)$/ }));
    expect(target()).toMatchObject({ docId: 'doc-32s' });

    // Module 5 has no document of this project: a row with nothing to click.
    expect(moduleRow('Module 5 · Clinical')?.tagName, 'a module with no document is not a button').toBe('DIV');
  });

  it('offers the editor and the organisation\'s protocols as doors', async () => {
    serve();
    const p = props();
    (window as unknown as { C2C_EDITOR_TARGET?: unknown }).C2C_EDITOR_TARGET = { docId: 'stale', setAt: Date.now() };
    render(<ProjectHome {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: /Open in Authoring/ }));
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
    expect(target(), 'an older target does not ride along').toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /Protocols \(organisation-wide\)/ }));
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

  it('the Evidence blurb says what the tab holds', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await open('Evidence');
    expect(document.querySelector('.pj-stageband-blurb')?.textContent).toBe('Project files and the data room the documents are written from');
  });
});

describe('Submit — the grid\'s filing doors', () => {
  it('"Compile and download" opens eCTD compile, and "Open readiness" opens the readiness screen', async () => {
    serve();
    const p = props();
    render(<ProjectHome {...p} />);
    await open('Submit');
    fireEvent.click(await screen.findByRole('button', { name: /Compile and download/ }));
    expect(p.onNav).toHaveBeenCalledWith('ectd-compile');
    fireEvent.click(screen.getByRole('button', { name: /Open readiness/ }));
    expect(p.onNav).toHaveBeenCalledWith('dispatch-readiness');
  });
});

describe('Review findings — the row, the handoff and the filing type say what they do', () => {
  it('a module row names the sections as the figure and the document it opens in words, and how many the module holds', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(moduleRow('Module 2 · Summaries')?.tagName).toBe('BUTTON'));
    // The figure is the module's sections approved or locked, not the document's progress.
    expect(moduleRow('Module 2 · Summaries')!.getAttribute('aria-label'))
      .toBe('Module 2 · Summaries: 0 of 1 approved or locked, 0%. Open Clinical overview (2.5), the newest of 2 Module 2 documents');
    // The document is visible in words, not only in a hover title.
    const named = Array.from(document.querySelectorAll('[data-testid="pj-lmod-doc"]')).map((e) => e.textContent);
    expect(named).toEqual([
      'Opens Clinical overview (2.5), the newest of 2 Module 2 documents',
      'Opens Drug substance (3.2.S)',
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
    await screen.findByRole('button', { name: /Open Submission Center/ });
    expect(screen.queryByRole('button', { name: /Compile and download/ }), 'an eCTD compile door on a 510(k)').toBeNull();
    const later = screen.getByTestId('pj-coming-later').textContent ?? '';
    expect(later).not.toMatch(/IND/);
    expect(later).not.toMatch(/variation classifier/);
    // The device line's wording (PJ_LIFECYCLE laterDevice), not the drug line's.
    expect(later).toMatch(/Registration lifecycle tracking and market access/);
  });

  it('a drug project still names IND annual-report tracking as coming later', async () => {
    serve();
    render(<ProjectHome {...props()} />);
    await open('Submit');
    await screen.findByRole('button', { name: /Compile and download/ });
    expect(screen.getByTestId('pj-coming-later').textContent).toMatch(/IND annual-report tracking/);
  });
});
