// @vitest-environment jsdom
/**
 * Plan: what the filing needs, who does it, and by when.
 *
 * docs/design/CLIENT_JOURNEY_2026-10-25.md, pass 3 (founder decisions 3 and 4).
 * The founder could not find how to "flow into an actual document build": a
 * new project said "No documents in this project yet" and offered the editor
 * with nothing open, while the IND's 93 deliverables, each with a template,
 * sat in a lane of the editor's file panel, and a device project's workstreams
 * sat above the steps. This pins:
 *   - a US IND's Plan lists its deliverables by phase, from the catalogue read,
 *     with this project's working copy and a template start for the rest;
 *   - Assign creates ONE task in the task store, for one person with a due
 *     date, scoped by the project's numeric id and linked to this project's
 *     deliverable by its origin columns — and the assignment is read back;
 *   - Assign is not offered to a viewer, nor while the project id is unverified;
 *   - a phase that a feature composes opens that feature on this project, only
 *     where it serves the filing (CMC for a small-molecule IND, the IND forms);
 *   - a device project's Plan is its workstreams; any other filing is told so,
 *     never given an invented list;
 *   - a failed read is said as a failure, never as an empty plan.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null as null | { id: string; permissions: string[] } }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => auth }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) => isLaunchSurface(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
      resolved: true, masterAdmin: false, platformAdmin: false, tier: null,
    }),
  };
});

import { ProjectHome } from '../surfaces/ProjectHome';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { buildDeliverableTaskBody, planAssignments, PLAN_TASK_ENTITY } from '../surfaces/PlanAssign';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const OTHER = '9c9c9c9c-1111-4222-8333-444455556666';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({ success: false, error: 'unavailable' }) }) as unknown as Response;
const US_DRUG_IND = { id: PID, name: 'BX-410', product_name: 'Torvanib', program_type: 'IND', primary_agency: 'FDA', product_type: 'drug', status: 'active', target_submission_date: '2027-03-01T00:00:00Z' };
const tpl = (id: string, title: string) => ({ id, title, module: null, sectionCount: 4, kind: 'narrative', aiDraftable: true, authoringMode: 'ai_assisted', originalFormat: 'docx', limitations: [] });
const TPL_TPP = '00000000-0000-4000-8000-000000000001';
const deliverable = (id: string, title: string, phaseId: string, template?: ReturnType<typeof tpl>) => ({
  id, title, phaseId, phaseName: phaseId, taskId: id.split(':')[0], taskName: 'task', module: null, sectionCodes: [], artifactTypes: [],
  description: `${title} for the IND.`, aiDraftable: true, guidance: null, ...(template ? { template } : {}),
});
const CATALOG = {
  submissionType: 'IND',
  phases: [
    { id: 'phase3', name: 'Module 3 — Quality/CMC', order: 3 },
    /* The catalogue's own phase 1 name (services/regulatory/pyramids/ind-pyramid.ts). Slice A.1: it read "Program Planning". */
    { id: 'phase1', name: 'Planning', order: 1 },
    { id: 'phase7', name: 'Module 1 — Administrative', order: 7 },
    { id: 'phase8', name: 'QA Review & Submission', order: 8 },
  ],
  sections: [],
  deliverables: [
    deliverable('product_profile:deliverable:0', 'Target Product Profile', 'phase1', tpl(TPL_TPP, 'Target Product Profile')),
    deliverable('product_profile:deliverable:1', 'Regulatory pathway assessment', 'phase1', tpl('00000000-0000-4000-8000-000000000002', 'Regulatory pathway assessment')),
    deliverable('drug_substance:deliverable:0', '3.2.S Drug Substance section', 'phase3'),
    deliverable('forms:deliverable:0', 'Form FDA 1571', 'phase7'),
    deliverable('qc:deliverable:0', 'Submission QC checklist', 'phase8'),
  ],
};
const TPP_DOC = { id: 'doc-tpp', title: 'Target Product Profile', status: 'draft', template_id: TPL_TPP, client_program_id: PID, program_id: PID };
const TEAM = { program_id: PID, project_id: 51, team: [] };
const DANA = { id: '12', name: 'Dana Ruiz' };
const taskRow = (deliverableId: string, over: Record<string, unknown> = {}) => ({
  taskId: 'task-1', sourceEntityType: PLAN_TASK_ENTITY, sourceEntityId: `${PID}:${deliverableId}`,
  assigneeName: 'Dana Ruiz', dueDate: '2026-11-03T17:00:00.000Z', status: 'pending', createdAt: '2026-10-25T10:00:00Z', ...over,
});

