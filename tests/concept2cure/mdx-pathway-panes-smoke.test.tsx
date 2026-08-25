/**
 * @vitest-environment jsdom
 *
 * Runtime smoke tests for the June-bundle pathway panes and the AnA drafter.
 *
 * The sibling `design-system-surfaces-smoke.test.tsx` renders the standalone
 * surfaces but never mounts K510/PMA/CerSurface, so it never exercises
 * `PathwayPanes`, `AuditTrailPane`, `CorrespondencePane`, `ApprovalsPane`,
 * `FilesTreePane`, `DossierDrawer`, or `AnaDrafter` — those only appear on a
 * tab switch or a "Draft response" click. This file mounts every one of them so
 * runtime issues tsc can't see (hook-order violations, data-shape mismatches,
 * missing icon refs) fail the build.
 *
 * Everything here is in-memory (PATHWAY_TABS_DATA + the dossierStore +
 * CORRESP_DETAIL); fetch is mocked to 404 only as a safety net. Since the
 * data-honesty pass, fixtures are reachable ONLY in explicit sample mode —
 * with sample off and no live data the panes render DataGate's honest
 * loading / error / empty states. Tests that need populated panes cross the
 * demo boundary deliberately via setSampleMode(true).
 */

import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { PathwayPanes } from '../../client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes';
import { AnaDrafter } from '../../client/src/concept2cure/mdx/components/AnaDrafter';
import { PATHWAY_TABS_DATA } from '../../client/src/concept2cure/mdx/data/pathwayTabs';
import { DossierStore } from '../../client/src/concept2cure/mdx/store/dossierStore';
import { setSampleMode } from '../../client/src/concept2cure/mdx/lib/sampleMode';
import type { PathwayKey } from '../../client/src/concept2cure/mdx/types';
import { K510Surface } from '../../client/src/concept2cure/mdx/surfaces/K510Surface';
import { PmaSurface } from '../../client/src/concept2cure/mdx/surfaces/PmaSurface';
import { CerSurface } from '../../client/src/concept2cure/mdx/surfaces/CerSurface';
import type { Program } from '../../client/src/concept2cure/mdx/data/programs';

const mkProgram = (pathway: Program['pathway']): Program => ({
  id: `p-${pathway}`, title: 'Test program', code: 'BX-204', pathway,
  stage: 'Verification', stageIdx: 4, readiness: 60, status: 'active',
  lead: 'Jordan Chen', owners: ['JC'], nextBlocker: null,
  dueLabel: 'Filing · Q3 2026', dueTone: 'ok', lastActivity: '3h ago', meta: 'test',
});

// PathwayPanes now uses react-query (live audit/correspondence/approvals); renders
// must run under a QueryClient. retry:false so a mocked 404 settles immediately
// (to an honest error state — or to the sample fixtures when sample mode is on).
function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const askAna = vi.fn();
const openEditor = vi.fn();
const onClose = vi.fn();
const onOpenSection = vi.fn();

const errorLog: unknown[] = [];
let origError: typeof console.error;
let origWarn: typeof console.warn;

beforeEach(() => {
  cleanup();
  askAna.mockClear();
  openEditor.mockClear();
  onClose.mockClear();
  onOpenSection.mockClear();
  errorLog.length = 0;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false, status: 404, text: async () => 'Not Found', json: async () => ({ data: null }),
  }) as unknown as typeof fetch;
  origError = console.error;
  origWarn = console.warn;
  console.error = (...args: unknown[]) => { errorLog.push(['error', ...args]); };
  console.warn = (...args: unknown[]) => { errorLog.push(['warn', ...args]); };
});

afterEach(() => {
  console.error = origError;
  console.warn = origWarn;
});

function assertNoReactErrors() {
  const reactErrors = errorLog.filter((entry) => {
    const [, ...rest] = entry as [string, unknown];
    const text = rest.map((x) => String(x)).join(' ');
    if (text.includes('not wrapped in act')) return false; // test-mode noise
    if (text.includes('jsdom')) return false;
    return true;
  });
  console.error = origError;
  console.warn = origWarn;
  if (reactErrors.length > 0) {
    throw new Error(
      `Pathway panes logged ${reactErrors.length} error/warning(s):\n` +
        reactErrors.map((e) => JSON.stringify(e).slice(0, 240)).join('\n'),
    );
  }
}

