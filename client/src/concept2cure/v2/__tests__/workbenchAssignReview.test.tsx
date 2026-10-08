// @vitest-environment jsdom
/**
 * DocumentWorkbench — the review task and the Tasks rail.
 *
 * The one tasking path (ReviewTasksPanel.tsx header): POST /api/tasks/tasks
 * creates the task with its origin recorded as this document
 * (sourceEntityType 'authoring_document', sourceEntityId <docId>) and the
 * program in moduleData; the rail lists GET /api/tasks/tasks/by-module/Authoring
 * filtered to that origin; Complete is the path's own PATCH transition, and a
 * 428 ESIGN_REQUIRED opens the signing ceremony on the document.
 *
 * 2026-10-08: the workbench sends a document for review through
 * SendForReviewDialog (the review request, then each reviewer's task; pinned
 * in sendForReview.test.tsx). The task create, its confirmation and its
 * reconciliation below are AssignReviewDialog's, which that dialog reuses and
 * the canvas card still opens directly.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

import { AssignReviewDialog, isSubmittableReviewer } from '../editor/AssignReviewDialog';

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
    if (method === 'POST' && url === `/api/authoring/documents/${DOC}/request-review`) {
      const reviewers = (body?.reviewers ?? []) as Array<{ id: string; name?: string }>;
      return ok({ success: true, reviews: reviewers.map((r, i) => ({ id: `rev-${i + 1}`, doc_id: DOC, reviewer_id: r.id, reviewer_name: r.name ?? null, review_status: 'pending' })) });
    }
    if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') {
      return ok({ success: true, data: ledger, count: ledger.length });
    }
    // The document's review requests: none, so a review task here is a task-only assignment.
    if (method === 'GET' && url === `/api/authoring/documents/${DOC}/reviews`) return ok({ success: true, reviews: [] });
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

describe('DocumentWorkbench — review tasks', () => {
  it('the task create is POST /api/tasks/tasks linked to the document, and the Tasks rail lists it with its state', async () => {
    const p = dialogProps();
    render(<AssignReviewDialog {...p} docTitle="Module 2.5 Clinical Overview" sectionCode="2.5.1" />);
    // The roster is the Task board's roster.
    await screen.findByRole('option', { name: 'OQ Signer' });
    expect((screen.getByTestId('ar-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('ar-assignee'), { target: { value: '42' } });
    // A date that is never today or past: the row then shows the date itself, not "due today" or "overdue".
    fireEvent.change(screen.getByTestId('ar-due'), { target: { value: '2099-10-05' } });
    fireEvent.change(screen.getByTestId('ar-instructions'), { target: { value: 'Check the efficacy claims against the SAP.' } });
    fireEvent.click(screen.getByTestId('ar-submit'));

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
    expect(String(sent.dueDate)).toMatch(/^2099-10-05T/);
    await waitFor(() => expect(p.onCreated).toHaveBeenCalledWith({ taskId: 'TASK-1758-1', assigneeName: 'OQ Signer' }));
    cleanup();

    // The workbench's Tasks rail lists the task the ledger now holds.
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    const row = await within(rail).findByTestId('rt-row');
    expect(row.textContent).toContain('Review: Module 2.5 Clinical Overview');
    expect(row.textContent).toContain('Assigned');
    expect(row.textContent).toContain('assigned to OQ Signer');
    expect(row.textContent).toContain('due Oct 5, 2099');
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

  it('a 428 ESIGN_REQUIRED completion opens the §11.50 ceremony on the document, not swallowed and not on the Task board', async () => {
    ledger = [{ id: 1, taskId: 'TASK-2', title: 'Review: Module 2.5 Clinical Overview', status: 'in-progress', priority: 'high', assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null, sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: true, approvalStatus: null, createdAt: null }];
    patch = () => {
      throw new ApiRequestError('Completing this task requires an electronic signature.', 428, { success: false, code: 'ESIGN_REQUIRED' }, 'ESIGN_REQUIRED');
    };
    const p = props();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><DocumentAuthoring {...p} /></QueryClientProvider>);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    expect((await within(rail).findByTestId('rt-row')).textContent).toContain('needs e-signature to complete');
    fireEvent.click(within(rail).getByTestId('rt-complete'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Electronic signature');
    expect(within(dialog).getByLabelText(/Password/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Task board' })).toBeNull();
    expect(p.onNav).not.toHaveBeenCalledWith('task-board');
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

/* A transition whose outcome nobody can confirm: the server's OUTCOME_UNKNOWN,
   or a gateway's answer. Never reported as "its state is unchanged". */
