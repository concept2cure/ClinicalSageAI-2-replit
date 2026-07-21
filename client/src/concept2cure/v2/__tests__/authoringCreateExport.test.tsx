// @vitest-environment jsdom
/**
 * AuthoringCreateExport — the create → publish half of the document loop.
 * Proves: New document POSTs /api/authoring/docs (with optional template seed)
 * and adopts the SERVER's row; New section POSTs /api/authoring/sections; and
 * Publish streams the server's binary via POST /docs/:id/export. A PDF button
 * is deliberately absent (the server's pdf branch returns mislabeled DOCX
 * bytes) — locked here so it can't quietly reappear. C2CForm is stubbed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
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

  it('publishes the assembled document as Word via POST /docs/:id/export', async () => {
    const fireToast = vi.fn();
    render(<AuthoringCreateExport {...base} docId="D1" fireToast={fireToast} />);
    fireEvent.click(screen.getByRole('button', { name: /Word/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/authoring/docs/D1/export');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ format: 'docx' });
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Published DOCX/));
  });

  it('offers no PDF button (the server pdf branch returns mislabeled DOCX bytes)', () => {
    render(<AuthoringCreateExport {...base} docId="D1" />);
    expect(screen.queryByRole('button', { name: /PDF/ })).toBeNull();
    expect(screen.getByRole('button', { name: /XML/ })).toBeTruthy();
  });
});
