// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (INFORMATION_ARCHITECTURE.md, row
 * `device-submission`): a package shows no receiving authority its record does
 * not carry.
 *
 * A c2c_submission_packages row carries a family, a title, a status and a
 * target date. It names no receiving authority and no transmission gateway.
 * The adapter derived one from the family anyway: "NB · TÜV" for an EU family
 * (one named notified body, chosen for every EU package) and "FDA · ESG" for
 * every other (a 510(k) eSTAR does not even travel by ESG). Both rendered on
 * the row, as the detail's "Target ·" line, and inside the Transmit and View
 * receipt prompts sent to AnA. They are off all four.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, renderHook, act, within } from '@testing-library/react';

import { SubmissionsSurface } from '../Workbench';
import { useSubmissions } from '../../hooks/useSubmissions';

const pkg = (over: Record<string, unknown>) => ({
  id: 1, packageId: 'pkg-a', orgId: 7, projectId: 3, packageFamily: '510k',
  title: 'Infusion pump 510(k)', description: null, targetDate: null, status: 'active',
  metadata: { esig: true }, createdById: 12, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});

const PACKAGES = [
  pkg({}),
  pkg({ id: 2, packageId: 'pkg-b', packageFamily: 'eu_mdr', title: 'Infusion pump EU MDR', status: 'completed', metadata: { esig: true, transmitAt: '2026-10-10' } }),
];

type Answer<T> = T | 'fail' | 'pending';
const failed = { ok: false, status: 503, json: async () => ({}), text: async () => 'upstream unavailable' } as unknown as Response;

/** Each read answers its body, or 'fail' (503) / 'pending' (never settles).
 *  `readiness`: the gate the readiness read answers; `milestones`: its rows. */
function serve(
  packages: Answer<unknown[]> = PACKAGES,
  readiness: Answer<Record<string, unknown>> = { errs: 0, warns: 0, ok: 4 },
  milestones: Answer<unknown[]> = [],
) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/packages\/[^/]+\/readiness/.test(url)) {
      if (readiness === 'pending') return new Promise<Response>(() => {});
      if (readiness === 'fail') return failed;
      return { ok: true, status: 200, json: async () => readiness } as unknown as Response;
    }
    if (/\/packages\/[^/]+\/milestones/.test(url)) {
      if (milestones === 'pending') return new Promise<Response>(() => {});
      if (milestones === 'fail') return failed;
      return { ok: true, status: 200, json: async () => ({ data: milestones }) } as unknown as Response;
    }
    if (url.includes('/api/submission-ops/packages')) {
      if (packages === 'pending') return new Promise<Response>(() => {});
      if (packages === 'fail') return failed;
      return { ok: true, status: 200, json: async () => ({ data: packages }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as unknown as Response;
  }));
}

