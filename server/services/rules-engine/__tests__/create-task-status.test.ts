/**
 * A task a rule creates is written in the task vocabulary, so it reaches the
 * person's Tasks, the board's columns and the cross-store read.
 *
 * It was written with status 'todo', which unified_tasks never holds
 * (task-state-machine.ts TASK_STATUSES): my-work's open statuses and the
 * cross-store read drop it, and the board has no column for it, so the task
 * existed and nobody saw it. The engine is reached in production: PATCH
 * /api/projects/:projectId (projects-management.ts) and the sentinel scheduler
 * started at boot (bootstrap/register-project-routes.ts) both emit rule events.
 */
import { describe, it, expect, vi } from 'vitest';
import { CreateTaskHandler } from '../actions';
import { CREATABLE_TASK_STATUSES } from '../../tasking/task-state-machine';
import type { RuleAction, RuleDefinition, RuleEventPayload } from '../types';

type Call = { sql: string; params: unknown[] };

function fakePool(calls: Call[]) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/^\s*SELECT u\.id/.test(sql)) return { rows: [{ id: 41 }] };
      return { rows: [{ id: 7, title: 'Review the change' }] };
    }),
  };
}

const payload = { organizationId: 3, projectId: 12, userId: 5, event: 'project_status_changed', data: {} } as unknown as RuleEventPayload;
const rule = { ruleId: 'r-1', name: 'QA review on status change' } as unknown as RuleDefinition;

/** The status the INSERT writes: a literal in its VALUES list, or the parameter it binds. */
function insertedStatus(call: Call): unknown {
  const columns = /INSERT INTO unified_tasks\s*\(([^)]*)\)/.exec(call.sql)![1].split(',').map(c => c.trim());
  const values = /VALUES\s*\(([\s\S]*?)\)\s*RETURNING/.exec(call.sql)![1].split(',').map(v => v.trim());
  const value = values[columns.indexOf('status')];
  const param = /^\$(\d+)$/.exec(value);
  return param ? call.params[Number(param[1]) - 1] : value.replace(/^'|'$/g, '');
}

describe('create_task: the status a rule writes', () => {
  it('writes a status the task store holds and the board has a column for', async () => {
    const calls: Call[] = [];
    const handler = new CreateTaskHandler(fakePool(calls) as never);
    const r = await handler.execute(
      { type: 'create_task', params: { title: 'Review the change', dueInDays: 3 } } as unknown as RuleAction, payload, rule);
    expect(r.success).toBe(true);
    const insert = calls.find(c => /INSERT INTO unified_tasks/.test(c.sql))!;
    expect(insert).toBeDefined();
    expect(CREATABLE_TASK_STATUSES as readonly unknown[]).toContain(insertedStatus(insert));
    expect(insertedStatus(insert)).toBe('pending');
  });

  it('control: keeps the tenant, the project and the role-resolved assignee it already wrote', async () => {
    const calls: Call[] = [];
    const handler = new CreateTaskHandler(fakePool(calls) as never);
    const r = await handler.execute(
      { type: 'create_task', params: { title: 'Review the change', assignToRole: 'qa_reviewer' } } as unknown as RuleAction, payload, rule);
    expect(r.success).toBe(true);
    const lookup = calls.find(c => /FROM users u/.test(c.sql))!;
    expect(lookup.sql).toMatch(/ou\.organization_id = \$2/);
    expect(lookup.params).toEqual(['qa_reviewer', 3]);
    const insert = calls.find(c => /INSERT INTO unified_tasks/.test(c.sql))!;
    expect(insert.params[1]).toBe(3);
    expect(insert.params).toContain(12);
    expect(insert.params).toContain(41);
  });
});
