/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectTeamMember, ProjectTeamResponse } from '@shared/project-team';
import type { DataState } from '../dataConnect';
import { ProjectTeamResponsibilities } from '../surfaces/ProjectTeamResponsibilities';

const PID = '11111111-1111-4111-8111-111111111111';
const members: ProjectTeamMember[] = [
  { user_id: 7, entry_id: 'user:7', identity: 'active_member', label: 'Alex Chen · Account #7', name: 'Alex Chen',
    email: 'alex7@example.test', role: 'lead', responsibilities: ['project_lead'], sharing_role: 'use', sources: ['program_lead', 'project_member'] },
  { user_id: 8, entry_id: 'user:8', identity: 'active_member', label: 'Alex Chen · Account #8', name: 'Alex Chen',
    email: 'alex8@example.test', role: null, responsibilities: ['project_owner'], sharing_role: 'owner', sources: ['project_owner', 'project_creator'] },
  { user_id: 9, entry_id: 'user:9', identity: 'unconfirmed_account', label: 'Account #9 — Current membership not confirmed',
    name: null, email: null, role: 'lead', responsibilities: ['project_lead'], sharing_role: null, sources: ['program_lead'] },
  { user_id: null, entry_id: 'recorded-name:0', identity: 'recorded_name', label: 'Alex Chen', name: 'Alex Chen',
    email: null, role: null, responsibilities: [], sharing_role: null, sources: ['recorded_name'] },
];
const data = (team = members): ProjectTeamResponse => ({ program_id: PID, project_id: 51, team });
const state = (over: Partial<DataState<ProjectTeamResponse>> = {}): DataState<ProjectTeamResponse> => ({ data: data(), loading: false, empty: false, ...over });
afterEach(cleanup);

describe('project responsibility panel', () => {
  it('keeps same-name accounts distinct, sources responsibility and labels sharing separately', () => {
    render(<ProjectTeamResponsibilities programId={PID} state={state()} />);
    const rows = within(screen.getByRole('list', { name: 'Recorded project team' })).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText('Alex Chen · Account #7')).toBeTruthy();
    expect(within(rows[1]).getByText('Alex Chen · Account #8')).toBeTruthy();
    expect(within(rows[0]).getByText('Project lead', { exact: true })).toBeTruthy();
    expect(within(rows[1]).getByText('Project owner', { exact: true })).toBeTruthy();
    expect(within(rows[0]).getByText('Sharing: Use')).toBeTruthy();
    expect(within(rows[1]).getByText('Sharing: Owner')).toBeTruthy();
    expect(within(rows[1]).getByText('Project owner, Project creator')).toBeTruthy();
    expect(screen.getByText(/do not grant universal editing or approval\/signing authority/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('explicitly states unconfirmed membership and name-only records without fabricated assignments', () => {
    render(<ProjectTeamResponsibilities programId={PID} state={state()} />);
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[2]).getByText('Current membership not confirmed', { exact: true })).toBeTruthy();
    expect(within(rows[2]).getByText('Sharing not confirmed')).toBeTruthy();
    expect(within(rows[3]).getByText('Recorded name only; account not linked')).toBeTruthy();
    expect(within(rows[3]).getByText('None recorded')).toBeTruthy();
    expect(within(rows[3]).getByText('A recorded name grants no access or responsibility.')).toBeTruthy();
    expect(rows[3].textContent).not.toMatch(/Sharing:|Project lead|Project owner|Approver|Reviewer|assigned on/i);
  });

  it('keeps creator provenance separate from recorded responsibility', () => {
    const creator: ProjectTeamMember = { ...members[1], responsibilities: [], sources: ['project_creator'] };
    render(<ProjectTeamResponsibilities programId={PID} state={state({ data: data([creator]) })} />);
    expect(screen.getByText('None recorded')).toBeTruthy();
    expect(screen.getByText('Project creator')).toBeTruthy();
    expect(screen.queryByText('Project owner', { exact: true })).toBeNull();
  });

  it('announces loading and a verified empty roster distinctly', () => {
    const view = render(<ProjectTeamResponsibilities programId={PID} state={state({ loading: true })} />);
    expect(screen.getByRole('status').textContent).toBe('Loading team…');
    expect(screen.queryByRole('list')).toBeNull();
    view.rerender(<ProjectTeamResponsibilities programId={PID} state={state({ data: data([]) })} />);
    expect(screen.getByText('No recorded team members')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    { error: 'HTTP 503' }, { data: null }, { data: { ...data(), program_id: 'other' } },
    { data: data([]), meta: { pendingStore: true } },
    { data: { ...data(), team: [{ ...members[0], sharing_role: 'approve' }] } as never },
  ])('fails closed for unverified read %j and offers a real read retry', over => {
    const retry = vi.fn();
    render(<ProjectTeamResponsibilities programId={PID} state={state(over)} onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load the project team");
    expect(screen.queryByText('No recorded team members')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry team' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
