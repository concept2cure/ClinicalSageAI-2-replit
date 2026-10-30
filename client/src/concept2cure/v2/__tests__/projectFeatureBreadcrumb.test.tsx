// @vitest-environment jsdom
/**
 * A device discipline or pathway is crumbed as a feature of the client's project.
 *
 * On 2026-10-23 (62a8d5e7) the founder made the MDX disciplines and pathways
 * features of the client's project: they sit under the Projects app in
 * shared/constants/launch-scope.ts, pinned to MDX_PROJECT_FEATURE_SURFACE_IDS
 * (shared/constants/mdx-project-features.ts). The shell still presented them as
 * the old "Medical Device & IVD" app: NAV_GROUP_OF put design-controls, risk,
 * labeling and human-factors in that tier, breadcrumbTierOf drew it as their
 * parent, and ⌘K's hint column, which reads the same function, named them by it.
 * The breadcrumb did not name the open project at all.
 *
 * Now the parent is Projects, then the open project by the name the project
 * chip and the project page's crumb already use (code, or title when it has
 * none). With no project open, or one opened by id alone, the trail is
 * Projects › <feature>: the crumb never invents a project name. ⌘K's hint
 * names Projects. Ids, routes and entitlements are untouched: labels only.
 *
 * 2026-10-29 (D2, folds F1c and F2): design-controls and risk folded into
 * device-engineering, and ivd-completeness into device-diagnostics, so the
 * cases that used them use those two features; the folded ids are no ⌘K row.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['member'] }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7, currentOrganization: { name: 'Concept2Cure Therapeutics' } }),
}));

import { getSurface, UI_SURFACES, type UiSurface } from '@shared/constants/ui-surface-registry';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { breadcrumbTierOf } from '../registryModel';
import { NavEntitlementsProvider } from '../navEntitlements';
import { CmdK, TopBar } from '../Shell';
import { clearShellProject, publishShellProject } from '../shellProject';

const OLD_TIER = 'Medical Device & IVD';
const NAV_URL = '/api/module-subscriptions/navigation';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

const surface = (id: string): UiSurface => {
  const s = getSurface(id);
  if (!s) throw new Error(`no surface ${id}`);
  return s;
};

/** The breadcrumb's crumbs in order, separators left out. */
function crumbs(): string[] {
  return Array.from(document.querySelectorAll('.crumbs > span:not(.sep)')).map((el) => el.textContent ?? '');
}
/** Every crumb above the page itself: the root, then the parents. */
function parents(): string[] {
  return Array.from(document.querySelectorAll('.crumbs > span:not(.sep):not(.here)')).map((el) => el.textContent ?? '');
}
const here = () => document.querySelector('.crumbs .here')?.textContent ?? '';

function bar(id: string) {
  return render(<TopBar surface={surface(id)} onPalette={() => {}} segment="medtech" onSegment={() => {}} />);
}

const PROJECT = { id: '82d3b729-5c1e-4a7b-9d2f-0e6a1b3c4d5e', code: 'NPX-510', title: 'NeuroPanel-Dx 510(k)', ws: 'MDX', productType: 'ivd' };

beforeEach(() => {
  clearShellProject();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === NAV_URL
      ? ok({ organizationId: 7, tier: 'standard', industryMode: 'medtech', masterAdmin: false, resolved: true, surfaces: [] })
      : ok({ data: [] }),
  );
});
afterEach(() => {
  cleanup();
  clearShellProject();
});

