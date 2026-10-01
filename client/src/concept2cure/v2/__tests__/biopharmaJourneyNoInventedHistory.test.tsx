// @vitest-environment jsdom
/**
 * The journey's stage catalog says what each stage involves — never what has
 * happened on the customer's programme.
 *
 * Every organization was shown the same regulatory history, under its own live
 * programme code: "Pre-IND meeting — minutes filed", "Nonclinical scope
 * aligned", "Protocol amendment 04 — active", "DSMB interim review 3 —
 * continue", "eCTD backbone — 84% mapped", "eValidator — 1 define.xml error",
 * "3 predicted HAQs", and a done flag on each deliverable. An earlier fix
 * dropped the rendered status chips and the tick marks but left the outcomes in
 * the descriptions themselves, and in an AnA prompt ("the 3 predicted HAQs
 * anchored on the locked CSR").
 *
 * This walks every stage of a real-shaped programme and checks that nothing on
 * screen states an outcome the programme record does not carry.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }) }));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { BiopharmaJourney } from '../surfaces/BiopharmaJourney';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response;

/* An outcome is a claim about THIS programme. None of these may appear unless
   the record says so — and the record below says nothing about any of them. */
const OUTCOMES = [
  /minutes filed/i, /scope aligned/i, /amendment 0?4/i, /interim review 3/i, /—\s*continue/i,
  /\b84%/, /define\.xml error/i, /\b3 predicted/i, /questions filed/i, /CMC first/i,
  /locked CSR and prior/i, /\bComplete\b/, /\bDrafting\b/, /\bPredicted\b/, /Q1 — internal/,
  /Target product profile locked/i,
];

beforeEach(() => apiRequest.mockReset());

describe('BiopharmaJourney — no invented programme history', () => {
  it('states no interaction outcome or deliverable status on any of the nine stages', async () => {
    const ROW = {
      code: 'ZX-9', name: 'Zexanib', app: 'BLA', modality: 'small molecule',
      indication: 'relapsed disease', pathway: 'accelerated', sponsor: 'ZenBio',
      agency: 'FDA', readiness: 42, current: 'IND filed',
      target: { label: 'BLA submission', v: 'Q4 2027', agency: 'FDA' },
      seg: 'biotech', overlay: {}, modules: [], clock: [], haqs: [],
      contra: { t: 'none', tag: 'ok', d: 'No contradictions on file.' }, blockers: [],
    };
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/program-journey' ? ok({ data: [ROW] }) : ok({ data: [] }),
    );
    const { container } = render(
      <BiopharmaJourney surface={{ id: 'program-journey', label: 'Journey' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />,
    );
    await waitFor(() => expect(container.querySelectorAll('.pj-stage-btn').length).toBe(9));

    const stageButtons = Array.from(container.querySelectorAll('.pj-stage-btn')) as HTMLButtonElement[];
    let interactionRowsSeen = 0;
    for (const b of stageButtons) {
      fireEvent.click(b);
      interactionRowsSeen += container.querySelectorAll('.pj-int').length;
      const text = container.textContent ?? '';
      for (const re of OUTCOMES) expect(text, `stage "${b.textContent}" states ${re}`).not.toMatch(re);
    }
    // Positive control: the interactions WERE rendered — the scan read real rows.
    expect(interactionRowsSeen).toBeGreaterThan(9);
    expect(screen.getAllByText(/Agency interactions at this stage/).length).toBeGreaterThan(0);
  });
});
