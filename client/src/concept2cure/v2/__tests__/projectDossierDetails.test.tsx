/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DossierReadinessCard, ModuleCompletion, dossierFacts, type DossierState, type RowCopy } from '../surfaces/ProjectDossier';

afterEach(cleanup);

const updated = '2026-10-25T14:32:00.000Z';
const sections = [
  { key: '2.4', label: 'Nonclinical overview', status: 'review' },
  { key: '2.5', label: 'Clinical overview', status: 'drafted' },
];
function read(): DossierState {
  return {
    retry: vi.fn(),
    state: {
      loading: false, empty: false,
      data: {
        projectId: 'project', measuredAt: updated,
        home: { state: 'measured', pct: 0, complete: 0, counted: 2 }, markets: [],
        rows: [{
          group: 'module', module: '2', agency: null, documentId: 'home', label: 'Pack summaries',
          counted: 2, complete: 0, inReview: 1, drafted: 1,
          figure: { state: 'measured', pct: 0, complete: 0, counted: 2 }, lastUpdated: updated, sections,
        }],
      },
    },
  };
}

describe('the existing dossier details on Author', () => {
  it('gives AnA counted section facts and the recorded module update date', () => {
    const facts = dossierFacts(read()) as { dossier: { rows: unknown[] } };
    expect(facts.dossier.rows[0]).toMatchObject({ sections, lastUpdated: updated });
  });

  it('shows read-only section status and a valid update time without changing the editor handoff', () => {
    const onOpen = vi.fn();
    const doc = { id: 'authoring-doc', title: 'Existing clinical overview' } as any;
    render(<ModuleCompletion read={read()} copyFor={() => ({ kind: 'one', doc })} onOpen={onOpen} />);
    const details = screen.getByText('Section status', { selector: 'summary' }).closest('details')!;
    fireEvent.click(within(details).getByText('Section status'));
    expect(details.textContent).toContain('2.4');
    expect(details.textContent).toContain('Nonclinical overview');
    expect(details.textContent).toContain('In review');
    expect(details.textContent).toContain('Clinical overview');
    expect(details.textContent).toContain('Drafted');
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(updated);
    expect(document.querySelector('time')?.parentElement?.textContent).toBe(`Updated ${new Date(updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Open Existing clinical overview/ }));
    expect(onOpen).toHaveBeenCalledWith(doc, 'M2'); // the row's module rides along (F3)
  });

  it('prints home review and draft totals without pooling the added market', () => {
    const r = read();
    r.state.data!.rows.push({ ...r.state.data!.rows[0], documentId: 'market', agency: 'ema', inReview: 30, drafted: 40 });
    render(<DossierReadinessCard read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
    expect(screen.getByText('1 in review · 1 drafted')).toBeTruthy();
    expect(document.body.textContent).not.toContain('31 in review');
    expect(document.body.textContent).not.toContain('41 drafted');
    expect(screen.getByTestId('pj-dossier-value').textContent).toBe('0%');
  });

  it('hands the existing critical-path question to AnA without opening a document', () => {
    const onAsk = vi.fn();
    const onOpen = vi.fn();
    render(<ModuleCompletion read={read()} copyFor={() => ({ kind: 'none' })} onOpen={onOpen} onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /critical path to filing/i }));
    expect(onAsk).toHaveBeenCalledWith('What is the critical path to filing?');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not turn an unreadable or empty dossier into summary zero counts', () => {
    const r = read();
    r.state.data!.home = { state: 'unavailable', pct: null, reason: 'Store unavailable.' };
    r.state.data!.rows = [];
    render(<DossierReadinessCard read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
    expect(screen.getByText('Store unavailable.')).toBeTruthy();
    expect(screen.queryByText(/in review.*drafted/)).toBeNull();
    expect(dossierFacts({ ...r, state: { ...r.state, data: null, error: 'read failed' } })).toEqual({ dossier: null, dossierUnavailable: 'the dossier read failed' });
  });

  it('the home line asks for the one home document\'s copy, and with no home document it has no door', () => {
    const copyFor = vi.fn((): RowCopy => ({ kind: 'none' }));
    const view = render(<DossierReadinessCard read={read()} copyFor={copyFor} onOpen={vi.fn()} />);
    expect(copyFor).toHaveBeenCalledWith('home');
    expect(screen.getByTestId('pj-dossier-home-copy').textContent).toBe('No editing copy of this filing yet.');
    view.unmount();
    const r = read();
    r.state.data!.home = { state: 'unavailable', pct: null, reason: 'Store unavailable.' };
    r.state.data!.rows = [];
    render(<DossierReadinessCard read={r} copyFor={copyFor} onOpen={vi.fn()} />);
    expect(screen.getByTestId('pj-dossier-home').textContent, 'a door or copy words for no document').toBe('Store unavailable.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('states missing details and update time honestly, and preserves unknown statuses', () => {
    const r = read();
    r.state.data!.rows[0].lastUpdated = 'invalid';
    r.state.data!.rows[0].sections = undefined;
    const view = render(<ModuleCompletion read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
    expect(screen.getByText('Section details unavailable.')).toBeTruthy();
    expect(screen.getByText('Update time not recorded.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Invalid Date|0 sections/);
    expect((dossierFacts(r) as any).dossier.rows[0].sections).toBeNull();
    r.state.data!.rows[0].sections = [{ key: '2.4', label: 'Nonclinical overview', status: 'future-status' }];
    view.rerender(<ModuleCompletion read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
    expect(screen.getByText('future-status')).toBeTruthy();
  });

  it('prints prototype-like unknown statuses literally', () => {
    const r = read();
    r.state.data!.rows[0].sections = [{ key: '2.4', label: 'Nonclinical overview', status: '__proto__' }];
    render(<ModuleCompletion read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
    expect(screen.getByText('__proto__')).toBeTruthy();
  });

  it('does not present malformed section details as an empty list', () => {
    const r = read();
    r.state.data!.rows[0].sections = [{ key: '2.4', label: 'Nonclinical overview', status: null }] as any;
    render(<ModuleCompletion read={r} copyFor={() => ({ kind: 'none' })} onOpen={vi.fn()} />);
    expect(screen.getByText('Section details unavailable.')).toBeTruthy();
    expect(screen.queryByText('Section status')).toBeNull();
    expect((dossierFacts(r) as any).dossier.rows[0].sections).toBeNull();
  });
});
