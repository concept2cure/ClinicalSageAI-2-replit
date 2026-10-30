// @vitest-environment jsdom
/**
 * Slice 0 (.design/client-journey/INFORMATION_ARCHITECTURE.md, the
 * `device-postmarket` row): the documents panel says it is not read here
 * yet, instead of an empty list.
 *
 * PostmarketSurface's documents are the constant `EMPTY_DOCS`
 * (`const documents: KitDocument[] = EMPTY_DOCS` in PostmarketSurface.tsx) —
 * nothing reads them. The panel still drew
 * "Regulatory submissions in flight" with a filter row counting "All 0" and
 * "21 CFR 803 0", and the header said "0 regulatory submissions in flight":
 * a statutory-filing count stated about a list nobody read. A project with an
 * MDR in flight read as having none. The read exists
 * (`/api/post-market/programs/:id/documentation-status`) and is slice 21.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostmarketSurface } from '../PostmarketSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const PROGRAM = { id: 'project-own', code: 'PM-1', title: 'PM-1 Infusion pump' } as unknown as Program;

function serve() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/api/capa-mdr/triage')
      ? { items: [], count: 0 }
      : { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PostmarketSurface program={PROGRAM} onAskAna={() => {}} />
    </QueryClientProvider>,
  );
}

const text = (c: HTMLElement) => c.textContent ?? '';

describe('PostmarketSurface — the documents panel is not shown as an empty list (slice 0)', () => {
  it("says this project's post-market documents are not read here yet", async () => {
    serve();
    const { container, getByTestId } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    const note = getByTestId('pm-docs-not-read');
    expect(note.textContent ?? '').toMatch(/post-market documents are not read here yet/);
  });

  it('counts no documents it did not read', async () => {
    serve();
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    expect(text(container)).not.toMatch(/\d+ regulatory submissions in flight/);
    // The framework filter row counted an unread list: "All 0", "21 CFR 803 0".
    expect(container.querySelector('.docs-panel')).toBeNull();
    const filterCounts = Array.from(container.querySelectorAll('.seg-btn .count')).map((n) => n.textContent);
    expect(filterCounts).toEqual([]);
  });

  it('keeps the regulations the panel serves in the header', async () => {
    // Over-correction guard: the citation line is real, only the count was not.
    serve();
    const { container } = mount();
    await waitFor(() => expect(text(container)).not.toMatch(/Loading/i));

    expect(text(container)).toMatch(/21 CFR 803 MDR · EU MDR Art\. 87/);
  });
});
