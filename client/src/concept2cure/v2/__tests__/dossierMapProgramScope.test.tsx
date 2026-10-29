// @vitest-environment jsdom
/** A2.7: the old map's UUID scope and honest states now reach Author through
 * the canonical dossier. No integer is ever parsed from a program UUID.
 * No-project visits are covered through the real shell in
 * projectDestinationShell.test.tsx and the ProjectHome empty-state action. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { ModuleCompletion, useProjectDossier } from '../surfaces/ProjectDossier';

const PROGRAM = '6191805f-e83d-4327-af00-aa2c6f4d43b0';
const URL = `/api/c2c/projects/${PROGRAM}/dossier`;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function payload(modules: unknown[]) {
  return { projectId: PROGRAM, measuredAt: '2026-10-26T00:00:00Z', home: { state: 'no_sections', pct: null }, markets: [], rows: [],
    artifactReadiness: { basis: 'governed_artifacts', state: 'no_artifacts', sections: [], summary: { totalSections: 0, readySections: 0, inProgressSections: 0, draftSections: 0, notAssessedSections: 0 } },
    supportingReadiness: {
      sectionTracking: { basis: 'section_tracking', state: modules.length ? 'measured' : 'no_sections', modules, unmapped: [] },
    },
  };
}
function Author() {
  const read = useProjectDossier(PROGRAM);
  return <ModuleCompletion read={read} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />;
}
beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('the former map read in project Author (F-7)', () => {
  it('asks by the exact program UUID and renders its tracking map', async () => {
    apiRequest.mockImplementation(async (_m, url) => url === URL ? ok(payload([{ m: '3', label: 'Quality', counted: 1, complete: 0, unknownCount: 0, pct: 0, tone: 'idle', sections: [{ code: '3.2.P', title: 'Drug Product', label: '3.2.P Drug Product', status: 'drafting', observedStatuses: ['drafting'] }] }])) : ok({}));
    render(<Author />);
    expect(await screen.findByText(/Module 3 · Quality/)).toBeTruthy();
    expect(screen.getByText('3.2.P Drug Product')).toBeTruthy();
    expect(apiRequest.mock.calls.map(([, url]) => url)).toEqual([URL]);
  });

  it('does not turn an unanchored program into an empty tracked dossier', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'PROGRAM_UNANCHORED', message: 'No accepted project anchor.' } }) } as Response);
    render(<Author />);
    expect(await screen.findByText("Couldn't load module completion")).toBeTruthy();
    expect(screen.queryByText('No tracked sections yet.')).toBeNull();
    expect(screen.queryByText('No document sections yet')).toBeNull();
  });

  it('keeps a genuinely empty tracked section store separate from a failed read', async () => {
    apiRequest.mockResolvedValue(ok(payload([])));
    render(<Author />);
    expect(await screen.findByText('No tracked sections yet.')).toBeTruthy();
    expect(screen.queryByText("Couldn't load module completion")).toBeNull();
  });
});
