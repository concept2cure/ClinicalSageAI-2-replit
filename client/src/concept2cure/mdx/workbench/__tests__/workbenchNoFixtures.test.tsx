// @vitest-environment jsdom
/**
 * The four Workbench panels — Tasks, Validation, Submissions, Templates — each
 * used to hold a set of example rows reached through sample mode.
 *
 * ── What was removed ─────────────────────────────────────────────────────────
 * `SUBMISSIONS` had to go regardless of gating. Its rows carried
 * `cover: 'signed'`, `esig: true`, a log line reading "Cover letter e-signed
 * (AUD-9104)" — an invented Part 11 signature id — and a "CLEARED · K254481"
 * decision against a clearance-shaped number, and they drove the transmission
 * gate the panel renders. The same fabrication was removed twice before, from
 * the v2 Submission Center and from the pathway audit and approvals panes.
 *
 * The other six row sets (TASKS, TASKS_METRICS, VALIDATION_SUMMARY,
 * VALIDATION_PROGRAMS, VALIDATION_RULES, TEMPLATES) were example content, and
 * gating plus a banner is the right treatment for that. Workbench rendered a
 * banner on the submissions panel ALONE, so tasks, validation findings and
 * templates appeared unmarked — indistinguishable from the tenant's own work.
 *
 * ── What this test pins ──────────────────────────────────────────────────────
 * Every panel reads live or reads nothing, and "nothing" is never allowed to
 * absorb a failure. Case 1 is the one that matters: a panel that renders
 * "No tasks assigned" over a request that never landed is telling a regulatory
 * team their queue is clear.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

import { TasksSurface, TemplatesSurface } from '../Workbench';

const noop = () => {};

/** Every endpoint answers `body`; a null body means the request fails. */
function serve(body: unknown | null) {
  return vi.fn(async () =>
    body === null
      ? ({ ok: false, status: 503, text: async () => 'upstream unavailable' } as unknown as Response)
      : ({ ok: true, status: 200, json: async () => body } as unknown as Response),
  );
}

describe('Workbench panels read live, and say so when they cannot', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', serve({ data: [] }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports a FAILED task read as a failure, never as "no tasks assigned"', async () => {
    vi.stubGlobal('fetch', serve(null));
    render(<TasksSurface onAskAna={noop} />);

    await waitFor(() => {
      expect(screen.getByTestId('workbench-no-tasks-error')).toBeTruthy();
    });
    expect(screen.queryByTestId('workbench-no-tasks')).toBeNull();
    expect(screen.queryByText('No tasks assigned')).toBeNull();
  });

  it('a genuinely empty task read says the queue is empty, and offers the action that fills it', async () => {
    render(<TasksSurface onAskAna={noop} />);

    await waitFor(() => {
      expect(screen.getByTestId('workbench-no-tasks')).toBeTruthy();
    });
    expect(screen.getByText('No tasks assigned')).toBeTruthy();
    /* The CTA is inside the empty state, and it is the SAME handler as the
       header button — hence two matches for the label, which is the point:
       one definition, so the two controls cannot come to name it differently. */
    const empty = screen.getByTestId('workbench-no-tasks');
    expect(empty.querySelector('.c2c-empty-action')?.textContent).toBe('New task');
    expect(screen.getAllByText('New task')).toHaveLength(2);
    expect(screen.queryByTestId('workbench-no-tasks-error')).toBeNull();
  });

  it('reports a FAILED template read as a failure, never as an empty library', async () => {
    vi.stubGlobal('fetch', serve(null));
    render(<TemplatesSurface onAskAna={noop} />);

    await waitFor(() => {
      expect(screen.getByTestId('workbench-no-templates-error')).toBeTruthy();
    });
    expect(screen.queryByText('No templates yet')).toBeNull();
  });

  it('renders no row a live read did not return — the example sets are gone', async () => {
    render(<TasksSurface onAskAna={noop} />);
    await waitFor(() => expect(screen.getByTestId('workbench-no-tasks')).toBeTruthy());

    /* Titles from the deleted TASKS set. Sample mode is force-disabled in
       production, so these were only ever reachable in dev — which is where a
       screenshot for a customer gets taken. */
    for (const gone of ['Biocompat -11', 'Close CE-01', 'Sign cover letter']) {
      expect(screen.queryByText(new RegExp(gone, 'i'))).toBeNull();
    }
  });
});

describe('the workbench data module carries no fabricated record', () => {
  it('holds no signature, clearance number or audit id', async () => {
    const mod = await import('../../data/workbench');
    const exported = Object.keys(mod);

    for (const gone of [
      'TASKS',
      'TASKS_METRICS',
      'VALIDATION_SUMMARY',
      'VALIDATION_PROGRAMS',
      'VALIDATION_RULES',
      'SUBMISSIONS',
      'TEMPLATES',
    ]) {
      expect(exported).not.toContain(gone);
    }

    /* The two that stay: a Kanban's columns and the stages of a regulatory
       submission are real structure, not an assessment of anybody's work. */
    expect(exported).toContain('TASKS_COLUMNS');
    expect(exported).toContain('SUBMISSION_PIPELINE');

    /* Nothing reachable from the module serialises a signature or a decision. */
    const serialised = JSON.stringify(
      Object.fromEntries(exported.map((k) => [k, (mod as Record<string, unknown>)[k]])),
    );
    for (const marker of ['AUD-9104', 'K254481', 'e-signed', 'CLEARED']) {
      expect(serialised).not.toContain(marker);
    }
  });
});
