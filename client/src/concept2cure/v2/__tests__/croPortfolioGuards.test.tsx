// @vitest-environment jsdom
/**
 * cro-portfolio: the guards kept the content.
 *
 * Sibling of `guardsPreserveContent.test.tsx` — same purpose, different surface,
 * kept separate so neither file grows past reading length. The purpose is the
 * half the hostile-payload probe cannot cover: that surface still SHOWS its data
 * when the data is fine.
 *
 * The three cases are the three answers a row can legitimately give, and the
 * point is that they stay distinguishable:
 *
 *   · every field present        → everything renders, both SOW tones present
 *   · child lists genuinely empty → "No studies recorded for this sponsor yet"
 *                                   and `0 studies` — an EMPTY state, which is a
 *                                   true statement about the sponsor
 *   · no `sow` at all             → the chip is OMITTED, not rendered blank
 *
 * That last one is the whole argument in miniature. An empty `.cro-sow` chip is
 * not neutral in a status column: it reads as a status, and its default
 * `tone-idle` is a specific claim about a contract nobody actually reported on.
 * Absent and idle are different facts, and a guard that renders one as the other
 * passes every crash test while quietly lying.
 *
 * From a verification agent's scratch file, kept because it asserts the
 * direction nothing else does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

const { apiRequest, ApiRequestError } = vi.hoisted(() => {
  class ApiRequestError extends Error {
    constructor(message: string, public readonly status: number, public readonly payload?: unknown) {
      super(message);
      this.name = 'ApiRequestError';
    }
  }
  return { apiRequest: vi.fn(), ApiRequestError };
});
vi.mock('@/lib/queryClient', () => ({ apiRequest, ApiRequestError }));

import { AuthProvider } from '@/services/portal/authService';
import { CroPortfolio } from '../surfaces/CroPortfolio';

const GOOD = {
  data: [
    {
      id: 'spn-1',
      name: 'Aurelia Therapeutics',
      type: 'biotech',
      lead: 'Dana Whitfield',
      sow: 'at-risk',
      sowNote: 'Change order pending for the second cohort',
      studies: [
        { code: 'AUR-204', phase: 'Phase 2', ind: 'Refractory NSCLC / open-label', status: 'Enrolling', n: '48 / 120' },
        { code: 'AUR-101', phase: 'Phase 1', ind: 'Solid tumors / dose escalation', status: 'Complete', n: '30 / 30' },
      ],
      subs: [
        { id: 'IND-145200', type: 'IND', region: 'FDA / CDER', state: 'validated', gate: '1 gate open', due: 'Mar 2027' },
      ],
    },
    {
      id: 'spn-2',
      name: 'Belmont Pharma',
      type: 'pharma',
      lead: 'Raj Patel',
      sow: 'on-track',
      sowNote: null,
      studies: [
        { code: 'BEL-310', phase: 'Phase 3', ind: 'Plaque psoriasis / double-blind', status: 'Enrolling', n: '210 / 400' },
      ],
      subs: [
        { id: 'NDA-215880', type: 'NDA', region: 'FDA / CDER', state: 'draft', gate: null, due: null },
        { id: 'MAA-9921', type: 'MAA', region: 'EMA', state: 'dispatched', gate: 'gate clear', due: 'Jan 2027' },
      ],
    },
  ],
};

let body: unknown = GOOD;

beforeEach(() => {
  cleanup();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <CroPortfolio
          surface={{ id: 'cro-portfolio', label: 'cro', navTier: 'global' } as never}
          onNav={() => {}}
          onAsk={() => {}}
          segment="biotech"
        />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(container.textContent).toContain('Aurelia Therapeutics'), { timeout: 6000 });
  return container;
}

const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('cro-portfolio guards did not gag the good-data render', () => {
  it('renders every guarded field for a well-formed payload', async () => {
    body = GOOD;
    const c = await mount();
    const all = txt(c);

    // roster names
    expect(all).toContain('Aurelia Therapeutics');
    expect(all).toContain('Belmont Pharma');

    // the two count reads that were replaced by locals
    expect(all).toContain('2 studies');
    expect(all).toContain('1 submission');
    expect(all).toContain('1 study');
    expect(all).toContain('2 submissions');

    // the sow chip — must still be PRESENT and carry its label
    const chips = Array.from(c.querySelectorAll('.cro-sow')).map(txt);
    expect(chips).toEqual(['at risk', 'on track']);
    expect(c.querySelector('.cro-sow.tone-warn')).toBeTruthy();
    expect(c.querySelector('.cro-sow.tone-ok')).toBeTruthy();

    // the sow banner — present, labelled, toned, and carrying its note
    const banner = c.querySelector('.cro-sow-banner');
    expect(banner).toBeTruthy();
    expect(txt(banner)).toContain('SOW - at risk');
    expect(txt(banner)).toContain('Change order pending for the second cohort');
    expect(banner?.className).toContain('tone-warn');

    // detail: lead + study table + submission table rows really rendered
    expect(all).toContain('Engagement lead Dana Whitfield');
    expect(all).toContain('AUR-204');
    expect(all).toContain('Refractory NSCLC / open-label');
    expect(all).toContain('Phase 2');
    expect(all).toContain('48 / 120');
    expect(all).toContain('AUR-101');
    expect(all).toContain('IND-145200');
    expect(all).toContain('FDA / CDER');
    expect(all).toContain('1 gate open');
    expect(all).toContain('Mar 2027');

    // the empty-state rows must NOT have fired
    expect(all).not.toContain('No studies recorded');
    expect(all).not.toContain('No regulatory submissions recorded');

    // derived rollups fed by the two flatMaps
    const cells = Array.from(c.querySelectorAll('.cro-pipe-cell')).map(txt);
    expect(cells).toEqual(['1Draft', '0Assembling', '1Validated', '0Frozen', '1Dispatched']);
    const metrics = Array.from(c.querySelectorAll('.metric')).map(txt);
    expect(metrics[0]).toContain('2');
    expect(metrics[1]).toContain('of 3 total');
    expect(all).toContain('3 active submissions');
  });

  it('a row missing ONLY its child lists keeps its name, chip and siblings', async () => {
    body = {
      data: [
        { id: 'a', name: 'Partial Sponsor', type: 'biotech', lead: 'Kim Lee', sow: 'renewal-due', sowNote: 'Renewal in Q3' },
        GOOD.data[1],
      ],
    };
    const c = await (async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { container } = render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <CroPortfolio
              surface={{ id: 'cro-portfolio', label: 'cro', navTier: 'global' } as never}
              onNav={() => {}}
              onAsk={() => {}}
              segment="biotech"
            />
          </AuthProvider>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(container.textContent).toContain('Partial Sponsor'), { timeout: 6000 });
      return container;
    })();
    const all = txt(c);
    // the row survives, is not blanked, and its known facts still print
    expect(all).toContain('Partial Sponsor');
    expect(all).toContain('Kim Lee');
    expect(txt(c.querySelector('.cro-sow'))).toBe('renewal due');
    expect(txt(c.querySelector('.cro-sow-banner'))).toContain('SOW - renewal due');
    expect(txt(c.querySelector('.cro-sow-banner'))).toContain('Renewal in Q3');
    // absent lists fall through to the pre-existing honest empty rows
    expect(all).toContain('No studies recorded for this sponsor yet');
    expect(all).toContain('No regulatory submissions recorded for this sponsor yet');
    // the OTHER sponsor is untouched
    expect(all).toContain('Belmont Pharma');
    expect(all).toContain('0 studies');
  });

  it('a row missing ONLY its sow omits the chip rather than inventing one', async () => {
    body = {
      data: [
        { id: 'a', name: 'No SOW Sponsor', type: 'biotech', lead: 'Ana Ruiz', sowNote: null, studies: [], subs: [] },
      ],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container: c } = render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <CroPortfolio
            surface={{ id: 'cro-portfolio', label: 'cro', navTier: 'global' } as never}
            onNav={() => {}}
            onAsk={() => {}}
            segment="biotech"
          />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(c.textContent).toContain('No SOW Sponsor'), { timeout: 6000 });
    const all = txt(c);
    expect(all).toContain('No SOW Sponsor');
    expect(all).toContain('Ana Ruiz');
    expect(c.querySelector('.cro-sow')).toBeNull();
    expect(c.querySelector('.cro-sow-banner')).toBeNull();
    // and no stand-in value was invented in its place
    expect(all).not.toMatch(/SOW - (Unknown|N\/A|TBD|—|-)\b/);
    expect(all).not.toContain('Unknown');
    expect(all).not.toContain('N/A');
  });
});
