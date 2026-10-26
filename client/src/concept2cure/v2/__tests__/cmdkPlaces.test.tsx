// @vitest-environment jsdom
/**
 * ⌘K reaches what a person can already see; it is not a catalogue (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, section 2).
 *
 * Its empty-query "Jump to" listed the first eight registry rows: Projects,
 * Plan & features, Artifacts center, Project home, the editor, Regulatory
 * workspace (locked), Vault, Review. A search listed every registry surface,
 * the ones outside the release included, each as a "not in this release" lock.
 * Now:
 *   - "Jump to" lists the places, in the rail's order;
 *   - with a project open, its six steps are listed, and each opens that step
 *     through the same validated action the rest of the product uses;
 *   - a surface outside the release is not listed. A licence lock (a plan, a
 *     module switched off) is still listed with its reason: the unlock panel
 *     that answers it is where a person learns what to do
 *     (cmdkLicenseGating.test.tsx).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['member'] },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7 }),
}));

import { NavEntitlementsProvider, type NavEntitlementsPayload, type NavSurfaceEntitlement } from '../navEntitlements';
import { CmdK } from '../Shell';
import { clearShellProject, publishShellProject } from '../shellProject';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';

const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

function serve(surfaces: NavSurfaceEntitlement[] = []) {
  const body: NavEntitlementsPayload = {
    organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces,
  };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === NAV_URL) return ok(body);
    throw new Error(`unexpected ${method} ${url}`);
  });
}

function Harness({ onNav }: { onNav: (id: string) => void }) {
  const [open, setOpen] = React.useState(true);
  return (
    <NavEntitlementsProvider>
      <CmdK open={open} onClose={() => setOpen(false)} onNav={onNav} onAsk={vi.fn()} onAct={vi.fn()} />
    </NavEntitlementsProvider>
  );
}

async function mount() {
  const onNav = vi.fn();
  render(<Harness onNav={onNav} />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { onNav };
}

/** The rows under one header, in order, by their visible label. */
function rowsUnder(header: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const el of Array.from(document.querySelectorAll('.cmdk-list > *'))) {
    if (el.classList.contains('cmdk-hdr')) {
      inside = el.textContent?.trim() === header;
      continue;
    }
    if (inside) out.push(el.querySelector('.lbl')?.textContent?.trim() ?? '');
  }
  return out;
}

const search = (term: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: term } });

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  clearShellProject();
  __resetSurfaceActionBus();
});

const RELEASE_LOCK = (id: string, label: string): NavSurfaceEntitlement => ({
  id, label, entitled: false, source: 'launch-scope', requiredTier: null,
});

describe('⌘K: places, the open project\'s steps, and features already shown', () => {
  it('"Jump to" lists the places, in the rail\'s order', async () => {
    serve();
    await mount();
    expect(rowsUnder('Jump to')).toEqual([
      'Home', 'Projects', 'Tasks', 'Communication', 'Vault', 'CMC / Module 3', 'Quality', 'Reporting & analytics',
    ]);
  });

  it('a place opens as the rail opens it', async () => {
    serve();
    const { onNav } = await mount();
    fireEvent.click(screen.getByRole('button', { name: /^Vault/ }));
    expect(onNav).toHaveBeenCalledWith('vault');
  });

  it('a surface outside the release is not listed; a licence lock still is, with its reason', async () => {
    serve([
      RELEASE_LOCK('submission-twin', 'Submission twin'),
      { id: 'submission-center', label: 'Submission center', entitled: false, source: 'tier', requiredTier: 'professional' },
    ]);
    await mount();
    search('submission');
    expect(screen.queryByRole('button', { name: /Submission twin/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Submission center — not included in your plan' })).toBeTruthy();
  });

  it('with a project open, its steps are listed, and a step opens the project on it', async () => {
    publishShellProject({ id: '16431c9c-f452-4bf6-9482-95a920ee51eb', title: 'BX-401 Oncology IND', code: 'BX-401' });
    serve();
    const { onNav } = await mount();
    expect(rowsUnder('This project')).toEqual(['Plan', 'Evidence', 'Author', 'Review', 'Submit', 'Respond']);
    search('evid');
    fireEvent.click(screen.getByRole('button', { name: /^Evidence.*BX-401/ }));
    expect(onNav).toHaveBeenCalledWith('project-home');
    const stages: string[] = [];
    registerSurfaceActionHandlers('project-home', {
      'project-home.set-stage': (params) => {
        stages.push(params.stage);
        return { ok: true };
      },
    });
    expect(stages).toEqual(['evidence']);
  });

  it('with no project open, no steps are listed', async () => {
    serve();
    await mount();
    expect(rowsUnder('This project')).toEqual([]);
    search('plan');
    expect(screen.queryByText('This project')).toBeNull();
  });
});
