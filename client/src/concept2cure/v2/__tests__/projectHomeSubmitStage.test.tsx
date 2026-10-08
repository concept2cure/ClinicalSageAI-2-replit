// @vitest-environment jsdom
/**
 * The project page holds its readiness and its submissions
 * (ONE_ANA_ONE_CANVAS.md slice 24).
 *
 * The Submit stage of Project home said "Submissions open in the Submission
 * Center" and showed nothing, so a regulatory lead on the project had to leave
 * it to learn whether its sequence could be sent and what had been filed.
 *
 * It now shows, above the project's submissions:
 *   - the dispatch gate's verdict, from the same discovery and the same
 *     endpoint as the readiness screen (programSequence.ts), stated exactly as
 *     the server stated it, with "Open readiness" to the readiness screen;
 *   - the honest not-ready states in plain words;
 * and the project's submissions from GET /api/submissions?programId=<uuid>,
 * with loading, a failure with a retry, and an honest empty as three states.
 *
 * The two panels sit side by side, so the review of this slice held them to
 * not contradicting each other or the readiness screen:
 *   - the gate reads only the submission of the project's own type, so a
 *     project whose submissions are all of other types (an MAA in an IND
 *     project, anything in a CER project) is never told it has "no
 *     submission" while the list below shows one;
 *   - a cleared verdict carries the server's "not assessed" sentence, as the
 *     readiness screen does, never a bare all-clear;
 *   - no submission is matched to the project by name (P-20 follow-up): one
 *     with no project recorded is not gated here, and the readiness panel
 *     says how many such submissions there are and how one is anchored.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '6e0f3a2d-1b4c-4d5e-8f70-9a1b2c3d4e5f';
const SCOPED = `/api/submissions?programId=${PID}`;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = () => Object.assign(new Error('Server error'), { status: 500 });

const PROGRAM = { id: PID, name: 'ONC-221', code: 'ONC-221', product_name: 'Vorelinib', program_type: 'IND', status: 'active' };
const SUB = {
  id: 61, title: 'ONC-221 IND', productName: 'Vorelinib', applicationType: 'ind', clientType: 'biotech',
  primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PID,
};
/* The server's verdict, worded and counted by the server. */
const ASSESSMENT = {
  sequenceId: 905,
  region: 'fda',
  sequenceStatus: 'assembling',
  validationErrors: 2,
  unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1,
  shadowReviewMissing: false,
  externalValidation: { configured: false, ran: false, errorCount: 0, cleared: true, blockers: [] },
  readiness: { errors: 2, warnings: 5, infos: 1, findings: [] },
  leafCount: 14,
  gate: { cleared: false, blockers: ['2 open error-severity validation findings.', 'No §11.70 release signature on this sequence.'] },
};

