// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (INFORMATION_ARCHITECTURE.md, row
 * `device-validation`): the Validation center says only what it reads.
 *
 * What the screen reads is GET /api/submission-ops/blockers (the open rows of
 * c2c_blockers for the organisation) and the project list. It runs no eSTAR
 * required-field rule and no claim-evidence check. Three things it said anyway:
 *   - a header promising "eSTAR required-field rules and claim-evidence checks,
 *     every program, one dashboard";
 *   - a triage button whose prompt hard-coded "the 3 blockers", whatever the
 *     list held;
 *   - a rules table that, holding no rows, rendered a header and blank space.
 * A device filing's readiness is assessed on the eSTAR filing readiness panel
 * in its pathway workspace, so the empty list says where that is. A failed
 * read is never shown as an empty list.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

import { ValidationSurface } from '../Workbench';

const BLOCKERS = [
  { id: 1, blockerId: 'blk_a', projectId: 3, severity: 'high', status: 'open', blockerType: 'regulatory_correspondence_issue', description: 'Correspondence raised biocompatibility', createdAt: '2026-10-20T00:00:00Z' },
  { id: 2, blockerId: 'blk_b', projectId: 3, severity: 'medium', status: 'open', blockerType: 'regulatory_correspondence_issue', description: 'Correspondence raised labeling', createdAt: '2026-10-21T00:00:00Z' },
];

/** `blockers: null` makes the blockers read fail, and `'pending'` holds it
 *  open; `programs: null` makes the project read fail. */
function serve(blockers: unknown[] | null | 'pending', programs: unknown[] | null = []) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const fail = { ok: false, status: 503, text: async () => 'upstream unavailable' } as unknown as Response;
    if (url.includes('/api/submission-ops/blockers')) {
      if (blockers === 'pending') return new Promise<Response>(() => {});
      return blockers === null
        ? fail
        : ({ ok: true, status: 200, json: async () => ({ data: blockers }) } as unknown as Response);
    }
    if (url.includes('/api/regulatory-programs')) {
      return programs === null
        ? fail
        : ({ ok: true, status: 200, json: async () => ({ data: programs }) } as unknown as Response);
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response;
  }));
}

