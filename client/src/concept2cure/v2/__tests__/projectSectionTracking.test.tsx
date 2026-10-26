/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModuleCompletion, dossierFacts, type DossierState } from '../surfaces/ProjectDossier';

afterEach(cleanup);
const measured = () => ({
  basis: 'section_tracking', state: 'measured',
  modules: [{ m: '2', label: 'CTD summaries', counted: 2, complete: 1, unknownCount: 0, pct: 50, tone: 'warn',
    sections: [
      { code: 'm2.5', title: 'Clinical Overview', status: 'signed', label: '2.5 Clinical Overview', observedStatuses: ['signed'] },
      { code: 'm2.7', title: 'Clinical Summary', status: 'drafting', label: '2.7 Clinical Summary', observedStatuses: ['drafting'] },
    ],
  }], unmapped: [],
});
function read(sectionTracking: unknown = measured()): DossierState {
  return { retry: vi.fn(), state: { loading: false, empty: false, data: {
    projectId: 'project-a', measuredAt: '2026-10-26T20:00:00.000Z',
    home: { state: 'measured', pct: 67, complete: 2, counted: 3 }, markets: [], rows: [],
    ...({ sectionTracking } as object),
  } } };
}
function mount(r: DossierState) {
  return render(<ModuleCompletion read={r} docForModule={() => null} onOpen={vi.fn()} />);
}
const panel = () => screen.getByRole('region', { name: 'Section tracking' });

describe('recorded tracking sections reached through Author', () => {
  it('shows module figures, tracked labels and signed state alongside the independent document view', () => {
    mount(read());
    const view = panel();
    expect(view.textContent).toContain('Module 2 · CTD summaries');
    expect(view.textContent).toContain('1 of 2 tracked sections complete');
    expect(view.textContent).toContain('50%');
    expect(view.textContent).toContain('2.5 Clinical Overview');
    expect(view.textContent).toContain('2.7 Clinical Summary');
    expect(view.textContent).toContain('Signed');
    expect(view.textContent).toContain('Drafting');
    expect(view.textContent).not.toContain('67%');
    expect(screen.getByText('No document sections yet')).toBeTruthy();
  });

  it('gives AnA the same labelled tracking source without replacing governed figures', () => {
    const facts = dossierFacts(read()) as any;
    expect(facts.dossier.sectionTracking).toEqual(measured());
    expect(facts.dossier.home).toEqual({ state: 'measured', pct: 67, counted: 3, complete: 2 });
    expect(facts.dossier.artifactReadiness).toBeNull();
  });

  it('keeps a raw alias record separate from another saved tracking row', () => {
    const p = measured();
    p.modules[0].sections[1] = { ...p.modules[0].sections[1], code: '2.5', title: 'A second saved record', label: '2.5 A second saved record' };
    mount(read(p));
    expect(panel().textContent).toContain('2.5 Clinical Overview');
    expect(panel().textContent).toContain('2.5 A second saved record');
    expect(panel().textContent).toContain('1 of 2 tracked sections complete');
  });

  it('preserves unknown duplicate observations and withholds dependent completion', () => {
    const p = measured();
    Object.assign(p.modules[0], { complete: 0, unknownCount: 1, pct: null, tone: null });
    p.modules[0].sections[0] = { ...p.modules[0].sections[0], status: 'future_state', observedStatuses: ['signed', 'future_state'] };
    const r = read(p);
    mount(r);
    expect(panel().textContent).toContain('Completion not assessed');
    expect(panel().textContent).toContain('future_state');
    expect(panel().textContent).not.toMatch(/\d+%/);
    expect((dossierFacts(r) as any).dossier.sectionTracking).toEqual(p);
  });

  it('shows unmapped records instead of guessing a module or reporting an empty map', () => {
    const p = { ...measured(), modules: [], unmapped: [{ code: '4.2.1', title: 'Tracked report', status: 'signed', label: '4.2.1 Tracked report', module: 'M3', reason: 'MODULE_MISMATCH' }] };
    const r = read(p);
    mount(r);
    expect(panel().textContent).toContain('Unmapped tracking records');
    expect(panel().textContent).toContain('4.2.1 Tracked report');
    expect(panel().textContent).toContain('M3');
    expect(panel().textContent).not.toContain('No tracked sections yet');
    expect((dossierFacts(r) as any).dossier.sectionTracking).toEqual(p);
  });

  it.each(['unavailable', 'unanchored'])('preserves %s with its source reason', state => {
    const p = { basis: 'section_tracking', state, reason: 'Tracking records cannot be read for this project.', modules: null, unmapped: null };
    const r = read(p);
    mount(r);
    expect(panel().textContent).toContain(p.reason);
    expect(panel().textContent).not.toMatch(/0%|No tracked sections yet/);
    expect((dossierFacts(r) as any).dossier.sectionTracking).toEqual(p);
  });

  it('shows an explicitly measured empty tracking store', () => {
    mount(read({ basis: 'section_tracking', state: 'no_sections', modules: [], unmapped: [] }));
    expect(panel().textContent).toContain('No tracked sections yet.');
    expect(panel().textContent).not.toMatch(/\d+%/);
  });

});

