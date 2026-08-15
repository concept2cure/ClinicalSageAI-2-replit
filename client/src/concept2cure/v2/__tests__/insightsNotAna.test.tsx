// @vitest-environment jsdom
/**
 * The Insights reporting pane must not present as AnA.
 *
 * ── What was shipping ─────────────────────────────────────────────────────────
 * The left column was headed "AnA — Reporting analyst", opened with "AnA
 * suggests", and answered in the first person: "I can build any report you
 * need", "I will not show an estimated result on a plan that has not unlocked
 * the governed model", "I am ranking and framing them, not recomputing them".
 *
 * None of it was AnA. What answered was `roRouteReply` (then `roAnaReply`), a
 * deterministic matcher: `roRouteIntent` scores the utterance against a fixed
 * vocabulary, `roDecide` checks entitlement, and the reply text is a template
 * literal in the same file. No model call, no retrieval, no reasoning.
 *
 * A reader cannot tell a template from a model by reading it. The name and the
 * first person WERE the claim, and the claim was false — on a governed
 * regulatory reporting surface, where "AnA judged this" and "a switch statement
 * matched a keyword" are not interchangeable provenance.
 *
 * ── The sharpest case ─────────────────────────────────────────────────────────
 * The opener said: "Looking across your portfolio, <PROGRAM> is <N>% ready…
 * Based on that and where each program sits, I'd start with the <PRESET>."
 *
 * The preset is `roPresetsForSeg(seg)[0]` — the first element of a static
 * per-segment array. It never reads readiness, never reads the PDUFA date,
 * never reads the portfolio. "Based on that" described a derivation that does
 * not exist, immediately after quoting a real number, which is the arrangement
 * most likely to be believed.
 *
 * ── What this test does NOT ask for ───────────────────────────────────────────
 * Not that the pane become a real assistant. The deterministic router is the
 * right mechanism here and is more trustworthy than a model would be for this
 * job: it refuses to show an estimated result on an unentitled plan, and when
 * it resolves a type it runs the REAL governed report. The behaviour stays; the
 * borrowed identity goes.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;

const OWNED_PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

/* A live flagship program, so the canvas renders its real four-state "loaded"
   branch rather than an empty state — the opener under test only exists there.
   The readiness figure is deliberately present and specific: the old copy
   quoted it and then claimed to have reasoned from it. */
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    url.includes('/api/insights-canvas/overview')
      ? ok({
          data: {
            organizationId: 1,
            tier: 'standard',
            segments: ['biotech'],
            leadProgram: {
              projectId: 1,
              code: 'BX204',
              label: 'BX204',
              filing: 'NDA',
              indication: null,
              readiness: 73,
              scope: 'project',
              scopeId: '1',
              agency: null,
              pdufa: '2027-03-14',
              criticalBlockerCount: 0,
            },
            portfolio: { programs: null },
          },
        })
      : ok({}),
  );
});

afterEach(() => cleanup());

async function renderCanvas() {
  render(<InsightsCanvas {...OWNED_PROPS} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

describe('Insights reporting pane — identity', () => {
  it('does not present itself as AnA', async () => {
    await renderCanvas();
    const text = document.body.textContent ?? '';

    // The header claimed a persona for a template matcher.
    expect(screen.queryByText(/AnA\s*--\s*Reporting analyst/)).toBeNull();
    expect(screen.queryByText(/AnA suggests/)).toBeNull();

    // …and so did the composer's placeholder, which is the last thing a user
    // reads before typing a question.
    const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement | null;
    expect(composer, 'the composer textarea should still exist').not.toBeNull();
    expect(composer!.placeholder).not.toMatch(/\bAnA\b/);

    // Nothing anywhere in the rendered pane should attribute this to AnA. The
    // `rc-ana*` CLASS names remain (internal selectors, carried by
    // insights-v2.css) — this is about what the user reads.
    expect(text, 'the pane still names AnA somewhere in its visible text').not.toMatch(/\bAnA\b/);
  });

  it('does not claim the suggested pack was derived from the readiness figure', async () => {
    await renderCanvas();
    const opener = document.querySelector('.rc-opener')?.textContent ?? '';

    // The live facts SHOULD still be stated — they are real, from the governed
    // overview read-model. Losing them would be the wrong fix.
    expect(opener, 'the live readiness figure should still be shown').toMatch(/73% ready/);
    expect(opener, 'the live PDUFA date should still be shown').toMatch(/2027-03-14/);

    // What must be gone is the asserted derivation. `roPresetsForSeg(seg)[0]`
    // never reads any of the above.
    expect(opener).not.toMatch(/Based on that/i);
    expect(opener).not.toMatch(/where each program sits/i);
    expect(opener).not.toMatch(/I'd start with/i);

    // No first person at all: there is no "I" here to speak.
    expect(opener).not.toMatch(/\bI\b|\bI'd\b|\bI'll\b|\bI am\b/);
  });

  it('states that the pane routes rather than answers', async () => {
    await renderCanvas();
    const guardrail = document.querySelector('.rc-guardrail')?.textContent ?? '';

    expect(guardrail, 'the guardrail line is missing').not.toBe('');
    // The guardrail used to open "AnA narrates and explains report outputs" —
    // crediting a language model for a `switch`. The half worth keeping is the
    // provenance claim, which is true and load-bearing.
    expect(guardrail).not.toMatch(/\bAnA\b/);
    expect(guardrail).toMatch(/does not answer in its own words/i);
    expect(guardrail).toMatch(/none is originated here/i);
  });
});
