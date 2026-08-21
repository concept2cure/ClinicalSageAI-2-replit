// @vitest-environment jsdom
/**
 * W0-5, MDX lane — the empty-state contract, and the fabrication that is gone.
 *
 * ── Why this file exists separately from emptyState.contract.test.tsx ────────
 * The biopharma wave converted three CMC surfaces one call site at a time, so a
 * source scan of `v2/surfaces/` could assert its work. The MDX lane cannot be
 * asserted that way: all 33 of its panels reach the contract through ONE
 * component, `<DataGate>`, and none of them names an empty state itself. The
 * behaviour therefore has to be pinned at the gate.
 *
 * ── What was actually wrong ──────────────────────────────────────────────────
 * Two defects, and the second is the serious one.
 *
 * 1. The gate drew its own empty state — a `Shell` with `data-gate-title` /
 *    `data-gate-detail` / `data-gate-btn` classes, predating `<EmptyState>` and
 *    unaware of it. Its idle branch read "Select a program to load this panel."
 *    with no control of any kind: an instruction the panel did not implement,
 *    shown to a tenant that (in the UAT) had no program to select. It also
 *    wrapped every branch in `role="status"`, so `<ErrorState>`'s `role="alert"`
 *    sat inside a polite live region and each failure announced twice.
 *
 * 2. The audit and approvals panes passed `sample={…}` fixtures that were a
 *    SYNTHESIZED Part 11 hash-chain and a set of invented signed approvals —
 *    named signers, signature ids, `signed_at` timestamps, actor IP addresses.
 *    Sample mode gated them and a banner labelled them. That is the correct
 *    treatment for example content and the wrong treatment for these: an audit
 *    trail's whole evidentiary value is that nothing in it was authored for
 *    display. The fixtures are deleted and the type fields with them.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DataGate } from '../DataGate';
import { OPEN_PROGRAM_EVENT } from '../../../v2/programAction';

afterEach(cleanup);

const child = () => <div data-testid="rows">rows</div>;

describe('DataGate — idle offers the one action that fixes it', () => {
  it('renders a real control, not an instruction, and it reaches the shell', () => {
    const heard = vi.fn();
    window.addEventListener(OPEN_PROGRAM_EVENT, heard);
    try {
      render(
        <DataGate state={{ status: 'idle' }} label="UDI records">
          {child}
        </DataGate>,
      );
      const btn = screen.getByRole('button', { name: 'Choose or create a program' });
      fireEvent.click(btn);
      /* The gate holds no `nav` prop and never will — it is a leaf. The event
         is the whole reason the CTA can exist here at all. */
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_PROGRAM_EVENT, heard);
    }
  });

  it('states why it is empty without instructing, and names its regulation', () => {
    render(
      <DataGate
        state={{ status: 'idle' }}
        label="UDI records"
        regulation="Serves the UDI record (21 CFR 830)"
      >
        {child}
      </DataGate>,
    );
    const panel = screen.getByRole('status');
    expect(panel.textContent).toContain('No UDI records requested');
    expect(panel.textContent).toContain('UDI records are held per program');
    expect(panel.textContent).toContain('Serves the UDI record (21 CFR 830)');
    /* The retired phrase, in any casing. */
    expect(panel.textContent).not.toMatch(/select a program/i);
  });

  it("honours a hook's own reason, and still renders the button beside it", () => {
    render(
      <DataGate
        state={{ status: 'idle', reason: 'The engineering record is held per program.' }}
        label="engineering metrics"
      >
        {child}
      </DataGate>,
    );
    expect(screen.getByText('The engineering record is held per program.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose or create a program' })).toBeTruthy();
  });

  it('takes a surface override, and stands down entirely only when told to', () => {
    const onAct = vi.fn();
    const { rerender } = render(
      <DataGate
        state={{ status: 'idle' }}
        label="predicate candidates"
        idleAction={{ label: 'Run a predicate search', onAct }}
      >
        {child}
      </DataGate>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run a predicate search' }));
    expect(onAct).toHaveBeenCalledTimes(1);

    /* `null` is the explicit opt-out for a surface that draws its own picker.
       `undefined` must NOT opt out — that is the default, and defaulting to no
       CTA is exactly how 33 panels came to have none. */
    rerender(
      <DataGate state={{ status: 'idle' }} label="predicate candidates" idleAction={null}>
        {child}
      </DataGate>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('DataGate — empty never renders a dead end', () => {
  it('prefers the action that populates THIS panel', () => {
    const onAct = vi.fn();
    render(
      <DataGate
        state={{ status: 'empty' }}
        label="CLIA categorizations"
        emptyHint="Categorize this test's CLIA complexity."
        emptyAction={{ label: 'Categorize this test', onAct }}
        onRetry={() => {}}
      >
        {child}
      </DataGate>,
    );
    /* A program IS open here, so "choose or create a program" would be wrong
       advice — the surface's own action wins over both it and the refresh. */
    expect(screen.queryByRole('button', { name: 'Choose or create a program' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Categorize this test' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('falls back to the refresh rather than to nothing', () => {
    const onRetry = vi.fn();
    render(
      <DataGate state={{ status: 'empty' }} label="vigilance trends" onRetry={onRetry}>
        {child}
      </DataGate>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('DataGate — one announcement per state', () => {
  it('a failure is an alert, and is NOT wrapped in a polite status', () => {
    render(
      <DataGate
        state={{ status: 'error', message: 'relation "software_lifecycle_items" does not exist' }}
        label="software lifecycle items"
        onRetry={() => {}}
      >
        {child}
      </DataGate>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('assertive');
    /* The gate used to wrap every branch in role="status", so this same failure
       was announced twice with two different urgencies. */
    expect(screen.queryByRole('status')).toBeNull();
    /* And the internals filter it inherits by delegating still applies. */
    expect(alert.textContent).not.toContain('software_lifecycle_items');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('loading is a polite status that says it is busy', () => {
    render(
      <DataGate state={{ status: 'loading' }} label="UDI records">
        {child}
      </DataGate>,
    );
    const panel = screen.getByRole('status');
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(panel.textContent).toContain('Loading UDI records');
  });

  it('ready renders the children and no panel at all', () => {
    render(
      <DataGate state={{ status: 'ready', data: [1, 2] }} label="UDI records">
        {child}
      </DataGate>,
    );
    expect(screen.getByTestId('rows')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the synthesized Part 11 record is gone, and cannot be reintroduced', () => {
  const mdx = path.resolve(__dirname, '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(mdx, rel), 'utf8');

  /**
   * Source with comments blanked out, newlines preserved so line numbers still
   * line up.
   *
   * A line-prefix filter is not enough and this test proved it twice: the first
   * version matched its own explanation of the prop it was asserting absent,
   * and the fix — dropping lines that START with a comment marker — still let
   * through the CONTINUATION lines of a block comment, which is where the
   * quoted prop actually sat.
   */
  const code = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/^([^\n'"`]*?)\/\/.*$/gm, '$1');

  it('the pathway fixtures carry no audit or approvals bundle', () => {
    const src = read('data/pathwayTabs.ts');
    /* The generator itself, not just its output — a `chain()` helper that
       manufactures hash values for display has no honest use. */
    expect(src).not.toMatch(/^function chain\(/m);
    expect(src).not.toMatch(/_AUDIT(_BASE|_HASHES)?\s*[:=]/);
    expect(src).not.toMatch(/_APPROVALS\s*[:=]/);
    /* Correspondence is ordinary example content and stays. */
    expect(src).toMatch(/_CORRESP\s*:/);
  });

  it('the bundle TYPE no longer has the fields, so a revert does not compile', () => {
    /* This is the actual enforcement. Deleting data leaves a shape someone can
       refill; deleting the fields means `sample={fixtures.audit}` is a type
       error at the call site rather than a judgement call at review time. */
    const types = read('types.ts');
    const bundle = types.slice(
      types.indexOf('export interface PathwayTabsBundle'),
      types.indexOf('export type PathwayTabsData'),
    );
    expect(bundle).toContain('correspondence');
    expect(bundle).not.toMatch(/\baudit\b\s*:/);
    expect(bundle).not.toMatch(/\bapprovals\b\s*:/);
  });

  it('neither governed pane is handed sample content any more', () => {
    /* Code lines only. The file explains the removal by quoting the prop it
       removed, and a naive substring search matches that explanation — which is
       how this assertion first failed on its own documentation. */
    const panes = code(read('surfaces/pathway/PathwayPanes.tsx'));
    expect(panes).not.toContain('sample={fixtures.audit}');
    expect(panes).not.toContain('sample={fixtures.approvals}');
    /* Correspondence keeps its fixture — and its banner. */
    expect(panes).toContain('sample={fixtures.correspondence}');
  });

  it('the dossier Activity tab merges no seed chain', () => {
    const store = code(read('store/dossierStore.ts'));
    expect(store).not.toContain('PATHWAY_TABS_DATA');
    /* The sample-mode branch that did the merging is gone with it. */
    expect(store).not.toContain('isSampleMode');
  });

  it('the passive instruction is retired from the whole lane', () => {
    /* Asserted against source across the lane, so reintroducing it anywhere —
       a hook's idleReason, a surface's prose, a disabled control's tooltip —
       fails here rather than at the next UAT. */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = code(fs.readFileSync(full, 'utf8'));
        src.split('\n').forEach((line, i) => {
          if (/select a (program|project)/i.test(line)) {
            offenders.push(`${path.relative(mdx, full)}:${i + 1}`);
          }
        });
      }
    };
    walk(mdx);
    expect(offenders, `passive instruction reintroduced at:\n${offenders.join('\n')}`).toEqual([]);
  });
});
