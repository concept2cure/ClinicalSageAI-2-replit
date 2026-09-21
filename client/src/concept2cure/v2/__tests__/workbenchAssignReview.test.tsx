// @vitest-environment jsdom
/**
 * DocumentWorkbench — Assign review and the Tasks rail.
 *
 * The one tasking path (ReviewTasksPanel.tsx header): POST /api/tasks/tasks
 * creates the task with its origin recorded as this document
 * (sourceEntityType 'authoring_document', sourceEntityId <docId>) and the
 * program in moduleData; the rail lists GET /api/tasks/tasks/by-module/Authoring
 * filtered to that origin; Complete is the path's own PATCH transition, and a
 * 428 ESIGN_REQUIRED is reported as the ceremony it is, on the Task board.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { tasksForDocument } from '../editor/ReviewTasksPanel';

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEC = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

/** The task ledger as the mock server holds it. */
let ledger: Array<Record<string, unknown>> = [];
let patch: (taskId: string, body: Record<string, unknown>) => Response;

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (url.startsWith('/api/authoring/docs?')) {
      return ok({ documents: [{ id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'draft', updated_at: null, section_count: 1 }] });
    }
    if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', status: 'draft', provenance: null } });
    if (url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({ sections: [{ id: SEC, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>The product rationale.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
    }
    if (url === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '42', name: 'OQ Signer' }, { id: '1', name: 'Jon Smith' }], total: 2 });
    if (method === 'POST' && url === '/api/tasks/tasks') {
      const row = { id: ledger.length + 1, taskId: `TASK-1758-${ledger.length + 1}`, organizationId: 2, status: body?.status ?? 'pending', assigneeName: body?.assigneeId === 42 ? 'OQ Signer' : null, createdAt: '2026-09-21T18:00:00Z', ...body };
      ledger.push(row);
      return ok({ success: true, data: row });
    }
    if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') {
      return ok({ success: true, data: ledger, count: ledger.length });
    }
    if (method === 'PATCH' && url.startsWith('/api/tasks/tasks/')) return patch(decodeURIComponent(url.slice('/api/tasks/tasks/'.length)), body ?? {});
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true, sources: [], revisions: [], comments: [] });
  });
}

const props = () => ({ surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'C2C-101' };
  ledger = [];
  patch = (taskId, body) => {
    const row = ledger.find(r => r.taskId === taskId);
    if (row) row.status = body.status;
    return ok({ success: true, data: row });
  };
  mockApi();
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('DocumentWorkbench — Assign review', () => {
  it('creates a review task through POST /api/tasks/tasks linked to the document, and the Tasks rail lists it with its state', async () => {
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(await screen.findByTestId('assign-review-open'));
    const dlg = await screen.findByTestId('assign-review-dialog');
    // The roster is the Task board's roster.
    await waitFor(() => expect(within(dlg).getByRole('option', { name: 'OQ Signer' })).toBeTruthy());
    expect((within(dlg).getByTestId('ar-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dlg).getByTestId('ar-assignee'), { target: { value: '42' } });
    fireEvent.change(within(dlg).getByTestId('ar-due'), { target: { value: '2026-10-05' } });
    fireEvent.change(within(dlg).getByTestId('ar-instructions'), { target: { value: 'Check the efficacy claims against the SAP.' } });
    fireEvent.click(within(dlg).getByTestId('ar-submit'));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/tasks/tasks', expect.objectContaining({
      title: 'Review: Module 2.5 Clinical Overview',
      description: 'Check the efficacy claims against the SAP.',
      moduleType: 'Authoring',
      taskType: 'review',
      assigneeId: 42,
      sourceEntityType: 'authoring_document',
      sourceEntityId: DOC,
      moduleData: expect.objectContaining({ authoringDocId: DOC, programId: PID, sectionCode: '2.5.1' }),
    })));
    const sent = apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/tasks/tasks')![2] as Record<string, unknown>;
    expect(String(sent.dueDate)).toMatch(/^2026-10-05T/);

    // The dialog closes and the Tasks rail opens on the created task.
    await waitFor(() => expect(screen.queryByTestId('assign-review-dialog')).toBeNull());
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    const row = await within(rail).findByTestId('rt-row');
    expect(row.textContent).toContain('Review: Module 2.5 Clinical Overview');
    expect(row.textContent).toContain('Assigned');
    expect(row.textContent).toContain('assigned to OQ Signer');
    expect(row.textContent).toContain('due Oct 5, 2026');
    expect(within(rail).getByText('1 open · 1 total')).toBeTruthy();
  });

  it('Start and Complete go through the tasking path’s own PATCH transition', async () => {
    ledger = [{ id: 1, taskId: 'TASK-1', title: 'Review: Module 2.5 Clinical Overview', status: 'pending', priority: 'medium', assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null, sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: false, approvalStatus: null, createdAt: null }];
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    fireEvent.click(await within(rail).findByRole('button', { name: /Start/ }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/tasks/tasks/TASK-1', { status: 'in-progress' }));
    expect(await within(rail).findByText('In progress')).toBeTruthy();
    fireEvent.click(within(rail).getByTestId('rt-complete'));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/tasks/tasks/TASK-1', { status: 'completed', progress: 100 }));
    expect(await within(rail).findByText('Completed')).toBeTruthy();
    expect(within(rail).getByText('0 open · 1 total')).toBeTruthy();
  });

  it('a 428 ESIGN_REQUIRED completion is reported as the §11.50 ceremony on the Task board, not swallowed', async () => {
    ledger = [{ id: 1, taskId: 'TASK-2', title: 'Review: Module 2.5 Clinical Overview', status: 'in-progress', priority: 'high', assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null, sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: true, approvalStatus: null, createdAt: null }];
    patch = () => {
      throw new ApiRequestError('Completing this task requires an electronic signature.', 428, { success: false, code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED');
    };
    const p = props();
    render(<DocumentAuthoring {...p} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    expect((await within(rail).findByTestId('rt-row')).textContent).toContain('needs e-signature to complete');
    fireEvent.click(within(rail).getByTestId('rt-complete'));
    expect(await within(rail).findByText(/requires an electronic signature \(21 CFR 11 §11\.50\)/)).toBeTruthy();
    fireEvent.click(within(rail).getByRole('button', { name: 'Open Task board' }));
    expect(p.onNav).toHaveBeenCalledWith('task-board');
    // Nothing was claimed: the state chip is unchanged.
    expect(within(rail).getByText('In progress')).toBeTruthy();
  });

  it('a failed task read is an error, never "no tasks"', async () => {
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') return ok({ success: false, error: 'Failed to fetch tasks by module' }, 500);
      return ok({ success: true, sources: [], revisions: [], comments: [] });
    });
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    expect(await within(rail).findByTestId('rt-error')).toBeTruthy();
    expect(within(rail).queryByTestId('rt-empty')).toBeNull();
  });

  it('tasksForDocument keeps only rows whose recorded origin is this document', () => {
    const rows = [
      { taskId: 'A', title: 'x', status: 'pending', sourceEntityType: 'authoring_document', sourceEntityId: DOC },
      { taskId: 'B', title: `mentions ${DOC}`, status: 'pending', sourceEntityType: 'document', sourceEntityId: DOC },
      { taskId: 'C', title: 'y', status: 'pending', sourceEntityType: 'authoring_document', sourceEntityId: 'other' },
    ];
    expect(tasksForDocument(rows, DOC).map(t => t.taskId)).toEqual(['A']);
    expect(tasksForDocument('not an array', DOC)).toEqual([]);
  });
});
