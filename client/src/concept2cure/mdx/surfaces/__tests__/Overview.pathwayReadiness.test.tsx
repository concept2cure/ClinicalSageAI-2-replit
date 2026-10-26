// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Program } from '../../data/programs';
import { Overview } from '../Overview';

vi.mock('../../components/ClientReviewZone', () => ({ ClientReviewZone: () => null }));
const row = (id: string, pathway = 'k510', readiness: number | null = null) => ({
  id, title: `Device ${id}`, code: id, pathway, readiness, stage: 'Planning', stageIdx: 0,
  status: 'idle', lead: '', owners: [], nextBlocker: null, dueLabel: 'No target set',
  dueTone: 'ok', lastActivity: 'Now', meta: '',
}) as Program;
const mount = (programs: Program[]) => render(<Overview programs={programs} onOpenProgram={vi.fn()} onAskAna={vi.fn()} onNewProject={vi.fn()} />);
const average = () => document.querySelectorAll('.health-card')[1];
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('device portfolio pathway visibility and absent readiness', () => {
  it('states Not recorded for a fresh device project and no readiness bar', () => {
    mount([row('fresh')]);
    expect(average()?.textContent).toContain('Not recorded');
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
    expect(document.querySelectorAll('.pg-bar-fill')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/0%|null%/);
  });
  it('does not average an absent figure as zero, and states measured coverage', () => {
    mount([row('measured', 'pma', 40), row('unset')]);
    expect(average()?.querySelector('.health-metric')?.textContent).toBe('40%');
    expect(average()?.textContent).toMatch(/1 of 2/);
  });
  it('lets a person filter IDE, regional and Other rows in grid and list', () => {
    mount([row('ide', 'ide'), row('regional', 'mdl'), row('unknown', 'other'), row('ivdr', 'ivdr')]);
    fireEvent.click(screen.getByRole('button', { name: /^IDE 1$/ }));
    expect(screen.getByText('Device ide')).toBeTruthy();
    expect(screen.queryByText('Device regional')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^MDL 1$/ }));
    expect(screen.getByText('Device regional')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Other 1$/ }));
    expect(screen.getByText('Device unknown')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(document.querySelector('.pg-list-row')?.textContent).toContain('Other');
    expect(document.querySelector('.pg-list-row')?.textContent).toContain('Not recorded');
  });
});
