// @vitest-environment jsdom
/**
 * CmOverview — the section-approval table tells the signer what the approve
 * route and the export gate will refuse, and a failed register read is never
 * rendered as an empty register.
 *
 * ── Found live ────────────────────────────────────────────────────────────────
 * 21/21 sections approved, three of them compiled at 0% completeness with every
 * required input missing, and the Overview table showed key / path / state /
 * "Approve section" — no completeness anywhere. The signer approved content
 * that did not exist because nothing on the page said it did not.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 *   • every row shows the compiler's completeness, and an incomplete row names
 *     the missing inputs;
 *   • an incomplete section gets NO live "Approve section" — a disabled control
 *     whose title says why, plus a way to the build board where it is fixed;
 *   • a 409 from the approve route renders the server's own reason (which now
 *     also means "incomplete"), not a hard-coded contradiction sentence;
 *   • `meta.sectionsUnreadable` / `meta.portfolioUnreadable` render as failed
 *     reads — never as "No Module 3 sections yet" / "No submissions yet".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'lead@example.test', displayName: 'R. Lead' } }),
}));

import { CmOverview } from '../surfaces/CmcModule';
import { CmcQuestionsProvider } from '../surfaces/cmcAgencyQuestions';

type CmWindow = { __cmSetTab?: (id: string) => void; C2C_PROJECT?: unknown };

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const PATHS: Record<string, string> = {
  '3.2.S.1': 'General Information', '3.2.P.1': 'Description and Composition', '3.2.P.5': 'Control of Drug Product',
  '3.2.P.6': 'Container Closure System', '3.2.P.8': 'Stability',
};
const section = (key: string, st: string, completeness: number | null, missingInputs: string[] = []) => ({
  key, path: PATHS[key], st, completeness, missingInputs,
});

const META = {
  projectId: 'P-1',
  portfolioProvisioned: true,
  spinePortfolioProvisioned: true,
  sectionsProvisioned: true,
  portfolioUnreadable: false,
  sectionsUnreadable: false,
  generatedAt: '2026-09-06T00:00:00.000Z',
};

/** A loaded board for project P-1: one submission. Agency questions are not the board's (2026-10-19). */
const board = (overrides: Record<string, unknown> = {}) => ({
  portfolio: [{ sub: 'BLA 761234', product: 'Compound A', region: 'FDA', type: 'BLA', rpi: 82, ir: null, source: 'spine' }],
  sections: [],
  kpis: { submissions: 1, rpiAverage: 82, sectionsApproved: 0, sectionsTotal: 0, readyPercent: 0 },
  meta: META,
  ...overrides,
});

/* Module 3's view of P-1's letters (read once at the module root since
   2026-10-19): nothing outstanding, so the section narrative below is what
   the lead speaks. And an earlier CMC question file that holds nothing. */
const MODULE3 = /^\/api\/concept2cure\/projects\/P-1\/agency-questions\?ctdModule=3$/;
const MODULE3_EMPTY = {
  module: 3, today: '2026-10-19', questions: [], lettersWithoutQuestions: [],
  summary: { questions: 0, outstanding: 0, questionsOverdue: 0, lettersOverdue: 0, lettersWithoutQuestionsOverdue: 0, lettersOverdueOnOtherQuestions: 0, byState: {} },
  notCounted: { unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 0 }, withheld: 0, truncated: false,
};
/** How the earlier CMC question file answers: a count of rows not closed there, or a failed read. */
let earlierFile: { notClosed: number } | 'error' = { notClosed: 0 };
/** The two agency-question reads the module root makes, or null for any other call. */
function questionReads(m: string, u: string): Response | null {
  if (m !== 'GET') return null;
  if (MODULE3.test(u)) return res({ success: true, data: MODULE3_EMPTY });
  if (u === '/api/cmc/agency-questions') {
    if (earlierFile === 'error') throw Object.assign(new Error('The earlier CMC question file could not be read.'), { status: 500 });
    const n = earlierFile.notClosed;
    return res({ success: true, data: [], meta: { total: n, notClosed: n, listed: 0, truncated: false, provisioned: true } });
  }
  return null;
}
const renderOverview = () => render(<CmcQuestionsProvider><CmOverview ask={vi.fn()} /></CmcQuestionsProvider>);