type Opts = {
  subs?: unknown[]; failSubs?: number; sequences?: unknown[]; assessment?: unknown;
  /** The organization's list, which discovery reads; defaults to `subs`. */
  orgSubs?: unknown[];
  program?: Record<string, unknown>;
};
function serve(opts: Opts = {}) {
  let subsFailures = opts.failSubs ?? 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PID}`) return ok(opts.program ?? PROGRAM);
    if (url === SCOPED) {
      if (subsFailures > 0) { subsFailures -= 1; throw fail(); }
      return ok({ data: opts.subs ?? [SUB], meta: { notOffered: 4 } });
    }
    if (url === '/api/submissions') return ok(opts.orgSubs ?? opts.subs ?? [SUB]);
    if (url === `/api/submissions/${SUB.id}/sequences`) return ok({ data: opts.sequences ?? [{ id: 905, sequenceNumber: '0001' }] });
    if (url === '/api/submissions/sequences/905/dispatch-readiness') return ok({ data: opts.assessment ?? ASSESSMENT });
    return ok({});
  });
}

const onNav = vi.fn();
function openSubmit() {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
  return waitFor(() => {
    const tab = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Submit'));
    expect(tab).toBeTruthy();
    fireEvent.click(tab as Element);
  });
}
const urls = () => apiRequest.mock.calls.map((c) => String(c[1]));

beforeEach(() => {
  onNav.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Project home — the Submit stage lists the project’s submissions', () => {
  it('lists the project’s submission from the project-scoped read', async () => {
    serve();
    await openSubmit();
    const row = await screen.findByTestId('pj-submission');
    expect(row.textContent).toContain('ONC-221 IND');
    expect(row.textContent).toContain('IND');
    expect(row.textContent).toContain('Active');
    expect(row.textContent).toContain('FDA (US)');
    expect(urls()).toContain(SCOPED);
    expect(screen.queryByText('Submissions open in the Submission Center')).toBeNull();
  });

  it('an empty project says so, which is not the same as a failure', async () => {
    serve({ subs: [] });
    await openSubmit();
    expect(await screen.findByText('No submissions for this project yet')).toBeTruthy();
    expect(screen.queryByText("Couldn't load this project's submissions")).toBeNull();
  });

  it('a failed read is a failure with a retry, and the retry reads again', async () => {
    serve({ failSubs: 1 });
    await openSubmit();
    expect(await screen.findByText("Couldn't load this project's submissions")).toBeTruthy();
    expect(screen.queryByText('No submissions for this project yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('pj-submission')).toBeTruthy();
  });

  it('keeps "Open Submission Center", which opens on this project', async () => {
    serve();
    await openSubmit();
    fireEvent.click(await screen.findByRole('button', { name: /Open Submission Center/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });
});

describe('Project home — the Submit stage shows the server’s dispatch verdict', () => {
  it('shows the server’s verdict, its blockers and its counts, from the readiness endpoint', async () => {
    serve();
    await openSubmit();
    const verdict = await screen.findByTestId('pj-readiness-verdict');
    expect(verdict.textContent).toContain('Dispatch blocked');
    expect(verdict.textContent).toContain('2 open error-severity validation findings.');
    expect(verdict.textContent).toContain('No §11.70 release signature on this sequence.');
    expect(verdict.textContent).toContain('2 errors');
    expect(verdict.textContent).toContain('5 warnings');
    expect(verdict.textContent).toContain('1 info');
    expect(verdict.textContent).toContain('Sequence 0001');
    expect(verdict.textContent).toContain('14 leaves');
    expect(urls()).toContain('/api/submissions/sequences/905/dispatch-readiness');
    // Above the submissions, where a regulatory lead looks first.
    const sections = Array.from(document.querySelectorAll('.pj-sec h2')).map((h) => h.textContent);
    expect(sections.indexOf('Dispatch readiness')).toBeLessThan(sections.indexOf('Submissions'));
    fireEvent.click(screen.getByRole('button', { name: /Open readiness/ }));
    expect(onNav).toHaveBeenCalledWith('dispatch-readiness');
  });

  it('a cleared verdict is the server’s, and says so in words', async () => {
    serve({ assessment: { ...ASSESSMENT, readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, gate: { cleared: true, blockers: [] } } });
    await openSubmit();
    const verdict = await screen.findByTestId('pj-readiness-verdict');
    expect(verdict.textContent).toContain('Cleared to dispatch');
    expect(verdict.textContent).not.toContain('What must close');
  });

  it('a response with no gate is unanswered, never cleared', async () => {
    const noGate: Record<string, unknown> = { ...ASSESSMENT };
    delete noGate.gate;
    serve({ assessment: noGate });
    await openSubmit();
    const verdict = await screen.findByTestId('pj-readiness-verdict');
    expect(verdict.textContent).toContain('No verdict from the server');
    expect(verdict.textContent).toContain('The gate is unanswered, which is not the same as cleared.');
    expect(verdict.textContent).not.toContain('Cleared to dispatch');
  });

  it('no submission and no sequence are said in plain words', async () => {
    serve({ subs: [] });
    await openSubmit();
    const panel = await screen.findByTestId('pj-readiness');
    await waitFor(() => expect(panel.textContent).toContain('No submission for this project yet'));
    expect(panel.textContent).toContain("The dispatch gate reads this project's IND submission, and none is recorded");
    cleanup();
    serve({ sequences: [] });
    await openSubmit();
    const again = await screen.findByTestId('pj-readiness');
    await waitFor(() => expect(again.textContent).toContain('No sequence to gate yet'));
    expect(again.textContent).toContain('Its submission "ONC-221 IND" has no eCTD sequence yet.');
  });
});

/* The review of slice 24 rendered the page with an IND project whose only
   submission is an MAA: the readiness panel said "No submission for this
   project yet" directly above a list showing it. */
const MAA = {
  id: 62, title: 'ONC-221 EU MAA', productName: 'Vorelinib', applicationType: 'maa', clientType: 'biotech',
  primaryRegion: 'eu', status: 'active', lifecycleStage: 'original', programId: PID,
};
const sectionText = (heading: string) =>
  Array.from(document.querySelectorAll('.pj-sec')).find((sec) => sec.querySelector('h2')?.textContent === heading)?.textContent ?? '';

describe('Project home — the two Submit panels never contradict each other', () => {
  it('an IND project whose only submission is an MAA is not told it has no submission', async () => {
    serve({ subs: [MAA] });
    await openSubmit();
    expect((await screen.findByTestId('pj-submission')).textContent).toContain('ONC-221 EU MAA');
    const panel = await screen.findByTestId('pj-readiness');
    await waitFor(() => expect(panel.textContent).toContain('No IND submission for this project yet'));
    expect(panel.textContent).not.toMatch(/No submission for this project/);
    // It names the submission it does not gate, by type and title.
    expect(panel.textContent).toContain('MAA "ONC-221 EU MAA"');
    expect(urls().some((u) => u.endsWith('/dispatch-readiness'))).toBe(false);
  });

  it('a CER project (no application type is CER) names its submissions instead of denying them', async () => {
    serve({ subs: [{ ...MAA, id: 63, title: 'Vorelinib CER', applicationType: 'cta' }], program: { ...PROGRAM, program_type: 'CER' } });
    await openSubmit();
    const panel = await screen.findByTestId('pj-readiness');
    await waitFor(() => expect(panel.textContent).toContain('No CER submission for this project yet'));
    expect(panel.textContent).toContain('CTA "Vorelinib CER"');
    expect(panel.textContent).not.toMatch(/No submission for this project/);
  });

  /* P-20 follow-up (docs/LAUNCH_DEFINITION_OF_DONE.md): no screen matches a
     program to an application by name. The gate used to read a same-named IND
     with no project recorded and print its verdict here. */
  it('a submission with no project recorded is not gated by name: no verdict, and the panels agree', async () => {
    // The scoped list (the server's anchor) is empty; the organization holds
    // a same-named IND with no project recorded.
    serve({ subs: [], orgSubs: [{ ...SUB, programId: null }] });
    await openSubmit();
    await waitFor(() => expect(sectionText('Submissions')).toContain('No submissions for this project yet'));
    expect(screen.queryByTestId('pj-readiness-verdict')).toBeNull();
    expect(urls()).not.toContain('/api/submissions/sequences/905/dispatch-readiness');
    expect(document.body.textContent).not.toMatch(/matched by name|matched to this one by name/);
    expect(document.body.textContent).toMatch(/1 IND submission in this organisation has no program recorded/);
  });
});

/* The review rendered a cleared assessment whose external gate the server
   marks "not assessed" (no agency-grade validator configured, the common
   installation): the project page said only "Cleared to dispatch", while the
   readiness screen said the package had not been checked against it. */
const NOT_ASSESSED =
  'No agency-grade validator is configured on this installation, so the package has not been checked against it.';
const CLEARED = {
  ...ASSESSMENT,
  validationErrors: 0,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] },
  gate: { cleared: true, blockers: [] },
};

describe('Project home — a cleared verdict carries what the server did not assess', () => {
  it('states each gate the server cleared without assessing, in the server’s words', async () => {
    serve({
      assessment: {
        ...CLEARED,
        gates: [
          { key: 'structural', rule: null, cleared: true, blockers: [] },
          {
            key: 'external', cleared: true, blockers: [], notAssessed: NOT_ASSESSED,
            rule: { id: 'EXT-VALIDATOR', title: 'Agency validator report', category: 'external', regions: ['fda'], severity: 'high', source: 'FDA', enforcement: 'agency', enforcementStatement: 'Requires the agency validator.' },
          },
        ],
      },
    });
    await openSubmit();
    const verdict = await screen.findByTestId('pj-readiness-verdict');
    expect(verdict.textContent).toContain('Cleared to dispatch');
    const lines = screen.getAllByTestId('pj-readiness-not-assessed');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toContain('Agency validator report');
    expect(lines[0].textContent).toContain('not assessed');
    expect(lines[0].textContent).toContain(NOT_ASSESSED);
  });

  it('with no gate breakdown, says the external validator did not run', async () => {
    serve({ assessment: CLEARED });
    await openSubmit();
    const verdict = await screen.findByTestId('pj-readiness-verdict');
    expect(verdict.textContent).toContain('Cleared to dispatch');
    expect(verdict.textContent).toContain('External validator not run');
  });

  it('a cleared verdict whose validator ran says nothing it did not assess', async () => {
    serve({ assessment: { ...CLEARED, externalValidation: { configured: true, ran: true, errorCount: 0, cleared: true, blockers: [] } } });
    await openSubmit();
    const verdict = await screen.findByTestId('pj-readiness-verdict');
    expect(verdict.textContent).toContain('Cleared to dispatch');
    expect(screen.queryByTestId('pj-readiness-not-assessed')).toBeNull();
  });
});
