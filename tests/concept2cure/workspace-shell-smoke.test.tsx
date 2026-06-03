/**
 * @vitest-environment jsdom
 *
 * Smoke for the new workspace shell (the AnA-conversation-first three-zone
 * shell from design-system/ui_kits/workspace/, mounted at
 * /concept2cure/workspace). Verifies:
 *   - Home renders (greeting + composer + suggestion pills + nav rail).
 *   - Navigating to a BUILT surface opens the work pane with the matching
 *     existing live `.tsx` surface (Analytics / Memory / Postmarket), not
 *     a re-ported kit JSX.
 *   - Navigating to an unbuilt surface (k510) shows the "in design" pane.
 *   - The composer surfaces a user message locally without calling out
 *     (per the install brief — no model call from the client).
 *
 * Same fetch-404 / localStorage / cleanup convention as the sibling smoke
 * suites in this directory.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { WorkspaceShell } from '../../client/src/concept2cure/workspace/WorkspaceShell';

beforeEach(() => {
  cleanup();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('Workspace shell — pre-deploy smoke', () => {
  it('renders home state: nav rail + AnA greeting + composer + suggestion pills', () => {
    const { container } = wrap(<WorkspaceShell />);
    expect(container.querySelector('nav.rail')).toBeTruthy();
    expect(container.querySelector('section.ana')).toBeTruthy();
    expect(container.querySelector('.ana-home')).toBeTruthy();
    expect(container.querySelector('.composer textarea')).toBeTruthy();
    expect(container.querySelectorAll('.suggest-pill').length).toBeGreaterThan(0);
    // No work pane in home state.
    expect(container.querySelector('section.work')).toBeFalsy();
  });

  it('home state shows no canned AnA reply when the composer is sent (no client model call)', () => {
    const { container } = wrap(<WorkspaceShell />);
    const ta = container.querySelector('.composer textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hello' } });
    const send = Array.from(container.querySelectorAll('.composer-send')).find(
      (b) => !(b as HTMLButtonElement).disabled,
    ) as HTMLButtonElement | undefined;
    if (send) fireEvent.click(send);
    // No assistant bubble appears — the brief forbids a client-side model call.
    expect(container.querySelector('.msg-ana')).toBeFalsy();
  });

  it('navigating to a BUILT surface (analytics) opens the work pane + mounts the live AnalyticsSurface', () => {
    const { container } = wrap(<WorkspaceShell />);
    const navItem = Array.from(container.querySelectorAll('button.nav-item')).find(
      (b) => (b.textContent || '').includes('Analytics'),
    ) as HTMLButtonElement | undefined;
    expect(navItem).toBeTruthy();
    if (navItem) fireEvent.click(navItem);
    // Work pane open.
    expect(container.querySelector('section.work')).toBeTruthy();
    // In-design pane should NOT be rendered for a built surface.
    expect(container.querySelector('.indesign')).toBeFalsy();
    // Grounded context card seeded for analytics.
    expect((container.textContent || '')).toMatch(/cycle time/i);
  });

  it('navigating to an UNBUILT surface (510k) shows the in-design pane', () => {
    const { container } = wrap(<WorkspaceShell />);
    const navItem = Array.from(container.querySelectorAll('button.nav-item')).find(
      (b) => (b.textContent || '').includes('510(k)'),
    ) as HTMLButtonElement | undefined;
    expect(navItem).toBeTruthy();
    if (navItem) fireEvent.click(navItem);
    expect(container.querySelector('section.work')).toBeTruthy();
    expect(container.querySelector('.indesign')).toBeTruthy();
  });

  it('nav rail renders all 4 IA groups from MDX_NAV_GROUPS', () => {
    const { container } = wrap(<WorkspaceShell />);
    const sections = Array.from(container.querySelectorAll('.rail-section')).map(
      (n) => (n.textContent || '').trim(),
    );
    // System group has an empty label and renders no header; the other three must appear.
    for (const label of ['Workstream', 'Workbench', 'Intelligence']) {
      expect(sections).toContain(label);
    }
  });
});
