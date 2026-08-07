// @vitest-environment jsdom
/**
 * "Open in editor" — the handoff, at render level.
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * Three buttons (Biostatistics, ReportEngine, CmcModule) wrote
 * `{title, md}` into localStorage['c2c_biostat_doc'] and navigated to
 * `document-authoring`. Nothing has ever read that key — no getItem, in any
 * file, in any commit — so the user pressed a button naming a specific document,
 * landed in the editor, and the named document was not there. Two of the three
 * also toasted "opened in editor"; those toasts were deleted in f018695, which
 * left a button that navigated and claimed nothing.
 *
 * ── What must be true now ─────────────────────────────────────────────────────
 * The payload is CONTENT, not an id, so honouring it means CREATING the row:
 * POST /api/authoring/docs, then POST /api/authoring/sections carrying the
 * markdown, then navigate. These tests mount each surface, click the real
 * control, and assert what actually happens — including every way it can fail:
 *
 *   • both writes are awaited and the navigation happens only after BOTH land;
 *   • the section carries the SAME markdown the surface rendered — the
 *     deliverable travels, not a title;
 *   • a failed document create does not navigate and does not POST a section;
 *   • a failed section create does not navigate either — leaving for an editor
 *     that would show an empty document is the same silent loss in a new hat;
 *   • a thrown request does not navigate;
 *   • a double click creates ONE document, not two;
 *   • the retired localStorage note is never written again.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { Biostatistics } from '../surfaces/Biostatistics';
import { ReportEngine } from '../surfaces/ReportEngine';
import { CmcModule } from '../surfaces/CmcModule';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const DOC_URL = '/api/authoring/docs';
const SEC_URL = '/api/authoring/sections';

/** Every POST the handoff makes, in call order. */
const posts = () =>
  apiRequest.mock.calls.filter((c) => c[0] === 'POST' && (c[1] === DOC_URL || c[1] === SEC_URL));
const docCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === DOC_URL);
const secCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === SEC_URL);

let setItem: ReturnType<typeof vi.spyOn>;
/** Every localStorage/sessionStorage key written since the test began. */
const writtenKeys = (): string[] => (setItem.mock.calls as unknown as unknown[][]).map((c) => String(c[0]));

/** Default: both creates succeed with a real server-shaped row. */
function wireStore(over: (m: string, u: string, b?: any) => Response | null = () => null) {
  apiRequest.mockImplementation(async (m: string, u: string, b?: any) => {
    const o = over(m, u, b);
    if (o) return o;
    if (m === 'POST' && u === DOC_URL) return res({ success: true, document: { id: 'D-77', title: b?.title } }, 201);
    if (m === 'POST' && u === SEC_URL) return res({ success: true, section: { id: 'S-12', code: b?.code } }, 201);
    return res({});
  });
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});
beforeEach(() => {
  apiRequest.mockReset();
  wireStore();
  setItem = vi.spyOn(Storage.prototype, 'setItem');
});

const props = (id: string, onNav: () => void) => ({
  surface: { id, label: id } as any,
  onAsk: vi.fn(),
  onNav,
  segment: 'biopharma',
});

/* ══════════════════════════ Biostatistics ══════════════════════════ */

