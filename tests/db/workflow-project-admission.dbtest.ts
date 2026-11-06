/** Existing task writers against the one restricted PostgreSQL fixture. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getBuiltinWorkflowTemplate } from '../../server/services/tasking/workflow-templates';
import { waitFor } from './scheduler-harness';
import { env, app, create, ordinary, unified, counts, refused, ordinaryRefused, unifiedRefused, injectedFailure,
  effects, transactionEvents, discards, loseNextCommit, DOCS, TEMPLATE, DEFINITIONS } from './workflow-project-native-fixture';

describe('current workflow project admission counterexamples', () => {
  it('refuses the same-organization private project outsider without any workflow write', async () => {
    const before = await counts(); const answer = await create({ projectId: 12 }, 7, 72);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body))
      .toEqual({ status: 403, writes: before });
  });
  it('records the actual project workspace on every created workflow task', async () => {
    const answer = await create(); expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data).toHaveLength(2);
    for (const task of answer.body.data) expect(task).toMatchObject({ organizationId: 9, projectId: 11, clientWorkspaceId: 71, createdById: 7 });
  });
});

describe('ordinary task project admission counterexamples', () => {
  it('refuses an explicit private project the ordinary task creator cannot edit', async () => {
    const before = await counts(); const answer = await ordinary({ projectId: 12 }, 7, 72);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body))
      .toEqual({ status: 403, writes: before });
  });
  it('persists the explicit project actual workspace on an ordinary task', async () => {
    const answer = await ordinary(); expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data).toMatchObject({ organizationId: 9, projectId: 11, clientWorkspaceId: 71, createdById: 7 });
  });
  it('refuses stale claimed write permission on an unfiled ordinary task', async () => {
    const before = await counts(); const answer = await ordinary({ projectId: undefined }, 12, null);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body))
      .toEqual({ status: 403, writes: before });
  });
});

describe('unified task project admission counterexamples', () => {
  it('refuses the unified creator outside the private explicit project', async () => {
    const before = await counts(); const answer = await unified({ projectId: 12, clientWorkspaceId: 72 }, 7, 72);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body)).toEqual({ status: 403, writes: before });
  });
  it('saves the admitted project actual workspace when the body omits it', async () => {
    const answer = await unified(); expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ projectId: 11, clientWorkspaceId: 71 });
  });
  it('rejects the actual viewer despite claimed write permission on unfiled work', async () => {
    const before = await counts(); const answer = await unified({ projectId: undefined }, 12, null);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body)).toEqual({ status: 403, writes: before });
  });
  it('rejects an explicitly supplied foreign workspace for unfiled work', async () => {
    const before = await counts(); const answer = await unified({ projectId: undefined, clientWorkspaceId: 81 }, 7, null);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body)).toEqual({ status: 403, writes: before });
  });
});

describe('unified creation retains current actor and project authority', () => {
  it.each([null, 0, -1, 1.5, '11', '11x', true, [], {}, 2_147_483_648])('rejects malformed explicit unified project %j', async projectId => {
    await unifiedRefused({ projectId }, 400);
  });
  it.each([13, 999_999])('rejects foreign or missing unified project %s', async projectId => { await unifiedRefused({ projectId }, 404); });
  it.each(['archived', 'deleted'])('rejects the actual %s unified parent', async status => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET status=$1 WHERE id=11`, [status]); await unifiedRefused({}, 409);
  });
  it.each(['membership', 'user', 'organization'])('rechecks actual %s for unified unfiled work', async kind => {
    const actor = kind === 'membership' ? 8 : 7;
    if (kind === 'membership') await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE user_id=8`);
    if (kind === 'user') await env.owner.query(`UPDATE ${env.t('users')} SET status='inactive' WHERE id=7`);
    if (kind === 'organization') await env.owner.query(`UPDATE ${env.t('organizations')} SET status='inactive' WHERE id=9`);
    await unifiedRefused({ projectId: undefined, assigneeId: 9 }, 403, actor, null);
  });
  it('does not promote a project use share into unified create authority', async () => { await unifiedRefused({}, 403, 10); });
  it('refuses an actually inactive unified edit share', async () => {
    await env.owner.query(`UPDATE ${env.t('project_members')} SET status='inactive' WHERE user_id=8`); await unifiedRefused({}, 403, 8);
  });
  it('admits the actual active project editor', async () => {
    const answer = await unified({}, 8); expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ projectId: 11, clientWorkspaceId: 71, createdById: 8 });
  });
});

describe('unified project workspace and workspace-only compatibility', () => {
  it.each(['body', 'request'])('refuses mismatched %s workspace on a project', async kind => {
    await unifiedRefused(kind === 'body' ? { clientWorkspaceId: 72 } : {}, 403, 7, kind === 'request' ? 72 : 71);
  });
  it('refuses an explicit workspace on an actual null-workspace parent', async () => { await unifiedRefused({ projectId: 14, clientWorkspaceId: 71 }, 403, 7, null); });
  it('keeps an actual null project workspace null', async () => {
    const answer = await unified({ projectId: 14 }, 7, null); expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ projectId: 14, clientWorkspaceId: null });
  });
  it('refuses a parent whose actual workspace is foreign', async () => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET client_workspace_id=81 WHERE id=11`); await unifiedRefused({}, 403, 7, null);
  });
  it('refuses a parent whose recorded workspace is missing', async () => {
    await env.owner.query(`DELETE FROM ${env.t('client_workspaces')} WHERE id=71`); await unifiedRefused({}, 403, 7, null);
  });
  it('accepts a supplied actual project workspace without a request claim', async () => {
    const answer = await unified({ clientWorkspaceId: 71 }, 7, null); expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ projectId: 11, clientWorkspaceId: 71 });
  });
  it.each([71, 81, 'malformed'])('does not invent unfiled scope from request claim %j alone', async workspace => {
    const answer = await unified({ projectId: undefined }, 7, workspace); expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ projectId: null, clientWorkspaceId: null });
  });
  it.each([71, null, '71'])('retains an admitted workspace-only task with request claim %j', async workspace => {
    const answer = await unified({ projectId: undefined, clientWorkspaceId: 71 }, 7, workspace);
    expect(answer.status, JSON.stringify(answer.body)).toBe(201); expect(answer.body.task).toMatchObject({ projectId: null, clientWorkspaceId: 71 });
  });
  it('refuses a missing explicit unfiled workspace', async () => { await unifiedRefused({ projectId: undefined, clientWorkspaceId: 999_999 }, 403, 7, null); });
  it('refuses a request claim that redirects explicit workspace-only work', async () => { await unifiedRefused({ projectId: undefined, clientWorkspaceId: 71 }, 403, 7, 72); });
  it.each([null, 0, -1, 1.5, '71', '71x', true, [], {}, 2_147_483_648])('rejects invalid explicit workspace-only scope %j', async clientWorkspaceId => {
    const answer = await unifiedRefused({ projectId: undefined, clientWorkspaceId }, 400, 7, null);
    expect(answer.body.success).toBe(false);
  });
  it('sanitizes a real workspace read failure and creates nothing', async () => {
    await env.owner.query(`REVOKE SELECT ON ${env.t('client_workspaces')} FROM ${env.runtimeRole}`);
    try {
      expect((await env.owner.query('SELECT has_table_privilege($1,$2,\'SELECT\') AS allowed', [env.runtimeRole, env.t('client_workspaces')])).rows[0].allowed).toBe(false);
      const answer = await unifiedRefused({ projectId: undefined, clientWorkspaceId: 71 }, 503, 7, null);
      expect(answer.body.code).toBe('TASK_PROJECT_ACCESS_UNAVAILABLE'); expect(JSON.stringify(answer.body)).not.toMatch(/permission denied|SQLSTATE|SELECT|client_workspaces/);
    } finally { await env.owner.query(`GRANT SELECT ON ${env.t('client_workspaces')} TO ${env.runtimeRole}`); }
  });
});

describe('unified service defaults, metadata and governed commit remain intact', () => {
  it.each(['authoring_document', 'canonical_document'])('keeps unfiled %s metadata without deriving a project', async sourceEntityType => {
    const answer = await unified({ projectId: undefined, sourceEntityType, sourceEntityId: DOCS[0] });
    expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ projectId: null, clientWorkspaceId: null, sourceEntityType, sourceEntityId: DOCS[0] });
  });
  it('keeps explicit unified scope independent of source metadata', async () => {
    const answer = await unified({ sourceEntityType: 'authoring_document', sourceEntityId: DOCS[1] });
    expect(answer.status, JSON.stringify(answer.body)).toBe(201); expect(answer.body.task).toMatchObject({ projectId: 11, sourceEntityId: DOCS[1] });
  });
  it.each([['CMC', 'FlaskConical', '#3B82F6', 'manufacturing'], ['IND', 'FileText', '#10B981', 'regulatory'],
    ['MedicalDevice', 'Activity', '#78716c', 'device'], ['eCTD', 'BookOpen', '#F59E0B', 'documentation'],
    ['Vault', 'Archive', '#EC4899', 'storage'], ['ProtocolDesign', 'Clipboard', '#06B6D4', 'clinical']])('preserves %s module defaults', async (moduleType, moduleIcon, moduleColor, category) => {
    const answer = await unified({ moduleType }); expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    expect(answer.body.task).toMatchObject({ moduleType, moduleIcon, moduleColor, category, taskType: 'action', priority: 'medium', status: 'pending', tags: [], metadata: {} });
    expect(answer.body.task.taskId).toMatch(/^[a-f0-9-]{36}$/); expect(answer.body.message).toBe(`Task created successfully in ${moduleType} module`);
  });
  it.each(['/api/regulatory/tasks', '/api/unified-tasks'])('preserves unified fields and atomic lineage through %s', async alias => {
    const answer = await unified({ organizationId: 10, createdById: 9, assigneeName: 'Named by caller', priority: 'high',
      metadata: { section: 'results' }, tags: ['review'], dueDate: '2026-11-08T10:00:00.000Z', reason: 'Prepare the actual review' }, 7, 71, alias);
    expect(answer.status, JSON.stringify(answer.body)).toBe(201); expect(answer.body.success).toBe(true);
    expect(answer.body.task).toMatchObject({ organizationId: 9, createdById: 7, projectId: 11, clientWorkspaceId: 71,
      assigneeId: 7, assigneeName: 'Named by caller', priority: 'high', tags: ['review'], metadata: { section: 'results' }, dueDate: '2026-11-08T10:00:00.000Z' });
    const rows = (await env.owner.query(`SELECT a.command,a.proposed_by,l.reason,l.ana_action_id,a.id,t.xmin::text AS task_tx,
      a.xmin::text AS action_tx,l.xmin::text AS audit_tx FROM ${env.t('unified_tasks')} t JOIN ${env.t('c2c_ana_actions')} a
      ON a.target='task:'||t.task_id JOIN ${env.t('audit_logs')} l ON l.id=a.audit_row_id::text`)).rows;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ command: 'task.create', proposed_by: 7, reason: 'Prepare the actual review' });
    expect(rows[0].ana_action_id).toBe(rows[0].id); expect(rows[0].task_tx).toBe(rows[0].action_tx); expect(rows[0].task_tx).toBe(rows[0].audit_tx);
    expect(await counts()).toEqual({ tasks: 1, edges: 0, actions: 1, audits: 1, usage: 0 });
  });
  it.each(['reviewRouteId', 'reviewRole', 'reviewStep', 'routeSignatureId', 'routeActId', 'routeAuthoringSignatureId'])(
    'refuses unified RR1 input %s before writes', async column => {
      const answer = await unifiedRefused({ [column]: 'protected' }, 400); expect(answer.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED');
    });
  it('rolls back actual unified task/action when its audit insert fails', async () => {
    await injectedFailure('audit_logs', 'tenant_id<>9', async () => { const answer = await unifiedRefused({}, 500); expect(answer.body.error).toBe('AUDIT_WRITE_FAILED'); });
  });
  it('reports a committed but lost unified COMMIT and discards the uncertain request lease', async () => {
    loseNextCommit(); const answer = await unified(); expect(answer.status, JSON.stringify(answer.body)).toBe(500);
    expect(answer.body.error).toBe('OUTCOME_UNKNOWN'); expect(answer.body.message).not.toMatch(/nothing was (created|changed)/i);
    expect(discards).toBe(1); expect(transactionEvents).toEqual(['COMMIT']); expect(effects.notify).not.toHaveBeenCalled();
    expect(await counts()).toEqual({ tasks: 1, edges: 0, actions: 1, audits: 1, usage: 0 });
  });
});

describe('ordinary creation retains actual actor and project authority', () => {
  it.each([null, 0, -1, 1.5, '11', '11x', true, [], {}, 2_147_483_648])('refuses invalid explicit project %j', async projectId => {
    await ordinaryRefused({ projectId }, 400);
  });
  it.each([13, 999_999])('refuses foreign or missing ordinary parent %s', async projectId => {
    await ordinaryRefused({ projectId }, 404);
  });
  it.each(['archived', 'deleted'])('refuses the actual %s ordinary parent', async status => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET status=$1 WHERE id=11`, [status]);
    await ordinaryRefused({}, 409);
  });
  it('does not turn a use share into ordinary create permission', async () => { await ordinaryRefused({}, 403, 10); });
  it('rejects the current revoked edit share', async () => {
    await env.owner.query(`UPDATE ${env.t('project_members')} SET status='inactive' WHERE user_id=8`);
    await ordinaryRefused({}, 403, 8);
  });
  it('rejects a different workspace claim on an ordinary task', async () => { await ordinaryRefused({}, 403, 7, 72); });
  it('rejects a workspace claim on a parent with actual null workspace', async () => { await ordinaryRefused({ projectId: 14 }, 403); });
  it.each(['membership', 'user', 'organization'])('rechecks actual %s for unfiled work', async kind => {
    const actor = kind === 'membership' ? 8 : 7;
    if (kind === 'membership') await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE user_id=8`);
    if (kind === 'user') await env.owner.query(`UPDATE ${env.t('users')} SET status='inactive' WHERE id=7`);
    if (kind === 'organization') await env.owner.query(`UPDATE ${env.t('organizations')} SET status='inactive' WHERE id=9`);
    await ordinaryRefused({ projectId: undefined, assigneeId: 9 }, 403, actor, null);
  });
});

describe('ordinary source-derived project and unfiled compatibility', () => {
  it.each(['authoring_document', 'canonical_document'])('admits and stamps the actual %s source project', async sourceEntityType => {
    const answer = await ordinary({ projectId: undefined, sourceEntityType, sourceEntityId: DOCS[0] });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data).toMatchObject({ projectId: 11, clientWorkspaceId: 71, sourceEntityType, sourceEntityId: DOCS[0] });
  });
  it.each(['authoring_document', 'canonical_document'])('refuses a private %s source project before writes', async sourceEntityType => {
    await ordinaryRefused({ projectId: undefined, sourceEntityType, sourceEntityId: DOCS[1] }, 403, 7, 72);
  });
  it.each([{}, { sourceEntityType: 'unknown_kind', sourceEntityId: DOCS[0] },
    { sourceEntityType: 'authoring_document', sourceEntityId: DOCS[2] }])('keeps valid unfiled intake %j without inventing workspace', async source => {
    const answer = await ordinary({ projectId: undefined, ...source });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data).toMatchObject({ projectId: null, clientWorkspaceId: null });
  });
  it('preserves explicit project precedence over source metadata', async () => {
    const answer = await ordinary({ sourceEntityType: 'authoring_document', sourceEntityId: DOCS[1] });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data).toMatchObject({ projectId: 11, clientWorkspaceId: 71, sourceEntityId: DOCS[1] });
  });
});

describe('ordinary canonical write, RR1 and COMMIT boundary', () => {
  it.each(['reviewRouteId', 'reviewRole', 'reviewStep', 'routeSignatureId', 'routeActId', 'routeAuthoringSignatureId'])(
    'refuses ordinary protected input %s before writes', async column => {
      const before = await counts(); const answer = await ordinary({ [column]: 'protected' });
      expect(answer.status, JSON.stringify(answer.body)).toBe(400);
      expect(answer.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED'); expect(await counts()).toEqual(before);
    });
  it('rolls back the task and action when actual audit persistence fails', async () => {
    const before = await counts(); await injectedFailure('audit_logs', 'tenant_id<>9', async () => {
      const answer = await ordinary(); expect(answer.status, JSON.stringify(answer.body)).toBe(500);
      expect(answer.body.error).toBe('AUDIT_WRITE_FAILED'); expect(await counts()).toEqual(before);
    });
  });
  it('notifies another named assignee only after confirmed COMMIT', async () => {
    const answer = await ordinary({ assigneeId: 9 }); expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(transactionEvents).toEqual(['COMMIT', 'notification']); expect(effects.notify).toHaveBeenCalledOnce();
    expect(effects.notify).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 9, recipientUserId: 9, taskId: answer.body.data.taskId }));
    expect(await counts()).toEqual({ tasks: 1, edges: 0, actions: 1, audits: 1, usage: 0 });
  });
  it('discards an actually committed lost acknowledgement and sends no success notice', async () => {
    loseNextCommit(); const answer = await ordinary({ assigneeId: 9 });
    expect(answer.status, JSON.stringify(answer.body)).toBe(500); expect(answer.body.error).toBe('OUTCOME_UNKNOWN');
    expect(discards).toBe(1); expect(transactionEvents).toEqual(['COMMIT']); expect(effects.notify).not.toHaveBeenCalled();
    expect(answer.body.message).not.toMatch(/nothing was (created|changed)/i);
    expect(await counts()).toEqual({ tasks: 1, edges: 0, actions: 1, audits: 1, usage: 0 });
  });
  it.each(['/api/task-management', '/api/tasks'])('keeps ordinary metadata, provenance and atomic lineage through %s', async alias => {
    const answer = await ordinary({ status: 'in-progress', priority: 'high', moduleData: { section: 'results' },
      reason: 'Prepare the actual review', startDate: '2026-11-06T10:00:00.000Z' }, 7, 71, alias);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200); expect(answer.body.success).toBe(true);
    expect(answer.body.data).toMatchObject({ projectId: 11, clientWorkspaceId: 71, createdById: 7, assigneeId: 7,
      assigneeName: 'Project owner', assignedBy: 7, status: 'in-progress', priority: 'high', moduleData: { section: 'results' } });
    expect(answer.body.data.assignedAt).toBeTruthy(); expect(answer.body.data.startDate).toBe('2026-11-06T10:00:00.000Z');
    const saved = (await env.owner.query(`SELECT a.command,a.proposed_by,l.reason,l.ana_action_id,a.id,a.audit_row_id,l.id AS audit_id,
      t.xmin::text AS task_tx,a.xmin::text AS action_tx,l.xmin::text AS audit_tx FROM ${env.t('unified_tasks')} t
      JOIN ${env.t('c2c_ana_actions')} a ON a.target='task:'||t.task_id JOIN ${env.t('audit_logs')} l ON l.id=a.audit_row_id::text`)).rows;
    expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ command: 'task.create', proposed_by: 7, reason: 'Prepare the actual review' });
    expect(saved[0].ana_action_id).toBe(saved[0].id); expect(saved[0].task_tx).toBe(saved[0].action_tx); expect(saved[0].task_tx).toBe(saved[0].audit_tx);
    expect(await counts()).toEqual({ tasks: 1, edges: 0, actions: 1, audits: 1, usage: 0 });
  });
});

describe('workflow creation requires its actual project and current authority', () => {
  it.each([undefined, null, 0, -1, 1.5, '11', '11x', true, [], {}, 2_147_483_648])('refuses invalid project %j without writes', async projectId => {
      await refused({ projectId }, 400, 'TASK_PROJECT_INVALID');
    });
  it.each([13, 999_999])('refuses foreign or missing project %s', async projectId => {
    await refused({ projectId }, 404, 'TASK_PROJECT_NOT_FOUND');
  });
  it.each(['archived', 'deleted'])('refuses the actual %s parent', async status => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET status=$1 WHERE id=11`, [status]);
    await refused({ projectId: 11 }, 409, 'TASK_PROJECT_CLOSED');
  });
  it('does not trust a claimed administrator whose actual organization role is viewer', async () => {
    await env.owner.query(`UPDATE ${env.t('organization_users')} SET role='viewer' WHERE user_id=7`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('does not trust a removed organization member', async () => {
    await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE user_id=7`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('refuses the actual inactive actor even with a claimed administrator role', async () => {
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 11);
  });
  it('refuses an inactive organization', async () => {
    await env.owner.query(`UPDATE ${env.t('organizations')} SET status='inactive' WHERE id=9`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('refuses a project use/read share as task-create authority', async () => {
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 10);
  });
  it('refuses an inactive edit share', async () => {
    await env.owner.query(`UPDATE ${env.t('project_members')} SET status='inactive' WHERE user_id=8`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 8);
  });
  it('uses the actual current edit share, recording its real creator and parent', async () => {
    const answer = await create({ projectId: 11 }, 8);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data.every((row: { createdById: number; projectId: number; clientWorkspaceId: number }) =>
      row.createdById === 8 && row.projectId === 11 && row.clientWorkspaceId === 71)).toBe(true);
    expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
  });
  it('keeps the existing authenticated viewer role gate', async () => {
    const before = await counts(); const answer = await request(app(7, 9, 71, 'viewer'))
      .post(`/api/task-management/tasks/from-template/${TEMPLATE}`).send({ projectId: 11 });
    expect(answer.status).toBe(403); expect(await counts()).toEqual(before);
  });
});

describe('the project determines workspace scope', () => {
  it.each([72, '71x', 0, -1, 1.5, true, {}, 2_147_483_648])('refuses mismatched or malformed client claim %j', async workspace => {
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 7, workspace);
  });
  it.each([null, '71'])('records actual workspace with an absent or normalized claim %j', async workspace => {
    const answer = await create({ projectId: 11 }, 7, workspace);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    for (const row of answer.body.data) expect(row.clientWorkspaceId).toBe(71);
  });
  it('keeps an actually unfiled project workspace null', async () => {
    const answer = await create({ projectId: 14 }, 7, null);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    for (const row of answer.body.data) expect(row).toMatchObject({ projectId: 14, clientWorkspaceId: null });
  });
  it('refuses an explicit client claim on a project with no workspace', async () => {
    await refused({ projectId: 14 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('refuses a project whose actual workspace belongs to another organization', async () => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET client_workspace_id=81 WHERE id=11`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 7, null);
  });
  it('refuses a project whose recorded workspace is missing', async () => {
    await env.owner.query(`DELETE FROM ${env.t('client_workspaces')} WHERE id=71`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 7, null);
  });
  it('does not let body client, organization or creator values redirect admitted tasks', async () => {
    const answer = await create({ projectId: 11, clientWorkspaceId: 72, organizationId: 10, createdById: 9 });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    for (const row of answer.body.data) expect(row).toMatchObject({ organizationId: 9, projectId: 11, clientWorkspaceId: 71, createdById: 7 });
  });
});

describe('workflow transaction and review-route protections remain canonical', () => {
  it.each(['/api/task-management', '/api/tasks'])('keeps the existing legacy envelope and atomic lineage through %s', async alias => {
    const answer = await create({ projectId: 11, startDate: '2026-11-06T10:00:00.000Z', adjustDates: true }, 7, 71, TEMPLATE, alias);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body).toMatchObject({ success: true, count: 2, template: 'Native project workflow' });
    expect(answer.body.data).toHaveLength(2);
    const saved = (await env.owner.query(`SELECT task_id,project_id,client_workspace_id,start_date,source_entity_type,source_entity_id,
      xmin::text AS tx FROM ${env.t('unified_tasks')} ORDER BY id`)).rows;
    expect(saved[0].start_date.toISOString()).toBe('2026-11-06T10:00:00.000Z');
    expect(saved[1].start_date.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    for (const row of saved) expect(row).toMatchObject({ project_id: 11, client_workspace_id: 71, source_entity_type: 'taskTemplate', source_entity_id: TEMPLATE });
    const transactions = (await env.owner.query(`SELECT xmin::text AS tx FROM ${env.t('unified_tasks')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('task_dependencies')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('audit_logs')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('c2c_ana_actions')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('task_templates')}`)).rows;
    expect(new Set(transactions.map(row => row.tx)).size).toBe(1);
    const actions = (await env.owner.query(`SELECT a.id AS action_id,a.command,a.target,a.proposed_by,a.audit_row_id,l.reason,l.ana_action_id,
      l.sha256_chain,l.chain_seq,l.hmac_seal FROM ${env.t('c2c_ana_actions')} a
      JOIN ${env.t('audit_logs')} l ON l.id=a.audit_row_id::text AND l.tenant_id=a.org_id`)).rows;
    expect(actions.filter(row => row.command === 'task.create')).toHaveLength(2);
    expect(actions.filter(row => row.command === 'task.link')).toHaveLength(1);
    for (const row of actions) {
      expect(row.proposed_by).toBe(7); expect(row.reason).toBeNull(); expect(row.ana_action_id).toBe(row.action_id);
      expect(row.sha256_chain).toMatch(/^[a-f0-9]{64}$/); expect(row.chain_seq).not.toBeNull(); expect(row.hmac_seal).toBeTruthy();
    }
    expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
  });
  it.each(['reviewRouteId', 'reviewRole', 'reviewStep', 'routeSignatureId', 'routeActId', 'routeAuthoringSignatureId'])(
    'still refuses protected request column %s before project or workflow writes', async column => {
      const before = await counts(); const answer = await create({ projectId: 11, [column]: 'protected' });
      expect(answer.status, JSON.stringify(answer.body)).toBe(400);
      expect(answer.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED'); expect(await counts()).toEqual(before);
    });
  it('still refuses a stored task definition naming a protected review column', async () => {
    await env.owner.query(`UPDATE ${env.t('task_templates')} SET tasks=$1::json WHERE template_id=$2`,
      [JSON.stringify([{ ...DEFINITIONS[0], reviewRouteId: '11111111-2222-4333-8444-555555555555' }, DEFINITIONS[1]]), TEMPLATE]);
    const before = await counts(); const answer = await create();
    expect(answer.status, JSON.stringify(answer.body)).toBe(400);
    expect(answer.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED'); expect(await counts()).toEqual(before);
  });
});

describe('workflow rollback and uncertain acknowledgement', () => {
  it.each(['unified_tasks', 'task_dependencies', 'c2c_ana_actions', 'task_templates'])(
    'rolls back every workflow fact when actual %s persistence fails', async table => {
      const before = await counts();
      const predicate = table === 'unified_tasks' ? "title <> 'Record the conclusion'"
        : table === 'task_templates' ? 'usage_count=0' : table === 'c2c_ana_actions' ? 'org_id<>9' : 'organization_id<>9';
      await injectedFailure(table, predicate, async () => {
        const answer = await create(); expect(answer.status, JSON.stringify(answer.body)).toBe(500);
        expect(answer.body.error).not.toBe('OUTCOME_UNKNOWN'); expect(await counts()).toEqual(before);
      });
    });
  it('reports an actually committed lost acknowledgement as unknown and discards its request connection', async () => {
    loseNextCommit(); const answer = await create();
    expect(answer.status, JSON.stringify(answer.body)).toBe(500); expect(answer.body.error).toBe('OUTCOME_UNKNOWN');
    expect(discards).toBe(1); expect(answer.body.message).not.toMatch(/nothing was (created|changed)/i);
    expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
  });
  it('keeps built-in template creation on the admitted parent without inventing stored usage', async () => {
    const builtin = getBuiltinWorkflowTemplate('BUILTIN-IND')!;
    const answer = await create({ projectId: 11 }, 7, 71, builtin.templateId);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.count).toBe(builtin.tasks.length);
    for (const row of answer.body.data) expect(row).toMatchObject({ projectId: 11, clientWorkspaceId: 71 });
    expect(await counts()).toEqual({ tasks: builtin.tasks.length, edges: builtin.dependencies.length,
      actions: builtin.tasks.length + builtin.dependencies.length, audits: builtin.tasks.length + builtin.dependencies.length, usage: 0 });
  });
});

describe('workflow admission retains current project permissions', () => {
  it('rechecks the edit membership after a real parent-lock wait instead of retaining an earlier grant', async () => {
    const holder = await env.owner.connect(); let open = true;
    let pending: Promise<request.Response> | undefined;
    try {
      await holder.query('BEGIN'); const blocker = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query(`SELECT id FROM ${env.t('projects')} WHERE id=11 FOR UPDATE`);
      pending = create({ projectId: 11 }, 8).then(answer => answer);
      expect(await waitFor(async () => (await env.owner.query(`SELECT pid FROM pg_stat_activity
        WHERE usename=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))`, [env.runtimeRole, blocker])).rows.length > 0, 5_000)).toBe(true);
      await holder.query(`DELETE FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`);
      await holder.query('COMMIT'); open = false;
      const answer = await pending; expect(answer.status, JSON.stringify(answer.body)).toBe(403);
      expect(answer.body.code).toBe('TASK_PROJECT_ACCESS_DENIED');
      expect(await counts()).toEqual({ tasks: 0, edges: 0, actions: 0, audits: 0, usage: 0 });
    } finally {
      if (open) await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined);
    }
  });
  it('retains actual edit membership until its workflow transaction commits, before a waiting revocation', async () => {
    const holder = await env.owner.connect(); const revoker = await env.owner.connect();
    let holderOpen = false; let revokerOpen = false;
    let pending: Promise<request.Response> | undefined;
    let revocation: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN'); holderOpen = true;
      const blocker = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query(`LOCK TABLE ${env.t('unified_tasks')} IN ACCESS EXCLUSIVE MODE`);
      pending = create({ projectId: 11 }, 8).then(answer => answer);
      let requestPid = 0;
      expect(await waitFor(async () => {
        const rows = (await env.owner.query(`SELECT pid FROM pg_stat_activity
          WHERE usename=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))`, [env.runtimeRole, blocker])).rows;
        requestPid = Number(rows[0]?.pid ?? 0); return requestPid > 0;
      }, 5_000)).toBe(true);
      await revoker.query('BEGIN'); revokerOpen = true;
      const revokerPid = Number((await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      revocation = revoker.query(`DELETE FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`);
      expect(await waitFor(async () => (await env.owner.query(`SELECT pid FROM pg_stat_activity
        WHERE pid=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))`, [revokerPid, requestPid])).rows.length === 1, 5_000)).toBe(true);
      await holder.query('COMMIT'); holderOpen = false;
      const answer = await pending; expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      await revocation; await revoker.query('COMMIT'); revokerOpen = false;
      expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
      await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 8);
    } finally {
      if (holderOpen) await holder.query('ROLLBACK'); holder.release();
      await pending?.catch(() => undefined); await revocation?.catch(() => undefined);
      if (revokerOpen) await revoker.query('ROLLBACK'); revoker.release();
    }
  });
});
