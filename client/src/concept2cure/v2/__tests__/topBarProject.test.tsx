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
 * The project is the filing, so the top bar says which one is open: a chip
 * from the shell's project channel (useShellProject) that reads the project's
 * code, or its title when it has no code, and opens its project page. With no
 * project open it reads "No project open" and opens Projects. The client type
 * is chosen in the account menu only.
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
  it('on the Vault with ONC-221 open, the chip names it and opens its project page', () => {
    publishShellProject({ id: '6f1c2a90-0d1e-4b7a-9c55-3a2f1e0b9d21', code: 'ONC-221', title: 'Oncology 221 NDA' });
    const { onNav } = renderBar();
    const chip = screen.getByRole('button', { name: /ONC-221/ });
    fireEvent.click(chip);
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

  it('with no project open, reads "No project open", says it opens Projects, and does', () => {
    const { onNav } = renderBar();
    // The visible label is the state; the accessible name also says the action,
    // which the title tooltip alone does not carry to a screen reader.
    const chip = screen.getByRole('button', { name: 'No project open. Choose one in Projects' });
    expect(chip.querySelector('.tb-proj-lbl')?.textContent).toBe('No project open');
    fireEvent.click(chip);
    expect(onNav).toHaveBeenCalledWith('projects');
  });

  it('names a project by its title when it has no code', () => {
    publishShellProject({ id: '82d3b729', title: 'NeuroPanel-Dx 510(k)', ws: 'MDX', productType: 'ivd' });
    renderBar();
    expect(screen.getByRole('button', { name: /NeuroPanel-Dx 510\(k\)/ })).toBeTruthy();
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