interface Serve { program?: Record<string, unknown> | Promise<Response>; docs?: unknown[]; catalog?: unknown; team?: Response; planTasks?: unknown[] | 'fail'; post?: Response }
function serve({ program = US_DRUG_IND, docs = [], catalog = CATALOG, team = ok(TEAM), planTasks = [], post }: Serve = {}) {
  const reads: Record<string, () => Response> = {
    [`/api/c2c/projects/${PID}`]: () => (program instanceof Promise ? program : ok(program)) as Response,
    [`/api/c2c/projects/${PID}/team`]: () => team,
    '/api/authoring/ind-document-catalog': () => (catalog as { ok?: boolean })?.ok === false ? catalog as Response : ok({ success: true, data: catalog }),
    '/api/task-management/assignees': () => ok({ success: true, data: [DANA] }),
    '/api/tasks/tasks/by-module/Plan': () => planTasks === 'fail' ? fail(500) : ok({ success: true, data: planTasks, count: planTasks.length }),
  };
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST' && url === '/api/tasks/tasks') {
      if (post) return post;
      return ok({ success: true, data: { taskId: 'task-9', assigneeName: 'Dana Ruiz', assigneeId: body?.assigneeId, sourceEntityType: body?.sourceEntityType, sourceEntityId: body?.sourceEntityId } });
    }
    if (reads[url]) return reads[url]();
    if (url.startsWith('/api/authoring/docs')) return ok({ documents: docs });
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    return ok({});
  });
}

const activeLabel = () => document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent?.trim() ?? null;
const tab = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find((b) => b.textContent?.trim() === label)!;
const phase = (id: string) => document.querySelector<HTMLElement & { open: boolean }>(`.pj-plan-phase[data-phase="${id}"]`)!;
const entry = (title: string) => Array.from(document.querySelectorAll<HTMLElement>('.pf-library-entry')).find((e) => e.querySelector('summary')?.textContent?.includes(title))!;

function mount() {
  const onNav = vi.fn();
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={onNav} segment="biopharma" />);
  return { onNav };
}
async function openPlan() {
  await waitFor(() => expect(tab('Plan')).toBeTruthy());
  fireEvent.click(tab('Plan'));
  return screen.findByTestId('pj-plan');
}