describe('MDX pathway panes smoke', () => {
  (['k510', 'pma', 'cer'] as PathwayKey[]).forEach((pathway) => {
    it(`PathwayPanes(${pathway}) mounts every tab without errors`, () => {
      const { getAllByRole } = renderWithClient(
        <PathwayPanes
          pathway={pathway}
          workspace={<div>workspace content</div>}
          onAskAna={askAna}
          onOpenEditor={openEditor}
        />,
      );
      const tabs = getAllByRole('tab');
      // Workspace · Audit · Correspondence · Approvals · Files
      expect(tabs.length).toBe(5);
      // Click each tab so its pane actually mounts.
      tabs.forEach((tab) => fireEvent.click(tab));
      assertNoReactErrors();
    });
  });

  it('audit fixtures are unreachable even in sample mode — the pane gates honestly', () => {
    /* This test used to assert the opposite: that sample mode populated the
       audit pane from fixtures. Those fixtures were a FABRICATED Part 11
       hash-chain, and the honesty pass deleted them outright — the audit tab
       now renders live rows or an honest gate state, never an invented
       chain, sample mode included. */
    setSampleMode(true);
    try {
      const { getAllByRole, container } = renderWithClient(
        <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
      );
      fireEvent.click(getAllByRole('tab')[1]); // Audit
      expect(container.querySelector('.audit-pane')).toBeNull();
      // One of DataGate's honest states stands where fixture rows used to be.
      expect(container.querySelector('[data-testid^="data-gate-"]')).toBeTruthy();
      assertNoReactErrors();
    } finally {
      setSampleMode(false);
    }
  });

  it('FilesTreePane preview opens a body section in the drawer', () => {
    // Data honesty redesign: the Files tab renders the tree ONLY on live
    // backend data or explicit sample mode — with the fetch mocked to 404 and
    // sample off it correctly shows "unavailable" and mounts nothing. This
    // smoke test exercises the pane WITH content, so it crosses the demo
    // boundary the same way a user does: the explicit sample-mode signal plus
    // the store's opt-in fixtures.
    setSampleMode(true);
    DossierStore.enableSampleFixtures();
    try {
      const { getAllByRole, container } = renderWithClient(
        <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
      );
      fireEvent.click(getAllByRole('tab')[4]); // Files
      expect(container.querySelector('.ftp-pane')).toBeTruthy();
      assertNoReactErrors();
    } finally {
      setSampleMode(false);
    }
  });

  it('AnaDrafter renders a drafted response (rta-3)', () => {
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-3')!;
    const { container } = renderWithClient(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.ana-drafter')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AnaDrafter renders an unstarted response (rta-2)', () => {
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-2')!;
    const { container } = renderWithClient(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.drafter-unstarted')).toBeTruthy();
    assertNoReactErrors();
  });

  // The pathway surfaces wrap their existing content as the Workspace tab.
  it('K510Surface mounts the pathway tab bar', () => {
    const { container } = renderWithClient(
      <K510Surface program={mkProgram('k510')} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(container.querySelector('.pwt-bar')).toBeTruthy();
    assertNoReactErrors();
  });

  it('PmaSurface mounts the pathway tab bar', () => {
    const { container } = renderWithClient(
      <PmaSurface program={mkProgram('pma')} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(container.querySelector('.pwt-bar')).toBeTruthy();
    assertNoReactErrors();
  });

  it('CerSurface mounts the pathway tab bar', () => {
    const { container } = renderWithClient(
      <CerSurface program={mkProgram('cer')} onAskAna={askAna} />,
    );
    expect(container.querySelector('.pwt-bar')).toBeTruthy();
    assertNoReactErrors();
  });
});

// Acceptance #4: edits round-trip through the in-memory store into the audit trail.
describe('dossierStore round-trip', () => {
  // Seeding is opt-in since the no-mock-data-in-prod remediation: the store
  // starts EMPTY and sample content exists only behind the explicit demo
  // boundary. These round-trip tests exercise store mechanics over that
  // sample content, so they enable it deliberately.
  beforeAll(() => {
    DossierStore.enableSampleFixtures();
  });

  it('seeds section bodies and pushes an edit onto the section activity trail', () => {
    const label = 'Substantial Equivalence Discussion'; // K510_ESTAR id 11
    const seeded = DossierStore.readSectionBody('k510', 11, label);
    expect(seeded.length).toBeGreaterThan(0);

    const before = DossierStore.activityForSection('k510', 11).length;
    const marker = `EDIT-${Date.now()}`;
    DossierStore.writeSectionBody('k510', 11, label, `${seeded}\n\n${marker}`, { who: 'Tester', role: 'Reg Lead' });

    // The edit persists…
    expect(DossierStore.readSectionBody('k510', 11, label)).toContain(marker);
    // …and a live section.edit event is appended (Activity tab reads this).
    const after = DossierStore.activityForSection('k510', 11);
    expect(after.length).toBeGreaterThanOrEqual(before + 1);
    expect(after.some((e) => e.kind === 'section.edit' && e.live === true)).toBe(true);
  });

  it('lists the dossier tree under the program root', () => {
    const root = DossierStore.rootFor('k510');
    const entries = DossierStore.listDir(root);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.path.startsWith(root))).toBe(true);
  });
});

// Operational flows a human user actually performs (interaction, not just render).
describe('pathway panes — operational flows', () => {
  /* ── Part 11 e-signature ────────────────────────────────────────────
     This used to assert that clicking "Apply signature" immediately
     rendered `.ap-card.signed`. That passed because the handler was
     `setSigned(true)` — the password was collected and discarded, the
     record number came from Math.random(), and nothing left the browser.
     The test was locking in signature theatre.

     Signing now goes through POST /api/esignature/sign, so these tests
     assert the properties that make it real: a signature needs a
     document *and* a revision to identify what was signed (§11.50(a)),
     the server has to confirm it, and a rejection must not produce a
     signed card. */

  /** A pending approval assigned to "You", carrying document + revision. */
  const SIGNABLE_APPROVAL = {
    id: 901,
    approvalId: 901,
    documentId: 12,
    versionId: 3,
    stage: 'regulatory',
    target: 'Device description',
    requested_at: '2026-07-01T09:00:00Z',
    requested_by: 'Jordan Chen',
    assigned_to: 'You',
    role: 'Reg Lead',
  };

  /** Route the approvals feed to `approvals`; everything else 404s. */
  function mockApprovalsFeed(approvals: unknown[], signResponse?: { status: number; body: unknown }) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/approval-workflows/pending')) {
        return { ok: true, status: 200, text: async () => '', json: async () => ({ approvals }) };
      }
      if (u.includes('/api/esignature/sign') && init?.method === 'POST') {
        const r = signResponse ?? { status: 200, body: {} };
        return {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          text: async () => JSON.stringify(r.body),
          json: async () => r.body,
        };
      }
      return { ok: false, status: 404, text: async () => 'Not Found', json: async () => ({ data: null }) };
    }) as unknown as typeof fetch;
  }

  async function openSignForm(container: HTMLElement, getAllByRole: (r: string) => HTMLElement[]) {
    fireEvent.click(getAllByRole('tab')[3]); // Approvals
    const esign = await waitFor(() => {
      const b = container.querySelector('.ap-sign-btn') as HTMLButtonElement | null;
      if (!b || b.disabled) throw new Error('sign button not enabled yet');
      return b;
    });
    fireEvent.click(esign);
    return container.querySelectorAll('.ap-sign-input');
  }

  it('Approvals: disables signing when the approval names no document revision', async () => {
    /* The kit fixture approvals carry no documentId/versionId. A
       signature that cannot say which revision it covers is not a
       compliant signature, so the control is disabled rather than
       pinning one to a guessed version. */
    mockApprovalsFeed([{ ...SIGNABLE_APPROVAL, documentId: undefined, versionId: undefined }]);
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[3]);
    await waitFor(() => expect(container.querySelector('.ap-sign-btn')).toBeTruthy());
    const btn = container.querySelector('.ap-sign-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    assertNoReactErrors();
  });

  it('Approvals: a confirmed signature renders the server-issued record', async () => {
    mockApprovalsFeed([SIGNABLE_APPROVAL], {
      status: 200,
      body: { signatureId: 4471, signatureHash: 'a1b2c3d4e5f6a7b8', signedAt: '2026-07-26T12:00:00Z' },
    });
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );

    const inputs = await openSignForm(container, getAllByRole);
    expect(inputs.length).toBeGreaterThanOrEqual(2); // meaning + password
    fireEvent.change(inputs[0], { target: { value: 'Reviewed and approved' } });
    fireEvent.change(inputs[1], { target: { value: 'pw-123456' } });

    const confirm = container.querySelector('.ap-sign-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(container.querySelector('.ap-card.signed')).toBeTruthy());
    /* The identifier on the card is the server's, not a local random. */
    expect(container.querySelector('.ap-card.signed')!.textContent).toContain('4471');
    assertNoReactErrors();
  });

  it('Approvals: a rejected signature shows the reason and stays unsigned', async () => {
    mockApprovalsFeed([SIGNABLE_APPROVAL], {
      status: 401,
      body: { error: 'Signature rejected: password verification failed (§11.200)' },
    });
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );

    const inputs = await openSignForm(container, getAllByRole);
    fireEvent.change(inputs[0], { target: { value: 'Reviewed and approved' } });
    fireEvent.change(inputs[1], { target: { value: 'wrong-password' } });
    fireEvent.click(container.querySelector('.ap-sign-confirm') as HTMLButtonElement);

    /* The refusal renders through <ErrorState testId="esign-rejected"> now —
       the server's reason shown verbatim, with the redaction filter over it. */
    await waitFor(() => expect(container.querySelector('[data-testid="esign-rejected"]')).toBeTruthy());
    expect(container.querySelector('[data-testid="esign-rejected"]')!.textContent).toContain(
      'password verification failed',
    );
    /* The critical assertion: no signed card on a rejected signature. */
    expect(container.querySelector('.ap-card.signed')).toBeNull();
    assertNoReactErrors();
  });

  it('DossierDrawer opens from a LIVE audit row and switches its three tabs', async () => {
    /* The fixture route into this flow is gone (the fabricated audit chain
       was deleted); the audit pane populates from the backend only. Mock the
       real feed with one section-scoped event and drive the drawer from it —
       the same path a reviewer takes in production. */
    const auditRow = {
      id: 'live-a1', when: '2026-05-02T10:00:00Z', actor: 'u1', actorName: 'Live Reviewer',
      role: 'QA', action: 'sign', resource: 'Section', target: '§11.4 Accuracy',
      resourceId: '11', reason: '', sha: 'deadbeef', prev: 'cafef00d', chain: 'ok',
    };
    globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/api/mdx/audit')) {
        return {
          ok: true, status: 200, text: async () => '',
          json: async () => ({ data: { events: [auditRow], actions: [], resources: [], kpis: [] } }),
        };
      }
      return { ok: false, status: 404, text: async () => 'Not Found', json: async () => ({ data: null }) };
    }) as unknown as typeof fetch;

    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[1]); // Audit
    const open = await waitFor(() => {
      const b = container.querySelector('.audit-act.primary') as HTMLElement | null;
      if (!b) throw new Error('live audit row not rendered yet');
      return b;
    });
    fireEvent.click(open);
    expect(container.querySelector('.dd-drawer')).toBeTruthy();
    const ddTabs = container.querySelectorAll('.dd-tab');
    expect(ddTabs.length).toBe(3); // Document · Attachments · Activity
    fireEvent.click(ddTabs[1] as HTMLElement);
    fireEvent.click(ddTabs[2] as HTMLElement);
    fireEvent.click(ddTabs[0] as HTMLElement);
    assertNoReactErrors();
  });

  it('AnaDrafter fails closed on an unstarted item — it never authors a response itself', async () => {
    /* This test used to expect a draft to APPEAR here. That draft was
       fabricated in the browser — templated prose stamped `generated_by:
       'AnA'` with four invented sign-off reviewers, no request ever made.
       The fix made Generate adopt a persisted AnA draft or refuse with the
       reason; for an unstarted letter with no persisted draft, refusal is
       the only honest outcome. */
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-2')!;
    const { container } = renderWithClient(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.drafter-unstarted')).toBeTruthy();
    const cta = container.querySelector('.du-cta') as HTMLElement | null;
    expect(cta).toBeTruthy();
    fireEvent.click(cta!); // "Generate draft"
    await waitFor(() => expect(container.querySelector('.du-error')).toBeTruthy());
    expect(container.querySelector('.du-error')!.textContent).toContain('cannot draft one');
    // Nothing was authored: no drafted body, no invented reviewer roster.
    expect(container.querySelector('.dr-body')).toBeNull();
    assertNoReactErrors();
  });

  it('AnaDrafter renders a persisted AnA draft — adoption, not authorship', () => {
    /* rta-3 carries a draft AnA actually produced and persisted
       (`generated_by: 'AnA'`, status drafted). The drafter's job is to
       present it for review; it mounts straight into the drafted body. */
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-3')!;
    const { container } = renderWithClient(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.dr-body')).toBeTruthy();
    expect(container.querySelector('.drafter-unstarted')).toBeNull();
    assertNoReactErrors();
  });
});

