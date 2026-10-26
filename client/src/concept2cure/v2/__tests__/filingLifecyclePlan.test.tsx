/** @vitest-environment jsdom */
/** The recorded project, rather than its broad pathway, selects its reference. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../editor/IndDocumentLibrary', () => ({ IndFilingPlan: () => <p data-testid="existing-ind-plan">Recorded IND deliverables</p> }));
vi.mock('../surfaces/PlanAssign', () => ({
  usePlanAssignments: () => ({ byDeliverable: new Map(), error: null }),
  AssignmentLine: () => null, AssignAction: () => null,
}));
vi.mock('../surfaces/ProjectMdxWorkflow', () => ({ mdxProjectPlan: () => null, ProjectMdxWorkflow: () => null }));
vi.mock('../surfaces/ProjectComingLater', () => ({ ComingLater: () => null }));

import { ProjectPlan } from '../surfaces/ProjectPlan';

type Projection = NonNullable<React.ComponentProps<typeof ProjectPlan>['prog']> & { submission_type_id?: string | null };
const PID = '6191805f-e83d-4327-af00-aa2c6f4d43b0';
const recorded: Projection = { id: PID, name: 'Recorded drug project', program_type: 'ind', primary_agency: 'FDA',
  product_type: 'drug', submission_type_id: 'us_ind', target_submission_date: '2027-03-31' };
function mount(overrides: Partial<Projection> = {}) {
  const prog = { ...recorded, ...overrides };
  return render(<ProjectPlan pid={PID} prog={prog} usInd={prog.program_type === 'ind' && prog.primary_agency === 'FDA'}
    cmcComposes={false} deviceFiling={false} otherFilings={[]} marketsState="ready" projectId={42}
    available={() => false} onNav={vi.fn()} onStage={vi.fn()} onAsk={vi.fn()} onOpenDocument={vi.fn()}
    team={<p>Existing project team</p>} tasks={<p>Existing project tasks</p>} />);
}
afterEach(cleanup);
const reference = () => screen.getByRole('region', { name: 'Filing lifecycle reference' });

describe('the selected project filing reference is reached on Plan', () => {
  it('reaches the existing US IND guide while preserving the actual filing plan, team and tasks', () => {
    mount();
    const region = reference();
    expect(within(region).getByText(/Authored filing-family guidance/)).toBeTruthy();
    const summary = within(region).getByText('Reference guide');
    const details = summary.closest('details');
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(region.textContent).toContain('Clinical-trial authorization');
    expect(region.textContent).toContain('Pre-IND meeting');
    expect(region.textContent).toContain('Clinical Hold');
    expect(region.textContent).toMatch(/30.day/);
    expect(within(region).queryByRole('progressbar')).toBeNull();
    expect(screen.getByTestId('existing-ind-plan')).toBeTruthy();
    expect(screen.getByText('Existing project team')).toBeTruthy();
    expect(screen.getByText('Existing project tasks')).toBeTruthy();
    expect(screen.getByText(/Target submission/)).toBeTruthy();
  });

  it.each([
    ['missing exact identity', { submission_type_id: undefined }],
    ['null exact identity', { submission_type_id: null }],
    ['generic alias', { submission_type_id: 'IND' }],
    ['unknown identity', { submission_type_id: 'not_a_filing' }],
    ['conflicting agency', { primary_agency: 'EMA' }],
    ['unrecorded agency', { primary_agency: null }],
    ['conflicting program type', { program_type: 'nda' }],
  ] as const)('withholds a selected guide for %s without removing the core Plan', (_label, overrides) => {
    mount(overrides);
    const region = reference();
    expect(region.textContent).toContain('No filing lifecycle guide is available for this recorded filing.');
    expect(region.textContent).not.toMatch(/Pre-IND meeting|Clinical Hold|30.day/);
    expect(screen.getByTestId('pj-plan')).toBeTruthy();
    expect(screen.getByText('Existing project team')).toBeTruthy();
    expect(screen.getByText('Existing project tasks')).toBeTruthy();
  });
});
