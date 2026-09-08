// @vitest-environment jsdom
/**
 * AuthoringCreateExport — the create → publish half of the document loop.
 * Proves: New document POSTs /api/authoring/docs (with optional template seed)
 * and adopts the SERVER's row; New section POSTs /api/authoring/sections; and
 * Publish streams the server's binary via POST /docs/:id/export — Word, PDF
 * (real PDF: the server branch now renders via the HTML→PDF engine), and XML.
 * C2CForm is stubbed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ title: '2.6.6 Tox Summary', module: 'M2', template: '(blank document)', code: '2.6.6.1', content: '' })}>{config.submitLabel}</button>
  ),
}));

import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url === '/api/authoring/templates') return ok({ success: true, templates: [{ id: 't1', name: 'CTD Module 2 shell' }] });
    if (method === 'POST' && url === '/api/authoring/docs') return ok({ success: true, document: { id: 'D-9', title: body.title } }, 201);
    if (method === 'POST' && url === '/api/authoring/sections') return ok({ success: true, section: { id: 'S-4', code: body.code } }, 201);
    if (method === 'POST' && url === '/api/authoring/docs/D1/export') {
      return { ok: true, status: 200, blob: async () => new Blob(['PK-docx']), json: async () => null } as unknown as Response;
    }
    return ok({});
  });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

const base = { docTitle: 'Nonclinical Overview', module: 'M2', fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn() };

describe('AuthoringCreateExport — create → publish', () => {
  it('creates a document via POST /docs and adopts the server row', async () => {
    const onDocCreated = vi.fn();
    render(<AuthoringCreateExport {...base} docId={null} onDocCreated={onDocCreated} />);
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
    fireEvent.click(await screen.findByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/authoring/docs');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ title: '2.6.6 Tox Summary', module: 'M2' });
    });
    expect(onDocCreated).toHaveBeenCalledWith({ id: 'D-9', title: '2.6.6 Tox Summary' });
  });

  it('tells the user when the new document is not bound to a filing', async () => {
    // The create response carries the binding outcome on every success. This
    // surface dropped it, so a document the server had DECLINED to attach to
    // the open project's governed filing produced the same unqualified
    // "Document created" as one it had attached. Unbound is a legitimate state;
    // unbound and unsaid is how the two document stores drifted apart.
    const fireToast = vi.fn();
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/authoring/templates') return ok({ success: true, templates: [] });
      if (method === 'POST' && url === '/api/authoring/docs') {
        return ok({
          success: true,
          document: { id: 'D-9', title: body.title },
          governance: { bound: false, reason: 'ivd has no document class, so no filing was resolved.' },
        }, 201);
      }
      return ok({});
    });
    render(<AuthoringCreateExport {...base} docId={null} fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
    fireEvent.click(await screen.findByTestId('form-submit'));

    await waitFor(() => {
      expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Not bound to a filing/));
    });
    // The reason itself, not just the fact — "why" is what makes it actionable.
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/no document class/));
    // And it still says the document was created, because it was.
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Document created/));
  });

  it('does not cry unbound when the document IS bound', async () => {
    const fireToast = vi.fn();
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/authoring/templates') return ok({ success: true, templates: [] });
      if (method === 'POST' && url === '/api/authoring/docs') {
        return ok({
          success: true,
          document: { id: 'D-9', title: body.title },
          governance: { bound: true, c2cDocumentId: 'doc_ind_7' },
        }, 201);
      }
      return ok({});
    });
    render(<AuthoringCreateExport {...base} docId={null} fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
    fireEvent.click(await screen.findByTestId('form-submit'));

    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Document created/)));
    expect(fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/Not bound/));
  });

  it('creates a section via POST /sections in the open document', async () => {
    const onSectionCreated = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" onSectionCreated={onSectionCreated} />);
    fireEvent.click(screen.getByRole('button', { name: /New section/ }));
    fireEvent.click(await screen.findByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/authoring/sections');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ doc_id: 'D1', code: '2.6.6.1' });
    });
    expect(onSectionCreated).toHaveBeenCalledWith({ id: 'S-4', code: '2.6.6.1' });
  });

  it('exports the assembled document as Word via POST /docs/:id/export', async () => {
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/authoring/docs/D1/export');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ format: 'docx' });
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Exported DOCX/));
  });

  it('exports a real PDF via POST /docs/:id/export {format: pdf}', async () => {
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/authoring/docs/D1/export' && (c[2] as any)?.format === 'pdf');
      expect(call).toBeTruthy();
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Exported PDF/));
  });
  it('a download the browser blocks is never reported as exported to the device', async () => {
    // downloadBlob answers false when the environment refuses the save; the
    // handler used to discard that answer and say "Published".
    const saved = URL.createObjectURL;
    (URL as any).createObjectURL = undefined;
    try {
      const fireToast = vi.fn();
      render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} />);
      fireEvent.click(screen.getByRole('button', { name: /Word/ }));
      await waitFor(() => expect(fireToast).toHaveBeenCalled());
      expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/browser blocked the download/), 'error');
      expect(fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/^Exported/));
    } finally {
      (URL as any).createObjectURL = saved;
    }
  });

  it('a governance refusal (409, not frozen) is not blamed on the connection', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST' && url === '/api/authoring/docs/D1/export') {
        throw Object.assign(new Error('Freeze or approve it first'), { name: 'ApiRequestError', status: 409 });
      }
      return { ok: true, status: 200, json: async () => ({ templates: [] }) } as Response;
    });
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    const msg = String(fireToast.mock.calls[0][0]);
    expect(msg).toMatch(/Freeze or approve it first/);
    expect(msg).not.toMatch(/Check your connection/);
  });

  it('offers no export on a draft document, and says why', () => {
    render(<AuthoringCreateExport {...base} docId="D1" docStatus="DRAFT" />);
    const word = screen.getByRole('button', { name: /Word/ }) as HTMLButtonElement;
    expect(word.disabled).toBe(true);
    expect(word.title).toMatch(/Freeze or approve this document/);
  });
});
