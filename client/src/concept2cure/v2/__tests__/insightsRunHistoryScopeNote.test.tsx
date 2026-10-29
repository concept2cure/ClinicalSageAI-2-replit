// @vitest-environment jsdom
/**
 * A run history row says what an organization-scope run's counts cover (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/small-honest-state-fixes/).
 *
 * a61afe12 made the catalog card, the pack tiles, the report's scope line and
 * the result after a run say both "Organization-wide records" and "Counts are
 * not narrowed to the selected project." for a run whose engine counted the
 * organization (`computedScope: 'organization'`) under a project. The run
 * history row said only the first line, so a project's name headed the
 * organization's counts in the one place a saved run is listed. These tests
 * hold that the row says both, from the row's carried `computedScope` only
 * (run-history.ts reads it from the stored summary), and keeps the scope
 * line's one exception: an account run is the organization's by its own scope.
 *
 * Only the transport (`apiRequest`) is replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RunsPanel } from '../surfaces/InsightsRunsPanel';

const ORG_WIDE = 'Organization-wide records';
const NOT_NARROWED = 'Counts are not narrowed to the selected project.';
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

/* Rows as GET /api/report-os/runs answers them (run-history.ts): `computedScope`
   is the stored summary's computedScope, else its domainScope, else the run's
   scope type. */
const run = (id: number, over: Record<string, unknown>) => ({
  id, runUuid: `aaaaaaaa-0000-4000-8000-0000000000${id}`, status: 'partial', confidence: null,
  createdAt: '2026-10-29T09:00:00.000Z', completedAt: '2026-10-29T09:00:05.000Z', ...over,
});
const RUNS = [
  // An organization-scope engine, run under the project.
  run(51, { reportTypeId: 'inspection.readiness_pack', reportTypeLabel: 'Inspection Readiness & 483 Response Pack',
    scopeType: 'project', scopeId: '12', scopeLabel: 'ABC-101', computedScope: 'organization' }),
  // The same engine, run for the organization.
  run(52, { reportTypeId: 'inspection.readiness_pack', reportTypeLabel: 'Inspection Readiness & 483 Response Pack',
    scopeType: 'account', scopeId: '1', scopeLabel: 'Organization', computedScope: 'organization' }),
  // A domain register whose engine computed the project it ran under.
  run(53, { reportTypeId: 'grants.portfolio_register', reportTypeLabel: 'Grants Portfolio Register',
    scopeType: 'project', scopeId: '12', scopeLabel: 'ABC-101', computedScope: 'project' }),
  // A project report.
  run(54, { reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest',
    scopeType: 'project', scopeId: '12', scopeLabel: 'ABC-101', computedScope: 'project' }),
];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({ data: RUNS, meta: { total: RUNS.length, limit: 50, offset: 0, hasMore: false } }));
});
afterEach(() => cleanup());

/** The Scope cell of the row for this type and scope label. */
async function scopeCell(typeLabel: string, scopeLabel: string): Promise<HTMLElement> {
  render(<RunsPanel types={[]} onOpen={() => {}} onBundle={() => {}} canBundle={false} />);
  const table = await screen.findByRole('table');
  const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
  const row = within(table).getAllByRole('row').find((tr) => {
    const cells = tr.querySelectorAll('td');
    return cells[0]?.textContent === typeLabel && cells[headers.indexOf('Scope')]?.textContent?.startsWith(scopeLabel);
  });
  expect(row, `a ${typeLabel} row for ${scopeLabel}`).toBeTruthy();
  return row!.querySelectorAll('td')[headers.indexOf('Scope')] as HTMLElement;
}

describe('run history row — what an organization-scope run counted', () => {
  it('a run under a project whose engine counted the organization says both lines', async () => {
    const cell = await scopeCell('Inspection Readiness & 483 Response Pack', 'ABC-101');
    expect(within(cell).getByText(ORG_WIDE)).toBeTruthy();
    expect(within(cell).getByText(NOT_NARROWED)).toBeTruthy();
  });

  it('an account run is the organization’s by its own scope: the first line only', async () => {
    const cell = await scopeCell('Inspection Readiness & 483 Response Pack', 'Organization');
    expect(within(cell).getByText(ORG_WIDE)).toBeTruthy();
    expect(cell.textContent).not.toMatch(/not narrowed/);
  });

  it('a domain register whose engine computed the project says neither', async () => {
    const cell = await scopeCell('Grants Portfolio Register', 'ABC-101');
    expect(cell.textContent).toBe('ABC-101');
  });

  it('a project report says neither', async () => {
    const cell = await scopeCell('Executive Readiness Digest', 'ABC-101');
    expect(cell.textContent).toBe('ABC-101');
  });
});
