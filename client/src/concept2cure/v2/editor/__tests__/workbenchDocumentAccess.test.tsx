// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: '1', organizationId: '7', displayName: 'Author', email: 'author@example.test' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import type { OwnedSurfaceViewProps } from '../../surfaceViews';

const DOC = '10000000-0000-4000-8000-000000000001';
const SEC = '20000000-0000-4000-8000-000000000001';
const emptyRects = () => [] as unknown as DOMRectList;
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect);
}
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
afterEach(cleanup);

describe('document access is reachable from the canonical authoring editor', () => {
  it('opens the current document access rail and uses its verified roster and outline choices', async () => {
    apiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) return ok({ success: true, documents: [{ id: DOC, title: 'Clinical overview', module: 'M2', status: 'draft', updated_at: null, section_count: 1 }] });
      if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { id: DOC, title: 'Clinical overview', status: 'draft', provenance: null } });
      if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ success: true, sections: [{ id: SEC, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>Medical rationale.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
      if (url === `/api/authoring/docs/${DOC}/permissions`) return ok({ success: true, docId: DOC, permissions: [] });
      if (url === '/api/tenant-users/7') return ok([{ id: 2, name: 'Medical reviewer', email: 'reviewer@example.test' }]);
      return ok({ success: true, revisions: [], comments: [], sources: [], events: [], citations: [] });
    });
    render(<DocumentAuthoring {...({ surface: { id: 'document-authoring', label: 'Authoring' }, segment: 'biotech', onNav: vi.fn() } as unknown as OwnedSurfaceViewProps)} />);
    fireEvent.click(await screen.findByTestId('access-rail-open'));
    const rail = within(screen.getByRole('complementary', { name: 'Document access' }));
    await rail.findByText('No explicit access grants recorded');
    await waitFor(() => expect((rail.getByRole('button', { name: 'Grant access' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(rail.getByRole('button', { name: 'Grant access' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Grant document access' }));
    expect(drawer.getByRole('option', { name: 'Medical reviewer' })).toBeTruthy();
    expect(drawer.getByRole('option', { name: '2.5.1 · Rationale' })).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${DOC}/permissions`);
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/tenant-users/7');
    fireEvent.click(drawer.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(rail.getByRole('button', { name: 'Close document access' }));
    expect(screen.queryByRole('complementary', { name: 'Document access' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('access-rail-open'));
  });
});
