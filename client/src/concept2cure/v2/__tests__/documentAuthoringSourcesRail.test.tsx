// @vitest-environment jsdom
/**
 * DocumentAuthoring — the Sources rail.
 *
 * The source context an author previously had to hold in their head: which
 * documents this section is drafted from, and whether those documents still say
 * what they said when it was written.
 *
 * Every row is a citation someone recorded. The standing of each citation
 * (`current` / `changed` / `unverified` / `unresolved`) is computed SERVER-side
 * from stored checksums and rendered as given — this surface never compares
 * anything itself, and never infers a source from the draft text.
 *
 * What these tests pin is mostly the honesty of the states:
 *   - a failed read is a failed read, not "cites nothing";
 *   - a citation with no recorded checksum makes no claim about the source;
 *   - a source that no longer resolves says so rather than vanishing;
 *   - a changed source is reported, never silently re-synced or rewritten.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// The editor's header widgets are unrelated to the rail under test, and
// AuthoringCollab reaches for the app-wide AuthProvider that a surface-level test
// does not stand up. Stubbed so a failure here is about source context.
// The surface itself now reads the auth identity too (suggestion attribution),
// so the auth service is mocked the way the sibling tests mock it.
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));


/* jsdom implements no layout: ProseMirror's scroll-into-view (scheduled by
   insertContent and selection changes) asks Ranges, Elements and text nodes
   for client rects and crashes the worker when a node type lacks the method.
   Stub the geometry to empty — scrolling is meaningless in jsdom anyway. */
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

const PID = '11111111-1111-4111-8111-111111111111';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEC = 'ssssssss-ssss-4sss-8sss-ssssssssssss';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function fail(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as Response;
}

function citation(over: Record<string, unknown> = {}) {
  return {
    citationId: 'cite-1',
    citedAt: '2026-07-01T00:00:00Z',
    citationText: null,
    citedChecksum: 'sha-1',
    state: 'current',
    source: {
      id: 5,
      title: 'protocol-v2.pdf',
      checksum: 'sha-1',
      extractionStatus: 'extracted',
      mimeType: 'application/pdf',
    },
    ...over,
  };
}

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

interface Routes {
  sections?: () => Response;
  projectSources?: () => Response;
}

/** Route the tree, the section list and the two source reads. */
function mockApi(routes: Routes = {}) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) {
      return ok({
        documents: [
          { id: DOC, title: 'CTD 3.2.P', module: 'M3', product_code: null, status: 'draft', updated_at: null, section_count: 1 },
        ],
      });
    }
    if (url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({
        sections: [
          { id: SEC, doc_id: DOC, code: 'P.1', title: 'Composition', content: 'draft text',
            order_index: 0, comment_count: 0, revision_count: 0, citation_count: 1, updated_at: null },
        ],
      });
    }
    if (url === `/api/authoring/sections/${SEC}/sources`) {
      return (routes.sections ?? (() => ok({ sources: [] })))();
    }
    if (url === `/api/c2c/projects/${PID}/sources`) {
      return (routes.projectSources ?? (() => ok({ sources: [] })))();
    }
    if (method === 'POST' || method === 'DELETE') return ok({ success: true });
    return ok({});
  });
}

/** Open the editor on its only section and switch the rail to Sources. */
async function openSourcesRail() {
  render(<DocumentAuthoring {...props()} />);
  // The section title appears in both the tree and the masthead.
  await screen.findAllByText('Composition');
  fireEvent.click(await screen.findByRole('button', { name: /Sources/ }));
  return screen.findByText('Drafted from');
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID };
});

