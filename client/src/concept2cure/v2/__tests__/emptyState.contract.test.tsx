// @vitest-environment jsdom
/**
 * W0-5 — the empty-state contract.
 *
 * A finished empty state answers four things: what this is (`title`), why it
 * is empty (`hint`), the ONE action that fixes it (`action` — a real control),
 * and the regulation it serves (`regulation`). What the contract retires is
 * the PASSIVE INSTRUCTION — "Select a program" as prose above a panel that
 * offers nothing to click. Three CMC surfaces carried exactly that copy; they
 * now carry `openProgramAction(nav)`, which navigates to Mission Control,
 * where programs are both opened and created.
 *
 * Pinned here:
 *   1. the contract renders — all four parts, and the action actually fires;
 *   2. a failure is NOT an empty state — `tone="error"` delegates to
 *      ErrorState and deliberately drops `action`/`regulation` (the one action
 *      on a failure is recovery, and a "create" CTA over a failed read would
 *      invite writing into a store that just refused to answer);
 *   3. `openProgramAction` is real navigation or honestly absent — a CTA that
 *      could not navigate would be the passive instruction in a button costume;
 *   4. the passive phrase is GONE from the converted surfaces, asserted
 *      against source so a revert of any one call site fails this file.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../dataConnect';
import { openProgramAction } from '../surfaces/cmcShared';

describe('EmptyState — the four-part contract', () => {
  it('renders all four parts, and the action fires', () => {
    const onAct = vi.fn();
    render(
      <EmptyState
        title="Open a program to build its Module 3"
        hint="The build state is per-project."
        action={{ label: 'Choose or create a program', onAct }}
        regulation="Serves the CTD Module 3 record (ICH M4Q)"
      />,
    );
    expect(screen.getByText('Open a program to build its Module 3')).toBeTruthy();
    expect(screen.getByText('The build state is per-project.')).toBeTruthy();
    expect(screen.getByText('Serves the CTD Module 3 record (ICH M4Q)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose or create a program' }));
    expect(onAct).toHaveBeenCalledTimes(1);
    /* An empty state is a POLITE status (UI standards §10) — the contract must
       not have promoted it to an interruption. */
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('a failure is not an empty state: tone="error" drops the CTA and the regulation line', () => {
    const onAct = vi.fn();
    const retry = vi.fn();
    render(
      <EmptyState
        tone="error"
        title="Couldn't load the quality design"
        hint="The service did not respond."
        retry={retry}
        action={{ label: 'Choose or create a program', onAct }}
        regulation="Serves the quality design record (ICH Q8, Q9 and Q10)"
      />,
    );
    /* Delegated to ErrorState: assertive, with recovery — and without the
       contract slots that belong to genuine emptiness. */
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose or create a program' })).toBeNull();
    expect(screen.queryByText(/ICH Q8, Q9 and Q10/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(onAct).not.toHaveBeenCalled();
  });

  it('openProgramAction is real navigation, or honestly absent', () => {
    const nav = vi.fn();
    const action = openProgramAction(nav);
    expect(action?.label).toBe('Choose or create a program');
    action?.onAct();
    expect(nav).toHaveBeenCalledWith('mission-control');
    /* No nav threaded → no CTA, rather than a dead button. */
    expect(openProgramAction(undefined)).toBeUndefined();
  });
});

describe('the passive instruction is retired from the converted surfaces', () => {
  const surfacesDir = path.resolve(__dirname, '..', 'surfaces');
  /* The three biopharma call sites the wave converted. mdx (device-wave)
     surfaces are out of this wave's scope and deliberately not asserted. */
  const CONVERTED = ['CmcModule3Build.tsx', 'CmcQuality.tsx', 'CmcModule.tsx'];

  for (const file of CONVERTED) {
    it(`${file} no longer says "Select a program" as prose`, () => {
      const src = fs.readFileSync(path.join(surfacesDir, file), 'utf8');
      expect(src.includes('Select a program'), `${file} reintroduced the passive instruction`).toBe(
        false,
      );
    });
  }

  it('each converted surface offers the one real action instead', () => {
    for (const file of CONVERTED) {
      const src = fs.readFileSync(path.join(surfacesDir, file), 'utf8');
      expect(src.includes('openProgramAction'), `${file} lost its CTA`).toBe(true);
    }
  });
});