/** The detail's gate items, by their label. */
function gateItems(container: HTMLElement) {
  return Object.fromEntries(
    Array.from(container.querySelectorAll('.sub-gate-item')).map((el) => [
      el.querySelector('.sub-gate-k')?.textContent ?? '',
      { ok: el.getAttribute('data-ok'), value: el.querySelector('.sub-gate-v')?.textContent ?? '' },
    ]),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* Audit [1]: widened from the two exact old strings. The record names no
   receiving authority, and no notified-body transmitter exists. */
const INVENTED = /\bESG\b|\bNB\b|TÜV|notified/i;

describe('device-submission states no target the record does not carry (slice 0)', () => {
  it('no row and no detail names an invented receiving authority', async () => {
    serve();
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Infusion pump EU MDR')).toBeTruthy());
    const rows = Array.from(container.querySelectorAll('.sub-row')).map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).not.toMatch(INVENTED);
    /* The first row is selected by an effect after the list renders. */
    await waitFor(() => expect(container.querySelector('.sub-detail-title')?.textContent).toBe('Infusion pump 510(k)'));
    const detail = container.querySelector('.sub-detail')?.textContent ?? '';
    expect(detail).not.toMatch(INVENTED);
    expect(container.querySelector('.sub-detail-target')).toBeNull();
  });

  it('the Transmit and View receipt prompts name no invented authority', async () => {
    serve();
    const asked: string[] = [];
    render(<SubmissionsSurface onAskAna={(t) => { asked.push(t); }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /transmit/i })).toBeTruthy());
    await waitFor(() => expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /transmit/i }));
    fireEvent.click(screen.getByText('Infusion pump EU MDR'));
    await waitFor(() => expect(screen.getByRole('button', { name: /view receipt/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /view receipt/i }));
    expect(asked).toHaveLength(2);
    for (const prompt of asked) expect(prompt).not.toMatch(INVENTED);
  });

  it('the header, the pipeline and the New submission prompt name no destination', async () => {
    serve();
    const asked: string[] = [];
    const { container } = render(<SubmissionsSurface onAskAna={(t) => { asked.push(t); }} />);
    await waitFor(() => expect(screen.getByText('Infusion pump EU MDR')).toBeTruthy());
    expect(container.querySelector('.page-header')?.textContent ?? '').not.toMatch(INVENTED);
    expect(container.querySelector('.sub-pipeline')?.textContent ?? '').not.toMatch(INVENTED);
    fireEvent.click(screen.getByRole('button', { name: /new submission/i }));
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(INVENTED);
    expect(asked[0]).not.toMatch(/\bprogram\b/i);
  });

  it('the empty list names no destination', async () => {
    serve([]);
    render(<SubmissionsSurface onAskAna={() => {}} />);
    const empty = await screen.findByTestId('workbench-no-submissions');
    expect(empty.textContent ?? '').not.toMatch(INVENTED);
  });

  /* Audit [2]: a completed package is not necessarily a transmitted one. */
  it('View receipt states no transmission date the record does not carry', async () => {
    serve([pkg({ status: 'completed', title: 'Completed, no transmit date', metadata: { esig: true } })]);
    const asked: string[] = [];
    render(<SubmissionsSurface onAskAna={(t) => { asked.push(t); }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /view receipt/i })).toBeTruthy());
    await waitFor(() => expect((screen.getByRole('button', { name: /view receipt/i }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /view receipt/i }));
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(/null/);
    expect(asked[0]).not.toMatch(/transmitted/);
  });

  /* Audit [6]: the gate is the readiness read, or it says it is not read. */
  it('a FAILED readiness read is not a clean gate, and Transmit stays off', async () => {
    serve(PACKAGES, 'fail');
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Validation?.value).toBe('Could not read the readiness gate'));
    expect(gateItems(container).Validation.ok).toBe('false');
    expect(container.querySelector('.sub-detail')?.textContent ?? '').not.toMatch(/0 err · 0 warn/);
    expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a readiness read in flight is "Not read yet", and Transmit stays off', async () => {
    serve(PACKAGES, 'pending');
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelector('.sub-detail-title')?.textContent).toBe('Infusion pump 510(k)'));
    await waitFor(() => expect(gateItems(container).Validation?.value).toBe('Not read yet'));
    expect(gateItems(container).Validation.ok).toBe('false');
    expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  /* Audit 2 [5]: `metadata.fileCount` has no writer on a package. What the
     server does record is `metadata.bundle`, the assembled zip's descriptor. */
  it('a package with no assembled bundle says so, and is not a checked package', async () => {
    serve();
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Package).toBeTruthy());
    expect(gateItems(container).Package.ok).toBe('false');
    expect(gateItems(container).Package.value).toBe('No bundle assembled');
    for (const row of Array.from(container.querySelectorAll('.sub-row'))) {
      expect(row.textContent ?? '').not.toMatch(/0 files|No files recorded/);
    }
  });

  it('an assembled bundle is read from the record: its size and hash', async () => {
    const sha256 = 'ab12cd34ef56'.padEnd(64, '0');
    serve([pkg({ metadata: { bundle: { sha256, sizeBytes: 1_572_864, format: 'ectd', assembledAt: '2026-10-20T00:00:00Z' } } })]);
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Package?.value).toMatch(/1\.5 MB/));
    expect(gateItems(container).Package.ok).toBe('true');
    expect(gateItems(container).Package.value).toMatch(/ab12cd34ef56/);
    expect(container.querySelector('.sub-row')?.textContent ?? '').toMatch(/1\.5 MB/);
  });

  /* Audit 2 [5]: this page reads no signature record and no cover letter, so
     it states neither as missing; "Not recorded" asserted an absence. */
  it('e-signature is "Not read on this page": a metadata flag is not a signature record', async () => {
    serve();
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container)['E-signature']).toBeTruthy());
    expect(gateItems(container)['E-signature'].value).toBe('Not read on this page');
    expect(gateItems(container)['E-signature'].ok).toBe('false');
    expect(container.querySelector('.sub-detail')?.textContent ?? '').not.toMatch(/Signed/);
  });

  it('the cover letter is "Not read on this page", and a metadata flag never ticks it', async () => {
    serve([pkg({ metadata: { cover: 'signed' } })]);
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container)['Cover letter']).toBeTruthy());
    expect(gateItems(container)['Cover letter'].value).toBe('Not read on this page');
    expect(gateItems(container)['Cover letter'].ok).toBe('false');
    expect(container.querySelector('.sub-detail')?.textContent ?? '').not.toMatch(/\bsigned\b|\bdraft\b/);
  });

  it('a row whose record carries no gate counts shows none', async () => {
    serve();
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll('.sub-row')).toHaveLength(2));
    expect(container.querySelectorAll('.sub-row .gate-chip')).toHaveLength(0);
  });

  it('a row shows no gate chips from `metadata.gate*`, which nothing writes on a package', async () => {
    serve([pkg({ metadata: { gateErrs: 0, gateWarns: 0, gateOk: 9 } })]);
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll('.sub-row')).toHaveLength(1));
    expect(container.querySelectorAll('.sub-row .gate-chip')).toHaveLength(0);
  });
});