const BOARD = /^\/api\/cmc\/module3-board(\?projectId=P-1)?$/;
const APPROVE = /\/api\/cmc\/module3-os\/sections\/P-1\/[^/]+\/approve$/;
const READINESS = /^\/api\/cmc\/module3-os\/readiness\/P-1$/;
/* The section a signer READS before signing it. §11.50 is a signature over
   content, so "Approve section" opens this and the signature form opens from
   inside it — the flow every approval test below now walks. */
const SECTION_READ = /^\/api\/cmc\/module3-os\/sections\/P-1\/([^/]+)$/;

const sectionRead = (key: string, overrides: Record<string, unknown> = {}) => ({
  sectionKey: key, sectionPath: PATHS[key] ?? key, title: PATHS[key] ?? key,
  approvalState: 'compiled', stale: false, staleReason: null,
  completeness: 100, missingInputs: [] as string[],
  narrative: `The composed body of section ${key}.`,
  tables: [{ title: 'Acceptance Criteria', headers: ['Test', 'Limit'], rows: [['Assay', '98.0-102.0%']] }],
  tablesUnknown: false,
  markdown: `## ${PATHS[key] ?? key}\n\nThe composed body of section ${key}.\n\n| Test | Limit |\n| --- | --- |\n| Assay | 98.0-102.0% |`,
  compiledHash: 'abc123def4567890', updatedAt: '2026-09-08T00:00:00.000Z',
  lineage: [{ sourceType: 'specification', sourceKey: 'specification:7', changedSinceCompile: false }],
  ...overrides,
});

/** Walk the read step: open a section's reader, then its signature form. */
async function openSignatureFor(name: RegExp = /Approve section/) {
  fireEvent.click(await screen.findByRole('button', { name }));
  fireEvent.click(await screen.findByRole('button', { name: /Sign & approve/ }));
}

/** A readiness verdict as GET /readiness returns it. */
const readinessOf = (overrides: Record<string, unknown> = {}) => ({
  totalSections: 1, approvedSections: 1, staleSections: 0, openCriticalContradictions: 0,
  sectionsWithoutProvenance: 0, incompleteApprovedSections: [] as string[], governedStateEvaluated: true, exportReady: true,
  ...overrides,
});

/** The board answers as given; the approve route answers with `approve`; readiness with `readiness`. */
function wire(boardData: unknown, approve?: () => Response, readiness?: () => Response, read?: () => Response) {
  apiRequest.mockImplementation(async (m: string, u: string) => {
    if (m === 'GET' && BOARD.test(u)) return res({ success: true, data: boardData });
    const questions = questionReads(m, u);
    if (questions) return questions;
    if (m === 'GET' && READINESS.test(u)) return readiness ? readiness() : res({ success: true, data: readinessOf() });
    if (m === 'POST' && APPROVE.test(u)) return approve ? approve() : res({ success: true, versionNumber: 1 });
    if (m === 'GET' && SECTION_READ.test(u)) {
      if (read) return read();
      const key = u.match(SECTION_READ)![1];
      return res({ success: true, data: sectionRead(decodeURIComponent(key)) });
    }
    return res({ success: true, data: [] });
  });
}

/** The approve POSTs the surface actually made. */
const approvePosts = () =>
  (apiRequest.mock.calls as Array<[string, string]>).filter((c) => c[0] === 'POST' && APPROVE.test(c[1]));

const row = (key: string) => screen.getByText(key, { selector: 'td' }).closest('tr') as HTMLElement;

beforeEach(() => {
  apiRequest.mockReset();
  earlierFile = { notClosed: 0 };
  (window as unknown as CmWindow).C2C_PROJECT = { id: 'P-1' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as CmWindow).C2C_PROJECT;
  delete (window as unknown as CmWindow).__cmSetTab;
});

