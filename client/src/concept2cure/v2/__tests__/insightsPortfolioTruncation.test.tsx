// @vitest-environment jsdom
/**
 * A capped portfolio board says it is capped.
 *
 * `server/services/report-os/portfolio/fetch.ts` reads `ORG_ROLLUP_CAP + 1`
 * rows (cap 100) and sets `truncated` when it got more, precisely so a caller
 * can tell a complete rollup from a capped one. The overview's projection
 * carries the flag through (`insights-canvas-routes.ts:446`) and the client
 * type declared it (`Insights.tsx`) — and nothing rendered it.
 *
 * So an organisation with more than a hundred programmes saw "100 programs ·
 * avg readiness N%" presented as its portfolio, with the average taken over
 * the first hundred. That is a silent cap on a governed figure, and the figure
 * is the one an executive reads as "where my portfolio stands" (CLAUDE.md: no
 * silent caps; a truncated answer must not read as the whole one).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

const program = (code: string, readiness: number | null) => ({
  projectId: code.length + readiness! || 1, code, label: code, indication: null, readiness,
  confidence: 60, status: 'partial', riskLevel: 'medium', criticalBlockerCount: 0, pdufa: null,
});

/** The rollup summary as `aggregate.ts` shapes it. */
const summary = (truncated: boolean) => ({
  programCount: truncated ? 100 : 3,
  avgReadiness: 62,
  avgConfidence: 0,
  worstRisk: 'medium',
  readyCount: 1,
  partialCount: 2,
  missingCount: 0,
  totalCriticalBlockers: 0,
  truncated,
});

function overview(truncated: boolean, programCount: number) {
  return {
    data: {
      organizationId: 1,
      tier: 'enterprise',
      segments: ['biotech'],
      leadProgram: {
        projectId: 1, code: 'BX204', label: 'BX204', filing: null, indication: null,
        readiness: 70, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0,
      },
      portfolio: {
        entitled: true,
        requiredTier: 'enterprise',
        summary: summary(truncated),
        programs: Array.from({ length: programCount }, (_, i) => program(`PRG${i}`, 60 + (i % 20))),
      },
    },
  };
}

let truncated = false;
let count = 3;

/* The boards here stay small on purpose. `truncated` is what the UI branches
   on, not the cap's value, so three programmes prove the same behaviour as a
   hundred — and rendering a hundred readiness rings once starved a
   neighbouring suite's 5s waitFor on this 4-core box. */

/* Braces, not an implicit return: vitest invokes whatever a beforeEach returns
   as a cleanup hook, and `mockReset()` returns the mock itself. */
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    String(url).includes('/api/insights-canvas/overview') ? ok(overview(truncated, count)) : ok({}),
  );
});
afterEach(() => cleanup());

/** Ask for the board the way the canvas's router recognises. */
async function openBoard(isTruncated: boolean, programCount: number) {
  truncated = isTruncated;
  count = programCount;
  render(
    <InsightsCanvas
      surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']}
      segment="biotech"
      onNav={() => {}}
    />,
  );
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
  const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
  fireEvent.change(composer, { target: { value: 'portfolio board view across all programs' } });
  fireEvent.keyDown(composer, { key: 'Enter' });
  await waitFor(() => expect(document.querySelector('.ro-dash')).not.toBeNull());
}

describe('the portfolio board and the server’s rollup cap', () => {
  it('a complete rollup says nothing about a cap, and counts plainly', async () => {
    await openBoard(false, 3);
    expect(screen.queryByTestId('ro-port-truncated')).toBeNull();
    expect(document.querySelector('.ro-rep-meta')?.textContent ?? '').toMatch(/3 programs/);
    expect(document.querySelector('.ro-rep-meta')?.textContent ?? '').not.toMatch(/first/);
  });

  it('a capped rollup says the board is not the whole portfolio', async () => {
    await openBoard(true, 3);
    const note = await screen.findByTestId('ro-port-truncated');
    expect(note.textContent ?? '').toMatch(/more programs than this board shows/);
    // And it says what the average does NOT cover, since that is the figure
    // an executive reads as the organisation's position.
    expect(note.textContent ?? '').toMatch(/not over your whole portfolio/);
  });

  it('a capped rollup counts as "first N", never as the organisation’s total', async () => {
    await openBoard(true, 3);
    const meta = document.querySelector('.ro-rep-meta')?.textContent ?? '';
    expect(meta).toMatch(/first 3 programs/);
  });

  /* NOT "the highest-ranked": fetchOrgPrograms selects the cap with no ORDER BY,
     so calling them a top slice would promise a selection the query never makes
     and read as "nothing worse exists". */
  it('the reply above the board says there are more, and that these are not ranked', async () => {
    await openBoard(true, 3);
    const result = await screen.findByTestId('rc-find-result');
    expect(result.textContent ?? '').toMatch(/there are more/);
    expect(result.textContent ?? '').toMatch(/not a ranked selection/);
    expect(result.textContent ?? '').not.toMatch(/highest-ranked|by the server's ranking/);
  });

  it('the board note does not claim the shown programs are the worst ones', async () => {
    await openBoard(true, 3);
    const note = await screen.findByTestId('ro-port-truncated');
    expect(note.textContent ?? '').toMatch(/without an ordering/);
    expect(note.textContent ?? '').not.toMatch(/highest-ranked/);
  });
});