describe('device-submission renders an unread list as unread, never as zero (audit 2)', () => {
  const pipelineCounts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('.sub-stage-n')).map((n) => n.textContent ?? '');

  /* Audit 2 [2]: a failed packages read showed seven "0" stages and
     "0 total · 0 active · 0 blocked", with no error. */
  it('a FAILED packages read says so, and states no count', async () => {
    serve('fail');
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    /* Let the read fail before reading the counts. */
    await act(async () => {});
    await act(async () => {});
    expect(pipelineCounts(container)).toHaveLength(7);
    for (const n of pipelineCounts(container)) expect(n).toBe('—');
    expect(container.textContent).not.toMatch(/0 total/);
    await waitFor(() => expect(screen.getByTestId('workbench-submissions-error')).toBeTruthy());
    expect(screen.getByTestId('workbench-submissions-error').textContent).toMatch(/Could not load the submission packages/);
    expect(screen.queryByTestId('workbench-no-submissions')).toBeNull();
  });

  it('a packages read in flight is "Loading…", and states no count', async () => {
    serve('pending');
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await act(async () => {});
    for (const n of pipelineCounts(container)) expect(n).toBe('—');
    expect(container.textContent).not.toMatch(/0 total/);
    expect(screen.getByTestId('workbench-submissions-loading').textContent).toMatch(/Loading/);
  });

  it('retry re-reads the package list', async () => {
    serve('fail');
    render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('workbench-submissions-error')).toBeTruthy());
    serve();
    fireEvent.click(within(screen.getByTestId('workbench-submissions-error')).getByRole('button'));
    await waitFor(() => expect(screen.getByText('Infusion pump EU MDR')).toBeTruthy());
  });

  /* Audit 2 [4]: the Activity strip rendered no rows while the milestones
     read was in flight or after it failed, which read as "no activity". */
  it('a FAILED milestones read says so under Activity', async () => {
    serve(PACKAGES, { errs: 0, warns: 0, ok: 4 }, 'fail');
    render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('submission-activity-error')).toBeTruthy());
    expect(screen.getByTestId('submission-activity-error').textContent).toMatch(/Could not read the activity log/);
  });

  it('a milestones 200 that is not a list is a failed read, not an empty log', async () => {
    serve(PACKAGES, { errs: 0, warns: 0, ok: 4 });
    const base = globalThis.fetch as unknown as (i: RequestInfo | URL) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      /\/milestones/.test(String(input))
        ? ({ ok: true, status: 200, json: async () => ({ data: { rows: 'not a list' } }) } as unknown as Response)
        : base(input),
    ));
    render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('submission-activity-error')).toBeTruthy());
    expect(screen.queryByTestId('submission-activity-empty')).toBeNull();
  });

  it('a milestones read in flight is "Activity not read yet"', async () => {
    serve(PACKAGES, { errs: 0, warns: 0, ok: 4 }, 'pending');
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelector('.sub-detail-title')?.textContent).toBe('Infusion pump 510(k)'));
    await waitFor(() => expect(screen.getByTestId('submission-activity-unread').textContent).toMatch(/Activity not read yet/));
  });

  it('an answered, empty milestones read is "No milestones recorded"', async () => {
    serve();
    render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('submission-activity-empty').textContent).toMatch(/No milestones recorded/));
  });
});

