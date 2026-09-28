// @vitest-environment jsdom
/**
 * Vault — a document type is named the same way everywhere it is shown, and a
 * file nobody authored is not reported as "0% complete".
 *
 * Split from vaultSurface.test.tsx (which pins the tree, filing and search
 * honesty) on 2026-09-24; these are the D2 label and completion cases.
 *
 * The tree used the shared label map (vaultIngestTypeLabel) from 2026-09-19.
 * Search hits and the upload type picker were mapped separately and rendered
 * the raw token, so the same document read "Module 3 · quality" in the tree
 * and "MODULE_3" in a search.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const PID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

/** One upload, as the server projects it (no authoring completion assessed). */
const UPLOAD = {
  id: `up-${DOC_ID}`, num: '3.2.P.8', title: 'stability-summary-24m', type: 'Test reports',
  status: 'confirmed', pct: null, owner: 'A. Author', ver: 'v1.0', updated: '2m ago',
  src: 'upload', docId: DOC_ID, sizeLabel: '1.0 MB', hash: 'a'.repeat(64),
  filing: {
    folderId: 'module-3', folderLabel: 'Module 3 · Quality', evidenceKind: 'report',
    ctdSection: '3.2.P.8', placementStatus: 'confirmed', confidence: 'high', rationale: 'Filed.',
  },
};

function vaultPayload() {
  return {
    success: true,
    data: {
      program: 'BX-301',
      spine: 'IND · 21 CFR 312',
      standard: 'pharma',
      documentCount: 1,
      tree: [{
        id: 'cabinet', code: '', label: 'Source files · filing cabinet',
        children: [{ id: 'cab-module-3', code: '', label: 'Module 3 · Quality', children: [UPLOAD] }],
      }],
      unfiledCount: 0,
    },
  };
}

const props = () => ({
  surface: { id: 'vault', label: 'Vault' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function mockSearch(searchResponse: () => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith(`/api/c2c/project-vault/${PID}/search`)) return searchResponse();
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    return ok({});
  });
}

function searchHit(over: Record<string, unknown>) {
  return ok({
    success: true,
    data: {
      query: 'q', total: 1, limit: 100, offset: 0,
      results: [{
        id: DOC_ID, fileName: 'doc.pdf', size: '1.0 MB', folderId: 'module-3',
        placementStatus: 'confirmed', snippet: null, ...over,
      }],
    },
  });
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
});

describe('Vault — document types are named in words', () => {
  it('names a search hit\'s document type in words, not the stored wire token', async () => {
    mockSearch(() => searchHit({ title: 'Dissolution method', documentType: 'MODULE_3', ctdSection: '3.2.P.5' }));
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'dissolution' } });
    expect((await screen.findAllByText('Module 3 · quality')).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('MODULE_3');
  });

  it('the upload type picker offers the shared labels, not the wire tokens with underscores swapped for spaces', async () => {
    mockSearch(() => ok({}));
    render(<Vault {...props()} />);
    const picker = (await screen.findByTestId('vault-upload-type')) as HTMLSelectElement;
    const labels = Array.from(picker.options).map((o) => o.textContent);
    expect(labels).toContain('Clinical study report');
    expect(labels).toContain('Module 3 · quality');
    expect(labels).not.toContain('MODULE 3');
    expect(labels).not.toContain('CSR');
    // The VALUE is still the token the ingest schema accepts.
    expect(Array.from(picker.options).map((o) => o.value)).toContain('MODULE_3');
  });
});

describe('Vault — what AnA is told about a selected file', () => {
  function Probe({ onCtx }: { onCtx: (c: SurfaceContext | null) => void }) {
    onCtx(useActiveSurfaceContext('vault'));
    return null;
  }

  it('a search hit is not "0% complete": no authoring completion was assessed', async () => {
    // A document the search found that is not in the tree, so the hit itself is
    // what is selected (a hit for a tree document opens the tree's record).
    mockSearch(() => searchHit({ id: '44444444-4444-4444-8444-444444444444', title: 'Stability Report', documentType: 'REPORT', ctdSection: '3.2.P.8' }));
    let ctx: SurfaceContext | null = null;
    render(<><Vault {...props()} /><Probe onCtx={(c) => { ctx = c; }} /></>);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'shelf' } });
    await screen.findAllByText('Stability Report');
    await waitFor(() => {
      const selected = (ctx?.facts as { selected?: { title?: string; percentComplete?: unknown } } | undefined)?.selected;
      expect(selected?.title).toBe('Stability Report');
      expect(selected?.percentComplete).toBeNull();
    });
  });
});
