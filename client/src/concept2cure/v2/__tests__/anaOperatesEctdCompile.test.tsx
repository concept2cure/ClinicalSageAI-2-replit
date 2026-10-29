// @vitest-environment jsdom
/**
 * AnA operates eCTD Compile & Export (wave 7).
 *
 * An audit of the shipped launch catalog found 13 of its 29 screens with no
 * registered action at all: AnA could navigate there and then do nothing. This
 * was one of them, and it is the screen a publisher sits on longest — reading
 * validation findings, deciding whether the package is submittable.
 *
 * Only three actions land here, and the count is the point. This surface's main
 * buttons ARE the governed acts — Compile, Validate, Download package, Import
 * eValidator report — and they stay a person's click. What is left that a
 * person genuinely operates is the two header menus and the orchestrator
 * run-id box, so that is what is wired, each handler driving the SAME state its
 * control drives.
 *
 * These mount the REAL surface and drive the registry's actions through the
 * real bus, asserting what a person would see: the Region menu moves, the
 * Submission menu moves, the run box carries the id and the run panel fills.
 * The refusals are checked too — a sequence that records its own region has no
 * Region menu and says so, a failed readiness read says the read failed rather
 * than letting a missing menu read as "no region recorded", and a menu is not
 * switched out from under a compile that is already in flight.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const IDENT = '42';
const STATUS_URL = `/api/ectd-compile/${IDENT}/status`;
const HISTORY_URL = `/api/ectd-compile/${IDENT}/history`;
const RUN_ID = 'run-abc-123';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const serverError = () => ({ ok: false, status: 500, json: async () => ({ success: false }) }) as Response;
const notFound = () => ({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) }) as Response;

/** Readiness as the server sends it. `sequence` is what varies per test. */
const STATUS = (sequence: unknown = null) => ({
  projectId: 42, overallReadiness: 60, submissionReady: false,
  totalSections: 5, totalRequired: 2, totalCompleted: 1, lastUpdated: null,
  sequence,
  modules: [{
    moduleCode: 'm3', moduleName: 'Module 3 — Quality', totalSections: 5,
    requiredSections: 2, completedRequired: 1, completionPct: 50, ready: false,
  }],
});

const RUN = {
  runId: RUN_ID, submissionId: 'sub-001', applicationNumber: 'IND123456',
  region: 'US', submissionType: 'IND', status: 'complete',
  startedAt: '2026-09-01T00:00:00Z', completedAt: '2026-09-01T00:04:00Z',
  steps: [{ key: 'package.assemble', status: 'complete', durationMs: 800 }],
};

const props = () =>
  ({ surface: { id: 'ectd-compile', label: 'eCTD' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' }) as any;

/**
 * Route every read this surface issues. `status` may be a Response, 'fail', or
 * a promise the test resolves itself (the read still in flight).
 */
function routeReads(opts: { status?: Response | Promise<Response> | 'fail'; run?: Response | Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const path = String(url);
    if (path.startsWith(STATUS_URL)) {
      if (opts.status === 'fail') return serverError();
      return opts.status ?? ok(STATUS());
    }
    if (path.startsWith(HISTORY_URL)) return ok({ compilations: [] });
    if (path.includes('/submission-orchestrator/runs/') && path.endsWith('/audit')) return ok({ events: [] });
    if (path.includes('/by-run/') && path.endsWith('/signed')) return ok({});
    if (path.includes('/submission-orchestrator/runs/')) return opts.run ?? ok(RUN);
    return ok({});
  });
}

/**
 * Send an action through the real bus, as a drive does. A mounted screen
 * answers at once; one that has not mounted (or whose read is in flight) is
 * stashed and answers through the deferred callback. `settled()` is whichever
 * came, so a test reads the same either way.
 */
function send(actionId: string, params: Record<string, string> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`${actionId} does not resolve: ${res.error}`);
  const deferred = vi.fn();
  const immediate = applySurfaceAction(res.directive, vi.fn(), deferred);
  const settled = () => (immediate.status === 'stashed' ? deferred.mock.calls.at(-1)?.[0] : immediate);
  return { immediate, deferred, settled };
}
type Sent = ReturnType<typeof send>;

const applied = (s: Sent) => waitFor(() => expect(s.settled()).toMatchObject({ status: 'applied' }));
const refused = (s: Sent) => waitFor(() => expect(s.settled()).toMatchObject({ status: 'failed' }));
const reasonOf = (s: Sent) => String(s.settled()?.reason ?? '');
const detailOf = (s: Sent) => String(s.settled()?.detail ?? '');

const regionMenu = () => screen.getByLabelText('Region') as HTMLSelectElement;
const subtypeMenu = () => screen.getByLabelText('Submission') as HTMLSelectElement;
const runBox = () => screen.getByLabelText('Orchestrator run id') as HTMLInputElement;

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
  routeReads();
  (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123', code: 'IND-42' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as any).C2C_PROJECT;
});

