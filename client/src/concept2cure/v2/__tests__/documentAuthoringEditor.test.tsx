// @vitest-environment jsdom
/**
 * Document Authoring editable canvas — proves the surface is wired to the REAL
 * governed authoring store (/api/authoring), not a fixture:
 *   • loads documents → sections and opens the selected section's real content
 *   • Save issues PATCH /api/authoring/sections/:id with the edited content and
 *     reports that a revision was recorded (auto-versioning is server-side)
 *   • a failed save is surfaced honestly and nothing is fabricated locally
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

const DOCS = {
  success: true,
  documents: [{ id: 'D1', title: 'Nonclinical Overview', module: 'M3', product_code: 'ABC', status: 'draft', updated_at: '2026-07-20T10:00:00Z', section_count: 1 }],
};
const SECTIONS = {
  success: true,
  sections: [{ id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information', content: 'The drug substance is a monoclonal antibody.', order_index: 0, comment_count: 0, revision_count: 2, citation_count: 1, updated_at: '2026-07-20T10:00:00Z' }],
};

function props() {
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

afterEach(() => cleanup());

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/S1/history')) return ok({ success: true, revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments')) return ok({ success: true, comments: [] });
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      return ok({ success: true, revision_created: true, section: { ...SECTIONS.sections[0], content: 'EDITED', revision_count: 3 } });
    }
    return ok({ success: true });
  });
});

describe('DocumentAuthoring — real editable canvas', () => {
  it('loads the document, opens its section, and shows the real server content in the editor', async () => {
    render(<DocumentAuthoring {...props()} />);
    // Real document from GET /api/authoring/docs (appears in tree + breadcrumb).
    expect((await screen.findAllByText('Nonclinical Overview')).length).toBeGreaterThan(0);
    // Auto-selected section's real content lands in the editor (not a fixture).
    await waitFor(() => {
      const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(ta.value).toBe('The drug substance is a monoclonal antibody.');
    });
  });

  it('saves edited content via PATCH and reports that a revision was recorded', async () => {
    render(<DocumentAuthoring {...props()} />);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value).toBe('The drug substance is a monoclonal antibody.'));

    fireEvent.change(ta, { target: { value: 'Revised substance description.' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    // The write went to the real endpoint with the edited content.
    await waitFor(() => {
      const patch = apiRequest.mock.calls.find((c) => c[0] === 'PATCH');
      expect(patch).toBeTruthy();
      expect(patch![1]).toBe('/api/authoring/sections/S1');
      expect((patch![2] as any).content).toBe('Revised substance description.');
    });
    // Honest confirmation that a revision was recorded server-side.
    expect(await screen.findByText(/revision was recorded/i)).toBeTruthy();
  });

  it('surfaces a failed save honestly and keeps the user’s text (no fabrication)', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
      if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
        return { ok: false, status: 500, json: async () => ({ error: 'db unavailable' }) } as Response;
      }
      return ok({ success: true });
    });

    render(<DocumentAuthoring {...props()} />);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await waitFor(() => expect(ta.value.length).toBeGreaterThan(0));

    fireEvent.change(ta, { target: { value: 'My unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(await screen.findByText(/Couldn’t save the section/i)).toBeTruthy();
    // The edit is preserved (not discarded, not replaced by a fake success).
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('My unsaved edit');
  });
});