beforeEach(() => {
  apiRequest.mockReset();
  auth.user = null;
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('a US IND’s Plan is what the filing needs, by phase', () => {
  it('a new project opens on it, phases in order, with the target date', async () => {
    serve();
    mount();
    await waitFor(() => expect(activeLabel()).toBe('Plan'));
    await screen.findByTestId('ind-filing-plan');
    expect(screen.getByRole('heading', { name: 'What this IND needs' })).toBeTruthy();
    expect(screen.getByText(/Target submission Mar 1, 2027/)).toBeTruthy();
    const names = Array.from(document.querySelectorAll('.pj-plan-phase-t')).map((n) => n.textContent);
    expect(names).toEqual(['1. Planning', '3. Module 3 — Quality/CMC', '7. Module 1 — Administrative', '8. QA Review & Submission']);
    expect(phase('phase1').open).toBe(true);
    expect(phase('phase1').querySelector('.pj-plan-phase-n')?.textContent).toBe('2 documents · 0 started');
  });

  it('a started deliverable opens this project’s working copy; the rest start from their template', async () => {
    serve({ docs: [TPP_DOC] });
    mount();
    await openPlan();
    await waitFor(() => expect(phase('phase1').querySelector('.pj-plan-phase-n')?.textContent).toBe('2 documents · 1 started'));
    expect(within(entry('Target Product Profile')).getByRole('button', { name: /Open Target Product Profile/ })).toBeTruthy();
    expect(within(entry('Regulatory pathway assessment')).getByRole('button', { name: /Create from template/ })).toBeTruthy();
  });

  it('a failed catalogue read is a failure with a retry, never an empty plan', async () => {
    serve({ catalog: fail(503) });
    mount();
    await openPlan();
    expect(await screen.findByText('What this filing needs could not be read')).toBeTruthy();
    expect(screen.queryByTestId('ind-filing-plan')).toBeNull();
  });
});

describe('Assign makes a deliverable one person’s task', () => {
  it('writes one task to the task store, scoped and linked, and reads the assignment back', async () => {
    serve();
    mount();
    await openPlan();
    const row = entry('Regulatory pathway assessment');
    fireEvent.click(within(row).getByRole('button', { name: /Assign/ }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(await within(drawer).findByLabelText(/Person/), { target: { value: '12' } });
    fireEvent.change(within(drawer).getByLabelText(/Due date/), { target: { value: '2026-11-03' } });
    serve({ planTasks: [taskRow('product_profile:deliverable:1')] });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/tasks/tasks', expect.anything()));
    const posts = apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/tasks/tasks');
    expect(posts).toHaveLength(1);
    const body = posts[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({
      title: 'Prepare: Regulatory pathway assessment', moduleType: 'Plan', projectId: 51, assigneeId: 12,
      sourceEntityType: 'filing_deliverable', sourceEntityId: `${PID}:product_profile:deliverable:1`,
    });
    expect(String(body.dueDate)).toMatch(/^2026-11-0[34]T/);
    expect(await within(entry('Regulatory pathway assessment')).findByText(/Assigned to Dana Ruiz\. The task is in their tasks/)).toBeTruthy();
    expect(await within(entry('Regulatory pathway assessment')).findByTestId('plan-assignment')).toBeTruthy();
    expect(within(entry('Regulatory pathway assessment')).getByTestId('plan-assignment').textContent).toMatch(/^Assigned to Dana Ruiz, due /);
    // The project's task list is read again, so the new task is listed without a reload.
    const workReads = apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && String(u).includes('/unified-work'));
    expect(workReads.length).toBeGreaterThanOrEqual(2);
  });

  it('is not offered to a viewer, whose task writes the server refuses', async () => {
    auth.user = { id: '3', permissions: ['read'] };
    serve();
    mount();
    await openPlan();
    await screen.findByTestId('ind-filing-plan');
    expect(within(entry('Target Product Profile')).queryByRole('button', { name: /Assign/ })).toBeNull();
  });

  it('is not offered while the project’s id is unverified, so no task is written unscoped', async () => {
    serve({ team: fail(503) });
    mount();
    await openPlan();
    await screen.findByTestId('ind-filing-plan');
    expect(within(entry('Target Product Profile')).queryByRole('button', { name: /Assign/ })).toBeNull();
  });

  it('an unreadable assignment list is said, and Assign still works', async () => {
    serve({ planTasks: 'fail' });
    mount();
    await openPlan();
    expect(await screen.findByTestId('plan-assignments-error')).toBeTruthy();
    await waitFor(() => expect(within(entry('Target Product Profile')).getByRole('button', { name: /Assign/ })).toBeTruthy());
  });
});

describe('a phase opens the feature that composes it, on this project', () => {
  it('a small-molecule US IND: Module 3 in CMC, Module 1 in the IND forms, QA on Submit', async () => {
    serve();
    const { onNav } = mount();
    await openPlan();
    await screen.findByTestId('ind-filing-plan');
    fireEvent.click(within(phase('phase3')).getByRole('button', { name: 'Compose Module 3 in CMC / Module 3' }));
    expect(onNav).toHaveBeenCalledWith('cmc');
    fireEvent.click(within(phase('phase7')).getByRole('button', { name: 'Prepare Forms 1571, 1572 and 3674 in IND forms' }));
    expect(onNav).toHaveBeenCalledWith('ind-checklist');
    fireEvent.click(within(phase('phase8')).getByRole('button', { name: 'Place approved documents in the sequence on Submit' }));
    expect(activeLabel()).toBe('Submit');
  });

  it('a biologic IND is not sent to CMC, which composes small-molecule Module 3 only', async () => {
    serve({ program: { ...US_DRUG_IND, product_type: 'biologic' } });
    mount();
    await openPlan();
    await screen.findByTestId('ind-filing-plan');
    expect(within(phase('phase3')).queryByRole('button', { name: /CMC/ })).toBeNull();
    expect(within(phase('phase7')).getByRole('button', { name: 'Prepare Forms 1571, 1572 and 3674 in IND forms' })).toBeTruthy();
  });
});

describe('other filings', () => {
  it('a device project’s Plan is its workstreams, each assignable', async () => {
    serve({ program: { ...US_DRUG_IND, program_type: '510k', product_type: 'device', regulatory_path: '510k' } });
    mount();
    await openPlan();
    const workflow = await screen.findByTestId('pj-mdx-workflow');
    expect(within(workflow).getAllByRole('button', { name: /Assign/ }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('ind-filing-plan')).toBeNull();
  });

  it('an NDA is told the list is not available here and where its documents are, with no invented list', async () => {
    serve({ program: { ...US_DRUG_IND, program_type: 'NDA' } });
    mount();
    await openPlan();
    expect(screen.getByTestId('pj-plan-none').textContent).toMatch(/available for US INDs and device filings/);
    expect(screen.queryByTestId('ind-filing-plan')).toBeNull();
    /* Slice A.1: it read "Open Author", naming only where it went (section 9, Door names). */
    fireEvent.click(screen.getByRole('button', { name: 'See this filing’s documents on Author' }));
    expect(activeLabel()).toBe('Author');
  });
});

describe('the assignment model', () => {
  it('keys tasks by this project’s deliverable; the newest wins; another project’s and cancelled tasks are ignored', () => {
    const rows = [
      taskRow('a', { taskId: 'old', assigneeName: 'Old', createdAt: '2026-10-01T00:00:00Z' }),
      taskRow('a', { taskId: 'new', assigneeName: 'New', createdAt: '2026-10-20T00:00:00Z' }),
      { ...taskRow('b'), sourceEntityId: `${OTHER}:b` },
      taskRow('c', { status: 'cancelled' }),
      { ...taskRow('d'), sourceEntityType: 'authoring_document' },
    ];
    const map = planAssignments(rows, PID);
    expect([...map.keys()]).toEqual(['a']);
    expect(map.get('a')?.taskId).toBe('new');
  });

  it('never Number()s the program UUID: the project id is the verified numeric one', () => {
    const body = buildDeliverableTaskBody({ programId: PID, projectId: 51, deliverable: { id: 'x', title: 'IB', group: 'phase5' }, assignee: '12', due: '', note: ' ' });
    expect(body.projectId).toBe(51);
    expect(body.description).toBeUndefined();
    expect(body).not.toHaveProperty('dueDate');
    expect((body.moduleData as Record<string, unknown>).programId).toBe(PID);
  });
});

describe('what Plan says, and when (design review, pass 3)', () => {
  it('while the project record is read, Plan says so, and never that the filing has no list', async () => {
    serve({ program: new Promise<Response>(() => {}) });
    mount();
    await openPlan();
    expect(screen.getByText('Reading this project…')).toBeTruthy();
    expect(screen.queryByTestId('pj-plan-none')).toBeNull();
  });

  it('a filing with no list is not told to "see every document" by the step band', async () => {
    serve({ program: { ...US_DRUG_IND, program_type: 'NDA' } });
    mount();
    await openPlan();
    await screen.findByTestId('pj-plan-none');
    expect(screen.getByTestId('pj-stageband').textContent).not.toMatch(/What to do now/);
  });

  it('the target date is the recorded day, never shifted by the viewer’s zone', async () => {
    serve({ program: { ...US_DRUG_IND, target_submission_date: '2027-03-01T00:00:00.000Z' } });
    mount();
    await openPlan();
    expect(await screen.findByText('Target submission Mar 1, 2027')).toBeTruthy();
  });

  it('a working copy titled as its template counts as started', async () => {
    const catalog = { ...CATALOG, deliverables: [deliverable('ib:deliverable:0', 'Investigator Brochure draft', 'phase1', tpl('00000000-0000-4000-8000-000000000009', "Investigator's Brochure (IB)"))] };
    serve({ catalog, docs: [{ id: 'doc-ib', title: "Investigator's Brochure (IB)", status: 'draft', program_id: PID }] });
    mount();
    await openPlan();
    await waitFor(() => expect(phase('phase1').querySelector('.pj-plan-phase-n')?.textContent).toBe('1 document · 1 started'));
  });

  it('an unconfirmed Assign reads the lists again, so they say what is there', async () => {
    serve({ post: fail(503) });
    mount();
    await openPlan();
    fireEvent.click(within(entry('Target Product Profile')).getByRole('button', { name: /Assign/ }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(await within(drawer).findByLabelText(/Person/), { target: { value: '12' } });
    fireEvent.change(within(drawer).getByLabelText(/Due date/), { target: { value: '2026-11-03' } });
    const before = apiRequest.mock.calls.filter(([, u]) => u === '/api/tasks/tasks/by-module/Plan').length;
    fireEvent.click(within(drawer).getByRole('button', { name: 'Assign' }));
    expect(await screen.findByTestId('plan-assign-error')).toBeTruthy();
    await waitFor(() => expect(apiRequest.mock.calls.filter(([, u]) => u === '/api/tasks/tasks/by-module/Plan').length).toBeGreaterThan(before));
  });

  it('a deliverable someone already has offers "Assign another person", and a finished task is the task’s, not the deliverable’s', async () => {
    serve({ planTasks: [taskRow('product_profile:deliverable:0', { status: 'completed' })] });
    mount();
    await openPlan();
    const row = entry('Target Product Profile');
    expect(await within(row).findByTestId('plan-assignment')).toBeTruthy();
    expect(within(row).getByTestId('plan-assignment').textContent).toMatch(/^Task completed: Dana Ruiz, due /);
    expect(within(row).getByRole('button', { name: /Assign another person/ })).toBeTruthy();
  });
});