// The operator decision: kit UI, real backend data. Prove the live path renders
// backend rows (fixtures are no longer a fallback — with sample mode off and no
// live data the panes render honest empty states, asserted below).
describe('live backend wiring', () => {
  it('renders live audit / correspondence / approvals from the backend', async () => {
    const ok = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('/api/mdx/audit')) {
        return ok({ data: { events: [{ id: 'live-a1', when: '2026-05-02T10:00:00Z', actor: 'u1', actorName: 'Live Reviewer', role: 'QA', action: 'sign', resource: 'Section', target: 'LIVE-AUDIT-ROW', resourceId: '11', reason: '', sha: 'deadbeef', prev: 'cafef00d', chain: 'ok' }], actions: [], resources: [], kpis: [] } });
      }
      if (u.includes('/api/regulatory-correspondence/correspondence')) {
        return ok({ data: [{ id: 'live-c1', subject: 'LIVE-LETTER-ROW', sender: 'CDRH', source_channel: 'eSTAR', communication_type: 'AI-Hold', received_at: '2026-05-02T09:00:00Z', status: 'open' }] });
      }
      if (u.includes('/api/approval-workflows/pending')) {
        return ok({ approvals: [{ id: 42, target: 'LIVE-APPROVAL-ROW', signer: 'You', stage: 'regulatory', requested_by: 'u2', requested_at: '2026-05-02T08:00:00Z' }] });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' } as Response);
    }) as unknown as typeof fetch;

    const { getAllByRole, findAllByText } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} programId="proj-1" />,
    );
    fireEvent.click(getAllByRole('tab')[1]); // Audit
    expect((await findAllByText('LIVE-AUDIT-ROW')).length).toBeGreaterThan(0); // list + detail
    fireEvent.click(getAllByRole('tab')[2]); // Correspondence
    expect((await findAllByText('LIVE-LETTER-ROW')).length).toBeGreaterThan(0);
    fireEvent.click(getAllByRole('tab')[3]); // Approvals
    expect((await findAllByText('LIVE-APPROVAL-ROW')).length).toBeGreaterThan(0);
  });
});

