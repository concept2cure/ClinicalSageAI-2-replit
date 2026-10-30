// @vitest-environment jsdom
/**
 * The eCTD compile screen's module readiness says what it counted (FILING_SPINE
 * F23 6/9, surfaces/EctdModuleReadiness.tsx).
 *
 * At head:
 *   - a program with no sequence read "0% · incomplete", a measured-looking 0
 *     over nothing counted;
 *   - a module with nothing required read "0%" and "ready";
 *   - a 200 with no `modules` read "No module readiness yet", an empty state
 *     for a read that did not answer.
 * Now the server says why nothing is counted and the card prints it with no
 * figure; a module with nothing required reads "none required"; a reply
 * without modules is a failed read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { ok, STATUS, props } from './ectdCompile.fixtures';

const NO_SEQUENCE = 'No sequence exists for this project yet, so nothing is counted as placed. Approved sections are on the project’s Author tab.';

function serveStatus(body: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(body);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    return ok({});
  });
}
const card = () => screen.getByText('Module readiness').closest('.pj-card') as HTMLElement;

beforeEach(() => {
  apiRequest.mockReset();
  (window as any).C2C_PROJECT = { id: 42, title: 'ABC-123', code: 'IND-42' };
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('eCTD module readiness says what it counted', () => {
  it('a program with no sequence: the sentence, and no percentage', async () => {
    serveStatus({
      ...STATUS, projectId: null, overallReadiness: null, readinessBasis: 'no-sequence', readinessNote: NO_SEQUENCE,
      modules: [], totalRequired: 0, totalCompleted: 0, sequence: null,
    });
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText(NO_SEQUENCE)).toBeTruthy();
    expect(card().textContent).not.toMatch(/%/);
  });

  it('a module with nothing required reads "none required", never 0% or ready', async () => {
    serveStatus({
      ...STATUS, readinessBasis: 'placed', totalRequired: 2, totalCompleted: 1,
      sequence: { sequenceNumber: '0000', region: 'fda', leafCount: 1 },
      modules: [
        { moduleCode: 'm1', moduleName: 'Module 1 — Administrative', totalSections: 0, requiredSections: 0, completedRequired: 0, completionPct: null, ready: null },
        STATUS.modules[0],
      ],
    });
    render(<EctdCompile {...props()} />);
    const row = (await screen.findByText('Module 1 — Administrative')).closest('tr')!;
    expect(row.textContent).toContain('none required');
    expect(row.textContent).not.toMatch(/ready|%/);
    expect(row.querySelector('.rd-chip'), 'no ready or partial chip').toBeNull();
    expect(card().textContent).toContain('1 of 2 required sections placed in sequence 0000');
  });

  it('a market with no required set says why, with no figure', async () => {
    const note = 'Sequence 0000 is for the ZZ market, which has no required-section set for a NDA here, so placement is not measured.';
    serveStatus({ ...STATUS, overallReadiness: null, readinessBasis: 'unavailable', readinessNote: note, modules: [], totalRequired: 0, totalCompleted: 0 });
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText(note)).toBeTruthy();
    expect(card().textContent).not.toMatch(/%/);
  });

  it('a 200 without modules is a failed read, never "No module readiness yet"', async () => {
    const noModules: Record<string, unknown> = { ...STATUS };
    delete noModules.modules;
    serveStatus(noModules);
    render(<EctdCompile {...props()} />);
    expect(await screen.findByText('Compilation readiness could not be read')).toBeTruthy();
    expect(screen.queryByText('No module readiness yet')).toBeNull();
  });
});
