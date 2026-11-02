/** @vitest-environment jsdom */
/**
 * The top bar names the open project, and opens it
 * (docs/design/FILING_SPINE.md §4 "Top bar", §7.2 F8; §6 row 10).
 *
 * ── What was shipping ─────────────────────────────────────────────────────────
 * No screen named the open project. The top bar's one control beside the
 * breadcrumb was "Switch client domain" (Shell.tsx:518-545 at b0b1694aa): a
 * second place to set the client type, which the account menu's Client type
 * already sets (Shell.tsx:404, wave 2A). So a person on the Vault, the
 * Submission Center or the editor could not see which filing they were in, and
 * had two controls for one setting.
 *
 * ── What this holds ───────────────────────────────────────────────────────────
 * The project is the filing, so the top bar says which one is open: the first
 * crumb, a button from the shell's project channel (useShellProject) that reads
 * the project's code, or its title when it has no code, and opens its project
 * page. The client type is chosen in the account menu only.
 *
 * D1-2 (.design/claude-convergence/D1.md §D1.B steps 1 and 4, §D1.I): the chip
 * (`.tb-proj`) folded into that crumb (`.crumb-proj`), same name, title and click,
 * so the project is named once. With none open the bar shows no project button:
 * the dashed "No project open" chip went, and Projects is the sidebar's.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: { name: 'Concept2Cure Therapeutics' } }),
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

import { TopBar } from '../Shell';
import { publishShellProject } from '../shellProject';

const VAULT = { id: 'vault', label: 'Vault' } as never;

function renderBar(onNav = vi.fn()) {
  render(<TopBar surface={VAULT} onPalette={() => {}} segment="biopharma" onSegment={() => {}} onNav={onNav} />);
  return { onNav, bar: document.querySelector('header.topbar') as HTMLElement };
}

beforeEach(() => {
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
});

describe('the top bar names the open project', () => {
  it('on the Vault with ONC-221 open, the project crumb names it and opens its project page', () => {
    publishShellProject({ id: '6f1c2a90-0d1e-4b7a-9c55-3a2f1e0b9d21', code: 'ONC-221', title: 'Oncology 221 NDA' });
    const { onNav, bar } = renderBar();
    const crumb = screen.getByRole('button', { name: 'ONC-221' });
    // The chip folded into the first crumb (D1-2): one name for the project, not two.
    expect(crumb.classList.contains('crumb-proj')).toBe(true);
    expect(bar.querySelector('.crumbs')?.firstElementChild).toBe(crumb);
    expect(crumb.getAttribute('title')).toBe('ONC-221 — Oncology 221 NDA');
    expect(bar.querySelector('.tb-proj')).toBeNull();
    fireEvent.click(crumb);
    expect(onNav).toHaveBeenCalledWith('project-home');
    expect(onNav).toHaveBeenCalledTimes(1);
  });

  it('has no "Switch client domain" control: the client type is chosen in the account menu', () => {
    publishShellProject({ id: 'p-1', code: 'ONC-221' });
    const { bar } = renderBar();
    expect(document.querySelector('[title="Switch client domain"]')).toBeNull();
    expect(screen.queryByTitle('Switch client domain')).toBeNull();
    // Nothing in the top bar sets or shows the client type any more.
    expect(bar.textContent).not.toMatch(/Biotech & Pharma|Client domain/);
  });

  /* Rewritten for D1-2: the dashed "No project open" chip that opened Projects went with
     the chip (§D1.B step 4). Projects is the sidebar's place, and ⌘K lists projects. */
  it('with no project open, the bar shows no project button and no "No project open"', () => {
    const { bar } = renderBar();
    expect(bar.querySelector('.crumb-proj, .tb-proj')).toBeNull();
    expect(bar.textContent).not.toMatch(/No project open|Choose one in Projects/);
    expect(screen.queryByRole('button', { name: /project/i })).toBeNull();
  });

  it('names a project by its title when it has no code', () => {
    publishShellProject({ id: '82d3b729', title: 'NeuroPanel-Dx 510(k)', ws: 'MDX', productType: 'ivd' });
    renderBar();
    const crumb = screen.getByRole('button', { name: 'NeuroPanel-Dx 510(k)' });
    expect(crumb.getAttribute('title')).toBe('NeuroPanel-Dx 510(k)');
  });

  it('follows the channel when another project is opened', () => {
    publishShellProject({ id: 'p-1', code: 'ONC-221' });
    renderBar();
    expect(screen.getByRole('button', { name: /ONC-221/ })).toBeTruthy();
    act(() => {
      publishShellProject({ id: 'p-2', code: 'CV-104' });
    });
    expect(screen.queryByRole('button', { name: /ONC-221/ })).toBeNull();
    expect(screen.getByRole('button', { name: /CV-104/ })).toBeTruthy();
  });
});
