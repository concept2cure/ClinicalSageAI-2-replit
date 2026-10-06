// @vitest-environment jsdom
/** A recorded export whose response was lost remains discoverable without a
 * second POST. The Workbench mounts the real export action and history rail. */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEC = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
let exports: Array<Record<string, unknown>>;
beforeEach(() => {
  (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: PID, title: 'C2C-101' };
  exports = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const document = { id: DOC, title: 'Nonclinical Overview', module: 'M2', status: 'APPROVED', section_count: 1 };
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [document] });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [{ id: SEC, doc_id: DOC, code: '2.4', title: 'Overview', content: '<p>Saved summary.</p>', order_index: 0 }] });
    if (method === 'POST' && url === `/api/authoring/docs/${DOC}/export`) {
      exports.push({ id: 'X1', document_id: DOC, export_type: 'docx', exported_at: '2026-10-06T21:00:00Z', file_name: 'nonclinical-overview.docx', file_size: 1024, doc_sha256: 'aaaa', exported_by: 'author@test.co' });
      throw new ApiRequestError('Reply lost', 502);
    }
    if (url === `/api/authoring/docs/${DOC}/exports`) return ok({ success: true, exports, total: exports.length, last_export: exports[0] ?? null, current_content_hash: 'aaaa', content_changed_since_last_export: exports.length ? false : null });
    if (url === `/api/authoring/docs/${DOC}/diff-since-export`) return ok({ baseline: exports.length ? '2026-10-06T21:00:00Z' : null, changed: [] });
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
    if (url.startsWith('/api/c2c/documents/')) return { ...ok({ success: false }), ok: false, status: 404 };
    return ok({ success: true, templates: [], sources: [], revisions: [], comments: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

it('recovers a recorded export through the existing history without creating another export', async () => {
  render(<DocumentAuthoring surface={{ id: 'document-authoring', label: 'Authoring' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
  await screen.findAllByText('Overview');
  fireEvent.click(screen.getByRole('button', { name: /^Word$/ }));
  const recovery = await screen.findByRole('button', { name: /Check export history/ });
  expect((screen.getByRole('button', { name: /^Word$/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(recovery);
  const row = await screen.findByTestId('export-row');
  expect(row.textContent).toContain('nonclinical-overview.docx');
  expect(exports).toHaveLength(1);
  expect(apiRequest.mock.calls.filter(c => c[0] === 'POST' && String(c[1]).endsWith('/export'))).toHaveLength(1);
  expect(screen.getByTestId('exports-verdict').getAttribute('data-verdict')).toBe('current');
});