describe('a project feature is crumbed under the open project', () => {
  it('engineering evidence, with a project open: Projects › the project › the feature', () => {
    publishShellProject(PROJECT);
    bar('device-engineering');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'Projects', 'NPX-510', 'Engineering evidence']);
    expect(document.querySelector('.crumbs')?.textContent).not.toContain(OLD_TIER);
  });

  it('IVDR evidence, with a project open: the same trail, and no "Medical Device & IVD" parent', () => {
    publishShellProject(PROJECT);
    bar('device-diagnostics');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'Projects', 'NPX-510', 'IVDR evidence']);
    expect(document.querySelector('.crumbs')?.textContent).not.toContain(OLD_TIER);
  });

  it('names the project as the project chip beside it does', () => {
    publishShellProject(PROJECT);
    bar('labeling');
    const chip = document.querySelector('.tb-proj .tb-proj-lbl')?.textContent;
    expect(chip).toBe('NPX-510');
    expect(parents()).toEqual(['Concept2Cure.RI', 'Projects', chip]);
  });

  it('names a project with no code by its title', () => {
    publishShellProject({ id: PROJECT.id, title: PROJECT.title });
    bar('human-factors');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'Projects', 'NeuroPanel-Dx 510(k)', 'Human factors (IEC 62366-1)']);
  });

  it('every MDX project feature: parents are Projects and the open project, never the old tier', () => {
    publishShellProject(PROJECT);
    for (const id of MDX_PROJECT_FEATURE_SURFACE_IDS) {
      bar(id);
      expect(parents(), id).toEqual(['Concept2Cure.RI', 'Projects', 'NPX-510']);
      expect(here(), id).toBe(surface(id).label);
      cleanup();
    }
  });

  it('follows the channel when another project is opened', () => {
    publishShellProject(PROJECT);
    bar('device-engineering');
    expect(parents()).toEqual(['Concept2Cure.RI', 'Projects', 'NPX-510']);
    act(() => {
      publishShellProject({ id: '1c0d9e8f-7a6b-4c5d-8e9f-0a1b2c3d4e5f', code: 'CV-104' });
    });
    expect(parents()).toEqual(['Concept2Cure.RI', 'Projects', 'CV-104']);
  });
});

describe('the crumb never invents a project name', () => {
  it('with no project open: Projects › the feature', () => {
    bar('device-engineering');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'Projects', 'Engineering evidence']);
  });

  it('with a project opened by id alone (a deep link, no name yet): Projects › the feature', () => {
    publishShellProject({ id: PROJECT.id });
    bar('device-diagnostics');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'Projects', 'IVDR evidence']);
  });
});

describe('other surfaces keep their crumbs', () => {
  it('the project page is still named by the project, with no Projects crumb added', () => {
    publishShellProject(PROJECT);
    bar('project-home');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'NPX-510']);
  });

  it('a core place carries no project crumb, even with a project open', () => {
    publishShellProject(PROJECT);
    bar('vault');
    expect(crumbs()).toEqual(['Concept2Cure.RI', 'Vault']);
  });

  it('a one-category surface keeps its category; an admin surface keeps Admin', () => {
    expect(breadcrumbTierOf(surface('cmc'))?.label).toBe('Biotech & Pharma');
    expect(breadcrumbTierOf(surface('identity-console'))?.label).toBe('Admin');
  });
});

describe('the registry model names Projects as a project feature’s parent', () => {
  it('for every MDX project feature', () => {
    for (const id of MDX_PROJECT_FEATURE_SURFACE_IDS) {
      expect(breadcrumbTierOf(surface(id))?.label, id).toBe('Projects');
    }
  });

  it('no surface is crumbed with the old tier', () => {
    const old = UI_SURFACES.filter((s) => breadcrumbTierOf(s)?.label === OLD_TIER).map((s) => s.id);
    expect(old).toEqual([]);
  });
});

describe('⌘K’s hint names Projects for a project feature', () => {
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return (
      <NavEntitlementsProvider>
        <CmdK open={open} onClose={() => setOpen(false)} onNav={vi.fn()} onAsk={vi.fn()} onAct={vi.fn()} />
      </NavEntitlementsProvider>
    );
  }
  async function search(text: string) {
    render(<Harness />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', NAV_URL));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.change(screen.getByPlaceholderText(/Search surfaces/), { target: { value: text } });
  }
  const hintOf = (label: string) => {
    const row = Array.from(document.querySelectorAll('.cmdk-item')).find(
      (el) => el.querySelector('.lbl')?.textContent === label,
    );
    if (!row) throw new Error(`no ⌘K row "${label}"`);
    return row.querySelector('.hint')?.textContent;
  };

  it('engineering evidence', async () => {
    await search('engineering evidence');
    expect(hintOf('Engineering evidence')).toBe('Projects');
  });

  it('IVDR evidence', async () => {
    await search('ivdr evidence');
    expect(hintOf('IVDR evidence')).toBe('Projects');
  });

  it('no row for a folded screen: risk management, design controls and IVD completeness live in their targets', async () => {
    for (const [text, label] of [['risk management', 'Risk management'], ['design controls', 'Design controls (DHF)'], ['ivd completeness', 'IVD completeness']]) {
      await search(text);
      expect(Array.from(document.querySelectorAll('.cmdk-item .lbl')).map((el) => el.textContent), text).not.toContain(label);
      cleanup();
    }
  });

  it('no ⌘K row is hinted with the old tier', async () => {
    await search('device');
    const hints = Array.from(document.querySelectorAll('.cmdk-item .hint')).map((el) => el.textContent);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints).not.toContain(OLD_TIER);
  });
});