// The data-honesty guarantee: with sample mode off and no live rows, the panes
// render DataGate's honest states — never the kit fixtures, and in particular
// never the synthesized Part 11 audit hash-chain.
describe('honest empty states — sample mode off, no live data', () => {
  it('renders empty states with zero fixture audit rows on resolved-empty feeds', async () => {
    const ok = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('/api/mdx/audit')) {
        return ok({ data: { events: [], actions: [], resources: [], kpis: [] } });
      }
      if (u.includes('/api/regulatory-correspondence/correspondence')) {
        return ok({ data: [] });
      }
      if (u.includes('/api/approval-workflows/pending')) {
        return ok({ approvals: [] });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' } as Response);
    }) as unknown as typeof fetch;

    const { getAllByRole, container, findByText } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} programId="proj-1" />,
    );
    const tabs = getAllByRole('tab');

    fireEvent.click(tabs[1]); // Audit
    await findByText(/No audit events yet/i);
    expect(container.querySelector('.audit-pane')).toBeNull();
    expect(container.querySelectorAll('.audit-row').length).toBe(0);
    // Nothing from the synthesized fixture chain may leak through.
    expect(container.textContent).not.toContain('Tamper-evident');
    expect(container.textContent).not.toContain('Jordan Chen');
    // And no sample banner either — this is an honest empty, not sample mode.
    expect(container.querySelector('.data-gate-sample')).toBeNull();

    fireEvent.click(tabs[2]); // Correspondence
    await findByText(/No correspondence yet/i);
    expect(container.querySelector('.corr-pane')).toBeNull();

    fireEvent.click(tabs[3]); // Approvals
    await findByText(/No approvals yet/i);
    expect(container.querySelector('.ap-pane')).toBeNull();

    // Tab-bar counts report the honest zero, not the fixture totals.
    const countEls = Array.from(container.querySelectorAll('.pwt-count'));
    expect(countEls.length).toBeGreaterThan(0);
    countEls.forEach((el) => expect(el.textContent).toBe('0'));
    assertNoReactErrors();
  });

  it('renders an error state — not fixtures — when the feeds fail', async () => {
    // beforeEach mocks fetch to 404 everything; sample mode is off.
    const { getAllByRole, container, findByText } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[1]); // Audit
    await findByText(/Could not load audit events/i);
    expect(container.querySelector('.audit-pane')).toBeNull();
    expect(container.querySelectorAll('.audit-row').length).toBe(0);
    expect(container.textContent).not.toContain('Tamper-evident');
    assertNoReactErrors();
  });
});