describe('DocumentAuthoring — the Sources rail', () => {
  it('lists what the section is drafted from', async () => {
    mockApi({ sections: () => ok({ sources: [citation()] }) });
    await openSourcesRail();
    expect(await screen.findByText('protocol-v2.pdf')).toBeTruthy();
    expect(screen.getByText('Matches the source record as stored')).toBeTruthy();
  });

  it('reports a changed source without rewriting anything', async () => {
    mockApi({
      sections: () =>
        ok({ sources: [citation({ state: 'changed', citedChecksum: 'sha-old', source: { id: 5, title: 'protocol-v3.pdf', checksum: 'sha-new', extractionStatus: 'extracted', mimeType: null } })] }),
    });
    await openSourcesRail();
    expect(await screen.findByText('Source changed since cited')).toBeTruthy();
    // The offered action asks what changed. It does not regenerate the section.
    expect(screen.getByText(/Ask what changed/)).toBeTruthy();
  });

  /*
   * This used to assert that the button called the shell's `onAsk`. The editor
   * is registered `ownsConversation: true` — it needs the rail's column for its
   * own third track — so that call went into a rail this screen never renders.
   * The ask opens the editor's own AnA pane now; the prompt is unchanged.
   */
  it('asks AnA what changed, in the editor’s own pane, rather than redrafting on the spot', async () => {
    mockApi({ sections: () => ok({ sources: [citation({ state: 'changed' })] }) });
    const p = props();
    render(<DocumentAuthoring {...p} />);
    await screen.findAllByText('Composition');
    fireEvent.click(await screen.findByRole('button', { name: /Sources/ }));
    fireEvent.click(await screen.findByText(/Ask what changed/));

    // The pane opens with the question in it — not a rail somewhere else.
    const pane = await screen.findByLabelText(/AnA — document authoring/);
    await waitFor(() => expect(pane.textContent).toMatch(/no longer matches/));
    expect(pane.textContent).toMatch(/Do not rewrite it yet/);
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('makes no claim about a citation with no recorded checksum', async () => {
    mockApi({ sections: () => ok({ sources: [citation({ state: 'unverified', citedChecksum: null })] }) });
    await openSourcesRail();
    expect(await screen.findByText('Not checked against content')).toBeTruthy();
    expect(screen.queryByText('Matches the source record as stored')).toBeNull();
  });

  it('says a source is gone instead of dropping the citation', async () => {
    // "Cites something unavailable" and "cites nothing" are different facts, and
    // the first is the one worth surfacing.
    mockApi({ sections: () => ok({ sources: [citation({ state: 'unresolved', source: null })] }) });
    await openSourcesRail();
    expect(await screen.findByText('Source no longer available')).toBeTruthy();
  });

  it('distinguishes a failed read from a section that cites nothing', async () => {
    mockApi({ sections: () => fail(500) });
    await openSourcesRail();
    expect(await screen.findByText(/Couldn’t load this section’s sources/)).toBeTruthy();
    expect(screen.queryByText(/No sources recorded for this section/)).toBeNull();
  });

  it('renders an honest empty state for a section with no recorded sources', async () => {
    mockApi({ sections: () => ok({ sources: [] }) });
    await openSourcesRail();
    expect(await screen.findByText(/No sources recorded for this section/)).toBeTruthy();
  });
});

describe('DocumentAuthoring — recording a source', () => {
  it('offers the project data room, and refuses an unreadable document', async () => {
    mockApi({
      projectSources: () =>
        ok({
          sources: [
            { id: 11, title: 'good.pdf', extractionStatus: 'extracted' },
            { id: 22, title: 'scanned.pdf', extractionStatus: 'failed' },
          ],
        }),
    });
    await openSourcesRail();
    fireEvent.click(await screen.findByText(/Record a source/));

    const good = await screen.findByText('good.pdf');
    expect((good as HTMLButtonElement).disabled).toBe(false);
    // A document with no readable text cannot ground a draft, so citing it would
    // promise grounding it cannot provide.
    expect((screen.getByText(/scanned\.pdf/) as HTMLButtonElement).disabled).toBe(true);
  });

  it('posts the chosen source id and reloads the rail', async () => {
    mockApi({
      projectSources: () => ok({ sources: [{ id: 11, title: 'good.pdf', extractionStatus: 'extracted' }] }),
    });
    await openSourcesRail();
    fireEvent.click(await screen.findByText(/Record a source/));
    fireEvent.click(await screen.findByText('good.pdf'));

    await waitFor(() =>
      expect(
        apiRequest.mock.calls.some(
          (c: unknown[]) =>
            c[0] === 'POST' &&
            c[1] === `/api/authoring/sections/${SEC}/cite-source` &&
            (c[2] as { source_id?: number })?.source_id === 11,
        ),
      ).toBe(true),
    );
  });

  it('says so when there is no project data room to pick from', async () => {
    // With no project in context there is nothing to offer. Listing every source
    // in the organization instead would attach documents the project does not own.
    delete (window as any).C2C_PROJECT;
    mockApi();
    await openSourcesRail();
    fireEvent.click(await screen.findByText(/Record a source/));
    expect(await screen.findByText(/No project sources available/)).toBeTruthy();
  });

  it('surfaces the server’s refusal instead of reporting success', async () => {
    mockApi({
      projectSources: () => ok({ sources: [{ id: 11, title: 'good.pdf', extractionStatus: 'extracted' }] }),
    });
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) {
        return ok({ documents: [{ id: DOC, title: 'CTD 3.2.P', module: 'M3', status: 'draft', section_count: 1, product_code: null, updated_at: null }] });
      }
      if (url === `/api/authoring/docs/${DOC}/sections`) {
        return ok({ sections: [{ id: SEC, doc_id: DOC, code: 'P.1', title: 'Composition', content: '', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
      }
      if (url === `/api/authoring/sections/${SEC}/sources`) return ok({ sources: [] });
      if (url === `/api/c2c/projects/${PID}/sources`) {
        return ok({ sources: [{ id: 11, title: 'good.pdf', extractionStatus: 'extracted' }] });
      }
      if (method === 'POST' && url.endsWith('/cite-source')) {
        return fail(400, { error: 'source not found in this organization' });
      }
      return ok({});
    });

    await openSourcesRail();
    fireEvent.click(await screen.findByText(/Record a source/));
    fireEvent.click(await screen.findByText('good.pdf'));

    expect(await screen.findByText(/Nothing was saved/)).toBeTruthy();
  });
});

describe('DocumentAuthoring — re-reading a source', () => {
  it('asks the server to re-resolve, and reports what it says', async () => {
    mockApi({ sections: () => ok({ sources: [citation({ state: 'changed' })] }) });
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) {
        return ok({ documents: [{ id: DOC, title: 'CTD 3.2.P', module: 'M3', status: 'draft', section_count: 1, product_code: null, updated_at: null }] });
      }
      if (url === `/api/authoring/docs/${DOC}/sections`) {
        return ok({ sections: [{ id: SEC, doc_id: DOC, code: 'P.1', title: 'Composition', content: '', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 1, updated_at: null }] });
      }
      if (url === `/api/authoring/sections/${SEC}/sources`) return ok({ sources: [citation({ state: 'changed' })] });
      if (method === 'POST' && url.endsWith('/refresh-token')) {
        return ok({ success: true, changed: true, message: 'Source content has changed since this citation was made; the citation now records the current checksum.' });
      }
      return ok({});
    });

    await openSourcesRail();
    fireEvent.click(await screen.findByText(/Re-read source/));

    // The message is the server's. The client does not compute or invent a hash.
    expect(await screen.findByText(/the citation now records the current checksum/)).toBeTruthy();
  });

  it('reports a refusal from the server verbatim', async () => {
    mockApi({ sections: () => ok({ sources: [citation()] }) });
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/authoring/docs?')) {
        return ok({ documents: [{ id: DOC, title: 'CTD 3.2.P', module: 'M3', status: 'draft', section_count: 1, product_code: null, updated_at: null }] });
      }
      if (url === `/api/authoring/docs/${DOC}/sections`) {
        return ok({ sections: [{ id: SEC, doc_id: DOC, code: 'P.1', title: 'Composition', content: '', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 1, updated_at: null }] });
      }
      if (url === `/api/authoring/sections/${SEC}/sources`) return ok({ sources: [citation()] });
      if (method === 'POST' && url.endsWith('/refresh-token')) {
        return fail(409, { error: 'frozen', message: 'This citation is frozen and cannot be re-resolved' });
      }
      return ok({});
    });

    await openSourcesRail();
    fireEvent.click(await screen.findByText(/Re-read source/));
    expect(await screen.findByText(/frozen and cannot be re-resolved/)).toBeTruthy();
  });
});