describe('device-submission ticks the gate only on a read that assessed something (audit 2 [3])', () => {
  it('an all-zero read of a package with nothing in it is "Nothing assessed yet", and Transmit stays off', async () => {
    serve(PACKAGES, { errs: 0, warns: 0, ok: 0, data: { sections: [], totalBlockers: 0, totalOverdue: 0 } });
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Validation?.value).toBe('Nothing assessed yet'));
    expect(gateItems(container).Validation.ok).toBe('false');
    expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('an all-zero read over artifacts none of which passed is not ticked either', async () => {
    serve(PACKAGES, { errs: 0, warns: 0, ok: 0, data: { sections: [{ totalArtifacts: 3 }] } });
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Validation?.value).toBe('0 err · 0 warn · 0 pass'));
    expect(gateItems(container).Validation.ok).toBe('false');
    expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a 200 with no counts is an unreadable gate, never 0 / 0 / 0', async () => {
    serve(PACKAGES, {});
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Validation?.value).toBe('Could not read the readiness gate'));
    expect(gateItems(container).Validation.ok).toBe('false');
    expect(container.querySelector('.sub-detail')?.textContent ?? '').not.toMatch(/0 err · 0 warn/);
    expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a read with passes and no errors is ticked, and Transmit is on', async () => {
    serve();
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(gateItems(container).Validation?.value).toBe('0 err · 0 warn · 4 pass'));
    expect(gateItems(container).Validation.ok).toBe('true');
    expect((screen.getByRole('button', { name: /transmit/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('device-submission states no stage or status the record does not carry (audit 2 [7])', () => {
  const stageCount = (container: HTMLElement, label: string) => {
    const st = Array.from(container.querySelectorAll('.sub-stage')).find(
      (s) => s.querySelector('.sub-stage-label')?.textContent === label,
    );
    return st?.querySelector('.sub-stage-n')?.textContent ?? '';
  };

  it('a package whose record names no stage is placed in none', async () => {
    serve();
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Infusion pump EU MDR')).toBeTruthy());
    expect(stageCount(container, 'Package')).toBe('0');
    expect(stageCount(container, 'Decision')).toBe('0');
    expect(container.querySelector('.sub-pipeline')?.textContent ?? '').not.toMatch(/Cleared/);
    expect(container.textContent).toMatch(/2 packages record no stage/);
  });

  it('a package whose record names a stage is counted there', async () => {
    serve([pkg({ metadata: { stage: 'validate' } })]);
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(stageCount(container, 'Validate')).toBe('1'));
    expect(container.textContent).not.toMatch(/record no stage/);
  });

  it('a locked package reads "locked", and a cancelled one "cancelled" with no "what is blocking"', async () => {
    serve([
      pkg({ status: 'locked', title: 'Locked package' }),
      pkg({ id: 3, packageId: 'pkg-c', status: 'cancelled', title: 'Cancelled package' }),
    ]);
    const { container } = render(<SubmissionsSurface onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll('.sub-row')).toHaveLength(2));
    const row = (title: string) =>
      Array.from(container.querySelectorAll('.sub-row')).find(
        (r) => r.querySelector('.sub-row-title')?.textContent === title,
      ) as HTMLElement;
    expect(row('Locked package').querySelector('.status-pill')?.textContent).toBe('locked');
    expect(row('Cancelled package').querySelector('.status-pill')?.textContent).toBe('cancelled');
    fireEvent.click(row('Cancelled package'));
    await waitFor(() => expect(container.querySelector('.sub-detail-title')?.textContent).toBe('Cancelled package'));
    expect(screen.queryByRole('button', { name: /ask claude/i })).toBeNull();
  });
});

/* Audit [11]: the invented value is not computed at all, so no new consumer
   can bring it back. */
describe('useSubmissions carries no receiving authority', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('an adapted package has no `target` field', async () => {
    serve();
    const { result } = renderHook(() => useSubmissions());
    await waitFor(() => expect(result.current.submissions).toHaveLength(2));
    for (const s of result.current.submissions!) {
      expect(Object.prototype.hasOwnProperty.call(s, 'target')).toBe(false);
      expect(JSON.stringify(s)).not.toMatch(INVENTED);
    }
  });
});
