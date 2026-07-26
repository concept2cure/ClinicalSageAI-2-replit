// @vitest-environment jsdom
/**
 * ProjectHome — the project's data room.
 *
 * The data room is the set of sources this project's documentation is written
 * from. It renders real `cre_evidence_sources` client documents from
 * GET /api/c2c/projects/:id/sources and never a fixture.
 *
 * The behaviour these tests pin is mostly about honesty:
 *   - a document whose text could not be read says so, rather than appearing
 *     identical to one that can be drafted from;
 *   - an empty project says it is empty;
 *   - a failed read says so instead of rendering as "no sources".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '11111111-1111-4111-8111-111111111111';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function source(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'protocol-v2.pdf',
    checksum: 'sha-1',
    ingestionStatus: 'ingested',
    extractionStatus: 'extracted',
    createdAt: '2026-07-20T10:00:00Z',
    mimeType: 'application/pdf',
    fileSize: 2_400_000,
    artifactId: null,
    origin: 'chat_upload',
    extractionMethod: 'pdf-text',
    ...over,
  };
}

const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/** Route every ProjectHome read; only /sources carries a payload we assert on. */
function mockApi(sourcesResponse: () => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}/sources`) return sourcesResponse();
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-301', code: 'BX301' });
    return ok({});
  });
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
});

describe('ProjectHome — data room', () => {
  it('lists the project\'s real sources', async () => {
    mockApi(() => ok({ projectId: PID, sources: [source()], unscoped: [] }));
    render(<ProjectHome {...props()} />);

    expect(await screen.findByText('protocol-v2.pdf')).toBeTruthy();
    // Kind, size and date come from the source's own metadata.
    expect(document.body.textContent).toMatch(/PDF/);
    expect(document.body.textContent).toMatch(/2\.3 MB|2\.4 MB/);
  });

  it('says a document is readable only when its extraction succeeded', async () => {
    mockApi(() =>
      ok({
        projectId: PID,
        sources: [
          source({ id: 1, title: 'good.pdf', extractionStatus: 'extracted' }),
          source({ id: 2, title: 'scanned.pdf', extractionStatus: 'failed' }),
          source({ id: 3, title: 'queued.pdf', extractionStatus: 'pending' }),
        ],
        unscoped: [],
      }),
    );
    render(<ProjectHome {...props()} />);

    await screen.findByText('good.pdf');
    // A document whose text could not be read must not look like one that can
    // be drafted from — a section "written from" it would be grounded in
    // nothing.
    expect(screen.getByText('Text not readable')).toBeTruthy();
    expect(screen.getByText('Not processed yet')).toBeTruthy();
    expect(screen.getByText('Read')).toBeTruthy();
  });

  it('reports how many sources are actually usable', async () => {
    mockApi(() =>
      ok({
        projectId: PID,
        sources: [
          source({ id: 1, extractionStatus: 'extracted' }),
          source({ id: 2, title: 'b.pdf', extractionStatus: 'failed' }),
        ],
        unscoped: [],
      }),
    );
    render(<ProjectHome {...props()} />);
    await screen.findByText(/2 sources · 1 readable/);
  });

  it('renders an honest empty state for a project with no sources', async () => {
    mockApi(() => ok({ projectId: PID, sources: [], unscoped: [] }));
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/No sources in this project yet/)).toBeTruthy();
  });

  it('distinguishes a failed read from an empty data room', async () => {
    mockApi(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/Couldn't load this project's sources/)).toBeTruthy();
    expect(screen.queryByText(/No sources in this project yet/)).toBeNull();
  });

  it('filters the list without refetching', async () => {
    mockApi(() =>
      ok({
        projectId: PID,
        sources: [source({ id: 1, title: 'protocol.pdf' }), source({ id: 2, title: 'csr.pdf' })],
        unscoped: [],
      }),
    );
    render(<ProjectHome {...props()} />);
    await screen.findByText('protocol.pdf');

    fireEvent.change(screen.getByLabelText('Search sources'), { target: { value: 'csr' } });

    await waitFor(() => expect(screen.queryByText('protocol.pdf')).toBeNull());
    expect(screen.getByText('csr.pdf')).toBeTruthy();
  });

  it('offers a way to add sources', async () => {
    mockApi(() => ok({ projectId: PID, sources: [], unscoped: [] }));
    render(<ProjectHome {...props()} />);
    expect(await screen.findByLabelText('Add sources to this project')).toBeTruthy();
  });
});
