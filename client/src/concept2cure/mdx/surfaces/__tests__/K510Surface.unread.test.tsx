// @vitest-environment jsdom
/**
 * A 510(k) surface with nothing read is not a 510(k) with nothing wrong.
 *
 * K510Surface fell back to three example sets, and each asserted something a
 * reviewer weighs:
 *
 *   K510_SE_ROWS    an invented substantial-equivalence comparison, including
 *                   a MARD accuracy of 8.2% against a predicate's 8.7%.
 *                   Substantial equivalence IS the 510(k) argument.
 *   K510_PREDICATES real cleared devices (K221847, K213163 and the rest are
 *                   genuine FDA records) carrying an invented `match` score
 *                   against the sponsor's device — an assessment nobody made.
 *   K510_ESTAR      the real FDA eSTAR section list with an invented status
 *                   per section, driving the blocker count and completion.
 *
 * The predicate table already refused to write an example K-number into the
 * device profile, because "an example K-number claimed as a predicate would
 * reach FDA as this sponsor's own assertion" — but that refusal was a tooltip
 * on a disabled button, and nothing on screen said the rows were examples.
 *
 * Case one is what removing them exposed: the eSTAR header read
 * "{total} sections · {blockers} blockers" unconditionally, so a submission
 * nobody had read rendered as "0 sections · 0 blockers" — an all-clear. The
 * fixture had made that branch unreachable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { K510Surface } from '../K510Surface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'BX-204 CGM',
  code: 'BX-204',
  stageIdx: 4,
  status: 'active',
} as unknown as Program;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** Every endpoint answers with `body`, or fails when it is null. */
function respond(body: unknown | null) {
  fetchMock.mockImplementation(async () =>
    body === null
      ? { ok: false, status: 503, text: async () => 'upstream unavailable', json: async () => ({}) }
      : { ok: true, status: 200, text: async () => '', json: async () => body },
  );
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <K510Surface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />
    </QueryClientProvider>,
  );
}

describe('K510Surface — an unread submission is not a clean one', () => {
  it('does not report "0 blockers" for eSTAR sections it never read', async () => {
    respond(null);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/eSTAR sections/));

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/0 sections · 0 blockers/);
    expect(text).toMatch(/Sections not yet read/);
  });

  it('still reports a real count once the sections are read', async () => {
    // Over-correction guard: a submission that HAS been read must say so.
    /* The wire shape of GET /api/510k/projects/:id/document-preview. */
    respond({
      sections: [
        { id: 1, label: 'Medical Device User Fee Cover Sheet', status: 'complete' },
        { id: 2, label: '510(k) Cover Letter', status: 'draft' },
      ],
    });
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/sections ·/));
    expect(container.textContent ?? '').not.toMatch(/Sections not yet read/);
  });

  it('renders no predicate, match score or SE comparison a live read did not return', async () => {
    respond(null);
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/eSTAR sections/));

    /* Values from the deleted K510_PREDICATES / K510_SE_ROWS sets. The
       K-numbers are real FDA clearances; claiming one as this sponsor's
       predicate is the assertion that must never be fabricated. */
    const text = container.textContent ?? '';
    for (const invented of ['K221847', 'Dexcom G7', 'FreeStyle Libre 3', '8.2%', 'MARD accuracy']) {
      expect(text).not.toContain(invented);
    }
  });
});

describe('the 510(k) data module states no assessment', () => {
  it('exports the real eSTAR section list and no findings about any submission', async () => {
    const mod = await import('../../data/k510');
    const exported = Object.keys(mod);
    for (const gone of ['K510_PREDICATES', 'K510_SE_ROWS', 'K510_ESTAR']) {
      expect(exported).not.toContain(gone);
    }

    /* The FDA eSTAR template's own structure stays — it is published, and it
       says nothing about anyone's progress through it. */
    expect(exported).toContain('K510_ESTAR_SECTIONS');
    const sections = (mod as Record<string, unknown>).K510_ESTAR_SECTIONS as { id: number; label: string }[];
    expect(sections).toHaveLength(20);
    expect(sections[0]).toEqual({ id: 1, label: 'Medical Device User Fee Cover Sheet' });
    /* No status, no blocker, no signer on any of them. */
    for (const s of sections) {
      expect(Object.keys(s).sort()).toEqual(['id', 'label']);
    }
  });
});
