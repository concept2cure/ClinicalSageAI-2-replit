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
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

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
import { startNewDocument } from '../newDocumentAction';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const PROJECT = '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

function wireExport(reply: () => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string) => method === 'POST' ? reply() : ok({ templates: [] }));
}

describe('Authoring export confirmation and recovery', () => {

  it('a lost reply is unknown, blocks repeat export, and offers the existing history', async () => {
    wireExport(async () => { throw new TypeError('Failed to fetch'); });
    const fireToast = vi.fn();
    const onCheckExports = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} onCheckExports={onCheckExports} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    const issue = await screen.findByRole('alert');
    expect(issue.textContent).toMatch(/cannot confirm.*recorded/i);
    expect(issue.textContent).not.toMatch(/document is unchanged|no file was produced/i);
    expect((screen.getByRole('button', { name: /Word/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Check export history/ }));
    expect(onCheckExports).toHaveBeenCalledOnce();
    expect(apiRequest.mock.calls.filter(c => c[0] === 'POST')).toHaveLength(1);
    expect(fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/^Exported/));
  });

  it.each([502, 500])('an untyped %s does not assert that nothing was recorded', async (status) => {
    wireExport(async () => { throw new ApiRequestError('Service unavailable', status); });
    render(<AuthoringCreateExport {...base} docId="D1" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot confirm.*recorded/i);
  });

  it('a body-read failure after success refreshes the real record without claiming delivery', async () => {
    wireExport(async () => ({ ok: true, status: 200, blob: async () => { throw new Error('stream interrupted'); } }) as unknown as Response);
    const onExported = vi.fn();
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} onExported={onExported} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/recorded.*file.*not received/i);
    expect(onExported).toHaveBeenCalledWith('docx');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/^Exported/));
  });

  it('an empty body is not passed to the download primitive', async () => {
    wireExport(async () => ({ ok: true, status: 200, blob: async () => new Blob([]) }) as Response);
    render(<AuthoringCreateExport {...base} docId="D1" />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/recorded.*file.*not received/i);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('a typed rendering failure is retryable without an unknown-outcome claim', async () => {
    wireExport(async () => { throw new ApiRequestError('Rendering failed', 500, undefined, 'EXPORT_NOT_RECORDED'); });
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(String(fireToast.mock.calls[0][0])).toMatch(/no export was recorded/i);
    expect((screen.getByRole('button', { name: /Word/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('the server’s confirmed-record delivery failure refreshes history', async () => {
    wireExport(async () => { throw new ApiRequestError('Delivery failed', 500, undefined, 'EXPORT_DELIVERY_FAILED'); });
    const onExported = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" onExported={onExported} />);
    fireEvent.click(screen.getByRole('button', { name: /XML/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/recorded.*file.*not received/i);
    expect(onExported).toHaveBeenCalledWith('xml');
  });

});

describe('Authoring export context isolation', () => {
  it('does not overlap export requests across formats', async () => {
    let resolve!: (value: Response) => void;
    wireExport(() => new Promise<Response>(r => { resolve = r; }));
    render(<AuthoringCreateExport {...base} docId="D1" />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(apiRequest.mock.calls.filter(c => c[0] === 'POST')).toHaveLength(1);
    await act(async () => resolve({ ok: true, status: 200, blob: async () => new Blob(['PK']) } as Response));
  });

  it('a delayed old document export cannot download or refresh the new document', async () => {
    let resolve!: (value: Response) => void;
    wireExport(() => new Promise<Response>(r => { resolve = r; }));
    const onExported = vi.fn();
    const fireToast = vi.fn();
    const { rerender } = render(<AuthoringCreateExport {...base} docId="D1" onExported={onExported} fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    rerender(<AuthoringCreateExport {...base} docId="D2" onExported={onExported} fireToast={fireToast} />);
    await act(async () => resolve({ ok: true, status: 200, blob: async () => new Blob(['PK']) } as Response));
    expect(onExported).not.toHaveBeenCalled();
    expect(fireToast).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Word/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(['document round-trip', 'project switch', 'unmount'])('ignores a pending old body after %s', async (change) => {
    let resolve!: (value: Blob) => void;
    wireExport(async () => ({ ok: true, status: 200, blob: () => new Promise<Blob>(r => { resolve = r; }) }) as Response);
    const onExported = vi.fn();
    const fireToast = vi.fn();
    const props = { ...base, docId: 'D1', onExported, fireToast };
    const { rerender, unmount } = render(<AuthoringCreateExport {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    if (change === 'document round-trip') {
      rerender(<AuthoringCreateExport {...props} docId="D2" />);
      rerender(<AuthoringCreateExport {...props} />);
    } else if (change === 'project switch') {
      (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: '22222222-2222-4222-8222-222222222222', title: 'Other IND' };
      rerender(<AuthoringCreateExport {...props} />);
    } else unmount();
    await act(async () => resolve(new Blob(['PK'])));
    expect(onExported).not.toHaveBeenCalled();
    expect(fireToast).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
beforeEach(() => {
  // A document is created in the open project (PF-07).
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT, title: 'BX-204 IND' };
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

describe('AuthoringCreateExport — a document belongs to a project (PF-07)', () => {
  it('with no project open, New document is disabled, says why, and nothing is posted', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    render(<AuthoringCreateExport {...base} docId={null} />);
    const button = screen.getByRole('button', { name: /New document/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Open a project first/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/authoring/docs')).toBe(false);
  });

  it('the empty states’ New document (the event path) does not open a form that can only be refused', async () => {
    // The document tree's and the canvas's empty states raise the event rather
    // than click the button; the same rule holds there.
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} fireToast={fireToast} docId={null} />);
    startNewDocument();
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Open a project first/), 'error'));
    expect(screen.queryByTestId('form-submit')).toBeNull();
  });

  it('the event path opens the form when a project is open', async () => {
    render(<AuthoringCreateExport {...base} docId={null} />);
    startNewDocument();
    expect(await screen.findByTestId('form-submit')).toBeTruthy();
  });

  it('creates the document in the open project', async () => {
    render(<AuthoringCreateExport {...base} docId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
    fireEvent.click(await screen.findByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/authoring/docs');
      expect(call![2]).toMatchObject({ client_program_id: PROJECT });
    });
  });
});

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
