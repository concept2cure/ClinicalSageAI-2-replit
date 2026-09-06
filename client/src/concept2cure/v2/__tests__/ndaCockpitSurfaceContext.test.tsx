// @vitest-environment jsdom
/**
 * What the NDA cockpit tells AnA about Refuse-to-File risk.
 *
 * This surface owns a distinction it fought for: an empty Refuse-to-File risk
 * log does NOT mean the risk was assessed and found clear. No completed
 * shadow-review signal is recorded anywhere for it to read, so
 * `assessmentState` returns `not-assessed` rather than `assessed-clear`, and
 * the comment above `filingState` records that deriving clearance from
 * `rtf.length === 0` would reinstate the exact defect.
 *
 * Publishing screen state to AnA is a new way to lose that. A summary reading
 * "0 Refuse-to-File risks" is true, reassuring, and wrong in the way that
 * matters — it hands the model a clean bill of health nobody issued, and the
 * model will repeat it in prose to a filing team.
 *
 * So the surface publishes `filingState` VERBATIM rather than re-deriving it,
 * and these tests pin that the words AnA receives carry the caution the screen
 * does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { NdaCockpit } from '../surfaces/NdaCockpit';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('nda-cockpit');
  return null;
}

const props = () => ({
  surface: { id: 'nda-cockpit', label: 'NDA cockpit' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

function renderCockpit() {
  return render(
    <>
      <NdaCockpit {...props()} />
      <Probe />
    </>,
  );
}

beforeEach(() => {
  seen = null;
  apiRequest.mockReset();
});

/* Wait for the context to LEAVE loading, not merely to exist. A `waitFor` on
   truthiness is satisfied by the loading summary on the first paint, so every
   assertion below would run against "still loading" and pass or fail for
   nothing to do with what it means to test. */
const settled = () =>
  waitFor(() => {
    expect(seen?.summary).toBeTruthy();
    expect(seen!.summary).not.toMatch(/still loading/i);
  });
afterEach(cleanup);

/** Modules present, RTF log empty — the case the distinction exists for. */
function modulesButNoFindings() {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.includes('/nda-cockpit/modules')) {
      return res({ data: [{ id: 'm1', name: 'Module 1', ready: 40 }, { id: 'm2', name: 'Module 2', ready: 80 }] });
    }
    return res({ data: [] });
  });
}

describe('the NDA cockpit never tells AnA an unassessed risk is clear', () => {
  it('publishes the surface own verdict, not a re-derivation', async () => {
    modulesButNoFindings();
    renderCockpit();
    await settled();
    // The value comes straight from assessmentState. A second opinion computed
    // here could drift from the one the screen shows.
    expect(seen!.facts!.refuseToFileState).toBe('not-assessed');
  });

  it('says NOT ASSESSED in the words AnA reads, not a reassuring zero', async () => {
    modulesButNoFindings();
    renderCockpit();
    await settled();
    expect(seen!.summary).toMatch(/NOT ASSESSED/i);
    // The sentence a model would happily repeat to a filing team.
    expect(seen!.summary).not.toMatch(/\b0 (logged )?Refuse-to-File risk/i);
    expect(seen!.summary).not.toMatch(/\bno Refuse-to-File risks?\b/i);
  });

  it('explains WHY an empty log is not clearance', async () => {
    // Without the reason, "not assessed" invites the model to treat it as a
    // formality it can reason past.
    modulesButNoFindings();
    renderCockpit();
    await settled();
    expect(seen!.summary).toMatch(/no completed shadow review is recorded/i);
  });

  it('reports a failed read as a failed read, with no readiness figure', async () => {
    apiRequest.mockImplementation(async () => {
      throw new Error('upstream unavailable');
    });
    renderCockpit();
    await settled();
    expect(seen!.summary).toMatch(/failed read, not a clean program/i);
    expect(seen!.facts).toBeUndefined();
  });

  it('does not report Module 1 clear when only the Module-1 read failed', async () => {
    // m1Live (/api/nda-cockpit/m1) is a SEPARATE read, deliberately excluded
    // from filingState — so /modules and /rtf answering does not mean Module 1
    // was read. A failed /m1 must publish an UNKNOWN (null) Module-1 count, never
    // a false "0 Module 1 admin item(s) open" that a filing team reads as done.
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.includes('/nda-cockpit/modules')) {
        return res({ data: [{ id: 'm1', name: 'Module 1', ready: 40 }] });
      }
      if (url.includes('/nda-cockpit/m1')) return res({ error: 'module-1 store unavailable' }, 503);
      return res({ data: [] });
    });
    renderCockpit();
    await settled();
    expect(seen!.facts!.module1AdminOpen).toBeNull();
    expect(seen!.summary).not.toMatch(/\b0 Module 1 admin item/i);
    expect(seen!.summary).toMatch(/Module 1 admin status could not be read/i);
  });
});
