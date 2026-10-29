/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ModuleCompletion, dossierFacts, type DossierState } from '../surfaces/ProjectDossier';

afterEach(cleanup);
const date = '2026-10-26T12:34:00.000Z';
const artifactReadiness = {
  basis: 'governed_artifacts', state: 'measured',
  sections: [{ ctdSection: '3.2.P.5', status: 'review', artifactCount: 4, draftCount: 0, reviewCount: 2, approvedCount: 1, lockedCount: 1, unknownCount: 0, lastUpdated: date }],
  summary: { totalSections: 1, readySections: 0, inProgressSections: 1, draftSections: 0, notAssessedSections: 0 },
};
const sectionTracking = { basis: 'section_tracking', state: 'measured', unmapped: [], modules: [{
  m: '3', label: 'Quality', counted: 2, complete: 1, unknownCount: 0, pct: 50, tone: 'warn', sections: [
    { code: '3.2.P.5', title: 'Control of drug product', label: '3.2.P.5 Control of drug product', status: 'approved', observedStatuses: ['approved'] },
    { code: '3.2.P.8', title: 'Stability', label: '3.2.P.8 Stability', status: 'drafting', observedStatuses: ['drafting'] },
  ],
}] };
function read({ artifactReadiness: artifacts = artifactReadiness, sectionTracking: tracking = sectionTracking }: { artifactReadiness?: unknown; sectionTracking?: unknown } = {}): DossierState {
  return {
    retry: vi.fn(), state: { loading: false, empty: false, data: {
      projectId: 'project', measuredAt: date, home: { state: 'measured', pct: 0, complete: 0, counted: 1 }, markets: [],
      rows: [{ group: 'module', module: '3', agency: null, documentId: 'd', label: 'Pack quality', counted: 1, complete: 0, inReview: 0, drafted: 1, figure: { state: 'measured', pct: 0, complete: 0, counted: 1 }, lastUpdated: date, sections: [{ key: '3.2.P.5', label: 'Control of drug product', status: 'drafted' }] }],
      artifactReadiness: artifacts, supportingReadiness: { sectionTracking: tracking },
    } },
  } as DossierState;
}
function show(r: DossierState) {
  return render(<ModuleCompletion read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
}

describe('old dossier functions in project Author', () => {
  it('shows per-section artifact counts, weakest status, section date and summary alongside governed sections', () => {
    show(read());
    const region = screen.getByRole('region', { name: 'Artifact section status' });
    expect(screen.getAllByRole('region', { name: 'Artifact section status' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Section artifacts' })).toBeNull();
    expect(within(region).getByText('3.2.P.5')).toBeTruthy();
    const cells = within(region).getAllByRole('cell').map(c => c.textContent);
    expect(cells).toContain('4');
    expect(cells).toContain('0 / 2 / 1 / 1 / 0');
    expect(cells).toContain('In review');
    expect(region.querySelector('time')?.getAttribute('datetime')).toBe(date);
    expect(region.textContent).toContain('1 section · 0 approved or locked · 1 in review · 0 draft · 0 not assessed');
    expect(document.body.textContent).toContain('Pack quality');
  });

  it('shows actual tracking module percentage and all its section labels separately', () => {
    show(read());
    const region = screen.getByRole('region', { name: 'Section tracking' });
    expect(region.textContent).toContain('Module 3 · Quality');
    expect(region.textContent).toContain('50%');
    expect(region.textContent).toContain('3.2.P.5 Control of drug product');
    expect(region.textContent).toContain('3.2.P.8 Stability');
    expect(screen.getByTestId('pj-lmod').textContent).toContain('0%');
  });

  it('publishes artifact counts, section dates, tracking labels and their separate bases to AnA', () => {
    expect(dossierFacts(read())).toMatchObject({ dossier: { artifactReadiness, supportingReadiness: { sectionTracking } } });
    expect((dossierFacts(read()) as { dossier: { supportingReadiness: object } }).dossier.supportingReadiness).toEqual({ sectionTracking });
  });

  it('preserves independent failed/unprovisioned states rather than reporting empty or zero', () => {
    const r = read({ artifactReadiness: { basis: 'governed_artifacts', state: 'unavailable', reason: 'Artifact records could not be read.', sections: null, summary: null }, sectionTracking: { basis: 'section_tracking', modules: null, unmapped: null, state: 'unavailable', code: 'STORE_UNAVAILABLE', reason: 'Section tracking is not provisioned.' } });
    show(r);
    expect(screen.getByText('Artifact records could not be read.')).toBeTruthy();
    expect(screen.getByText('Section tracking is not provisioned.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('0 approved or locked');
    expect(document.body.textContent).not.toContain('No tracked sections');
    expect(dossierFacts(r)).toMatchObject({ dossier: { supportingReadiness: r.state.data?.supportingReadiness } });
  });

  it('calls an older or malformed supporting response unavailable, with no fabricated empty counts', () => {
    show(read({ artifactReadiness: { state: 'read', sections: [null] }, sectionTracking: null }));
    expect(screen.getByText('Section tracking is unavailable.')).toBeTruthy();
    expect(screen.getByText('Artifact section status is unavailable.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('0 approved or locked');
  });

  it('states unknown artifact status and unknown counts without presenting it as ready', () => {
    const unknown = { ...artifactReadiness, sections: [{ ...artifactReadiness.sections[0], status: 'not_assessed', artifactCount: 5, unknownCount: 1 }], summary: { ...artifactReadiness.summary, inProgressSections: 0, notAssessedSections: 1 } };
    show(read({ artifactReadiness: unknown, sectionTracking }));
    const region = screen.getByRole('region', { name: 'Artifact section status' });
    expect(within(region).getByText('Not assessed')).toBeTruthy();
    expect(region.textContent).toContain('1 not assessed');
    expect(region.textContent).toContain('0 / 2 / 1 / 1 / 1');
  });

  it('withholds both loaded sources after the whole dossier read fails', () => {
    const r = read();
    r.state.error = 'The dossier read failed.';
    show(r);
    expect(screen.getByText('Artifact section status could not be read.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Section tracking' }).textContent).toContain('Section tracking could not be read.');
    expect(screen.queryByRole('table')).toBeNull();
    expect(document.body.textContent).not.toMatch(/0 approved or locked|1 in review|50%/);
    expect(dossierFacts(r)).toEqual({ dossier: null, dossierUnavailable: 'the dossier read failed' });
  });
});