describe('CmOverview — completeness on the section-approval table', () => {
  it('shows each section\'s completeness, names the missing inputs, and withholds approval from an incomplete one', async () => {
    wire(board({
      sections: [
        section('3.2.S.1', 'draft', 100),
        section('3.2.P.6', 'draft', 0, ['containerClosureDescription', 'suitabilityJustification']),
        section('3.2.P.8', 'approved', 60, ['shelfLifeJustification']),
        section('3.2.P.1', 'draft', null),
      ],
    }));
    const setTab = vi.fn();
    (window as unknown as CmWindow).__cmSetTab = setTab;
    renderOverview();
    await screen.findByText('3.2.P.6', { selector: 'td' });

    // The incomplete draft: its score, its missing inputs, and no live approval.
    const p6 = row('3.2.P.6');
    expect(within(p6).getByText('0%')).toBeTruthy();
    expect(within(p6).getByText(/containerClosureDescription/)).toBeTruthy();
    expect(within(p6).getByText(/suitabilityJustification/)).toBeTruthy();
    const withheld = within(p6).getByRole('button', { name: /Approve section/ }) as HTMLButtonElement;
    expect(withheld.disabled).toBe(true);
    expect(withheld.title).toMatch(/0% complete/);
    expect(withheld.title).toMatch(/containerClosureDescription/);
    // …and the way to where it gets fixed.
    fireEvent.click(within(p6).getByRole('button', { name: /build board/i }));
    expect(setTab).toHaveBeenCalledWith('build');

    // The complete draft keeps its live control.
    const live = within(row('3.2.S.1')).getByRole('button', { name: /Approve section/ }) as HTMLButtonElement;
    expect(live.disabled).toBe(false);
    expect(within(row('3.2.S.1')).getByText('100%')).toBeTruthy();

    // An approval already on the ledger over an incomplete record is shown as
    // exactly that — approved AND incomplete — the state the export gate refuses.
    const p8 = row('3.2.P.8');
    expect(within(p8).getByText('60%')).toBeTruthy();
    expect(within(p8).getByText(/shelfLifeJustification/)).toBeTruthy();
    expect(within(p8).getByText('approved', { selector: '.rd-chip' })).toBeTruthy();
    expect(within(p8).getByText(/incomplete/i, { selector: '.rd-chip' })).toBeTruthy();

    // A record the compiler never scored is "not established", not a number —
    // and not approvable either (the gate reads it as incomplete).
    const p1 = row('3.2.P.1');
    expect(within(p1).getByText(/not established/i)).toBeTruthy();
    expect((within(p1).getByRole('button', { name: /Approve section/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a 409 shows the server\'s own reason — 409 no longer means only "contradictions"', async () => {
    const reason = '§3.2.P.5 is 40% complete and cannot be approved. Missing required inputs: acceptanceCriteria. Record them and recompile.';
    wire(board({ sections: [section('3.2.P.5', 'draft', 100)] }), () => res({ success: false, error: reason }, 409));
    renderOverview();

    await openSignatureFor();
    fireEvent.change(screen.getByPlaceholderText('Reason for this approval...'), { target: { value: 'Reviewed against the CoA.' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter your password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign & approve/ }));

    const toast = await screen.findByText(/40% complete/);
    expect(toast.textContent).toContain('acceptanceCriteria');
    expect(screen.queryByText(/resolve the critical contradictions first/)).toBeNull();
    // The refusal was the server's: one POST went out, and nothing flipped locally.
    expect(approvePosts()).toHaveLength(1);
    expect(within(row('3.2.P.5')).getByText('draft', { selector: '.rd-chip' })).toBeTruthy();
  });
});

describe('CmOverview — a signature is over content, not a section number', () => {
  /* The Overview showed the signer a key, a percentage and the missing inputs.
     The narrative and tables the approve route hashes and snapshots were served
     by no route and rendered on no screen, so the signature covered a section
     NUMBER. "Approve section" now opens the section first. */
  it('shows the composed narrative and tables BEFORE the signature form appears', async () => {
    wire(board({ sections: [section('3.2.P.5', 'draft', 100)] }));
    renderOverview();

    fireEvent.click(await screen.findByRole('button', { name: /Approve section/ }));

    // The content, and the hash the signature is bound to.
    expect(await screen.findByText(/The composed body of section 3.2.P.5/)).toBeTruthy();
    expect(screen.getByText(/98.0-102.0%/)).toBeTruthy();
    expect(screen.getByText(/abc123def456/)).toBeTruthy();
    expect(screen.getByText(/Composed from 1 source record/)).toBeTruthy();
    // …and no signature form yet: the reason and password fields are not there.
    expect(screen.queryByPlaceholderText('Reason for this approval...')).toBeNull();

    // Only after Sign & approve does the signature form open.
    fireEvent.click(screen.getByRole('button', { name: /Sign & approve/ }));
    expect(await screen.findByPlaceholderText('Reason for this approval...')).toBeTruthy();
  });

  /* GA plan item 4: the panel shows the content hash the signature covers, and
     the signature carries it back, so a recompile between the read and the
     signing is refused by the server (409 SECTION_CHANGED) instead of signing
     content nobody read. */
  it('sends the content hash the signer actually read with the signature', async () => {
    wire(board({ sections: [section('3.2.P.5', 'draft', 100)] }));
    renderOverview();

    fireEvent.click(await screen.findByRole('button', { name: /Approve section/ }));
    expect(await screen.findByText(/abc123def456/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sign & approve/ }));
    fireEvent.change(await screen.findByPlaceholderText('Reason for this approval...'), { target: { value: 'Reviewed against the CoA and the executed record.' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter your password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign & approve/ }));

    await vi.waitFor(() => expect(approvePosts()).toHaveLength(1));
    const body = (apiRequest.mock.calls as Array<[string, string, Record<string, unknown>]>)
      .find((c) => c[0] === 'POST' && APPROVE.test(c[1]))![2];
    expect(body.compiledHash).toBe('abc123def4567890');
    expect(body.reason).toBe('Reviewed against the CoA and the executed record.');
  });

  it('offers NO signature when the section could not be read', async () => {
    /* A failed read is not an empty section, and it is certainly not something
       to sign: the control is withheld and the failure is named. */
    wire(
      board({ sections: [section('3.2.P.5', 'draft', 100)] }),
      undefined,
      undefined,
      () => res({ success: false, error: 'boom' }, 500),
    );
    renderOverview();

    fireEvent.click(await screen.findByRole('button', { name: /Approve section/ }));
    expect(await screen.findByText(/could not be read/i)).toBeTruthy();
    const sign = screen.getByRole('button', { name: /Sign & approve/ }) as HTMLButtonElement;
    expect(sign.disabled).toBe(true);
  });

  it('warns when the section is stale or its tables are unknown', async () => {
    wire(
      board({ sections: [section('3.2.P.5', 'draft', 100)] }),
      undefined,
      undefined,
      () => res({ success: true, data: sectionRead('3.2.P.5', {
        stale: true, staleReason: 'A source changed after this was built.',
        tables: null, tablesUnknown: true,
        lineage: [{ sourceType: 'specification', sourceKey: 'specification:7', changedSinceCompile: true }],
      }) }),
    );
    renderOverview();

    fireEvent.click(await screen.findByRole('button', { name: /Approve section/ }));
    expect(await screen.findByText(/This section is stale/)).toBeTruthy();
    expect(screen.getByText(/Its tables are not known/)).toBeTruthy();
    expect(screen.getByText(/1 source record\(s\) changed since this was compiled/)).toBeTruthy();
  });
});

/* Review of 2026-10-19: the reassurance is withheld while anything the figure
   leaves out could be open, and the earlier CMC file's open count is not
   established until its read succeeds. A failed read is not "nothing open". */
describe('CmOverview — no reassurance over an earlier CMC file that was not read', () => {
  const clearBoard = () => board({ sections: [section('3.2.S.1', 'approved', 100), section('3.2.P.5', 'review', 100)] });

  it('reassures when both reads are measured and nothing is open', async () => {
    wire(clearBoard());
    renderOverview();
    expect(await screen.findByText(/You're building steadily/)).toBeTruthy();
  });

  it('withholds it, and says why, when the earlier file could not be read', async () => {
    earlierFile = 'error';
    wire(clearBoard());
    renderOverview();
    expect(await screen.findByText(/The earlier CMC question file could not be read; whether it holds open questions is not known\./)).toBeTruthy();
    await screen.findByText('3.2.P.5', { selector: 'td' });
    expect(screen.queryByText(/building steadily/)).toBeNull();
    expect(document.querySelector('.al-lead.al-good')).toBeNull();
  });

  it('withholds it while the earlier file holds questions not closed there', async () => {
    earlierFile = { notClosed: 2 };
    wire(clearBoard());
    renderOverview();
    expect(await screen.findByText(/holds 2 questions not\s+closed there/)).toBeTruthy();
    expect(screen.queryByText(/building steadily/)).toBeNull();
  });
});

describe('CmOverview — a failed register read is an error, never an empty register', () => {
  it('sectionsUnreadable renders the failed-read copy and not "No Module 3 sections yet"', async () => {
    wire(board({ sections: [], meta: { ...META, sectionsProvisioned: false, sectionsUnreadable: true } }));
    renderOverview();
    await screen.findAllByText('BLA 761234');

    const alerts = screen.getAllByRole('alert');
    const failed = alerts.find((a) => /could not be read/i.test(a.textContent ?? ''));
    expect(failed, 'no failed-read alert rendered').toBeTruthy();
    expect(failed!.textContent).toMatch(/failed read, not an empty register/i);
    expect(screen.queryByText(/No Module 3 sections yet/)).toBeNull();
    expect(screen.queryByText(/No governed CMC sections have been authored/)).toBeNull();
    // The narrative does not reassure over a read that did not happen.
    expect(screen.queryByText(/building steadily/)).toBeNull();
  });

  it('renders a null submission count as unknown even without a portfolioUnreadable flag', async () => {
    wire(board({ portfolio: [], kpis: { submissions: null, rpiAverage: null, sectionsApproved: null, sectionsTotal: null, readyPercent: null }, meta: { ...META, portfolioProvisioned: false } }));
    renderOverview();
    await screen.findAllByText(/could not be read/i);
    expect(screen.getAllByText(/— submissions/).length).toBeGreaterThan(0);
    expect(screen.queryByText('0 submissions')).toBeNull();
    expect(screen.queryByText('No submissions yet')).toBeNull();
  });

  it('portfolioUnreadable renders the failed-read copy and not "No submissions yet"', async () => {
    wire(board({
      portfolio: [],
      kpis: { submissions: 0, rpiAverage: null, sectionsApproved: null, sectionsTotal: null, readyPercent: null },
      meta: { ...META, portfolioProvisioned: false, portfolioUnreadable: true },
    }));
    renderOverview();
    await screen.findAllByText(/could not be read/i);

    const failed = screen.getAllByRole('alert').find((a) => /could not be read/i.test(a.textContent ?? ''));
    expect(failed).toBeTruthy();
    expect(failed!.textContent).toMatch(/failed read, not an empty register/i);
    expect(screen.queryByText(/No submissions yet/)).toBeNull();
    expect(screen.queryByText(/No CMC submissions are in scope yet/)).toBeNull();
  });
});

describe('CmOverview — the build-state card reads the export gate, never a percentage', () => {
  it('says Not export ready with the gate\'s reasons when every section is approved but one is incomplete', async () => {
    wire(
      board({ sections: [section('3.2.S.1', 'approved', 100), section('3.2.P.6', 'approved', 0, ['containerClosureDescription'])] }),
      undefined,
      () => res({ success: true, data: readinessOf({ totalSections: 2, approvedSections: 2, incompleteApprovedSections: ['3.2.P.6'], exportReady: false }) }),
    );
    renderOverview();
    await screen.findByText('Not export ready');
    expect(screen.queryByText('Export ready')).toBeNull();
    expect(screen.getByText(/100% approved/)).toBeTruthy();
    expect(screen.getByText(/export blocked: 1 approved but incomplete \(§3\.2\.P\.6\)/)).toBeTruthy();
  });

  it('says Export ready only when the gate does', async () => {
    wire(board({ sections: [section('3.2.S.1', 'approved', 100)] }));
    renderOverview();
    await screen.findByText('Export ready');
  });

  it('renders a failed readiness read as a failed read, not as ready and not as not-ready', async () => {
    wire(board({ sections: [section('3.2.S.1', 'approved', 100)] }), undefined, () => res({ success: false, error: 'readiness store unavailable' }, 500));
    renderOverview();
    await screen.findByText('Export readiness could not be read');
    expect(screen.queryByText('Export ready')).toBeNull();
    expect(screen.queryByText('Not export ready')).toBeNull();
    expect(screen.getByText(/failed read, not a pass/)).toBeTruthy();
  });
});
