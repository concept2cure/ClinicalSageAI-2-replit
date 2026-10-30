// @vitest-environment jsdom
/**
 * Job roles and who must train on a controlled document, in the Quality register
 * (P-49, P-50 Q3; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.12, slices
 * 1 and 2). The panels read the server's listings and change them only through
 * the governed routes, each change with its reason. A failed read is said, never
 * shown as "no roles" or "nobody assigned"; only the acts the server admits are
 * offered; a refusal is shown in the server's words and nothing is assumed.
 * Server half: tests/db/qms-job-roles.dbtest.ts, qms-training-assignments*.dbtest.ts.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  jobRoles: { listing: null as unknown, failed: false, error: null as string | null, refresh: vi.fn() },
  assignments: { listing: null as unknown, failed: false, error: null as string | null, refresh: vi.fn() },
  assignmentsFor: [] as number[],
}));
vi.mock('../hooks', async (original) => ({
  ...await original<typeof import('../hooks')>(),
  useJobRoles: () => H.jobRoles,
  useTrainingAssignments: (documentId: number) => { H.assignmentsFor.push(documentId); return H.assignments; },
}));
vi.mock('@/lib/queryClient', async (original) => ({
  ...await original<typeof import('@/lib/queryClient')>(),
  apiRequest: (...args: unknown[]) => H.apiRequest(...args),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { JobRolesPanel, TrainingAssignmentsPanel } from '../TrainingCoverage';
import type { QmsDoc } from '../data';

const REASON = 'Quality assurance owns this procedure.';
const ok = (data: unknown) => ({ status: 201, ok: true, json: async () => ({ data }) });
const QA = { id: 3, name: 'QA reviewer', description: 'Reviews batch records', documentCount: 1,
  members: [{ userId: 21, label: 'Ana Ortiz', addedAt: '2026-10-01T09:00:00.000Z', active: true },
    { userId: 22, label: 'Ben Lee', addedAt: '2026-10-02T09:00:00.000Z', active: false }] };
const OPS = { id: 4, name: 'Operations', description: null, documentCount: 0, members: [] };
const roles = (over: Record<string, unknown> = {}) => ({
  roles: [QA, OPS], people: [{ userId: 21, label: 'Ana Ortiz' }, { userId: 23, label: 'Cara Diaz' }], canAdminister: true, ...over,
});
const doc = { id: 6, docNumber: 'SOP-015', title: 'Supplier controls', docType: 'sop', status: 'effective', version: '1.0' } as QmsDoc;
const listing = (over: Record<string, unknown> = {}) => ({
  assignments: [
    { id: 11, kind: 'role', jobRoleId: 3, jobRoleName: 'QA reviewer', userId: null, userLabel: null, active: null,
      assignedBy: 1, assignedByLabel: 'Quality lead', assignedAt: '2026-10-03T10:00:00.000Z' },
    { id: 12, kind: 'person', jobRoleId: null, jobRoleName: null, userId: 23, userLabel: 'Cara Diaz', active: true,
      assignedBy: 1, assignedByLabel: 'Quality lead', assignedAt: '2026-10-04T10:00:00.000Z' },
  ],
  trainable: { inForce: { version: '1.0', effectiveDate: '2026-09-01' }, pending: null },
  people: [
    { userId: 21, label: 'Ana Ortiz', via: ['role:3'], coveredSince: '2026-10-03T10:00:00.000Z' },
    { userId: 23, label: 'Cara Diaz', via: ['person'], coveredSince: '2026-10-04T10:00:00.000Z' },
  ],
  peopleCount: 2, peopleScope: 'everyone', canAssign: true, ...over,
});

beforeEach(() => {
  H.apiRequest.mockReset();
  H.jobRoles = { listing: roles(), failed: false, error: null, refresh: vi.fn() };
  H.assignments = { listing: listing(), failed: false, error: null, refresh: vi.fn() };
  H.assignmentsFor = [];
});
afterEach(cleanup);

const giveReason = (form: HTMLElement) => fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: REASON } });

describe('Job roles', () => {
  it('a failed read says so, never "No job roles yet"', () => {
    H.jobRoles = { listing: null, failed: true, error: 'HTTP 500', refresh: vi.fn() };
    render(<JobRolesPanel onClose={() => {}} />);
    expect(screen.getByText('Job roles could not be read')).toBeTruthy();
    expect(screen.queryByText('No job roles yet.')).toBeNull();
  });

  it('a verified empty list says there are none; while loading it says so', () => {
    H.jobRoles = { listing: roles({ roles: [] }), failed: false, error: null, refresh: vi.fn() };
    const { unmount } = render(<JobRolesPanel onClose={() => {}} />);
    expect(screen.getByText('No job roles yet.')).toBeTruthy();
    unmount();
    H.jobRoles = { listing: null, failed: false, error: null, refresh: vi.fn() };
    render(<JobRolesPanel onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Loading job roles…');
  });

  it('lists each role and its holders; someone who is not an administrator is offered no change', () => {
    H.jobRoles = { listing: roles({ canAdminister: false }), failed: false, error: null, refresh: vi.fn() };
    render(<JobRolesPanel onClose={() => {}} />);
    const qa = screen.getByTestId('qms-job-role-3');
    expect(within(qa).getByText('QA reviewer')).toBeTruthy();
    expect(within(qa).getByText(/Ben Lee \(no longer an active member\)/)).toBeTruthy();
    expect(screen.getByText('Only an administrator changes job roles and who holds them.')).toBeTruthy();
    for (const name of ['New job role', 'Rename', 'Delete', 'Remove', 'Add a person']) {
      expect(screen.queryByRole('button', { name: new RegExp(name) })).toBeNull();
    }
  });

  it('an administrator creates a role with its reason, through the governed route, and the list is read again', async () => {
    H.apiRequest.mockResolvedValue(ok({ id: 5, name: 'Validation' }));
    render(<JobRolesPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /New job role/ }));
    const form = screen.getByRole('form', { name: 'New job role' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: ' Validation ' } });
    expect((within(form).getByRole('button', { name: 'Create role' }) as HTMLButtonElement).disabled, 'no reason yet').toBe(true);
    giveReason(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(H.jobRoles.refresh).toHaveBeenCalled());
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/job-roles', { name: 'Validation', reason: REASON });
  });

  it('a refused change shows the server\'s sentence and keeps the form', async () => {
    H.apiRequest.mockRejectedValue(new ApiRequestError('A job role named "QA reviewer" already exists in this organization. Nothing was changed.', 409, {}, 'QMS_JOB_ROLE_EXISTS'));
    render(<JobRolesPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /New job role/ }));
    const form = screen.getByRole('form', { name: 'New job role' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'QA reviewer' } });
    giveReason(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Create role' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('A job role named "QA reviewer" already exists in this organization. Nothing was changed.');
    expect(H.jobRoles.refresh).not.toHaveBeenCalled();
  });

  it('a role assigned to a document cannot be deleted, and says why; removing a holder sends a DELETE with its reason', async () => {
    H.apiRequest.mockResolvedValue(ok({ removed: true }));
    render(<JobRolesPanel onClose={() => {}} />);
    const qa = screen.getByTestId('qms-job-role-3');
    const del = within(qa).getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.title).toBe('Assigned to a document: withdraw those assignments first.');
    fireEvent.click(within(qa).getAllByRole('button', { name: 'Remove' })[0]);
    const form = screen.getByRole('form', { name: 'Remove Ana Ortiz from QA reviewer' });
    giveReason(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('DELETE', '/api/mdx/qms/job-roles/3/members/21', { reason: REASON }));
  });
});

describe('Who must train on a document', () => {
  it('reads this document\'s assignments; a failed read says so, never "Nobody is assigned"', () => {
    H.assignments = { listing: null, failed: true, error: 'HTTP 503', refresh: vi.fn() };
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    expect(H.assignmentsFor).toContain(6);
    expect(screen.getByText('Who must train could not be read')).toBeTruthy();
    expect(screen.queryByText('Nobody is assigned to train on this document.')).toBeNull();
  });

  it('a verified empty list says nobody is assigned, and that training opens with the version in force', () => {
    H.assignments = { listing: listing({ assignments: [], people: [], peopleCount: 0 }), failed: false, error: null, refresh: vi.fn() };
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    expect(screen.getByText('Nobody is assigned to train on this document.')).toBeTruthy();
    expect(screen.getByTestId('qms-assigned-count').textContent).toBe('0 people are assigned.');
    expect(screen.getByText('Version in force: v1.0')).toBeTruthy();
  });

  it('an assigner sees every person and how each is covered', () => {
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    expect(screen.getByTestId('qms-assigned-count').textContent).toBe('2 people are assigned.');
    expect(screen.getByText('through QA reviewer, since 2026-10-03')).toBeTruthy();
    expect(screen.getByText('by name, since 2026-10-04')).toBeTruthy();
  });

  it('anyone else sees the count and their own line, not the names (P-50)', () => {
    H.assignments = { listing: listing({ peopleScope: 'own', peopleCount: 3, canAssign: false,
      people: [{ userId: 21, label: 'Ana Ortiz', via: ['role:3'], coveredSince: '2026-10-03T10:00:00.000Z' }] }), failed: false, error: null, refresh: vi.fn() };
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    expect(screen.getByTestId('qms-assigned-count').textContent).toBe('3 people are assigned. You are assigned through QA reviewer, since 2026-10-03.');
    expect(screen.queryByText(/Cara Diaz,|by name, since/)).toBeNull();
    for (const name of ['Assign a job role', 'Assign a person', 'Withdraw']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByText(/Only an administrator or a designated QMS approver who can edit/)).toBeTruthy();
  });

  it('when whether you may change them could not be checked, it says so and offers nothing', () => {
    H.assignments = { listing: listing({ canAssign: null }), failed: false, error: null, refresh: vi.fn() };
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('Whether you can change these assignments could not be checked. Try again later.');
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('a version approved for a later day is named', () => {
    H.assignments = { listing: listing({ trainable: { inForce: { version: '1.0', effectiveDate: '2026-09-01' }, pending: { version: '2.0', effectiveDate: '2026-11-15' } } }), failed: false, error: null, refresh: vi.fn() };
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    expect(screen.getByText('Version in force: v1.0 · v2.0 takes effect 2026-11-15')).toBeTruthy();
  });

  it('assigns a job role not yet assigned, with its reason; the role already assigned is not offered', async () => {
    H.apiRequest.mockResolvedValue(ok({ id: 13 }));
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign a job role' }));
    const form = screen.getByRole('form', { name: 'Assign a job role' });
    const select = within(form).getByLabelText('Job role') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual(['Choose a job role', 'Operations']);
    fireEvent.change(select, { target: { value: '4' } });
    giveReason(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(H.assignments.refresh).toHaveBeenCalled());
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/6/training-assignments', { jobRoleId: 4, reason: REASON });
  });

  it('withdraws an assignment with its reason; a refusal is shown in the server\'s words', async () => {
    H.apiRequest.mockRejectedValueOnce(new ApiRequestError('This assignment covers you, so another administrator or QMS approver removes it; you still train on SOP-015. Nothing was changed.', 403, {}, 'QMS_TRAINING_SELF_UNASSIGN'));
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Withdraw' })[0]);
    const form = screen.getByRole('form', { name: 'Withdraw job role QA reviewer' });
    giveReason(form);
    fireEvent.click(within(form).getByRole('button', { name: 'Withdraw' }));
    expect((await within(form).findByRole('alert')).textContent).toMatch(/^This assignment covers you/);
    expect(H.apiRequest).toHaveBeenCalledWith('DELETE', '/api/mdx/qms/documents/6/training-assignments/11', { reason: REASON });
  });

  it('when the roles and people cannot be read, nothing can be assigned, and it says so', () => {
    H.jobRoles = { listing: null, failed: true, error: 'HTTP 500', refresh: vi.fn() };
    render(<TrainingAssignmentsPanel doc={doc} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign a person' }));
    expect(screen.getByRole('alert').textContent).toBe('The job roles and people could not be read, so nothing can be assigned now.');
  });
});
