/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModuleCompletion, dossierFacts, type DossierState } from '../surfaces/ProjectDossier';

afterEach(cleanup);
const updated = '2026-10-26T14:32:00.000Z';
const measured = () => ({
  basis: 'governed_artifacts', state: 'measured',
  sections: [{
    ctdSection: '3.2.S.1', artifactCount: 3, draftCount: 1, reviewCount: 1,
    approvedCount: 1, lockedCount: 0, unknownCount: 0, status: 'draft', lastUpdated: updated,
  }],
  summary: { totalSections: 1, readySections: 0, inProgressSections: 0, draftSections: 1, notAssessedSections: 0 },
});
function read(artifactReadiness: unknown = measured()): DossierState {
  return {
    retry: vi.fn(), state: { loading: false, empty: false, data: {
      projectId: 'project-a', measuredAt: updated,
      home: { state: 'measured', pct: 67, complete: 2, counted: 3 }, markets: [], rows: [],
      ...({ artifactReadiness } as object),
    } },
  };
}
function mount(r: DossierState) {
  return render(<ModuleCompletion read={r} docForModule={() => null} onOpen={vi.fn()} />);
}
const panel = () => screen.getByRole('region', { name: 'Artifact section status' });

describe('artifact facts carried into the existing Author workflow', () => {
  it('shows artifact state, all lifecycle counts and the section date even with no governed module rows', () => {
    mount(read());
    const view = panel();
    const row = within(view).getByRole('row', { name: /3\.2\.S\.1/ });
    expect(within(row).getAllByRole('cell').map(c => c.textContent)).toEqual([
      '3.2.S.1', '3', '1 / 1 / 1 / 0 / 0', new Date(updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), 'Draft',
    ]);
    expect(row.querySelector('time')?.getAttribute('datetime')).toBe(updated);
    expect(view.textContent).toContain('1 section · 0 approved or locked · 0 in review · 1 draft · 0 not assessed');
    expect(view.textContent).toMatch(/weakest/i);
    expect(view.textContent).not.toMatch(/\d+%/);
    expect(screen.getByText('No document sections yet')).toBeTruthy();
  });

  it('gives AnA the same source-labelled artifact facts without changing governed readiness', () => {
    const facts = dossierFacts(read()) as any;
    expect(facts.dossier.artifactReadiness).toEqual(measured());
    expect(facts.dossier.home).toEqual({ state: 'measured', pct: 67, complete: 2, counted: 3 });
  });

  it.each(['unavailable', 'unanchored'])('preserves %s as a reason, never empty or ready', state => {
    const payload = { basis: 'governed_artifacts', state, reason: 'Artifact records cannot be read for this project.', sections: null, summary: null };
    const r = read(payload);
    mount(r);
    expect(panel().textContent).toContain(payload.reason);
    expect(within(panel()).queryByRole('table')).toBeNull();
    expect(panel().textContent).not.toMatch(/0 approved|No sectioned artifacts/);
    expect((dossierFacts(r) as any).dossier.artifactReadiness).toEqual(payload);
  });

  it('states a measured empty artifact source independently of the governed section source', () => {
    const payload = { ...measured(), state: 'no_artifacts', sections: [], summary: { totalSections: 0, readySections: 0, inProgressSections: 0, draftSections: 0, notAssessedSections: 0 } };
    mount(read(payload));
    expect(panel().textContent).toContain('No sectioned artifacts yet.');
    expect(panel().textContent).not.toMatch(/0%|ready for filing/);
  });

  it.each([undefined, null, { ...measured(), summary: null }, { ...measured(), sections: [{ ...measured().sections[0], artifactCount: '3' }] }, { ...measured(), sections: [{ ...measured().sections[0], status: '__proto__' }] }])('withholds malformed or missing artifact detail', payload => {
    const r = read(payload);
    // Passing undefined must simulate a response from before this field existed.
    if (payload === undefined) delete (r.state.data as any).artifactReadiness;
    mount(r);
    expect(panel().textContent).toContain('Artifact section status is unavailable.');
    expect(within(panel()).queryByRole('table')).toBeNull();
    expect((dossierFacts(r) as any).dossier.artifactReadiness).toBeNull();
  });

  it('shows unassessed artifact state and unknown count without promoting the section', () => {
    const p = measured();
    p.sections[0] = { ...p.sections[0], status: 'not_assessed', unknownCount: 1, draftCount: 0, lastUpdated: null as any };
    p.summary = { totalSections: 1, readySections: 0, inProgressSections: 0, draftSections: 0, notAssessedSections: 1 };
    mount(read(p));
    expect(within(panel()).getByRole('cell', { name: 'Not assessed' })).toBeTruthy();
    expect(panel().textContent).toContain('0 / 1 / 1 / 0 / 1');
    expect(panel().textContent).toContain('Update time not recorded.');
  });

  it.each(['state', 'summary'])('withholds a contradictory %s instead of reporting artifacts as ready', kind => {
    const p = measured();
    if (kind === 'state') p.sections[0].status = 'locked';
    else p.summary = { ...p.summary, readySections: 1, draftSections: 0 };
    const r = read(p);
    mount(r);
    expect(panel().textContent).toContain('Artifact section status is unavailable.');
    expect(within(panel()).queryByRole('table')).toBeNull();
    expect((dossierFacts(r) as any).dossier.artifactReadiness).toBeNull();
  });

  it('does not reuse loaded artifact facts after the dossier read fails, and offers retry', () => {
    const r = read();
    r.state.error = 'read failed';
    mount(r);
    expect(panel().textContent).toContain('Artifact section status could not be read.');
    expect(within(panel()).queryByRole('table')).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Retry' }));
    expect(r.retry).toHaveBeenCalledOnce();
    expect(dossierFacts(r)).toEqual({ dossier: null, dossierUnavailable: 'the dossier read failed' });
  });

  it('states loading rather than showing an empty artifact result', () => {
    const r = read();
    r.state.data = null;
    r.state.loading = true;
    mount(r);
    expect(panel().textContent).toContain('Reading artifact section status…');
    expect(panel().textContent).not.toContain('No sectioned artifacts');
  });
});
