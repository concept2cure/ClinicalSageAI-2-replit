// @vitest-environment jsdom
/**
 * D-7 on the client (decided 2026-10-22; docs/design/ANA_DETACH_2026-10-08.md
 * §9 D-7, §12.6): a Live Drive turn whose page closed goes on, and a screen
 * action it asks for afterwards is refused and listed as a step that DID NOT
 * RUN, with "Not run: the page was closed, so AnA stopped driving the screen."
 *
 * The server records such a step `not_run` (stream.ts SCREEN_GONE_RESULT,
 * step-presentation.ts SCREEN_GONE_LINE). The client had four step statuses
 * and read every one that was not `success` as `error`, so the reopened
 * conversation said "3 steps completed · 1 failed" beside the line that it
 * never ran (acceptance G, screen 03), and the Summary drew it as a failure.
 * A step that did not run is neither completed nor failed.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AnaActivity } from '../AnaActivity';
import { hydrateToolTrace } from '../../components/ana/useAnaChat';
import { summaryRows, type StepRow } from '../turnSummaryRows';
import { SCREEN_GONE_LINE } from '@shared/ana/stop-lines';
import type { TimelineEvent } from '@shared/ana/turn-timeline';

afterEach(cleanup);

/* The persisted trace of acceptance G's turn: a move while the page was open,
   the screen action refused after it closed, then a read. */
const TRACE = [
  { tool: 'navigate_to', label: 'Opened the Vault', status: 'success' },
  { tool: 'act_on_screen', label: 'Filling in the form', status: 'not_run', message: SCREEN_GONE_LINE },
  { tool: 'list_project_documents', label: 'Listed the project documents', status: 'success' },
];

describe('D-7: a screen step refused after the page closed did not run; it did not fail', () => {
  it('a reopened conversation reads it as not run, with its line', () => {
    const calls = hydrateToolTrace(TRACE);
    expect(calls.map((c) => c.status)).toEqual(['success', 'not_run', 'success']);
    expect(calls[1].message).toBe(SCREEN_GONE_LINE);
  });

  it('the folded line says it did not run, never "failed", and its row says why', () => {
    render(<AnaActivity streaming={false} toolCalls={hydrateToolTrace(TRACE)} />);
    const toggle = screen.getByRole('button', { expanded: false });
    expect(toggle.textContent).toContain('2 steps completed · 1 did not run');
    expect(toggle.textContent).not.toMatch(/failed/);
    expect(screen.getByText(SCREEN_GONE_LINE)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/did not complete|not_run/);
  });

  it("the Summary's step row is not run, with the line", () => {
    const AT = '2026-10-22T17:08:20.000Z';
    const step = (seq: number, over: Partial<TimelineEvent>): TimelineEvent =>
      ({ kind: 'step', seq, at: AT, round: 2, phase: 'announced', step: 's2', task: null, source: 'project', label: 'Filling in the form', preview: null, ...over }) as TimelineEvent;
    const rows = summaryRows(
      [step(1, {}), step(2, { phase: 'finished', status: 'not_run', message: SCREEN_GONE_LINE } as Partial<TimelineEvent>)],
      [],
      { live: false },
    );
    const row = rows.find((r): r is StepRow => r.kind === 'step');
    expect(row).toMatchObject({ status: 'not_run', message: SCREEN_GONE_LINE });
  });
});
