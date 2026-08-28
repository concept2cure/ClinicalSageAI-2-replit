// @vitest-environment jsdom
/**
 * Inconsistency — two controls that collected intent and did nothing with it.
 *
 * ── Defect 1: "Propagate change" propagated nothing ──────────────────────────
 * The governed 'Change <value>' form took a new value AND a mandatory
 * reason-for-change, under a header reading "Governed change" and a footnote
 * promising an audit trail. Its entire submit handler was
 *   fireToast('Requested change: … -- cross-dossier propagation is not yet wired')
 * Nothing was propagated, nothing was recorded, nothing was audited. Collecting
 * a 21 CFR §11 reason for change for an action the product cannot perform is
 * worse than having no control: the user believes the record moved.
 *
 * POST /api/governed-intelligence/assumptions/:id/revalue does both halves —
 * record the replacement at the new value, supersede the original by it — in
 * one request, because doing them from the client leaves an orphan replacement
 * behind whenever the second fails.
 *
 * ── Defect 2: "Show me how to clear it" showed nothing ───────────────────────
 * On the blocked-filing hero this set a 1.6-second CSS outline on a finding
 * card that is almost always below the fold. No scroll, no focus, no guidance —
 * the word "how" was answered by nothing at all, and for a keyboard or
 * screen-reader user the outline was not even perceivable.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The chain in both cases: the request that goes out and what happens to the
 * screen when the server refuses it, and the finding the CTA actually delivers
 * the user to.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Inconsistency } from '../surfaces/Inconsistency';

const Surface = Inconsistency as unknown as React.ComponentType<Record<string, unknown>>;

const PROGRAM = {
  projectId: 9, name: 'Bexarone in advanced NSCLC', code: 'BX-204',
  stage: 'Phase 2', indication: 'NSCLC', app: null, filing: null,
};

/** dosage_conflict defaults to blocks_promotion — this is the blocking finding. */
const BLOCKING = {
  id: 'f-1', projectId: 9, contradictionType: 'dosage_conflict',
  severity: 'critical', title: 'Starting dose disagrees across the dossier',
  objectA: { type: 'section', id: 'a', label: 'Protocol §6.1' },
  objectB: { type: 'section', id: 'b', label: 'IB §5.3' },
  sourceClassification: 'deterministic', truthHierarchyLevel: 1, llmRole: 'none',
  confidenceScore: 0.98, confidenceLevel: 'high',
  description: 'The protocol states 400 mg BID; the Investigator Brochure states 200 mg BID.',
  deterministicRule: 'DOSE_XREF', consequenceType: 'blocks_promotion',
  reviewState: 'unresolved', detectedBy: 'engine', factId: null,
};

/** advisory_only — present so the blocking one is not the only card on screen. */
const ADVISORY = {
  ...BLOCKING,
  id: 'f-2', contradictionType: 'temporal_inconsistency', severity: 'low',
  title: 'Enrolment window dates differ by one day',
  description: 'A one-day discrepancy between the SAP and the protocol.',
  deterministicRule: null, consequenceType: 'advisory_only',
};

const ASSUMPTION = {
  id: 'a-77', category: 'dosing', domainTrack: 'clinical',
  assumedValue: '400 mg BID', status: 'active',
  title: 'Starting dose', source: 'Protocol §6.1',
};

const board = (over: Record<string, unknown> = {}) => ({
  program: PROGRAM, findings: [ADVISORY, BLOCKING], assumptions: [ASSUMPTION],
  decisions: [], checks: [], ...over,
});

const BOARD_PATH = '/api/governed-intelligence-inconsistency/projects/9/inconsistency';
const REVALUE_PATH = '/api/governed-intelligence/assumptions/a-77/revalue';
const REASON = 'Reconcile the IB to the protocol-specified starting dose';

/** Reads route to the board; every write is left to the test. */
function routeReads(data: unknown = board()) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === BOARD_PATH) {
      return { ok: true, status: 200, json: async () => ({ data }) };
    }
    throw new Error('unrouted ' + method + ' ' + path);
  });
}

/** Add a write route on top of the read routes already installed. */
function routeWrite(handler: (method: string, path: string, body: unknown) => unknown) {
  const reads = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) =>
    m === 'GET' ? reads(m, p, b) : handler(m, p, b),
  );
}

/** Open the governed-change form from the assumption registry row. */
async function openChangeForm() {
  const asked: string[] = [];
  render(<Surface onAsk={(t: string) => asked.push(t)} onNav={() => {}} />);
  // The assumption registry renders inline under the findings, and the row's
  // "Change value" button is the form's only reachable trigger — the other one
  // sits behind `f.factId`, documented as null on every live finding.
  const trigger = await screen.findByTitle(/Change Starting dose/);
  fireEvent.click(trigger);
  await screen.findByLabelText(/New value/);
  return asked;
}

