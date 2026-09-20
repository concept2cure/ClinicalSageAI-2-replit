// @vitest-environment jsdom
/**
 * "0% compliant" is a conformity finding, and it may only be stated about a
 * device somebody assessed.
 *
 * The GSPR header computed its headline as
 *
 *   gspr.overallPercent ?? (total > 0 ? round(compliant / total * 100) : 0)
 *
 * That `?? 0` was safe only because IVD_GSPR guaranteed rows: sample mode fed
 * the panel three chapters with 13 of 20 requirements compliant, so the zero
 * branch was unreachable in the only configuration anyone looked at. Remove
 * the fixture — as this change does, because an invented per-chapter conformity
 * count is a regulatory claim — and the zero branch becomes the normal case for
 * every device whose matrix has not been started. The surface then told an IVD
 * manufacturer that their device was 0% compliant with IVDR Annex I, which is
 * the most alarming reading the arithmetic can produce and is not a finding at
 * all.
 *
 * Case two is the over-correction guard: a device that HAS been assessed and
 * genuinely scores zero must still say so. "Not yet assessed" and "0% compliant"
 * are different facts and the header has to keep telling them apart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IvdSurface } from '../IvdSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'BX-Dx Assay',
  code: 'IVD-1',
  stageIdx: 3,
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

/** Every endpoint answers `{ data: [] }`; the GSPR matrix answers `matrix`. */
function respond(matrix: unknown) {
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => (url.includes('gspr-checklist') ? matrix : { data: [] }),
  }));
}

/* IvdSurface renders PathwayPanes, which reads through react-query. Retries
   off so a deliberate failure resolves once instead of on the library's
   schedule. */
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <IvdSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />
    </QueryClientProvider>,
  );
}

describe('IvdSurface — an unassessed GSPR matrix is not a zero score', () => {
  it('never reports 0% compliant for a device whose matrix has not been started', async () => {
    respond({ chapters: {} });
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/0% compliant/);
    expect(text).toMatch(/Not yet assessed/);

    /* And it reads as EMPTY, not as idle. useIvdGsprMatrix returned
       `rows.length ? rows : null`, collapsing "the matrix is open and holds
       nothing" into "never asked" — which the gate renders as "choose or
       create a program", the one instruction that cannot help a user who has
       one open. Invisible while a fixture stood in for null. */
    expect(text).not.toMatch(/Choose or create a program/i);
  });

  it('still reports a real zero — an assessed device that meets nothing says so', async () => {
    respond({
      chapters: {
        I: { total: 8, compliant: 0, partiallyCompliant: 0, nonCompliant: 8, notAssessed: 0 },
      },
      overallCompliancePercent: 0,
    });
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/compliant/));

    const text = container.textContent ?? '';
    expect(text).toMatch(/0% compliant/);
    expect(text).not.toMatch(/Not yet assessed/);
  });

  it('renders no classification, LoD or sensitivity a live read did not return', async () => {
    respond({ chapters: {} });
    const { container } = mount();
    await waitFor(() => expect(container.textContent ?? '').not.toMatch(/Loading/i));

    /* Values from the deleted IVD_CLASSIFICATIONS / IVD_VALIDATIONS /
       IVD_CLINICAL sets. Each was a regulatory finding about a named assay. */
    const text = container.textContent ?? '';
    for (const invented of ['BX-Dx HbA1c', 'SARS-CoV-2 Antigen', 'Rule 3(k)', '0.971', '12.5']) {
      expect(text).not.toContain(invented);
    }
  });
});

describe('the IVD data module states no finding', () => {
  it('exports no classification, validation, clinical or GSPR rows', async () => {
    const mod = await import('../../data/ivd');
    const exported = Object.keys(mod);
    for (const gone of ['IVD_CLASSIFICATIONS', 'IVD_VALIDATIONS', 'IVD_CLINICAL', 'IVD_GSPR']) {
      expect(exported).not.toContain(gone);
    }
    /* The stage list stays: the steps of an IVDR conformity route are real
       structure, not an assessment of any device against them. */
    expect(exported).toContain('IVD_STAGES');
  });
});
