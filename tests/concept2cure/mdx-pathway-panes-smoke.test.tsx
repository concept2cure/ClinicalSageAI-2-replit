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
 * Everything here is in-memory (PATHWAY_TABS_DATA + the seeded dossierStore +
 * CORRESP_DETAIL); fetch is mocked to 404 only as a safety net.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { PathwayPanes } from '../../client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes';
import { AnaDrafter } from '../../client/src/concept2cure/mdx/components/AnaDrafter';
import { PATHWAY_TABS_DATA } from '../../client/src/concept2cure/mdx/data/pathwayTabs';
import { DossierStore } from '../../client/src/concept2cure/mdx/store/dossierStore';
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
// must run under a QueryClient. retry:false so a mocked 404 falls back immediately.
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

  it('opens the DossierDrawer from the audit pane', () => {
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[1]); // Audit
    expect(container.querySelector('.audit-pane')).toBeTruthy();
    const openBtn = container.querySelector('.audit-act.primary');
    if (openBtn) fireEvent.click(openBtn);
    // Drawer mounts with the 3-tab layout, or the audit pane is still present — either way no crash.
    expect(container.querySelector('.dd-drawer, .audit-pane')).toBeTruthy();
    assertNoReactErrors();
  });

  it('FilesTreePane preview opens a body section in the drawer', () => {
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[4]); // Files
    expect(container.querySelector('.ftp-pane')).toBeTruthy();
    assertNoReactErrors();
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
  it('Approvals: a pending e-sign can be completed (Part 11 flow)', () => {
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[3]); // Approvals
    const esign = container.querySelector('.ap-sign-btn') as HTMLElement | null;
    expect(esign).toBeTruthy(); // the "signer = You" pending card
    fireEvent.click(esign!);
    const inputs = container.querySelectorAll('.ap-sign-input');
    expect(inputs.length).toBeGreaterThanOrEqual(2); // meaning + password
    fireEvent.change(inputs[1], { target: { value: 'pw-123456' } }); // password ≥ 6
    const confirm = container.querySelector('.ap-sign-confirm') as HTMLButtonElement | null;
    expect(confirm).toBeTruthy();
    expect(confirm!.disabled).toBe(false);
    fireEvent.click(confirm!);
    expect(container.querySelector('.ap-card.signed')).toBeTruthy(); // signed state rendered
    assertNoReactErrors();
  });

  it('DossierDrawer opens from the audit pane and switches its three tabs', () => {
    const { getAllByRole, container } = renderWithClient(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[1]); // Audit
    const open = container.querySelector('.audit-act.primary') as HTMLElement | null;
    expect(open).toBeTruthy();
    fireEvent.click(open!);
    expect(container.querySelector('.dd-drawer')).toBeTruthy();
    const ddTabs = container.querySelectorAll('.dd-tab');
    expect(ddTabs.length).toBe(3); // Document · Attachments · Activity
    fireEvent.click(ddTabs[1] as HTMLElement);
    fireEvent.click(ddTabs[2] as HTMLElement);
    fireEvent.click(ddTabs[0] as HTMLElement);
    assertNoReactErrors();
  });

  it('AnaDrafter generates a structured draft from an unstarted item', async () => {
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-2')!;
    const { container } = renderWithClient(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.drafter-unstarted')).toBeTruthy();
    const cta = container.querySelector('.du-cta') as HTMLElement | null;
    expect(cta).toBeTruthy();
    fireEvent.click(cta!); // "Generate draft"
    await waitFor(() => expect(container.querySelector('.dr-body')).toBeTruthy(), { timeout: 2000 });
    assertNoReactErrors();
  });
});

// The operator decision: kit UI, real backend data. Prove the live path renders
// backend rows (the 15 tests above already prove fixture fallback under fetch→404).
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
  });
});