describe('Biostatistics — Open in editor', () => {
  it('creates the document, saves the markdown as a section, then navigates', async () => {
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);

    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));

    // Nothing is claimed before the server answers: the old handler navigated
    // synchronously, which is exactly the behaviour being removed.
    expect(onNav).not.toHaveBeenCalled();

    await waitFor(() => expect(secCalls()).toHaveLength(1));

    const doc = docCalls()[0][2];
    expect(doc).toMatchObject({ title: 'Sample Size Rationale', module: 'M5' });

    const sec = secCalls()[0][2];
    expect(sec).toMatchObject({
      doc_id: 'D-77',
      title: 'Sample Size Rationale',
      // NOT a CTD number: the editor binds outline nodes by exact code match, so
      // a numeric code here would assert a filing position this surface cannot
      // know.
      code: 'sample_size_rationale',
    });

    // The deliverable actually travels — the same markdown the surface rendered,
    // not just its title.
    expect(sec.content).toMatch(/^# Sample Size Rationale/);
    expect(sec.content).toMatch(/## Sample Size Determination/);
    expect(sec.content.length).toBeGreaterThan(400);

    // And only then the navigation.
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(posts().map((c) => c[1])).toEqual([DOC_URL, SEC_URL]);
  });

  it('never writes the retired localStorage note', async () => {
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    await waitFor(() => expect(onNav).toHaveBeenCalled());
    expect(writtenKeys()).not.toContain('c2c_biostat_doc');
  });

  it('scopes the document to the open project, like every project-aware surface', async () => {
    (window as any).C2C_PROJECT = { id: '11111111-2222-3333-4444-555555555555' };
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    await waitFor(() => expect(docCalls()).toHaveLength(1));
    expect(docCalls()[0][2]).toMatchObject({ client_program_id: '11111111-2222-3333-4444-555555555555' });
  });

  it('does NOT navigate when the document create fails — and saves no section', async () => {
    wireStore((m, u) => (m === 'POST' && u === DOC_URL ? res({ error: 'Failed to create document' }, 500) : null));
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);

    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));

    expect(await screen.findByText(/Couldn’t create the document/)).toBeTruthy();
    expect(screen.getByText(/Nothing was saved/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
    expect(secCalls()).toHaveLength(0);
    // The work is still on screen — the rendered document did not go anywhere.
    expect(document.querySelector('.bs-doc-render')?.textContent).toMatch(/Sample Size Determination/);
  });

  it('says so, and stays put, when the session is not authenticated', async () => {
    wireStore((m, u) => (m === 'POST' && u === DOC_URL ? res({ error: 'Authentication required' }, 401) : null));
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    expect(await screen.findByText(/isn’t authenticated/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
    expect(secCalls()).toHaveLength(0);
  });

  it('does NOT navigate when the section create fails — the text would be lost', async () => {
    wireStore((m, u) => (m === 'POST' && u === SEC_URL ? res({ error: 'Document is FROZEN/APPROVED' }, 403) : null));
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);

    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));

    expect(await screen.findByText(/its text didn’t save/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('does NOT navigate when the request throws', async () => {
    wireStore(() => { throw new Error('network down'); });
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    expect(await screen.findByText(/network down/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('a double click creates ONE document, not two', async () => {
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    const btn = screen.getByRole('button', { name: /Open in editor/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(onNav).toHaveBeenCalled());
    expect(docCalls()).toHaveLength(1);
    expect(secCalls()).toHaveLength(1);
  });

  it('hands off the document the user actually chose', async () => {
    const onNav = vi.fn();
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    fireEvent.click(screen.getByRole('button', { name: 'DSMB / DMC Charter' }));
    fireEvent.click(screen.getByRole('button', { name: /Open in editor/ }));
    await waitFor(() => expect(secCalls()).toHaveLength(1));
    expect(docCalls()[0][2]).toMatchObject({ title: 'DSMB / DMC Charter' });
    expect(secCalls()[0][2]).toMatchObject({ code: 'dsmb_charter' });
    expect(secCalls()[0][2].content).toMatch(/DSMB|Data Monitoring/i);
  });
});

/* ══════════════════════════ ReportEngine ══════════════════════════ */

const PROTOCOL = [
  'Title: A Phase 2 Study of BX-9 in Sickle Cell Disease',
  'Indication: Sickle cell disease',
  'Phase: 2',
  'Sample size: 240 subjects',
  'Duration: 52 weeks',
  'Primary endpoint: annualized vaso-occlusive crisis rate',
].join('\n');

function analyzed(onNav: () => void) {
  render(<ReportEngine {...props('report-engine', onNav)} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: PROTOCOL } });
  fireEvent.click(screen.getByRole('button', { name: /Analyze protocol/ }));
}

describe('ReportEngine — Open in editor', () => {
  it('creates the document and section from the AnswerLead action, then navigates', async () => {
    const onNav = vi.fn();
    analyzed(onNav);

    // The lead's primary action and the document bar's button are the same
    // handler — both must exist, and both must be the real handoff.
    fireEvent.click(await screen.findByRole('button', { name: /Open in document editor/ }));
    expect(onNav).not.toHaveBeenCalled();

    await waitFor(() => expect(secCalls()).toHaveLength(1));
    expect(docCalls()[0][2]).toMatchObject({ title: 'Design Recommendations', module: 'M5' });
    expect(secCalls()[0][2]).toMatchObject({ doc_id: 'D-77', code: 'recommendations' });
    expect(secCalls()[0][2].content).toMatch(/# Protocol Design Recommendations/);
    expect(secCalls()[0][2].content).toMatch(/Sickle cell disease/);
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(writtenKeys()).not.toContain('c2c_biostat_doc');
  });

  it('the document-bar button runs the same handoff', async () => {
    const onNav = vi.fn();
    analyzed(onNav);
    fireEvent.click(await screen.findByRole('button', { name: /Open in editor/ }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(docCalls()).toHaveLength(1);
    expect(secCalls()).toHaveLength(1);
  });

  it('does NOT navigate when the document create fails', async () => {
    wireStore((m, u) => (m === 'POST' && u === DOC_URL ? res({ error: 'Failed to create document' }, 500) : null));
    const onNav = vi.fn();
    analyzed(onNav);
    fireEvent.click(await screen.findByRole('button', { name: /Open in editor/ }));
    expect(await screen.findByText(/Couldn’t create the document/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
    expect(secCalls()).toHaveLength(0);
    // The analysis is still rendered where the user left it.
    expect(document.querySelector('.ra-doc')?.textContent).toMatch(/Protocol Design Recommendations/);
  });

  it('does NOT navigate when the section create fails', async () => {
    wireStore((m, u) => (m === 'POST' && u === SEC_URL ? res({ error: 'Document not found' }, 404) : null));
    const onNav = vi.fn();
    analyzed(onNav);
    fireEvent.click(await screen.findByRole('button', { name: /Open in editor/ }));
    expect(await screen.findByText(/its text didn’t save/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════ CmcModule ══════════════════════════ */

async function simulated(onNav: () => void) {
  render(<CmcModule {...props('cmc-module', onNav)} />);
  fireEvent.click(screen.getByRole('button', { name: /Change simulator/ }));
  const ta = await screen.findByPlaceholderText(/switch the drug-substance supplier/);
  fireEvent.change(ta, { target: { value: 'Move DS manufacture from Site A to Site B; equivalent process.' } });
  fireEvent.click(screen.getByRole('button', { name: /Simulate change/ }));
  return await screen.findByRole('button', { name: /Open in editor/ });
}

describe('CmcModule change simulator — Open in editor', () => {
  it('creates the document and section carrying the assessment, then navigates', async () => {
    const onNav = vi.fn();
    const btn = await simulated(onNav);

    fireEvent.click(btn);
    expect(onNav).not.toHaveBeenCalled();

    await waitFor(() => expect(secCalls()).toHaveLength(1));
    expect(docCalls()[0][2]).toMatchObject({
      title: 'Regulatory Change Impact Assessment',
      // Quality documentation files under Module 3, not the server's M3-by-
      // default accident — it is sent explicitly.
      module: 'M3',
    });
    expect(secCalls()[0][2]).toMatchObject({ doc_id: 'D-77', code: 'regulatory_change_impact_assessment' });
    expect(secCalls()[0][2].content).toMatch(/# Regulatory Change Impact Assessment/);
    expect(secCalls()[0][2].content).toMatch(/Move DS manufacture from Site A to Site B/);
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(writtenKeys()).not.toContain('c2c_biostat_doc');
  });

  it('does NOT navigate when the document create fails — the assessment stays on screen', async () => {
    const onNav = vi.fn();
    const btn = await simulated(onNav);
    wireStore((m, u) => (m === 'POST' && u === DOC_URL ? res({ error: 'Failed to create document' }, 500) : null));

    fireEvent.click(btn);

    expect(await screen.findByText(/Couldn’t create the document/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
    expect(secCalls()).toHaveLength(0);
    expect(document.querySelector('.cm-doc-render')?.textContent).toMatch(/Comparability Requirement/);
  });

  it('does NOT navigate when the section create fails', async () => {
    const onNav = vi.fn();
    const btn = await simulated(onNav);
    wireStore((m, u) => (m === 'POST' && u === SEC_URL ? res({ error: 'Document not found' }, 404) : null));

    fireEvent.click(btn);

    expect(await screen.findByText(/its text didn’t save/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
  });
});
