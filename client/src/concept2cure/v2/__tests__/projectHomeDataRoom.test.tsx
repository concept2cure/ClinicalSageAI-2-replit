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

describe('ProjectHome — pinning sources as context', () => {
  afterEach(() => { delete (window as any).C2C_SOURCE_PINS; });

  it('cannot pin a source whose text was never read', async () => {
    // Pinning promises AnA will be grounded in the document. A source with no
    // extracted text cannot ground anything, so offering it would be a lie.
    mockApi(() =>
      ok({
        projectId: PID,
        sources: [
          source({ id: 1, title: 'good.pdf', extractionStatus: 'extracted' }),
          source({ id: 2, title: 'scanned.pdf', extractionStatus: 'failed' }),
        ],
        unscoped: [],
      }),
    );
    render(<ProjectHome {...props()} />);
    await screen.findByText('good.pdf');

    expect((screen.getByLabelText('Use good.pdf as context') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Use scanned.pdf as context') as HTMLInputElement).disabled).toBe(true);
  });

  it('hands the pinned set to AnA', async () => {
    mockApi(() =>
      ok({
        projectId: PID,
        sources: [
          source({ id: 11, title: 'a.pdf' }),
          source({ id: 22, title: 'b.pdf' }),
        ],
        unscoped: [],
      }),
    );
    const p = props();
    render(<ProjectHome {...p} />);
    await screen.findByText('a.pdf');

    fireEvent.click(screen.getByLabelText('Use a.pdf as context'));
    fireEvent.click(screen.getByLabelText('Use b.pdf as context'));

    const draft = await screen.findByText(/Draft with 2 pinned sources/);
    fireEvent.click(draft);

    expect((window as any).C2C_SOURCE_PINS).toEqual(['11', '22']);
    expect(p.onAsk).toHaveBeenCalledTimes(1);
  });

  it('offers no pin action until something is pinned', async () => {
    mockApi(() => ok({ projectId: PID, sources: [source()], unscoped: [] }));
    render(<ProjectHome {...props()} />);
    await screen.findByText('protocol-v2.pdf');
    expect(screen.queryByText(/Draft with .* pinned source/)).toBeNull();
  });
});

describe('ProjectHome — where a source is used', () => {
  /** Route /sources and /source-changes independently. */
  function mockUsageApi(sources: unknown[], changes: unknown[] = []) {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/projects/${PID}/sources`) return ok({ projectId: PID, sources, unscoped: [] });
      if (url === `/api/c2c/projects/${PID}/source-changes`) {
        return ok({ projectId: PID, changes, count: changes.length });
      }
      if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-301' });
      return ok({});
    });
  }

  it('reports the sections and documents a source is cited in', async () => {
    mockUsageApi([
      source({ id: 1, title: 'protocol.pdf', usage: { sections: 3, documents: 2, changedSections: 0 } }),
    ]);
    render(<ProjectHome {...props()} />);
    await screen.findByText('protocol.pdf');
    expect(screen.getByText(/Used in 3 sections · 2 documents/)).toBeTruthy();
  });

  it('says plainly when nothing was written from a source', async () => {
    // An uploaded document nothing cites is the state a reviewer most wants to
    // notice, so it must not read the same as a cited one.
    mockUsageApi([source({ id: 1, title: 'orphan.pdf', usage: { sections: 0, documents: 0, changedSections: 0 } })]);
    render(<ProjectHome {...props()} />);
    await screen.findByText('orphan.pdf');
    expect(screen.getByText('Not cited yet')).toBeTruthy();
  });

  it('flags the sections written against content the source no longer has', async () => {
    mockUsageApi([
      source({ id: 1, title: 'moved.pdf', usage: { sections: 4, documents: 1, changedSections: 2 } }),
    ]);
    render(<ProjectHome {...props()} />);
    await screen.findByText('moved.pdf');
    expect(screen.getByText(/2 written against older content/)).toBeTruthy();
  });

  it('shows nothing rather than a zero when the server sends no usage field', async () => {
    // An older server is not the same fact as "cited nowhere". Guessing either
    // way would be the fabrication this surface exists to avoid.
    mockUsageApi([source({ id: 1, title: 'unknown.pdf' })]);
    render(<ProjectHome {...props()} />);
    await screen.findByText('unknown.pdf');
    expect(screen.queryByText('Not cited yet')).toBeNull();
    expect(screen.queryByText(/Used in/)).toBeNull();
  });

  it('names the affected sections when a source has changed under them', async () => {
    mockUsageApi(
      [source({ id: 7, title: 'protocol-v3.pdf', usage: { sections: 1, documents: 1, changedSections: 1 } })],
      [
        {
          citationId: 'c-1',
          sectionId: 's-1',
          sectionCode: 'P.1',
          sectionTitle: 'Composition',
          documentTitle: 'CTD 3.2.P',
          sourceId: 7,
          sourceTitle: 'protocol-v3.pdf',
          citedAt: '2026-07-01T00:00:00Z',
        },
      ],
    );
    render(<ProjectHome {...props()} />);
    await screen.findByText(/1 section in this project was drafted from a source that has since changed/);
    expect(screen.getByText(/CTD 3\.2\.P · P\.1/)).toBeTruthy();
    // The platform reports; it does not silently regenerate regulated text.
    expect(screen.getByText(/Nothing has been rewritten/)).toBeTruthy();
  });

  it('shows no change banner when nothing is stale', async () => {
    mockUsageApi([source({ id: 1, usage: { sections: 1, documents: 1, changedSections: 0 } })]);
    render(<ProjectHome {...props()} />);
    await screen.findByText('protocol-v2.pdf');
    expect(screen.queryByText(/drafted from a source that has since changed/)).toBeNull();
  });
});
