// @vitest-environment jsdom
/**
 * Download: two acts that cannot be mistaken (docs/design/ONE_ANA_ONE_CANVAS.md
 * §4.5, slice 7, client half).
 *
 * The founder, 2026-10-07: "I want to be able to pull them down and see them
 * and work with them". Until this change a document AnA had just built could
 * not be downloaded at all: Word, PDF and XML were three buttons, all disabled
 * for a draft, because the export is a filing artifact the server refuses
 * (409) unless the document is sealed.
 *
 * Pinned here, through the editor's own toolbar control (AuthoringCreateExport):
 *  - one Download menu button, keyboard and screen-reader correct;
 *  - "Working copy (Word)" and "Working copy (PDF)" offered at any status, each
 *    described "Marked DRAFT — uncontrolled copy";
 *  - choosing one POSTs /api/authoring/docs/:id/working-copy and downloads the
 *    bytes the server sent;
 *  - a refusal is said in the server's words, never silent, never a success;
 *  - "Controlled export" is offered only when FROZEN or APPROVED, otherwise
 *    disabled with its reason visible and read;
 *  - a refusal, or a copy still being prepared, is shown only beside the
 *    document it was for (the Authoring surface keeps one control mounted as
 *    the person moves through the tree);
 *  - the menu is not laid out inside the toolbar that scrolls (it was cut off
 *    there): it opens as a manual popover, placed from its button in viewport
 *    coordinates. The clipping itself is shown in a real browser
 *    (docs/evidence/D2-ONE-ANA/2026-10-08/ana-2b-canvas-documents-download/).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({ C2CForm: () => null }));

import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { placeMenu } from '../editor/DownloadMenu';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
const fileReply = (bytes: string, name: string) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'Content-Disposition': `attachment; filename="${name}"` }),
  blob: async () => new Blob([bytes]),
  json: async () => null,
}) as unknown as Response;

let downloads: string[];
beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT, title: 'ONC-221' };
  downloads = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/authoring/templates') return ok({ success: true, templates: [] });
    if (method === 'POST' && url === '/api/authoring/docs/D1/working-copy') return fileReply('PK-working', 'Clinical_Overview_working_copy.docx');
    if (method === 'POST' && url === '/api/authoring/docs/D1/export') return fileReply('PK-controlled', 'clinical.docx');
    return ok({});
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const base = { docId: 'D1', docTitle: 'Clinical Overview', module: 'M2', onDocCreated: vi.fn(), onSectionCreated: vi.fn() };
const downloadButton = () => screen.getByRole('button', { name: /^Download/ });
const openMenu = () => {
  if (!screen.queryByRole('menu')) fireEvent.click(downloadButton());
  return screen.getByRole('menu');
};
const item = (name: string) => {
  openMenu();
  return screen.getByRole('menuitem', { name });
};
const posts = (tail: string) => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && String(c[1]).endsWith(tail));

describe('One Download menu: a working copy at any status, a controlled export only when sealed', () => {
  it('a draft offers both working copies, each marked as an uncontrolled copy', () => {
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={vi.fn()} />);
    for (const name of ['Working copy (Word)', 'Working copy (PDF)']) {
      const it = item(name);
      expect(it.getAttribute('aria-disabled')).toBeNull();
      expect(it.textContent).toContain('Marked DRAFT — uncontrolled copy');
      const described = document.getElementById(it.getAttribute('aria-describedby') ?? '');
      expect(described?.textContent).toContain('Marked DRAFT — uncontrolled copy');
    }
  });

  it('choosing Working copy (Word) on a draft posts the working-copy route and downloads what the server sent', async () => {
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={fireToast} />);
    fireEvent.click(item('Working copy (Word)'));
    await waitFor(() => expect(downloads).toEqual(['Clinical_Overview_working_copy.docx']));
    expect(posts('/working-copy')).toHaveLength(1);
    expect(posts('/working-copy')[0][2]).toEqual({ format: 'docx' });
    // Never the controlled export: no export-history row for a working copy.
    expect(posts('/export')).toHaveLength(0);
    // "requested": the browser may still ask where to save it, or block it.
    expect(fireToast).toHaveBeenCalledWith(
      'Working copy of Clinical Overview (Word) requested in your browser. Every page is marked DRAFT — uncontrolled copy.',
      'ok',
    );
  });

  it('Working copy (PDF) asks for a PDF', async () => {
    render(<AuthoringCreateExport {...base} docStatus="IN_REVIEW" fireToast={vi.fn()} />);
    fireEvent.click(item('Working copy (PDF)'));
    await waitFor(() => expect(posts('/working-copy')).toHaveLength(1));
    expect(posts('/working-copy')[0][2]).toEqual({ format: 'pdf' });
  });

  it('a refusal is said in the server’s words, beside the control and in a toast, and nothing downloads', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/authoring/docs/D1/working-copy') {
        throw new ApiRequestError('The working copy could not be recorded, so it was not sent', 503, undefined, 'WORKING_COPY_NOT_RECORDED');
      }
      return ok({ success: true, templates: [] });
    });
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={fireToast} />);
    fireEvent.click(item('Working copy (Word)'));
    const said = await screen.findByTestId('dlm-refusal');
    expect(said.textContent).toBe('No working copy of Clinical Overview was downloaded. The working copy could not be recorded, so it was not sent.');
    expect(fireToast).toHaveBeenCalledWith(said.textContent, 'error');
    expect(downloads).toEqual([]);
    expect(fireToast).not.toHaveBeenCalledWith(expect.anything(), 'ok');
  });

  it('a draft shows the controlled export disabled, with its reason visible and read with each item', () => {
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={vi.fn()} />);
    openMenu();
    const reason = screen.getByTestId('dlm-ctl-reason');
    expect(reason.textContent).toBe('Freeze or approve to export a controlled copy');
    for (const f of ['Word', 'PDF', 'XML']) {
      const ctl = screen.getByRole('menuitem', { name: `Controlled export (${f})` });
      expect(ctl.getAttribute('aria-disabled')).toBe('true');
      expect(ctl.getAttribute('aria-describedby')).toBe(reason.id);
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'Controlled export (Word)' }));
    expect(posts('/export')).toHaveLength(0);
  });

  it.each(['FROZEN', 'APPROVED', 'approved'])('a %s document offers the controlled export, through the export route', async (status) => {
    render(<AuthoringCreateExport {...base} docStatus={status} fireToast={vi.fn()} />);
    const ctl = item('Controlled export (Word)');
    expect(ctl.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByTestId('dlm-ctl-reason')).toBeNull();
    fireEvent.click(ctl);
    await waitFor(() => expect(posts('/export')).toHaveLength(1));
    expect(posts('/export')[0][2]).toEqual({ format: 'docx' });
    expect(posts('/working-copy')).toHaveLength(0);
  });
});

describe('The Download menu is a real menu button', () => {
  it('names what it opens, and says whether it is open', () => {
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={vi.fn()} />);
    const btn = downloadButton();
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe(screen.getByRole('menu').id);
  });

  it('opens on ArrowDown with focus on the first item; the arrows move; Escape closes and returns focus', async () => {
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={vi.fn()} />);
    const btn = downloadButton();
    btn.focus();
    fireEvent.keyDown(btn, { key: 'ArrowDown' });
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Working copy (Word)'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Working copy (PDF)');
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Controlled export (XML)');
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Working copy (Word)');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('choosing an item closes the menu and returns focus to the button', async () => {
    render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={vi.fn()} />);
    const pdf = item('Working copy (PDF)');
    await act(async () => { fireEvent.click(pdf); });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(downloadButton());
  });
});

describe('What the control says belongs to one document', () => {
  it('a refusal for one document is not shown beside the next one the control is handed', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/authoring/docs/D1/working-copy') throw new ApiRequestError('Document not found', 404);
      return ok({ success: true, templates: [] });
    });
    const fireToast = vi.fn();
    const { rerender } = render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={fireToast} />);
    fireEvent.click(item('Working copy (Word)'));
    expect((await screen.findByTestId('dlm-refusal')).textContent).toBe('No working copy of Clinical Overview was downloaded. Document not found.');
    rerender(<AuthoringCreateExport {...base} docId="D2" docTitle="Nonclinical Overview" docStatus="DRAFT" fireToast={fireToast} />);
    expect(screen.queryByTestId('dlm-refusal')).toBeNull();
    // Back on the first document, its own refusal is still its own.
    rerender(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={fireToast} />);
    expect(screen.getByTestId('dlm-refusal').textContent).toContain('Clinical Overview');
  });

  it('an answer that arrives after the person moved on is told, but not shown beside the other document, and does not hold its control', async () => {
    let answer: (r: Response) => void = () => {};
    apiRequest.mockImplementation((method: string, url: string) => {
      if (method === 'POST' && url === '/api/authoring/docs/D1/working-copy') {
        return new Promise<Response>((resolve) => { answer = resolve; });
      }
      return Promise.resolve(ok({ success: true, templates: [] }));
    });
    const fireToast = vi.fn();
    const { rerender } = render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={fireToast} />);
    fireEvent.click(item('Working copy (Word)'));
    const control = () => screen.getByTestId('ed-download').querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
    await waitFor(() => expect(control().textContent).toContain('Preparing…'));
    rerender(<AuthoringCreateExport {...base} docId="D2" docTitle="Nonclinical Overview" docStatus="DRAFT" fireToast={fireToast} />);
    // The other document's control is free while the first answer is out.
    expect(downloadButton().textContent).not.toContain('Preparing…');
    expect(downloadButton().getAttribute('aria-busy')).toBeNull();
    expect(item('Working copy (Word)').getAttribute('aria-disabled')).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await act(async () => { answer(ok({ success: false, message: 'Document not found' }, 404)); });
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith('No working copy of Clinical Overview was downloaded. Document not found.', 'error'));
    expect(screen.queryByTestId('dlm-refusal')).toBeNull();
  });
});

describe('The menu opens outside the toolbar that scrolls', () => {
  const rect = (r: Partial<DOMRect>) => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, ...r }) as DOMRect;

  it('where the browser has a top layer, the menu opens in it as a manual popover, placed from its button', () => {
    const shown: Element[] = [];
    const proto = HTMLElement.prototype as unknown as { showPopover?: () => void };
    proto.showPopover = function (this: HTMLElement) { shown.push(this); };
    try {
      render(<AuthoringCreateExport {...base} docStatus="DRAFT" fireToast={vi.fn()} />);
      fireEvent.click(downloadButton());
      const menu = document.querySelector('.dlm-menu') as HTMLElement;
      expect(shown).toEqual([menu]);
      expect(menu.getAttribute('popover')).toBe('manual');
      expect(menu.style.top).not.toBe('');
      expect(menu.style.left).not.toBe('');
    } finally {
      delete proto.showPopover;
    }
  });

  const placed = (button: Partial<DOMRect>, size: { width: number; height: number }) => {
    const btn = document.createElement('button');
    const menu = document.createElement('div');
    btn.getBoundingClientRect = () => rect(button);
    menu.getBoundingClientRect = () => rect(size);
    placeMenu(btn, menu);
    const st = menu.style;
    return { position: st.position, top: st.top, bottom: st.bottom, left: st.left, right: st.right, maxHeight: st.maxHeight };
  };

  it('near the top of the screen it opens below its button, right edges aligned, in fixed coordinates', () => {
    expect(placed({ top: 100, bottom: 132, left: 520, right: 600 }, { width: 260, height: 300 })).toEqual({
      position: 'fixed', top: '138px', bottom: 'auto', right: `${window.innerWidth - 600}px`, left: 'auto', maxHeight: '',
    });
  });

  it('with room above it opens above; aligned left where right-aligned would run off the screen', () => {
    const top = window.innerHeight - 70;
    expect(placed({ top, bottom: top + 32, left: 20, right: 100 }, { width: 260, height: 300 })).toEqual({
      position: 'fixed', top: 'auto', bottom: `${window.innerHeight - top + 6}px`, left: '20px', right: 'auto', maxHeight: '',
    });
  });

  it('taller than the room below, it scrolls inside itself rather than running off the screen', () => {
    expect(placed({ top: 100, bottom: 132, left: 520, right: 600 }, { width: 260, height: 2000 }).maxHeight)
      .toBe(`${window.innerHeight - 132 - 14}px`);
  });
});