// Dossier (Files tree + drawer) async-seeded from the c2c/documents backend.
// NOTE: DossierStore.hydratePathway mutates the module-singleton store, so this
// runs LAST — after the fixture-dependent tree/drawer tests above.
describe('live dossier wiring', () => {
  it('async-seeds the Files tree + drawer from the c2c/documents backend', async () => {
    const ok = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('/api/c2c/documents/doc-1/sections/')) {
        return ok({ id: 'x', document_id: 'doc-1', section_key: 's-clin', label: 'LIVE DOSSIER SECTION',
          content: { paragraphs: [{ text: 'LIVE BODY CONTENT from the backend.' }] }, owner_id: 'Jordan Chen', version: 3 });
      }
      if (u.includes('/api/c2c/documents/doc-1/outline')) {
        return ok({ document: { id: 'doc-1', title: '510(k)' }, outline: [
          { key: 's-clin', parent_key: null, label: 'LIVE DOSSIER SECTION', path_order: 1, status: 'review', version: 3, owner_id: 'Jordan Chen', accepted_at: '2026-05-01T10:00:00Z', has_content: true },
        ] });
      }
      if (u.includes('/api/c2c/documents')) {
        return ok({ documents: [{ id: 'doc-1', project_id: 'proj-1', doc_type: '510k', agency: 'FDA', title: '510(k)' }] });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' } as Response);
    }) as unknown as typeof fetch;

    const { getAllByRole, findByText, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} programId="proj-1" />,
    );
    fireEvent.click(getAllByRole('tab')[4]); // Files
    // Tree shows the backend section (not a BX-204 fixture section).
    const folderName = await findByText(/LIVE DOSSIER SECTION/);
    fireEvent.click(folderName.closest('button')!); // expand the section folder
    // Select body.md from the TREE aside (body.md also appears in the dir preview).
    const treeBody = await waitFor(() => {
      const el = Array.from(container.querySelectorAll('.ftp-tree .ftp-row-file'))
        .find((n) => n.textContent?.includes('body.md'));
      if (!el) throw new Error('tree body.md not yet present');
      return el as HTMLElement;
    });
    fireEvent.click(treeBody);
    // PreviewBody renders the backend section content.
    expect(await findByText(/LIVE BODY CONTENT from the backend/)).toBeTruthy();
    // Sample-only content stays out of a live tree: no example Sources/
    // placeholder dirs, and no synthesized audit-chain ndjson (the audit
    // feed 404s in this mock, so the Audit/ dir is honestly empty).
    expect(container.textContent).not.toContain('predicates/');
    expect(container.textContent).not.toContain('audit-trail.ndjson');
  });
});
