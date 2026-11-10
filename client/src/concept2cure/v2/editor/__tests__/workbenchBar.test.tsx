// @vitest-environment jsdom
/**
 * D4-2, the artifact bar (.design/claude-convergence/D4.md §D4.B, §D4.G steps 1–2,
 * §D4.K "Bar" and "Menus"). The editor's 25-control header becomes one row: the
 * title and its state, the view switch, Save as the one primary only while there
 * is something to save, AnA (✻), Comments, Download and More (⋯). Every control the
 * header had is still reached, from the bar or from one of its two menus, by its
 * old name and test id. The real workbench is mounted; HTTP is synthetic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Synthetic author', email: 'assembly@example.test' } }),
}));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({
  AuthoringFilingBar: () => <span data-testid="filing-bar-stub"><button type="button">Freeze</button><button type="button">E-sign</button></span>,
}));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({
  AuthoringPlaceIntoFiling: () => <button type="button" data-testid="place-into-filing-stub">Place into filing</button>,
}));

import { PID, DOC, doc, section, template, ok, user, bearer, editorNode, mounted, localEdit, openEditorControl } from './workbenchAssemblyBuild.testSupport';
import { authService } from '@/services/portal/authService';
import { publishShellProject } from '../../shellProject';
import { clearEditorTarget } from '../../editorTarget';
import { oversightPrompt } from '../authoringOversight';
import { AuthoringOversightActions } from '../AuthoringOversightActions';
import { DownloadMenu, MenuButton, MenuItem } from '../DownloadMenu';
import { AuthoringCreateExport } from '../../surfaces/AuthoringCreateExport';

for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  vi.stubGlobal('fetch', vi.fn(async () => ok({ authenticated: true, user: user() })));
  await authService.adoptSession(bearer());
  publishShellProject({ id: PID });
  apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (url === '/api/authoring/templates') return ok({ success: true, templates: [template] });
    if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ ...doc, program_id: PID }] });
    if (pathname === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: doc });
    if (pathname === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: [{ ...section, revision_count: 3, comment_count: 2 }] });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  publishShellProject({ id: '' }); vi.unstubAllGlobals();
});

const bar = () => screen.getByTestId('ed-bar');
const more = () => within(screen.getByTestId('ed-more')).getAllByRole('button')[0];

describe('D4-2: the editor has one bar', () => {
  it('draws one bar with the title and its state, and no crumbs or "Save and sign" group', async () => {
    await mounted();
    expect(bar().tagName).toBe('HEADER');
    expect(bar().classList.contains('dcv-bar')).toBe(true);
    expect(document.querySelectorAll('[data-testid="ed-bar"]')).toHaveLength(1);
    expect(document.querySelector('.ed-doc-h, .ed-crumbs, .ed-doc-commit, .ed-doc-actions')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Save and sign' })).toBeNull();
    expect(bar().querySelector('.dcv-bar-t')?.textContent).toBe(doc.title);
    expect(screen.getByTestId('ed-status').textContent).toBe('Draft');
    await waitFor(() => expect(screen.getByTestId('ed-versions').textContent).toBe('v3'));
    expect(screen.getByTestId('ed-versions').getAttribute('aria-label')).toBe(`Versions: 3 revisions of ${section.code}`);
    expect(screen.getByTestId('ed-saved').textContent).toMatch(/^Saved /);
    const save = screen.getByTestId('save-section');
    expect(save.classList.contains('primary')).toBe(false);
    expect(save.textContent).toContain('Saved');
    expect(within(bar()).getByRole('button', { name: 'Comments 2' })).toBeTruthy();
    /* The crumbs' module moved to the outline's header. */
    expect(screen.getByTestId('ed-tree-p').textContent).toContain(doc.module);
  });

  it('makes Save the one primary and opens the reason strip only while there is something to save', async () => {
    await mounted();
    expect(document.querySelector('.ed-reason')).toBeNull();
    localEdit();
    await waitFor(() => expect(screen.getByTestId('save-section').classList.contains('primary')).toBe(true));
    expect(screen.getByTestId('save-section').textContent).toContain('Save');
    const strip = document.querySelector('.ed-reason') as HTMLElement;
    expect(strip.closest('[data-testid="ed-bar"]')).toBeNull();
    expect(within(strip).getByLabelText('Reason for change')).toBe(within(strip).getByTestId('change-reason'));
    expect(within(strip).getByTestId('change-reason').getAttribute('aria-required')).toBe('true');
    expect(within(strip).getByTestId('change-reason-note').textContent).toContain('at least 8 characters');
    expect(screen.getByTestId('ed-saved').textContent).toBe('Unsaved changes — on this device only');
    expect(screen.getByTestId('ed-saved').hasAttribute('data-dirty')).toBe(true);
    expect(bar().querySelectorAll('.btn.primary')).toHaveLength(1);
  });

  it('holds every panel and act in More, by name and test id, with arrows, Escape and focus return', async () => {
    await mounted();
    fireEvent.click(more());
    const menu = within(screen.getByTestId('ed-more')).getByRole('menu');
    for (const [name, testId] of [
      ['Sources', 'sources-rail-open'], ['Vault', 'vault-rail-open'], ['Versions', undefined],
      ['Exports', 'exports-rail-open'], ['Review tasks', 'tasks-rail-open'], ['Signatures', undefined],
      ['Audit trail', undefined], ['Access', 'access-rail-open'], ['Send for review…', 'send-for-review-open'],
      ['File to vault…', 'file-to-vault-open'], ['New document…', undefined], ['New section…', undefined],
      ['Comments', undefined], ['Download working copy (Word)', undefined],
    ] as const) {
      const item = within(menu).getByRole('menuitem', { name });
      if (testId) expect(item.getAttribute('data-testid')).toBe(testId);
    }
    expect(within(menu).getByRole('menuitemradio', { name: 'Section view' }).getAttribute('aria-checked')).toBe('true');
    expect(within(menu).getByRole('menuitemradio', { name: 'Document view' }).getAttribute('aria-checked')).toBe('false');
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Sources' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Vault' }));
    /* End and Home reach the last and first items, and the arrows wrap. */
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Download working copy (Word)' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Sources' }));
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Download working copy (Word)' }));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: 'Sources' }));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(within(screen.getByTestId('ed-more')).queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it('opens a panel chosen from More, and its close returns focus to More', async () => {
    await mounted();
    fireEvent.click(openEditorControl('Access'));
    const aside = await screen.findByRole('complementary', { name: 'Document access' });
    fireEvent.click(within(aside).getByRole('button', { name: 'Close document access' }));
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Document access' })).toBeNull());
    expect(document.activeElement).toBe(more());
  });

  it('opens Review tasks from the status word and the versions from "v{n}"', async () => {
    await mounted();
    fireEvent.click(screen.getByTestId('ed-status'));
    expect(await screen.findByRole('complementary', { name: 'Review tasks' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('ed-versions'));
    expect(await screen.findByText('Revision history')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close revision history' }));
    await waitFor(() => expect(screen.queryByText('Revision history')).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId('ed-versions'));
  });

});

describe('D4-2: AnA, create and download from the bar', () => {
  it('puts Draft with AnA, Draft from sources and Review with AnA in the ✻ menu, and an ask lands in the conversation', async () => {
    const onAsk = vi.fn();
    await mounted({ onAsk });
    expect(document.querySelector('[aria-label="AnA document oversight"]')).toBeNull();
    const ana = within(screen.getByTestId('ed-ana')).getAllByRole('button')[0];
    expect(ana.getAttribute('aria-label')).toBe('AnA');
    expect(ana.getAttribute('aria-haspopup')).toBe('menu');
    expect(openEditorControl('Draft with AnA', 'ana')).toBeTruthy();
    expect(openEditorControl('Draft from sources', 'ana').getAttribute('data-testid')).toBe('ai-draft-open');
    const review = within(screen.getByTestId('ed-ana')).getByRole('group', { name: 'Review with AnA' });
    expect(within(review).getAllByRole('menuitem').map(item => item.getAttribute('aria-label')))
      .toEqual(['Review section', 'Review document', 'Reconcile project evidence', 'Prepare targeted fixes']);
    expect(review.textContent).toContain('AnA reads saved documents and project evidence. Proposed fixes remain tracked changes for your review.');
    fireEvent.click(openEditorControl('Review section', 'ana'));
    expect(onAsk).toHaveBeenCalledWith(oversightPrompt('section'), expect.anything());
    expect(within(screen.getByTestId('ed-ana')).queryByRole('menu')).toBeNull();
    fireEvent.click(openEditorControl('Draft from sources', 'ana'));
    expect(await screen.findByTestId('ai-draft-panel')).toBeTruthy();
  });

  it('opens the existing New document and New section drawers from More', async () => {
    await mounted();
    expect(within(bar()).queryByRole('button', { name: /New document/ })).toBeNull();
    fireEvent.click(openEditorControl('New document…'));
    expect(await screen.findByRole('button', { name: /Create document/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Create document/ })).toBeNull());
    fireEvent.click(openEditorControl('New section…'));
    expect(await screen.findByRole('button', { name: /Create section/ })).toBeTruthy();
  });

  it('keeps Download in the bar as an icon, the same menu', async () => {
    await mounted();
    const download = within(screen.getByTestId('ed-download')).getAllByRole('button')[0];
    expect(download.getAttribute('aria-label')).toBe('Download');
    expect(download.textContent?.trim()).toBe('');
    fireEvent.click(download);
    expect(within(screen.getByTestId('dlm-menu')).getByRole('menuitem', { name: 'Working copy (Word)' })).toBeTruthy();
  });

  it('keeps Freeze, E-sign and Place into filing in the bar until D4-3 moves their mounts', async () => {
    await mounted();
    expect(within(bar()).getByTestId('filing-bar-stub')).toBeTruthy();
    expect(within(bar()).getByTestId('place-into-filing-stub')).toBeTruthy();
    expect(within(bar()).getByRole('button', { name: /Re-file saved text/ })).toBeTruthy();
  });

  it('shows the conversation from the page placement where the AnA button stood', async () => {
    await mounted();
    const show = screen.getByTestId('ed-show-conversation');
    expect(show.getAttribute('aria-label')).toBe('Show the conversation');
    expect(editorNode()).toBeTruthy();
  });
});

