// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
vi.mock('../surfaces/PlanAssign', () => ({ usePlanAssignments: () => ({ byDeliverable: new Map() }), AssignAction: () => null, AssignmentLine: () => null }));
vi.mock('../editor/IndDocumentLibrary', () => ({ IndFilingPlan: () => <div>Existing IND plan</div> }));
import { ProjectPlan } from '../surfaces/ProjectPlan';
const props = { pid: 'program-one', usInd: true, cmcComposes: false, deviceFiling: false, otherFilings: [], marketsState: 'ready' as const,
  projectId: 21, available: () => false, onNav: vi.fn(), onStage: vi.fn(), onAsk: vi.fn(), onOpenDocument: vi.fn(), team: null, tasks: null };
const program = { id: 'program-one', name: 'Recorded project', program_type: 'ind', primary_agency: 'FDA' };
afterEach(cleanup);
describe('Plan reaches the same authored filing lifecycle reference', () => {
  it('uses the recorded exact filing rather than inferring it from the application type', () => {
    render(<ProjectPlan {...props} prog={{ ...program, submission_type_id: 'us_ind' }} />);
    expect(screen.getByText('Existing IND plan')).toBeTruthy();
    const reference = screen.getByTestId('filing-lifecycle-reference');
    expect(reference.textContent).toContain('IND: 30-day default review');
    expect(reference.textContent).toContain('Clinical Hold');
    expect(reference.textContent).toMatch(/not this project.s status, deadline or agency commitment/i);
  });
  it.each([undefined, null, 'unknown_stored_filing'])('does not infer a lifecycle from IND when exact filing is %s', id => {
    render(<ProjectPlan {...props} prog={{ ...program, submission_type_id: id }} />);
    expect(screen.queryByTestId('filing-lifecycle-reference')).toBeNull();
    expect(screen.getByText('Existing IND plan')).toBeTruthy();
  });
  it('does not let an unknown prior project reference survive a changed project read', () => {
    const view = render(<ProjectPlan {...props} prog={{ ...program, submission_type_id: 'us_ind' }} />);
    expect(screen.getByTestId('filing-lifecycle-reference')).toBeTruthy();
    view.rerender(<ProjectPlan {...props} pid="program-two" prog={{ ...program, id: 'program-two', submission_type_id: null }} />);
    expect(screen.queryByTestId('filing-lifecycle-reference')).toBeNull();
  });
});