/** One summary tile, found by its label. */
function tile(container: HTMLElement, label: RegExp) {
  const card = Array.from(container.querySelectorAll('.metric-card')).find((c) =>
    label.test(c.querySelector('.metric-label')?.textContent ?? ''),
  );
  if (!card) throw new Error(`no tile labelled ${label}`);
  return {
    tone: card.getAttribute('data-tone') ?? '',
    metric: card.querySelector('.metric-val')?.textContent ?? '',
    meta: card.querySelector('.metric-meta')?.textContent ?? '',
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('device-validation says only what it reads (slice 0)', () => {
  it('its header claims no eSTAR rule and no program it does not read', async () => {
    serve([]);
    const { container } = render(<ValidationSurface onAskAna={() => {}} />);
    await screen.findByTestId('workbench-no-blockers');
    const sub = container.querySelector('.page-header .page-sub')?.textContent ?? '';
    expect(sub).not.toMatch(/eSTAR required-field rules/i);
    expect(sub).not.toMatch(/claim-evidence checks/i);
    expect(sub).not.toMatch(/every program/i);
    expect(sub).toMatch(/open blockers recorded against your organization’s projects/i);
  });

  it('the triage prompt counts the blockers the list holds, never "the 3 blockers"', async () => {
    serve(BLOCKERS);
    const asked: string[] = [];
    render(<ValidationSurface onAskAna={(t) => { asked.push(t); }} />);
    await waitFor(() => expect(screen.getByText('Correspondence raised labeling')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /to triage/i }));
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(/the 3 blockers/);
    expect(asked[0]).toMatch(/\b2 open blockers\b/);
  });

  it('an empty list says no blocker is recorded and where a filing’s readiness is', async () => {
    serve([]);
    render(<ValidationSurface onAskAna={() => {}} />);
    const empty = await screen.findByTestId('workbench-no-blockers');
    expect(empty.textContent).toMatch(/No open blockers recorded/);
    expect(empty.textContent).toMatch(/eSTAR filing readiness panel/);
    expect(empty.textContent).not.toMatch(/program/i);
  });

  it('a FAILED blockers read is a failure, never the empty list', async () => {
    serve(null);
    render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workbench-no-validation-programs-error')).toBeTruthy());
    expect(screen.queryByTestId('workbench-no-blockers')).toBeNull();
    expect(screen.queryByText(/No open blockers recorded/)).toBeNull();
  });

  /* Audit [10]: the singular, and the prompt before the read has answered. */
  it('one blocker is "1 open blocker", not "1 open blockers"', async () => {
    serve([BLOCKERS[0]]);
    const asked: string[] = [];
    render(<ValidationSurface onAskAna={(t) => { asked.push(t); }} />);
    await waitFor(() => expect(screen.getByText('Correspondence raised biocompatibility')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /to triage/i }));
    expect(asked[0]).toMatch(/\b1 open blocker recorded\b/);
    expect(asked[0]).not.toMatch(/blockers/);
  });

  it('before the read answers, the prompt states no count', async () => {
    serve('pending');
    const asked: string[] = [];
    render(<ValidationSurface onAskAna={(t) => { asked.push(t); }} />);
    /* Lets the project read settle; the blockers read stays open. */
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /to triage/i }));
    expect(asked).toEqual(['Summarize the open blockers recorded across my projects']);
    expect(asked[0]).not.toMatch(/\d/);
  });

  /* Audit [3]: zero counts are "none recorded", not a clean result, and a
     stored progress number is not an eSTAR assessment. */
  it('zero counts read "None recorded" in a neutral tone, and no projects show no average', async () => {
    serve([], []);
    const { container } = render(<ValidationSurface onAskAna={() => {}} />);
    await screen.findByTestId('workbench-no-blockers');
    const errs = tile(container, /Open errors/);
    const warns = tile(container, /Open warnings/);
    for (const t of [errs, warns]) {
      expect(t.meta).toBe('None recorded');
      expect(t.tone).not.toBe('ok');
    }
    expect(container.textContent).not.toMatch(/No critical issues|No warnings/);
    const avg = tile(container, /^Avg/);
    expect(avg.metric).toBe('Not recorded');
    expect(avg.metric).not.toMatch(/%/);
    expect(avg.meta).toMatch(/not an eSTAR assessment/);
    expect(avg.tone).not.toBe('err');
  });

  /* Audit [4]: a low-severity open blocker is never a "Pass". */
  it('an open blocker of low severity renders as a warning, never "Pass"', async () => {
    serve([{ ...BLOCKERS[0], id: 3, blockerId: 'blk_c', severity: 'low', description: 'Low severity correspondence item' }]);
    const { container } = render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Low severity correspondence item')).toBeTruthy());
    const row = screen.getByText('Low severity correspondence item').closest('.ctable-row') as HTMLElement;
    expect(row.textContent).not.toMatch(/Pass/);
    expect(row.querySelector('.sev-pill')?.textContent).toBe('Warning');
    expect(tile(container, /Open warnings/).metric).toBe('1');
  });

  /* Audit [5]: a failed read is a failure on every panel it feeds. */
  it('a FAILED project read is a failure, never "no projects to validate"', async () => {
    serve([], null);
    render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workbench-no-validation-programs-error')).toBeTruthy());
    expect(screen.queryByTestId('workbench-no-validation-programs')).toBeNull();
  });

  it('a FAILED blockers read says so in the Rules section', async () => {
    serve(null);
    render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workbench-blockers-error')).toBeTruthy());
    expect(screen.getByTestId('workbench-blockers-error').textContent).toMatch(/Could not load the open blockers/);
  });

  it('a FAILED blockers read offers no report to export (a header-only CSV reads as clean)', async () => {
    serve(null);
    render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workbench-no-validation-programs-error')).toBeTruthy());
    expect((screen.getByRole('button', { name: /export report/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a read that answered can be exported', async () => {
    serve(BLOCKERS);
    render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Correspondence raised labeling')).toBeTruthy());
    expect((screen.getByRole('button', { name: /export report/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

/* As GET /api/regulatory-programs returns a row, with no progress recorded. */
const PROGRAM = {
  id: '11111111-2222-4333-8444-555555555555', name: 'Infusion pump', code: 'IP-1', description: null,
  programType: '510K', productType: 'device', deviceClass: 'II', regulatoryPath: null, primaryAgency: 'FDA',
  productName: 'Infusion pump', status: 'active', phase: null, priority: null, targetSubmissionDate: null,
  progressPercent: null, completedMilestones: null, totalMilestones: null, leadUserId: null, leadUserName: null,
  teamMembers: null, metadata: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};

describe('device-validation offers no control that can only hide every row (audit 2)', () => {
  /* Audit 2 [0]: a c2c_blockers row carries a projectId and no program code,
     so a card that filtered the rules by program left none, under a bare
     table header. */
  it('a project card is not a filter, and every blocker stays listed', async () => {
    serve(BLOCKERS, [PROGRAM]);
    const { container } = render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Correspondence raised labeling')).toBeTruthy());
    const card = container.querySelector('.val-prog-card') as HTMLElement;
    expect(card).toBeTruthy();
    fireEvent.click(card);
    expect(container.querySelectorAll('.ctable-row')).toHaveLength(2);
    expect(container.querySelector('.chip-filter')).toBeNull();
    expect(card.tagName).not.toBe('BUTTON');
  });

  it('a blocker row names the project it is recorded against, not "— · —"', async () => {
    serve(BLOCKERS);
    const { container } = render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Correspondence raised labeling')).toBeTruthy());
    for (const row of Array.from(container.querySelectorAll('.ctable-row'))) {
      expect(row.textContent ?? '').toMatch(/Project #3/);
      expect(row.textContent ?? '').not.toMatch(/—\s*·\s*—/);
    }
  });

  it('a blocker with no description shows its title, not "(no description)"', async () => {
    serve([{ ...BLOCKERS[0], description: undefined, title: 'Biocompatibility test report missing' }]);
    render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Biocompatibility test report missing')).toBeTruthy());
    expect(screen.queryByText('(no description)')).toBeNull();
  });

  /* Audit 2 [1]: the cards draw each project's stored progressPercent. They
     are not "Readiness", and they never show error, warning or pass counts. */
  it('the cards are recorded progress, and promise no error, warning or pass counts', async () => {
    serve(BLOCKERS, [PROGRAM]);
    const { container } = render(<ValidationSurface onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelector('.val-prog-card')).toBeTruthy());
    expect(container.textContent).not.toMatch(/Readiness by program/);
    expect(container.textContent).not.toMatch(/errors · warnings · pass/);
    expect(container.textContent).toMatch(/Recorded progress by project/);
    expect(container.querySelector('.val-prog-card')?.textContent ?? '').toMatch(/Recorded progress/);
  });

  it('the empty project panel promises no counts', async () => {
    serve([], []);
    render(<ValidationSurface onAskAna={() => {}} />);
    const empty = await screen.findByTestId('workbench-no-validation-programs');
    expect(empty.textContent ?? '').not.toMatch(/error, warning and pass counts/);
    expect(empty.textContent ?? '').toMatch(/recorded progress/);
  });
});


it('missing project readiness remains Not recorded in the validation consumer', async () => {
  serve([], [PROGRAM]);
  const { container } = render(<ValidationSurface onAskAna={() => {}} />);
  await waitFor(() => expect(container.querySelector('.val-prog-card')).toBeTruthy());
  expect(container.querySelector('.val-prog-card')?.textContent).toContain('Not recorded');
  expect(container.querySelector('.val-bar')).toBeNull();
  expect(tile(container, /Avg recorded progress/).metric).toBe('Not recorded');
});


it('retains an actual recorded progress value separately from assessed readiness', async () => {
  serve([], [{ ...PROGRAM, progressPercent: 40 }]);
  const { container } = render(<ValidationSurface onAskAna={() => {}} />);
  await waitFor(() => expect(container.querySelector('.val-prog-card')).toBeTruthy());
  expect(container.querySelector('.val-prog-card')?.textContent).toContain('40%');
  expect(tile(container, /Avg recorded progress/).metric).toBe('40%');
});