describe('D4-2: the one menu-button pattern', () => {
  it('MenuButton is a menu button that skips items it does not show', () => {
    const chose = vi.fn();
    render(
      <MenuButton ariaLabel="More document actions" icon={<span>⋯</span>} testId="probe">
        {close => (
          <>
            <MenuItem label="First" onChoose={() => { close(); chose('first'); }} />
            <div style={{ display: 'none' }}><MenuItem label="Hidden" onChoose={() => chose('hidden')} /></div>
            <MenuItem label="Radio" role="menuitemradio" checked onChoose={() => chose('radio')} />
          </>
        )}
      </MenuButton>,
    );
    const trigger = screen.getByRole('button', { name: 'More document actions' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Radio' }));
    expect(screen.getByRole('menuitemradio', { name: 'Radio' }).getAttribute('aria-checked')).toBe('true');
    /* Home and End skip the hidden item too; Tab closes the menu. */
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'First' }));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Radio' }));
    fireEvent.keyDown(menu, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'First' }));
    expect(chose).toHaveBeenCalledWith('first');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('DownloadMenu compact draws the icon only, named Download', () => {
    render(<DownloadMenu docId="D1" docTitle="Doc" fireToast={vi.fn()} compact testId="dl" />);
    const trigger = within(screen.getByTestId('dl')).getAllByRole('button')[0];
    expect(trigger.getAttribute('aria-label')).toBe('Download');
    expect(trigger.className).toBe('btn ed-ico');
    expect(trigger.textContent?.trim()).toBe('');
  });

  it('AuthoringOversightActions as a menu: the four asks as items, the same note, each ask closes the menu', () => {
    const onAsk = vi.fn();
    const onChoose = vi.fn();
    const { rerender } = render(<div role="menu"><AuthoringOversightActions variant="menu" projectOpen sectionOpen documentOpen dirty={false} onAsk={onAsk} onChoose={onChoose} /></div>);
    const group = screen.getByRole('group', { name: 'Review with AnA' });
    expect(within(group).getAllByRole('menuitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reconcile project evidence' }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith(oversightPrompt('evidence'));
    rerender(<div role="menu"><AuthoringOversightActions variant="menu" projectOpen={false} sectionOpen documentOpen dirty={false} onAsk={onAsk} onChoose={onChoose} /></div>);
    const disabled = screen.getByRole('menuitem', { name: 'Review section' });
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(disabled.getAttribute('aria-describedby')!)?.textContent).toBe('Open a project so AnA can read its documents and evidence.');
    fireEvent.click(disabled);
    expect(onAsk).toHaveBeenCalledTimes(1);
  });

  it('AuthoringCreateExport with triggers="download" draws Download only and opens its drawers on request', async () => {
    const base = { docId: DOC, docTitle: doc.title, docStatus: 'DRAFT', module: 'M3', programId: PID, fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn() };
    const { rerender } = render(<AuthoringCreateExport {...base} triggers="download" requests={{ document: 0, section: 0 }} />);
    expect(screen.queryByRole('button', { name: /New document/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /New section/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create document/ })).toBeNull();
    rerender(<AuthoringCreateExport {...base} triggers="download" requests={{ document: 1, section: 0 }} />);
    expect(await screen.findByRole('button', { name: /Create document/ })).toBeTruthy();
  });

  it('AuthoringCreateExport says a refused request in a toast and opens no drawer', () => {
    const fireToast = vi.fn();
    const base = { docId: DOC, docTitle: doc.title, docStatus: 'DRAFT', module: 'M3', programId: null, fireToast, onDocCreated: vi.fn(), onSectionCreated: vi.fn() };
    const { rerender } = render(<AuthoringCreateExport {...base} triggers="download" requests={{ document: 0, section: 0 }} />);
    rerender(<AuthoringCreateExport {...base} triggers="download" requests={{ document: 0, section: 1 }} />);
    expect(fireToast).toHaveBeenCalledWith('Open a project first — a document belongs to a project.', 'error');
    expect(screen.queryByRole('button', { name: /Create section/ })).toBeNull();
  });
});

