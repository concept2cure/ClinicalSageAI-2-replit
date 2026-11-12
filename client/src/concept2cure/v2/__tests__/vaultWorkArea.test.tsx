// @vitest-environment jsdom
/**
 * The Vault as one work area, the library first (D6-3; .design/claude-convergence/D6.md §C).
 *
 * What a unit test can prove of D6 §C.6 (BUILD_ORDER §4 D6: C 3, C 4, C 6),
 * plus the markup contract of D5 §WA.4.2 that the page now follows:
 *   - the back link, D0's header with ONE primary ("Add files"), three starters,
 *     and the six views as tabs, the Library first, the Data catalog (S2) beside it; no retired chrome
 *     (`sp-primary`, `sp-ask`, the eyebrow, "Open project", "later release");
 *   - AnA's `vault.search`, asked from another view, shows the Library with the
 *     query in the box; `vault.focus-document` opens the record (C.6 3);
 *   - "Add files" shows the Uploads view and opens the picker; a file dropped
 *     anywhere on the page is staged there (C.6 4);
 *   - the record is D0's inspector, docked beside the list at 1280px and wider,
 *     and a drawer below it that a row opens and Escape closes, focus back on
 *     the row (C.6 5, the part a test DOM can reach: the media query is read
 *     through matchMedia);
 *   - the seal ceremony and the fixity check keep their acts as quiet buttons in
 *     their sections (C.6 6).
 * The layout itself (above the fold, 390px, dark) needs the running app.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { PID, mockVaultApi, ok, props, uploadDoc, cabinetTree, vaultPayload } from './_vault-surface-fixtures';

const CONNECTED = 'Search my connected repositories for documents relevant to this project.';
const IMPORT = 'Upload documents to the vault and index them for semantic search.';

function directive(actionId: string, params: Record<string, unknown>) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve: ${res.error}`);
  return res.directive;
}

const area = () => document.querySelector('[data-work-area="vault"]') as HTMLElement;
const tab = (name: RegExp | string) => screen.getByRole('tab', { name });
const panelOf = (t: HTMLElement) => document.getElementById(t.getAttribute('aria-controls') ?? '') as HTMLElement;

/** A viewport query answered as `narrow` says, for the record's and the tree's drawers. */
function viewport(narrow: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: narrow(query), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  __resetSurfaceActionBus();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
  mockVaultApi(apiRequest, () => ok(vaultPayload({
    documentCounts: { authored: 0, artifacts: 0, uploads: 1 },
    tree: cabinetTree([uploadDoc(), uploadDoc({ id: 'up-second', docId: '33333333-3333-4333-8333-333333333333', title: 'protocol-c2c-101-201', num: '5.3.5.1' })]),
  })));
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe('the Vault is one work area, the library first (D6 §C.3)', () => {
  it('has the back link, one header with one primary, three starters and six views, Library first', async () => {
    const p = props();
    render(<Vault {...p} />);
    await screen.findByRole('tablist', { name: 'Vault views' });

    const root = area();
    expect(root.classList.contains('page-inner')).toBe(true);
    // Back to the project, by its name; it replaces "Open project".
    const back = root.querySelector(':scope > .pj-back') as HTMLButtonElement;
    expect(back.textContent).toMatch(/BX-301/);
    fireEvent.click(back);
    expect(p.onNav).toHaveBeenCalledWith('project-home');
    expect(within(root).queryByRole('button', { name: /^.?Open project$/ })).toBeNull();

    expect(within(root).getByRole('heading', { level: 1 }).textContent).toBe('Vault');
    expect(root.querySelector('.ph .ph-sub')?.textContent).toMatch(/IND · 21 CFR 312/);
    // One orange action in the work area, and it is the header's "Add files".
    const primaries = root.querySelectorAll('.btn.primary');
    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toMatch(/Add files/);
    expect(primaries[0].closest('.ph-acts')).not.toBeNull();
    // The retired chrome is gone from the page, and this step's controls are D0's buttons. (Panels from
    // other Vault files — Confirm N suggested, Versions, Annotations — keep theirs until their own step.)
    expect(root.querySelector('.sp-eyebrow, .vd-top, .vd-coexist')).toBeNull();
    expect(root.querySelector([
      '.ph', '.sp-starters', '.vd-d-actions', '[data-testid="vault-filing-block"]', '[data-testid="vault-seals"]',
      '[data-testid="vault-fixity"]', '[data-testid="vault-uploads-lane"]', '[data-testid="vault-data-room"]',
      '[data-testid="vault-coverage"]', '[data-testid="vault-artifacts-lane"]', '[data-testid="vault-org-artifacts"]',
    ].flatMap((scope) => [`${scope} .sp-primary`, `${scope} .sp-ask`]).join(', '))).toBeNull();
    expect(root.textContent).not.toMatch(/later release/);

    const starters = root.querySelectorAll('.sp-starters[data-layout="row"] .sp-starter');
    expect([...starters].map((s) => s.textContent)).toEqual([
      'What is missing for this filing?',
      'Which documents are not yet effective?',
      'Search my connected repositories',
    ]);
    fireEvent.click(starters[2]);
    expect(p.onAsk).toHaveBeenCalledWith(CONNECTED);

    const tabs = within(screen.getByRole('tablist', { name: 'Vault views' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Library', 'Data catalog', 'Uploads · 1', 'Required documents', 'Governed artifacts', 'Seals & fixity']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(panelOf(tabs[0]).hidden).toBe(false);
    for (const t of tabs.slice(1)) expect(panelOf(t).hidden).toBe(true);
    // The library is on the first view: its search box and its rows.
    expect(within(panelOf(tabs[0])).getByLabelText('Search this vault')).toBeTruthy();
    expect(panelOf(tabs[0]).querySelectorAll('.vd-rows .vd-row').length).toBeGreaterThan(0);
  });

  it('opens on the Data catalog when the project page asked it to, once (S2)', async () => {
    sessionStorage.setItem('c2c.vault.openView', 'catalog');
    const first = render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    expect(tab('Data catalog').getAttribute('aria-selected')).toBe('true');
    first.unmount();
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    expect(tab('Library').getAttribute('aria-selected')).toBe('true');
  });

  it('moves between views with the arrow keys, Home and End, one tab stop', async () => {
    render(<Vault {...props()} />);
    const list = await screen.findByRole('tablist', { name: 'Vault views' });
    const library = tab('Library');
    expect(library.tabIndex).toBe(0);
    expect(tab('Data catalog').tabIndex).toBe(-1);
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(tab('Data catalog').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Data catalog'));
    fireEvent.keyDown(list, { key: 'End' });
    expect(tab('Seals & fixity').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(tab('Library').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(tab('Seals & fixity').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(tab('Library').getAttribute('aria-selected')).toBe('true');
  });
});

describe("AnA's hands reach the view they act on (D6 §C.6 3)", () => {
  it('vault.search from the Seals & fixity view shows the Library with the query in the box', async () => {
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    fireEvent.click(tab('Seals & fixity'));
    expect(tab('Library').getAttribute('aria-selected')).toBe('false');

    let outcome: unknown;
    act(() => { outcome = applySurfaceAction(directive('vault.search', { query: 'protocol' }), vi.fn()); });
    expect(outcome).toEqual({ status: 'applied', detail: 'Searching the vault for "protocol"' });
    await waitFor(() => expect(tab('Library').getAttribute('aria-selected')).toBe('true'));
    expect(panelOf(tab('Library')).hidden).toBe(false);
    expect((screen.getByLabelText('Search this vault') as HTMLInputElement).value).toBe('protocol');
  });

  it('vault.focus-document from the Uploads view opens that document on its record', async () => {
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    fireEvent.click(tab(/^Uploads/));
    act(() => { applySurfaceAction(directive('vault.focus-document', { document: 'protocol-c2c-101-201' }), vi.fn()); });
    await waitFor(() => expect(tab('Library').getAttribute('aria-selected')).toBe('true'));
    expect(document.querySelector('.vd-detail .vd-d-title')?.textContent).toMatch(/protocol-c2c-101-201/);
  });
});

describe('the upload flow (D6 §C.4 steps 2, 5, 6; §C.6 4)', () => {
  it('"Add files" shows the Uploads view and opens the picker', async () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      render(<Vault {...props()} />);
      await screen.findByRole('tablist', { name: 'Vault views' });
      fireEvent.click(screen.getByTestId('vault-upload-button'));
      expect(tab(/^Uploads/).getAttribute('aria-selected')).toBe('true');
      const picker = pick.mock.contexts.at(-1) as HTMLInputElement;
      expect(picker.type).toBe('file');
      expect(picker.getAttribute('data-testid')).toBe('vault-upload-zone-files');
    } finally {
      pick.mockRestore();
    }
  });

  it('a file dropped anywhere on the page is staged in the Uploads view', async () => {
    const p = props();
    render(<Vault {...p} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    // The Uploads view, before anything is dropped: where files come from, and AnA's import ask.
    const uploads = panelOf(tab(/^Uploads/));
    expect(uploads.textContent).toMatch(/Drop files or a folder anywhere on this page, or use Add files\./);
    fireEvent.click(within(uploads).getByRole('button', { name: /Ask AnA to import/, hidden: true }));
    expect(p.onAsk).toHaveBeenCalledWith(IMPORT);
    expect(within(uploads).getByTestId('vault-upload-type').closest('label')?.textContent).toMatch(/^Type for files added next/);

    // Dropped on the Library's list, which is not the old header strip.
    const file = new File(['%PDF-1.4'], 'stability-36m.pdf', { type: 'application/pdf' });
    fireEvent.drop(document.querySelector('.vd-list') as HTMLElement, { dataTransfer: { files: [file], items: [] } });
    await waitFor(() => expect(tab(/^Uploads/).getAttribute('aria-selected')).toBe('true'));
    const staging = await within(uploads).findByTestId('vault-upload-staging');
    expect(staging.textContent).toContain('stability-36m.pdf');
  });

  it('when the Vault cannot be read, files added are still staged on screen, not lost behind the views', async () => {
    mockVaultApi(apiRequest, () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    render(<Vault {...props()} />);
    expect(await screen.findByText(/Couldn't load the project vault/)).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Vault views' })).toBeNull();
    const file = new File(['%PDF-1.4'], 'stability-36m.pdf', { type: 'application/pdf' });
    fireEvent.drop(area(), { dataTransfer: { files: [file], items: [] } });
    const staging = await screen.findByTestId('vault-upload-staging');
    expect(staging.textContent).toContain('stability-36m.pdf');
  });

  it('a viewer is offered no upload: no drop zone, no picker, no import ask', async () => {
    const auth = await import('@/services/portal/authService');
    const spy = vi.spyOn(auth, 'useAuthUser').mockReturnValue({ id: '7', permissions: [] } as never);
    try {
      render(<Vault {...props()} />);
      await screen.findByRole('tablist', { name: 'Vault views' });
      expect(screen.queryByTestId('vault-upload-zone')).toBeNull();
      expect(screen.queryByTestId('vault-upload-button')).toBeNull();
      expect(screen.queryByRole('button', { name: /Ask AnA to import/, hidden: true })).toBeNull();
      expect(area().querySelectorAll('.btn.primary')).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the record is D0's inspector (D6 §C.4 step 9; §C.6 5)", () => {
  it('docks beside the list at 1280px and wider, each part a disclosure with the first open', async () => {
    viewport(() => false);
    render(<Vault {...props()} />);
    const record = await waitFor(() => {
      const el = document.querySelector('.vd-detail') as HTMLElement | null;
      if (!el) throw new Error('no record yet');
      return el;
    });
    expect(record.classList.contains('de')).toBe(true);
    expect(record.hasAttribute('data-docked')).toBe(true);
    expect(record.closest('.wa-split')).not.toBeNull();
    const parts = [...record.querySelectorAll<HTMLElement & { open: boolean }>('details.pj-more')];
    expect(parts.map((d) => d.querySelector('summary')?.textContent)).toEqual(
      expect.arrayContaining(['Dossier filing', 'Catalog record', 'File', 'Versions', 'Review annotations', 'Related documents', 'History']),
    );
    expect(parts[0].querySelector('summary')?.textContent).toBe('Dossier filing');
    expect(parts[0].open).toBe(true);
    expect(parts.slice(1).every((d) => !d.open)).toBe(true);
    // The record's acts are quiet buttons; the one orange stays the header's.
    expect(within(record).getByTestId('vault-place-into-submission').className).toBe('btn ghost small');
    expect(within(record).getByTestId('vault-confirm-filing').className).toBe('btn ghost small');
  });

  it('below 1280px a row opens it as a drawer; Escape closes it and focus returns to the row', async () => {
    viewport((q) => q === '(max-width: 1279px)');
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    expect(document.querySelector('.vd-detail')).toBeNull();
    expect(document.querySelector('.wa-split')).toBeNull();
    const row = [...document.querySelectorAll('.vd-rows .vd-row')].find((r) => r.textContent?.includes('protocol-c2c-101-201')) as HTMLButtonElement;
    row.focus();
    fireEvent.click(row);
    const drawer = await screen.findByRole('dialog', { name: 'Record: protocol-c2c-101-201' });
    expect(drawer.classList.contains('de')).toBe(true);
    expect(drawer.closest('.de-bd')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Record:/ })).toBeNull());
    expect(document.activeElement).toBe(row);
  });

  it('below 1280px, Place into filing opened from the record keeps the keyboard: Tab stays in it, Escape closes it alone', async () => {
    viewport((q) => q === '(max-width: 1279px)');
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    const row = [...document.querySelectorAll('.vd-rows .vd-row')].find((r) => r.textContent?.includes('stability-summary-24m')) as HTMLButtonElement;
    row.focus();
    fireEvent.click(row);
    const record = await screen.findByRole('dialog', { name: 'Record: stability-summary-24m' });
    fireEvent.click(within(record).getByTestId('vault-place-into-submission'));
    const place = await screen.findByRole('dialog', { name: 'Place into filing' });
    // The record's hold on focus would pull a Tab out of this dialog and into the record behind it.
    const inside = within(place).getAllByRole('button')[0];
    inside.focus();
    fireEvent.keyDown(inside, { key: 'Tab' });
    expect(place.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Place into filing' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Record: stability-summary-24m' })).toBeTruthy();
    expect(record.contains(document.activeElement)).toBe(true);
  });

  it('below 1024px the structure is a drawer opened from the list', async () => {
    viewport((q) => q === '(max-width: 1279px)' || q === '(max-width: 1023px)');
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    expect(document.querySelector('aside.vd-tree')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Structure/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Document structure' });
    expect(within(drawer).getByText(/Module 3 · Quality/)).toBeTruthy();
  });
});

describe('the seals and the fixity check keep their acts (D6 §C.4 steps 10–11; §C.6 6)', () => {
  it('"Seal this Vault…" and "Check stored files" are quiet acts in their sections of the Seals & fixity view', async () => {
    render(<Vault {...props()} />);
    await screen.findByRole('tablist', { name: 'Vault views' });
    fireEvent.click(tab('Seals & fixity'));
    const view = panelOf(tab('Seals & fixity'));
    const seal = await within(view).findByTestId('vault-seal-open');
    expect(seal.className).toBe('btn ghost small');
    expect(seal.closest('.pj-sec-acts')).not.toBeNull();
    expect(within(view).getByRole('heading', { name: 'Seals' })).toBeTruthy();
    const check = within(view).getByRole('button', { name: 'Check stored files' });
    expect(check.className).toBe('btn ghost small');
    expect(within(view).getByRole('heading', { name: 'Stored files' })).toBeTruthy();
    // What a seal records is kept, closed, at the foot of its section.
    expect(within(view).getByText('What a seal records').closest('details')?.open).toBe(false);
  });
});