describe('tracking response validation and unavailable states', () => {
  it.each([undefined, null, { ...measured(), modules: null }, { ...measured(), modules: [{ ...measured().modules[0], pct: 100 }] }, { ...measured(), modules: [{ ...measured().modules[0], complete: '1' }] }, { ...measured(), state: 'no_sections' }])('withholds missing, malformed or contradictory tracking facts', p => {
    const r = read(p);
    if (p === undefined) delete (r.state.data as any).sectionTracking;
    mount(r);
    expect(panel().textContent).toContain('Section tracking is unavailable.');
    expect(panel().textContent).not.toMatch(/\d+%/);
    expect((dossierFacts(r) as any).dossier.sectionTracking).toBeNull();
  });

  it('withholds a ready-looking module that contains an unknown observation', () => {
    const p = measured();
    p.modules[0].sections[0].observedStatuses.push('__proto__');
    mount(read(p));
    expect(panel().textContent).toContain('Section tracking is unavailable.');
    expect(panel().textContent).not.toMatch(/50%|100%/);
  });

  it.each(['section', 'module', 'unmapped'])('withholds a contradictory %s label from the screen and AnA', kind => {
    const p = measured();
    if (kind === 'section') p.modules[0].sections[0].label = '4.2.1 A different section';
    else if (kind === 'module') p.modules[0].label = 'Quality';
    else Object.assign(p, { modules: [], unmapped: [{ code: '4.2.1', title: 'Tracked report', status: 'signed', label: 'Another record', module: 'M3', reason: 'MODULE_MISMATCH' }] });
    const r = read(p);
    mount(r);
    expect(panel().textContent).toContain('Section tracking is unavailable.');
    expect((dossierFacts(r) as any).dossier.sectionTracking).toBeNull();
  });

  it('withholds a module-mismatch reason when the recorded code and module agree', () => {
    const p = { ...measured(), modules: [], unmapped: [{ code: 'm2.5', title: 'Clinical Overview', status: 'signed', label: '2.5 Clinical Overview', module: 'M2', reason: 'MODULE_MISMATCH' }] };
    mount(read(p));
    expect(panel().textContent).toContain('Section tracking is unavailable.');
  });

  it('states loading independently of an empty map', () => {
    const r = read(); r.state.data = null; r.state.loading = true;
    mount(r);
    expect(panel().textContent).toContain('Reading section tracking…');
    expect(panel().textContent).not.toContain('No tracked sections yet');
  });

  it('retires stale tracking facts on read failure and offers Retry', () => {
    const r = read(); r.state.error = 'failed';
    mount(r);
    expect(panel().textContent).toContain('Section tracking could not be read.');
    expect(panel().textContent).not.toContain('Clinical Overview');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Retry' }));
    expect(r.retry).toHaveBeenCalledOnce();
    expect(dossierFacts(r)).toEqual({ dossier: null, dossierUnavailable: 'the dossier read failed' });
  });
});