describe('D4-2: the bar and menu CSS (§D4.K)', () => {
  const css = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'styles', 'authoring-v2.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string) => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...css.matchAll(new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'g'))].map(m => m[1]).join(';');
  };

  it('a focused menu item keeps a visible ring, not outline: none alone', () => {
    const focus = rule('.dlm-item:focus-visible');
    expect(focus).toMatch(/box-shadow\s*:[^;]*var\(--accent-200/);
  });

  it('retires the header rules no surface draws any more, and the editor draws none of the old header', () => {
    for (const gone of ['.ed-doc-commit', '.ed-doc-actions', '.ed-viewtoggle', '.ed-program']) expect(css.includes(gone), gone).toBe(false);
    /* `.ed-doc-h` and `.ed-crumbs` stay for BiopharmaProject.tsx's workspace header, which is not the editor. */
    const workbench = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'DocumentWorkbench.tsx'), 'utf8');
    for (const gone of ['ed-doc-h', 'ed-crumbs', 'ed-doc-commit', 'ed-doc-actions', 'ed-viewtoggle', 'ed-program']) expect(workbench.includes(`"${gone}"`), gone).toBe(false);
    expect(rule('.ed-reason')).toMatch(/border-bottom/);
    expect(rule('.ed-saved[data-dirty]')).toMatch(/var\(--warning\)/);
  });

  it('wraps rather than clips at every width, and wins over D0’s later `.dcv-bar` shell', () => {
    /* Until D4-3 empties it, the row holds Freeze, E-sign and their refusal notes,
       Place into filing and Re-file saved text: wider than the page column at 1440
       with a rail open. An unwrapped row with acts that never shrink overflowed it. */
    expect(rule('.dcv-bar.ed-bar')).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(rule('.dcv-bar.ed-bar')).toMatch(/gap\s*:\s*4px/);
    const acts = rule('.ed-bar-acts');
    expect(acts).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(acts).toMatch(/min-width\s*:\s*0/);
    expect(acts).not.toMatch(/flex-shrink\s*:\s*0|overflow-x\s*:\s*auto/);
  });

  it('hides at phone width only what More holds whole, so nothing goes out of reach', () => {
    const narrow = [...css.matchAll(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n {2}\}/g)].map(m => m[1]).join('\n');
    expect(narrow).toMatch(/\.ed-bar \.ed-view/);
    expect(narrow).toMatch(/ed-comments-open/);
    /* Lock and takeover, the controlled export, the way back to the conversation. */
    for (const kept of ['.ed-collab', 'ed-download', 'ed-show-conversation']) expect(narrow.includes(kept), kept).toBe(false);
  });
});