describe('DocumentWorkbench — Review tasks, an outcome the server could not confirm', () => {
  it('a transition whose COMMIT was lost is reported as unknown, never as unchanged, and the list is re-read', async () => {
    ledger = [{ id: 1, taskId: 'TASK-3', title: 'Review: Module 2.5 Clinical Overview', status: 'in-progress', priority: 'high', assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null, sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: false, approvalStatus: null, createdAt: null }];
    patch = () => {
      const body = { success: false, error: 'OUTCOME_UNKNOWN', message: 'Whether this change was saved is unknown. Reload to see the task’s current state before trying again.' };
      throw new ApiRequestError(body.message, 500, body, 'OUTCOME_UNKNOWN');
    };
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    await within(rail).findByTestId('rt-row');
    const reads = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === '/api/tasks/tasks/by-module/Authoring').length;
    const before = reads();
    fireEvent.click(within(rail).getByTestId('rt-complete'));
    expect(await screen.findByText(/Whether this change was saved is unknown/)).toBeTruthy();
    expect(screen.queryByText(/Its state is unchanged/)).toBeNull();
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('a gateway error on a transition is an unknown outcome too', async () => {
    ledger = [{ id: 1, taskId: 'TASK-4', title: 'Review: Module 2.5 Clinical Overview', status: 'in-progress', priority: 'high', assigneeName: 'OQ Signer', assigneeId: 42, dueDate: null, description: null, sourceEntityType: 'authoring_document', sourceEntityId: DOC, approvalRequired: false, approvalStatus: null, createdAt: null }];
    patch = () => { throw new ApiRequestError('Bad gateway', 502); };
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    await within(rail).findByTestId('rt-row');
    fireEvent.click(within(rail).getByTestId('rt-complete'));
    expect(await screen.findByText(/unknown/i)).toBeTruthy();
    expect(screen.queryByText(/Its state is unchanged/)).toBeNull();
  });
});


const dialogProps = () => ({ docId: DOC, docTitle: 'IND overview', programId: PID, sectionCode: '2.5',
  onClose: vi.fn(), onCreated: vi.fn(), fireToast: vi.fn(), onCheckTasks: vi.fn() });
async function readyAssignment() {
  await screen.findByRole('option', { name: 'OQ Signer' });
  fireEvent.change(screen.getByTestId('ar-assignee'), { target: { value: '42' } });
  fireEvent.change(screen.getByTestId('ar-instructions'), { target: { value: 'Check the clinical claims against the SAP.' } });
}

describe('review assignment confirmation and context', () => {
  it.each(['0', '-1', '1.5', '9007199254740992', '1e2'])('refuses invalid integer reviewer identity %s', id => {
    expect(isSubmittableReviewer(id)).toBe(false);
  });

  it('reports a lost response as unknown and preserves the instructions for reconciliation', async () => {
    const p = dialogProps();
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => method === 'POST' ? Promise.reject(new ApiRequestError('Bad gateway', 502)) : original(method, url, body));
    render(<AssignReviewDialog {...p} />); await readyAssignment(); fireEvent.click(screen.getByTestId('ar-submit'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/unknown|not.*confirmed/i);
    expect(screen.getByRole('alert').textContent).not.toMatch(/Nothing was recorded|not created/);
    expect((screen.getByTestId('ar-instructions') as HTMLTextAreaElement).value).toContain('clinical claims');
    expect(p.onCreated).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
    expect((screen.getByTestId('ar-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Check existing review tasks' }));
    expect(p.onCheckTasks).toHaveBeenCalledOnce();
  });

  it('does not confirm a receipt for a different document', async () => {
    const p = dialogProps(); const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => method === 'POST' ? Promise.resolve(ok({ success: true,
      data: { taskId: 'OTHER-TASK', assigneeId: 42, sourceEntityType: 'authoring_document', sourceEntityId: 'other-document' },
    })) : original(method, url, body));
    render(<AssignReviewDialog {...p} />); await readyAssignment(); fireEvent.click(screen.getByTestId('ar-submit'));
    await screen.findByRole('alert'); expect(p.onCreated).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
  });

  it('resets the reviewer and instructions when the document changes', async () => {
    const p = dialogProps(); const view = render(<AssignReviewDialog {...p} />); await readyAssignment();
    view.rerender(<AssignReviewDialog {...p} docId="other-document" docTitle="Other IND section" />);
    expect((screen.getByTestId('ar-assignee') as HTMLSelectElement).value).toBe('');
    expect((screen.getByTestId('ar-instructions') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByTestId('ar-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('ignores a delayed assignment receipt after changing documents', async () => {
    const p = dialogProps(); const original = apiRequest.getMockImplementation()!;
    let finish!: (value: Response) => void;
    apiRequest.mockImplementation((method, url, body) => method === 'POST' ? new Promise<Response>(resolve => { finish = resolve; }) : original(method, url, body));
    const view = render(<AssignReviewDialog {...p} />); await readyAssignment(); fireEvent.click(screen.getByTestId('ar-submit'));
    view.rerender(<AssignReviewDialog {...p} docId="other-document" docTitle="Other IND section" />);
    await act(async () => finish(ok({ success: true, data: { taskId: 'OLD-TASK', assigneeId: 42, sourceEntityType: 'authoring_document', sourceEntityId: DOC } })));
    expect(p.onCreated).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled(); expect(p.onClose).not.toHaveBeenCalled();
  });
});


describe('workbench reconciles an unconfirmed review assignment', () => {
  it('opens the task list after a lost task response and shows the task that actually committed', async () => {
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method, url, body) => {
      const result = await original(method, url, body);
      if (method === 'POST' && url === '/api/tasks/tasks') throw new ApiRequestError('Response lost after commit', 502);
      return result;
    });
    render(<DocumentAuthoring {...props()} />); await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('send-for-review-open'));
    fireEvent.click(await screen.findByTestId('sfr-reviewer-42'));
    fireEvent.change(screen.getByTestId('sfr-reason'), { target: { value: 'Ready for medical review.' } });
    fireEvent.click(screen.getByTestId('sfr-submit'));
    // The request stands; the task's outcome is unknown (never "no task"), and it is not sent twice.
    const taskLine = await screen.findByTestId('sfr-tasks');
    expect(taskLine.textContent).toMatch(/outcome is unknown/);
    expect(taskLine.textContent).not.toMatch(/no task/i);
    expect(ledger).toHaveLength(1);
    expect(screen.queryByTestId('sfr-submit')).toBeNull();
    expect(apiRequest.mock.calls.filter(c => c[0] === 'POST' && c[1] === '/api/tasks/tasks')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check existing review tasks' }));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    expect((await within(rail).findByTestId('rt-row')).textContent).toContain('Review: Module 2.5 Clinical Overview');
    expect(screen.queryByTestId('send-for-review-dialog')).toBeNull();
  });
});


describe('known assignment refusal', () => {
  it('keeps a confirmed audit rollback distinct from an unknown commit', async () => {
    const p = dialogProps(); const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, url, body) => method === 'POST'
      ? Promise.reject(new ApiRequestError('The audit write failed, so nothing was changed.', 500, {}, 'AUDIT_WRITE_FAILED'))
      : original(method, url, body));
    render(<AssignReviewDialog {...p} />); await readyAssignment(); fireEvent.click(screen.getByTestId('ar-submit'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/refused.*nothing was changed/i);
    expect(screen.queryByRole('button', { name: 'Check existing review tasks' })).toBeNull();
    expect((screen.getByTestId('ar-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(p.onCreated).not.toHaveBeenCalled(); expect(p.fireToast).not.toHaveBeenCalled();
  });
});


/* QA 2026-10-08 (browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
   The author could assign the review to herself. The roster both review
   dialogs offer leaves the author out (useReviewerRoster). The request-review
   cases of this walk (request first, the Reviewer grant, the author refusal)
   moved to sendForReview.test.tsx with the request itself: on the merge with
   the D2 ana-2c work, SendForReviewDialog is the one review-request path. */
describe('the reviewer roster never offers the author', () => {
  it('does not offer the document’s author as its reviewer, and says why', async () => {
    render(<AssignReviewDialog {...dialogProps()} authorId="1" />);
    await screen.findByRole('option', { name: 'OQ Signer' });
    expect(screen.queryByRole('option', { name: 'Jon Smith' })).toBeNull();
    expect(screen.getByTestId('ar-author-note').textContent).toMatch(/a different person reviews/);
  });
});
