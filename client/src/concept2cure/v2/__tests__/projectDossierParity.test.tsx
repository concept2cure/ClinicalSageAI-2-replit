/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ModuleCompletion, dossierFacts, type DossierState } from '../surfaces/ProjectDossier';

afterEach(cleanup);
const date = '2026-10-26T12:34:00.000Z';
const artifactReadiness = {
  state: 'read',
  sections: [{ ctdSection: '3.2.P.5', status: 'review', artifactCount: 4, draftCount: 0, reviewCount: 2, approvedCount: 1, lockedCount: 1, unknownCount: 0, lastUpdated: date }],
  summary: { totalSections: 1, readySections: 0, inProgressSections: 1, draftSections: 0, unknownSections: 0 },
};
const sectionTracking = { state: 'read', modules: [{ m: '3', label: 'Quality', pct: 50, tone: 'warn', sections: ['3.2.P.5 Control of drug product', '3.2.P.8 Stability'] }] };
function read(supportingReadiness: unknown = { artifactReadiness, sectionTracking }): DossierState {
  return {
    retry: vi.fn(), state: { loading: false, empty: false, data: {
      projectId: 'project', measuredAt: date, home: { state: 'measured', pct: 0, complete: 0, counted: 1 }, markets: [],
      rows: [{ group: 'module', module: '3', agency: null, documentId: 'd', label: 'Pack quality', counted: 1, complete: 0, inReview: 0, drafted: 1, figure: { state: 'measured', pct: 0, complete: 0, counted: 1 }, lastUpdated: date, sections: [{ key: '3.2.P.5', label: 'Control of drug product', status: 'drafted' }] }],
      ...{ supportingReadiness },
    } },
  } as DossierState;
}
function show(r: DossierState) {
  return render(<ModuleCompletion read={r} docForModule={() => null} onOpen={vi.fn()} />);
}

describe('old dossier functions in project Author', () => {
  it('shows per-section artifact counts, weakest status, section date and summary alongside governed sections', () => {
    show(read());
    const region = screen.getByRole('region', { name: 'Section artifacts' });
    expect(within(region).getByText('3.2.P.5')).toBeTruthy();
    const cells = within(region).getAllByRole('cell').map(c => c.textContent);
    expect(cells).toContain('4');
    expect(cells).toContain('0 / 2 / 1 / 1');
    expect(cells).toContain('In review');
    expect(region.querySelector('time')?.getAttribute('datetime')).toBe(date);
    expect(region.textContent).toContain('1 section · 0 ready · 1 in progress · 0 draft');
    expect(document.body.textContent).toContain('Pack quality');
  });

  it('shows actual tracking module percentage and all its section labels separately', () => {
    show(read());
    const region = screen.getByRole('region', { name: 'Tracked CTD sections' });
    expect(region.textContent).toContain('Module 3 · Quality');
    expect(region.textContent).toContain('50%');
    expect(region.textContent).toContain('3.2.P.5 Control of drug product');
    expect(region.textContent).toContain('3.2.P.8 Stability');
    expect(screen.getByTestId('pj-lmod').textContent).toContain('0%');
  });

  it('publishes artifact counts, section dates, tracking labels and their separate bases to AnA', () => {
    expect(dossierFacts(read())).toMatchObject({ dossier: { supportingReadiness: { artifactReadiness, sectionTracking } } });
  });

  it('preserves independent failed/unprovisioned states rather than reporting empty or zero', () => {
    const r = read({ artifactReadiness: { state: 'unavailable', code: 'READ_FAILED', reason: 'Artifact records could not be read.' }, sectionTracking: { state: 'unavailable', code: 'STORE_UNAVAILABLE', reason: 'Section tracking is not provisioned.' } });
    show(r);
    expect(screen.getByText('Artifact records could not be read.')).toBeTruthy();
    expect(screen.getByText('Section tracking is not provisioned.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('0 ready');
    expect(document.body.textContent).not.toContain('No tracked sections');
    expect(dossierFacts(r)).toMatchObject({ dossier: { supportingReadiness: r.state.data?.supportingReadiness } });
  });

  it('calls an older or malformed supporting response unavailable, with no fabricated empty counts', () => {
    show(read({ artifactReadiness: { state: 'read', sections: [null] }, sectionTracking: null }));
    expect(screen.getAllByText('Supporting section details are unavailable.')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('0 ready');
  });

  it('states unknown artifact status and unknown counts without presenting it as ready', () => {
    const unknown = { ...artifactReadiness, sections: [{ ...artifactReadiness.sections[0], status: 'unknown', artifactCount: 5, unknownCount: 1 }], summary: { ...artifactReadiness.summary, unknownSections: 1 } };
    show(read({ artifactReadiness: unknown, sectionTracking }));
    const region = screen.getByRole('region', { name: 'Section artifacts' });
    expect(within(region).getByText('Unknown')).toBeTruthy();
    expect(region.textContent).toContain('1 with unrecognized status');
  });
});
