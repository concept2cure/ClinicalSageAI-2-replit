/**
 * A training task's notice opens the training reader on its document (MR-12
 * Stage 4 slice 4b; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.9,
 * docs/design/QMS_IN_PROJECTS_2026-10-30.md QP1). Until then it opened the
 * Tasks board, which cannot complete it: only reading and acknowledging the
 * version does.
 *
 * The client is a script of the reads the resolver makes (the recipient's
 * notice, the task, the document); whether the recipient is assigned is the one
 * resolver's answer (training-assignment.ts), stubbed here and exercised on
 * PostgreSQL in tests/db/qms-training-tasks.dbtest.ts. What is asserted is the
 * decision: the person assigned is sent to read, without a share onto the
 * authored editing copy (P-50 Q2); anyone else is asked what any notice on the
 * document asks; a task key that is not a training key opens nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ assigned: true, authoringAllowed: false, asked: [] as unknown[][] }));
vi.mock('../../qms/training-assignment', () => ({
  isQmsTrainingAssignee: async (...args: unknown[]) => { H.asked.push(args.slice(1)); return H.assigned; },
}));
vi.mock('../../authoring/authoring-permissions', () => ({
  resolveAuthoringDocumentScope: async () => ({ docId: AUTHORED, tenantId: 7 }),
  resolveAuthoringSectionScope: async () => null,
  decideAuthoringPermission: async () => ({ allowed: H.authoringAllowed }),
}));

import { resolveNotificationRecordTarget } from '../notification-record-target';
import { isNotificationRecordTarget } from '../../../../shared/types/notification-navigation';

const AUTHORED = '0b5e1c7e-3d1a-4f7b-9a51-2c4b8e6f0d11';
const TASK = '5d9f7a3c-1e2b-4c6d-8f0a-9b8c7d6e5f4a';

function client(task: Record<string, unknown>, document: Record<string, unknown> | null = { authoring_document_id: AUTHORED }) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  return {
    seen,
    query: async (sql: string, params: unknown[] = []) => {
      seen.push({ sql, params });
      if (/FROM mdx_notifications/.test(sql)) return { rows: [{ action_url: null, current_org_role: 'member', resource_type: 'unified_task', resource_id: TASK }] };
      if (/FROM unified_tasks/.test(sql)) return { rows: [{ project_id: null, review_route_id: null, ...task }] };
      if (/FROM qms_documents/.test(sql)) return { rows: document ? [document] : [] };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}
const training = (key = 'qms-document:11:user:42') => ({ source_entity_type: 'qms_training', source_entity_id: key });
const ask = (c: ReturnType<typeof client>) =>
  resolveNotificationRecordTarget({ client: c, organizationId: 7, userId: 42, email: null, notificationId: 3 });

beforeEach(() => { H.assigned = true; H.authoringAllowed = false; H.asked = []; });

describe('a training task notice opens the reader that completes it', () => {
  it('sends the person assigned to read and acknowledge the document, with no share onto its authored copy', async () => {
    const c = client(training());
    const target = await ask(c);
    expect(target).toEqual({ surface: 'quality', label: 'Read and acknowledge', params: { qmsDocumentId: '11', qmsIntent: 'read' }, programId: null });
    expect(isNotificationRecordTarget(target)).toBe(true);
    expect(H.asked, 'assigned, asked of this document and this recipient').toEqual([[7, 11, 42]]);
    expect(c.seen.find(q => /FROM qms_documents/.test(q.sql))!.params, 'the document is read in the recipient organisation').toEqual(['11', 7]);
  });

  it('asks anyone no longer assigned what any notice on the document asks: no view of its authored copy, no target', async () => {
    H.assigned = false;
    await expect(ask(client(training()))).rejects.toMatchObject({ status: 404 });
  });

  it('opens an inline document for someone no longer assigned as any notice on it does, without the reading intent', async () => {
    H.assigned = false;
    expect(await ask(client(training(), { authoring_document_id: null })))
      .toEqual({ surface: 'quality', label: 'Open controlled document', params: { qmsDocumentId: '11' }, programId: null });
  });

  it('opens nothing for a training task whose document is gone, or whose key is not a training key', async () => {
    await expect(ask(client(training(), null))).rejects.toMatchObject({ status: 404 });
    for (const key of ['qms-document:11', 'qms-document:11:user:', 'qms-document:0:user:42', 'qms-document:11:user:42/../x', 'capa:11']) {
      await expect(ask(client(training(key)))).rejects.toMatchObject({ status: 422 });
    }
  });

  // The id is a UUID, as createUnifiedTask writes it. Until this change the notice door read only TASK- and ROUTE-
  // ids, so the reminders the due-date sweep sends for periodic-review, CAPA and training tasks opened nothing (422).
  it('still opens any other task on the Tasks board, by the id its task store wrote', async () => {
    expect(await ask(client({ source_entity_type: 'qms_periodic_review', source_entity_id: 'qms-document:11' })))
      .toEqual({ surface: 'tasks', label: 'Open task', params: { taskId: TASK }, programId: null });
  });

  it('the shared contract admits the reading intent on Quality, and no other', () => {
    const quality = (params: Record<string, string>) => ({ surface: 'quality', label: 'Read and acknowledge', params, programId: null });
    expect(isNotificationRecordTarget(quality({ qmsDocumentId: '11', qmsIntent: 'read' }))).toBe(true);
    expect(isNotificationRecordTarget(quality({ qmsDocumentId: '11' }))).toBe(true);
    expect(isNotificationRecordTarget(quality({ qmsDocumentId: '11', qmsIntent: 'edit' }))).toBe(false);
    expect(isNotificationRecordTarget(quality({ qmsDocumentId: '11', qmsIntent: 'read', redirect: '/x' }))).toBe(false);
  });
});