function fillAndSubmit(value: string, reason: string) {
  fireEvent.change(screen.getByLabelText(/New value/), { target: { value } });
  fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: reason } });
  fireEvent.click(screen.getByRole('button', { name: /Propagate change/ }));
}

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 9 };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('"Propagate change" is a governed write, not a toast', () => {
  it('POSTs the new value AND the reason to the revalue route', async () => {
    routeReads();
    await openChangeForm();
    routeWrite(() => ({ ok: true, status: 200, json: async () => ({ data: { id: 'a-78' } }) }));

    fillAndSubmit('200 mg BID', REASON);

    await waitFor(() => {
      const writes = apiRequest.mock.calls.filter(([m]) => m === 'POST');
      expect(writes.length, 'the form submitted without sending anything').toBe(1);
    });
    const [method, path, body] = apiRequest.mock.calls.find(([m]) => m === 'POST')!;
    expect(method).toBe('POST');
    expect(path).toBe(REVALUE_PATH);
    // The reason travels WITH the value. It is what a reviewer reads to
    // understand why the dossier moved, so a request carrying only the value
    // would be a governed change with no governance in it.
    expect(body).toEqual({ newValue: '200 mg BID', reason: REASON });
  });

  it('confirms the supersession and what it made stale — not "requested"', async () => {
    routeReads();
    await openChangeForm();
    routeWrite(() => ({ ok: true, status: 200, json: async () => ({ data: { id: 'a-78' } }) }));

    fillAndSubmit('200 mg BID', REASON);

    const toast = await screen.findByText(/Starting dose is now 200 mg BID/);
    expect(toast.textContent).toMatch(/superseded/);
    expect(toast.textContent).toMatch(/stale/);
    // The sentence the old handler produced.
    expect(document.body.textContent).not.toMatch(/not yet wired/);
  });

  it('refuses a reason too short to be a reason, without sending anything', async () => {
    // The route requires 8 characters; refusing here means the user is told
    // why instead of watching a governed form 400.
    routeReads();
    await openChangeForm();
    routeWrite(() => { throw new Error('a write should not have been attempted'); });

    fillAndSubmit('200 mg BID', 'typo');

    await screen.findByText(/at least 8 characters/);
    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST').length).toBe(0);
  });

  it('says the value is UNCHANGED when the server refuses, and keeps the form open', async () => {
    /* The failure that matters. A refused supersession that reported success
       would leave the user believing the dossier had moved — and the whole
       point of this control is that everything downstream is now stale. */
    routeReads();
    await openChangeForm();
    routeWrite(() => ({
      ok: false, status: 409,
      json: async () => ({ error: 'This assumption is already superseded; change the value on the record that replaced it.' }),
    }));

    fillAndSubmit('200 mg BID', REASON);

    const toast = await screen.findByText(/was not changed/);
    expect(toast.textContent).toMatch(/already superseded/);
    expect(toast.textContent).toMatch(/Starting dose is still 400 mg BID/);
    // Still on the form, with the user's typing intact, so the change can be retried.
    expect((screen.getByLabelText(/New value/) as HTMLInputElement).value).toBe('200 mg BID');
  });

  it('reports an unreachable service as unchanged too', async () => {
    routeReads();
    await openChangeForm();
    routeWrite(() => { throw new Error('Failed to fetch'); });

    fillAndSubmit('200 mg BID', REASON);

    const toast = await screen.findByText(/was not changed/);
    expect(toast.textContent).toMatch(/Failed to fetch/);
    expect(toast.textContent).toMatch(/still 400 mg BID/);
  });
});

describe('"Show me how to clear it" takes the user to the finding', () => {
  /** Every finding card gets a stable id; the blocking one is the target. */
  const card = () => document.getElementById('gi-f-' + BLOCKING.id);

  async function clickTheCta() {
    routeReads();
    const asked: string[] = [];
    render(<Surface onAsk={(t: string) => asked.push(t)} onNav={() => {}} />);
    const cta = await screen.findByRole('button', { name: 'Show me how to clear it' });
    fireEvent.click(cta);
    return asked;
  }

  it('scrolls the blocking finding into view', async () => {
    // jsdom has no scrollIntoView; installing a spy is also what proves the
    // surface calls it on the right element rather than on the page.
    const scrollIntoView = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;

    await clickTheCta();

    expect(scrollIntoView, 'the CTA moved the viewport nowhere').toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(card());
  });

  it('moves FOCUS to it, which an outline never did', async () => {
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();

    await clickTheCta();

    // A keyboard or screen-reader user has to arrive there too. The old
    // 1.6-second border was invisible to both.
    expect(document.activeElement).toBe(card());
    expect(card()?.getAttribute('tabindex')).toBe('-1');
  });

  it('asks AnA for the resolution of THAT finding, by name', async () => {
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = vi.fn();

    const asked = await clickTheCta();

    expect(asked.length, 'no guidance was requested — "how" was answered by nothing').toBe(1);
    expect(asked[0]).toContain(BLOCKING.title);
    expect(asked[0]).toContain('BX-204');
    expect(asked[0]).toMatch(/what has to be re-approved/);
  });

  it('still asks for the guidance where scrollIntoView does not exist', async () => {
    /* An unguarded call throws out of the click handler in jsdom and in some
       embedded webviews, and the ask below it never runs — losing the part of
       this control that actually answers the question. */
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;

    const asked = await clickTheCta();

    expect(asked.length).toBe(1);
    expect(asked[0]).toContain(BLOCKING.title);
  });
});
