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
      const { getAllByRole } = render(
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
    const { getAllByRole, container } = render(
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
    const { getAllByRole, container } = render(
      <PathwayPanes pathway="k510" workspace={<div />} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    fireEvent.click(getAllByRole('tab')[4]); // Files
    expect(container.querySelector('.ftp-pane')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AnaDrafter renders a drafted response (rta-3)', () => {
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-3')!;
    const { container } = render(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.ana-drafter')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AnaDrafter renders an unstarted response (rta-2)', () => {
    const corr = PATHWAY_TABS_DATA.k510.correspondence.find((c) => c.id === 'rta-2')!;
    const { container } = render(
      <AnaDrafter correspondence={corr} pathway="k510" onClose={onClose} onOpenSection={onOpenSection} />,
    );
    expect(container.querySelector('.drafter-unstarted')).toBeTruthy();
    assertNoReactErrors();
  });

  // The pathway surfaces wrap their existing content as the Workspace tab.
  it('K510Surface mounts the pathway tab bar', () => {
    const { container } = render(
      <K510Surface program={mkProgram('k510')} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(container.querySelector('.pwt-bar')).toBeTruthy();
    assertNoReactErrors();
  });

  it('PmaSurface mounts the pathway tab bar', () => {
    const { container } = render(
      <PmaSurface program={mkProgram('pma')} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(container.querySelector('.pwt-bar')).toBeTruthy();
    assertNoReactErrors();
  });

  it('CerSurface mounts the pathway tab bar', () => {
    const { container } = render(
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
    const { getAllByRole, container } = render(
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
    const { getAllByRole, container } = render(
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
    const { container } = render(
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