describe('the Region menu — what the next Validate or Compile is run for', () => {
  it('switches the region, and the menu a person reads really moved', async () => {
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');
    expect(regionMenu().value).toBe('FDA');

    const outcome = send('ectd-compile.set-region', { region: 'EMA' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/Selected region EMA \(EU · EMA\)/);
    // A selector only: the detail must not imply anything was sent.
    expect(detailOf(outcome)).toMatch(/Nothing is sent until a person clicks/);
    await waitFor(() => expect(regionMenu().value).toBe('EMA'));
  });

  it('says so rather than claiming a switch when that region is already selected', async () => {
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    const outcome = send('ectd-compile.set-region', { region: 'FDA' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/FDA is already the selected region/);
  });

  it('a region this compiler has no menu entry for never reaches the screen', () => {
    // The registry validates the enum before the bus is involved, so a bogus
    // region is refused with the legal set and the screen is never touched.
    // The handler keeps its own guard for a caller that bypasses the registry.
    const res = resolveSurfaceAction('ectd-compile.set-region', { region: 'EU' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/must be one of: FDA, EMA/);
  });

  it('is held while readiness loads — the menu\'s very presence depends on that read', async () => {
    let answer!: (r: Response) => void;
    const inFlight = new Promise<Response>((resolve) => (answer = resolve));
    routeReads({ status: inFlight });

    const outcome = send('ectd-compile.set-region', { region: 'EMA' });
    expect(outcome.immediate, 'nothing is mounted yet, so the bus holds it').toEqual({ status: 'stashed' });
    render(<EctdCompile {...props()} />);
    await waitFor(() => expect(apiRequest.mock.calls.some(([, u]) => String(u).startsWith(STATUS_URL))).toBe(true));
    expect(outcome.deferred, 'answered before readiness landed').not.toHaveBeenCalled();

    answer(ok(STATUS()));
    await applied(outcome);
    await waitFor(() => expect(regionMenu().value).toBe('EMA'));
  });

  it('a readiness read that FAILED gets the refusal, not a twenty-second timeout', async () => {
    routeReads({ status: 'fail' });

    const outcome = send('ectd-compile.set-region', { region: 'EMA' });
    expect(outcome.immediate).toEqual({ status: 'stashed' });
    render(<EctdCompile {...props()} />);

    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/Compilation readiness could not be read/);
    expect(reasonOf(outcome), 'a failed read must not read as a sequence with no recorded region')
      .toMatch(/not a sequence without a recorded region/);
  });

  it('a sequence that records its own region has no Region menu, and the refusal names both', async () => {
    routeReads({ status: ok(STATUS({ sequenceNumber: '0001', region: 'fda', leafCount: 3 })) });
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');
    expect(screen.queryByLabelText('Region'), 'the menu is replaced by the recorded region').toBeNull();

    const outcome = send('ectd-compile.set-region', { region: 'EMA' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/This sequence records region FDA/);
    expect(reasonOf(outcome), 'name the sequence the region is recorded on').toMatch(/sequence 0001/);
  });
});

describe('the Submission menu — what the next compile is run as', () => {
  it('switches the submission type, and the menu a person reads really moved', async () => {
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');
    expect(subtypeMenu().value).toBe('initial');

    const outcome = send('ectd-compile.set-submission-type', { submissionType: 'amendment' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/Selected submission type amendment/);
    await waitFor(() => expect(subtypeMenu().value).toBe('amendment'));
  });

  it('says so rather than claiming a switch when that type is already selected', async () => {
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    const outcome = send('ectd-compile.set-submission-type', { submissionType: 'initial' });
    await applied(outcome);
    expect(detailOf(outcome)).toMatch(/initial is already the selected submission type/);
  });

  it('a type this compiler does not offer never reaches the screen', () => {
    const res = resolveSurfaceAction('ectd-compile.set-submission-type', { submissionType: 'supplement' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/must be one of: initial, amendment/);
  });

  it('is refused while a compile is in flight, though the menu itself stays enabled', async () => {
    // Deliberately stricter than the human control: a person sees the button
    // reading "Compiling…" before they touch the menu, AnA cannot, and a type
    // switched mid-compile would mislabel the result she then narrates.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      const path = String(url);
      if (method === 'POST' && path.includes('/compile')) return new Promise<Response>(() => {});
      if (path.startsWith(STATUS_URL)) return ok(STATUS());
      if (path.startsWith(HISTORY_URL)) return ok({ compilations: [] });
      return ok({});
    });
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');
    fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
    await screen.findByRole('button', { name: /Compiling…/ });

    const outcome = send('ectd-compile.set-submission-type', { submissionType: 'amendment' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/A compile is in flight/);
    expect(subtypeMenu().value, 'nothing was switched under the compile').toBe('initial');
  });
});

describe('the orchestrator run box', () => {
  it('loads a run: the box carries the id and the pipeline panel fills', async () => {
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    const outcome = send('ectd-compile.load-run', { run: RUN_ID });
    await applied(outcome);
    // The detail claims only that the read was STARTED — each panel reports
    // its own outcome, including a run nobody can see.
    expect(detailOf(outcome)).toMatch(/Loading orchestrator run run-abc-123/);
    expect(detailOf(outcome)).not.toMatch(/passed|exists|signed and verified/);

    await waitFor(() => expect(runBox().value).toBe(RUN_ID));
    expect(await screen.findByText(/IND123456 · IND · US/)).toBeTruthy();
  });

  it('a run id nobody can see comes back as the panel\'s own honest miss, not as a result', async () => {
    routeReads({ run: notFound() });
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    const outcome = send('ectd-compile.load-run', { run: 'run-nope' });
    await applied(outcome);
    expect(await screen.findByText(/No run with that id is visible to your organization/)).toBeTruthy();
  });

  it('no run id says why no ids can be listed — this screen lists none', async () => {
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    // The registry refuses '' as a missing required param, so a blank reaches
    // the handler only as whitespace. Either way she gets somewhere to go next.
    const outcome = send('ectd-compile.load-run', { run: '   ' });
    await refused(outcome);
    expect(reasonOf(outcome)).toMatch(/No run id given/);
    expect(reasonOf(outcome), 'a miss with nothing to list must say where the id comes from')
      .toMatch(/Orchestration board or from the run that built the package/);
    const blank = resolveSurfaceAction('ectd-compile.load-run', { run: '' });
    expect(blank.ok).toBe(false);
  });

  it('a second load sent while the first read is in flight is held, then applied', async () => {
    let answer!: (r: Response) => void;
    const inFlight = new Promise<Response>((resolve) => (answer = resolve));
    routeReads({ run: inFlight });
    render(<EctdCompile {...props()} />);
    await screen.findByText('Module 3 — Quality');

    const first = send('ectd-compile.load-run', { run: RUN_ID });
    await applied(first);
    await screen.findByText('Loading run…');

    const second = send('ectd-compile.load-run', { run: 'run-second' });
    expect(second.immediate, 'two reads whose responses are not ordered must not race').toEqual({ status: 'stashed' });
    expect(second.deferred).not.toHaveBeenCalled();

    answer(ok(RUN));
    await applied(second);
    await waitFor(() => expect(runBox().value).toBe('run-second'));
  });
});

describe('with no program open — the one honest dead-end left', () => {
  it('refuses all three and says to open a program, instead of going silent', async () => {
    delete (window as any).C2C_PROJECT;
    render(<EctdCompile {...props()} />);
    await screen.findByText(/Open a project to compile its eCTD/);

    // statusState never leaves 'idle' with no program, so holding would wait
    // out the 20 s TTL. Each of these must refuse hard instead.
    for (const [id, params] of [
      ['ectd-compile.set-region', { region: 'EMA' }],
      ['ectd-compile.set-submission-type', { submissionType: 'amendment' }],
      ['ectd-compile.load-run', { run: RUN_ID }],
    ] as const) {
      const outcome = send(id, params);
      await refused(outcome);
      expect(reasonOf(outcome), id).toMatch(/No project is open/);
      expect(reasonOf(outcome), id).toMatch(/open a project first/i);
    }
    // No program, no project-scoped reads: only the eCTD reference's two, which
    // are not the project's (folded from ectd-publishing, D2 2026-10-29).
    expect(apiRequest.mock.calls.map((c) => c[1]).sort(), 'no program, no project-scoped reads')
      .toEqual(['/api/ectd/controlled-vocab', '/api/ectd/qualification/spec-versions']);
  });
});
