// @vitest-environment jsdom
/**
 * The existing live catalog is one workflow guide, not a second workflow engine.
 * Exercise actual cards, original navigation IDs, release locks and governed
 * writes after the live backend categories have been regrouped and searched.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Apps } from '../surfaces/AdminSurfaces';

const SURFACE = {
  id: 'apps', label: 'Workflows', navTier: 'global', layoutMode: 'apps',
  group: 'workspace', uiKit: null, apiPrefixes: [], anaToolFamilies: [],
  sharedContract: null, discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
} as unknown as UiSurface;

interface CatalogRow {
  moduleId: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
  subscriptionState: 'enabled' | 'disabled' | 'none';
  isAvailable: boolean;
  requiredTier: string;
  launchScope: 'launch' | 'later';
  sortOrder: number;
}

function row(moduleId: string, name: string, category: string, sortOrder: number): CatalogRow {
  return {
    moduleId, name, category, sortOrder,
    description: `Recorded capabilities of ${name}`,
    isEnabled: true, subscriptionState: 'enabled', isAvailable: true,
    requiredTier: 'professional', launchScope: 'launch',
  };
}

// Backend categories deliberately cross workflow boundaries: Review & govern
// contains features belonging to Authoring, Submission Center and QMS.
const MODULES: CatalogRow[] = [
  row('projects', 'Projects', 'Program planning', 10),
  row('review', 'Review & approval', 'Review & govern', 20),
  row('vault', 'Vault', 'Evidence & data', 30),
  row('document-authoring', 'Document editor & authoring', 'Author & assemble', 40),
  row('submission-center', 'Submission Center', 'Submit & file', 50),
  row('dispatch-readiness', 'Submission Readiness', 'Review & govern', 60),
  row('quality', 'Quality & Assurance', 'Review & govern', 70),
  row('cmc', 'CMC / Module 3', 'Author & assemble', 80),
  row('insights', 'Reporting & analytics', 'Evidence & data', 90),
  row('assay-evidence-analysis', 'Assay evidence analysis', 'Assay & diagnostics', 100),
];

const LICENSE = {
  tier: 'professional', industryMode: 'biotech',
  usage: {
    projects: { currentCount: 3, maxAllowed: 25 },
    users: { currentCount: 9, maxAllowed: 50 },
  },
};

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

function live(
  modules: CatalogRow[] = MODULES,
  opts: { enforced?: boolean; catalog?: unknown; onPut?: (url: string, body: unknown) => Promise<Response> } = {},
) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'GET' && url === '/api/module-subscriptions/catalog') {
      return ok(opts.catalog ?? { modules, launchScope: { enforced: opts.enforced ?? true } });
    }
    if (method === 'GET' && url === '/api/module-subscriptions/license') return ok(LICENSE);
    if (method === 'PUT' && opts.onPut) return opts.onPut(url, body);
    throw new Error(`unexpected ${method} ${url}`);
  });
}

function mount() {
  const onNav = vi.fn();
  return { ...render(<Apps surface={SURFACE} onAsk={() => {}} onNav={onNav} segment="biopharma" />), onNav };
}

function workflow(container: HTMLElement, id: string): HTMLElement & { open: boolean } {
  const result = container.querySelector<HTMLElement & { open: boolean }>(`details[data-workflow="${id}"]`);
  expect(result, `the existing ${id} features have a workflow home`).not.toBeNull();
  if (!result) throw new Error(`Missing workflow ${id}`);
  return result;
}

function card(container: HTMLElement, name: string): HTMLElement {
  const title = within(container).getByText(name, { selector: '.launch-title' });
  const result = title.closest<HTMLElement>('.launch');
  expect(result, `${name} retains its actual catalog card`).not.toBeNull();
  if (!result) throw new Error(`Missing catalog card for ${name}`);
  return result;
}

function search(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a workflow or feature' }), { target: { value } });
}

function confirmReason(reason: string) {
  const dialog = screen.getByRole('dialog');
  const reasonInput = dialog.querySelector('textarea');
  const confirmation = dialog.querySelector('input');
  if (!reasonInput || !confirmation) throw new Error('The governed confirmation must require a reason and acknowledgement');
  fireEvent.change(reasonInput, { target: { value: reason } });
  fireEvent.change(confirmation, { target: { value: 'yes' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' }));
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('workflow discovery extends the live catalog', () => {
  it('nests each live feature once in its existing work area and explains when, where to start and what follows', async () => {
    live();
    const { container } = mount();
    await screen.findByText('Document editor & authoring', { selector: '.launch-title' });
    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeTruthy();

    const memberships = [
      ['projects', 'Projects', ['Projects']],
      ['vault', 'Vault', ['Vault']],
      ['authoring', 'Authoring', ['Document editor & authoring', 'Review & approval']],
      ['submission-center', 'Submission Center', ['Submission Center', 'Submission Readiness']],
      ['qms', 'QMS controlled documents', ['Quality & Assurance']],
      ['cmc', 'CMC / Module 3', ['CMC / Module 3']],
      ['reporting', 'Reporting & analytics', ['Reporting & analytics']],
    ] as const;

    for (const [id, label, features] of memberships) {
      const area = workflow(container, id);
      const section = area.closest('section');
      expect(section, `${label} guidance remains visible outside the collapsed feature list`).not.toBeNull();
      if (!section) throw new Error(`Missing workflow section for ${id}`);
      expect(within(section).getByRole('heading', { name: label })).toBeTruthy();
      for (const heading of ['When to use', 'Start with', 'Next']) {
        const guidanceLabel = within(section).getByText(heading);
        expect(area.contains(guidanceLabel), `${heading} stays outside the collapsed list`).toBe(false);
      }
      expect(area.open, `${label} starts with guidance rather than an expanded launcher`).toBe(false);
      expect(area.querySelector('summary')?.textContent).toContain(`Features and steps (${features.length})`);
      for (const name of features) {
        expect(within(area).getByText(name, { selector: '.launch-title' })).toBeTruthy();
        expect(screen.getAllByText(name, { selector: '.launch-title' })).toHaveLength(1);
      }
    }
  });

  it('shows only work areas represented by live rows instead of inventing the missing catalog', async () => {
    live([MODULES[2]]);
    const { container } = mount();
    await screen.findByText('Vault', { selector: '.launch-title' });
    expect(workflow(container, 'vault')).toBeTruthy();
    expect(container.querySelectorAll('details[data-workflow]')).toHaveLength(1);
    expect(container.querySelector('[data-workflow="authoring"]')).toBeNull();
    expect(container.querySelector('[data-workflow="projects"]')).toBeNull();
  });

  it('finds a subordinate feature, expands its workflow and opens its original destination', async () => {
    live();
    const { container, onNav } = mount();
    await screen.findByText('Submission Readiness', { selector: '.launch-title' });
    search('Submission Readiness');
    const area = workflow(container, 'submission-center');
    expect(area.open).toBe(true);
    expect(container.querySelector('[data-workflow="authoring"]')).toBeNull();
    fireEvent.click(within(card(area, 'Submission Readiness')).getByRole('button', { name: 'Open' }));
    expect(onNav).toHaveBeenCalledWith('dispatch-readiness');
  });

  it('searches original backend categories even when their features belong to different workflows', async () => {
    live();
    const { container } = mount();
    await screen.findByText('Quality & Assurance', { selector: '.launch-title' });
    search('Review & govern');
    for (const [id, name] of [
      ['authoring', 'Review & approval'],
      ['submission-center', 'Submission Readiness'],
      ['qms', 'Quality & Assurance'],
    ]) {
      const area = workflow(container, id);
      expect(area.open).toBe(true);
      expect(within(area).getByText(name, { selector: '.launch-title' })).toBeTruthy();
    }
    expect(container.querySelector('[data-workflow="vault"]')).toBeNull();
  });

  it('searches the workflow guidance as well as feature names', async () => {
    live();
    const { container } = mount();
    await screen.findByText('Vault', { selector: '.launch-title' });
    const area = workflow(container, 'vault');
    const guidance = area.closest('section')?.querySelector('.workflow-guidance');
    expect(guidance, 'workflow guidance has its own readable block').not.toBeNull();
    const catalogText = MODULES.map((m) => `${m.name} ${m.description} ${m.category}`).join(' ').toLowerCase();
    const guidanceWord = guidance?.textContent?.match(/\b[a-z]{7,}\b/gi)?.find((word) => !catalogText.includes(word.toLowerCase()));
    expect(guidanceWord, 'use a guidance word absent from feature names, descriptions and categories').toBeTruthy();
    if (!guidanceWord) throw new Error('Vault guidance should explain its use beyond the catalog name');
    search(guidanceWord);
    expect(workflow(container, 'vault').open).toBe(true);
    expect(within(workflow(container, 'vault')).getByText('Vault', { selector: '.launch-title' })).toBeTruthy();
  });

  it('retains unknown live capabilities and their category, including search and original navigation', async () => {
    live();
    const { container, onNav } = mount();
    await screen.findByText('Assay evidence analysis', { selector: '.launch-title' });
    const additional = workflow(container, 'additional');
    expect(additional.querySelector('summary')?.textContent).toContain('Additional capabilities');
    expect(additional.open).toBe(false);
    expect(within(additional).getByText('Assay & diagnostics')).toBeTruthy();
    search('Assay & diagnostics');
    const found = workflow(container, 'additional');
    expect(found.open).toBe(true);
    fireEvent.click(within(card(found, 'Assay evidence analysis')).getByRole('button', { name: 'Open' }));
    expect(onNav).toHaveBeenCalledWith('assay-evidence-analysis');
  });

  it('keeps mapped and additional release-excluded features locked even when their grant is enabled', async () => {
    const excluded = [
      { ...MODULES[7], launchScope: 'later' as const },
      { ...row('device-510k', '510(k) workbench', 'Device pathways', 100), launchScope: 'later' as const },
    ];
    live(excluded, { enforced: true });
    const { container, onNav } = mount();
    await screen.findByText('510(k) workbench', { selector: '.launch-title' });
    expect(workflow(container, 'cmc')).toBeTruthy();
    expect(workflow(container, 'additional')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    for (const name of ['CMC / Module 3', '510(k) workbench']) {
      const locked = card(container, name);
      expect(within(locked).getByText('Not in this release')).toBeTruthy();
      expect(within(locked).queryByRole('button', { name: 'Open' })).toBeNull();
      expect(within(locked).queryByRole('switch')).toBeNull();
      expect(within(locked).queryByText('View plans')).toBeNull();
    }
    expect(onNav).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(0);
  });

  it('uses the original module and backend group for a governed toggle after regrouping and search', async () => {
    const put = vi.fn(async () => ok({ moduleId: 'quality', enabled: false, auditTrail: { persisted: true } }));
    live(MODULES, { onPut: put });
    const { container } = mount();
    await screen.findByText('Quality & Assurance', { selector: '.launch-title' });
    search('Quality & Assurance');
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    const area = workflow(container, 'qms');
    expect(area.open).toBe(true);
    fireEvent.click(within(card(area, 'Quality & Assurance')).getByRole('switch'));
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain('Disable Quality & Assurance');
    const reason = 'Consolidating controlled document access for this team';
    confirmReason(reason);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/module-subscriptions/quality/toggle', { enabled: false, reason }));
    await waitFor(() => expect(within(card(container, 'Quality & Assurance')).getByRole('switch').getAttribute('aria-checked')).toBe('false'));
    expect(within(card(container, 'Quality & Assurance')).getByText(/turned off for this workspace/)).toBeTruthy();
    search('');
    for (const name of ['Review & approval', 'Vault', 'Document editor & authoring']) {
      expect(within(card(container, name)).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    }
  });
});

describe('workflow discovery distinguishes search, empty and failed reads', () => {
  it('explains a no-match search and restores the actual live features when cleared', async () => {
    live();
    const { container } = mount();
    await screen.findByText('Vault', { selector: '.launch-title' });
    search('zz-no-such-client-workflow');
    expect(screen.getByText('No workflows match your search')).toBeTruthy();
    expect(screen.queryByText('No workflows available')).toBeNull();
    expect(screen.queryByText("Couldn't load workflows")).toBeNull();
    expect(container.querySelectorAll('.launch-title')).toHaveLength(0);
    search('');
    expect(screen.getByText('Vault', { selector: '.launch-title' })).toBeTruthy();
    expect(screen.queryByText('No workflows match your search')).toBeNull();
  });

  it('reports a genuinely empty catalog without claiming a search or read failure', async () => {
    live([]);
    mount();
    expect(await screen.findByText('No workflows available')).toBeTruthy();
    expect(screen.queryByText('No workflows match your search')).toBeNull();
    expect(screen.queryByText("Couldn't load workflows")).toBeNull();
  });

  it.each(['network failure', 'malformed successful body'])('reports %s as a failed read, never an empty catalog', async (failure) => {
    if (failure === 'network failure') apiRequest.mockRejectedValue(new Error('network down'));
    else live([], { catalog: { data: [] } });
    mount();
    expect(await screen.findByText("Couldn't load workflows")).toBeTruthy();
    expect(screen.queryByText('No workflows available')).toBeNull();
    expect(screen.queryByText('No workflows match your search')).toBeNull();
  });
});
