import { describe, it, expect, vi } from 'vitest';
import { WorkflowExecutionEngine } from '../../services/workflow/WorkflowExecutionEngine';

function createMockDb() {
  const store: Record<string, any[]> = {};
  return {
    calls: [] as any[],
    async query(sql: string, params: any[]) {
      this.calls.push({ sql, params });

      const lsql = sql.toLowerCase();
      if (lsql.includes('select id, name, version from workflow_definitions')) {
        return { rows: [{ id: 'def-1', name: 'Test WF', version: '1.0' }] };
      }
      if (lsql.includes('insert into workflow_runs')) {
        return { rows: [{ id: 'run-1' }] };
      }
      if (lsql.includes('select entry_hash from step_runs')) {
        return { rows: [] };
      }
      if (lsql.includes('insert into step_runs')) {
        return { rows: [] };
      }
      if (lsql.includes('select id from workflow_step_definitions where workflow_definition_id')) {
        // return next step id as null
        return { rows: [] };
      }
      if (lsql.includes('select id, preconditions, effects, name from workflow_step_definitions')) {
        return { rows: [{ id: 'step-1', preconditions: [{ id: 'p1', type: 'DATA_PRESENT', target: 'x', operator: 'EXISTS' }], effects: [{ id: 'e1', type: 'SEND_NOTIFICATION', target: 'user', payload: {} }], name: 'Step 1' }] };
      }
      if (lsql.includes('select id, workflow_definition_id, current_step_id')) {
        return { rows: [{ id: 'run-1', workflow_definition_id: 'def-1', current_step_id: 'step-1', completed_steps_count: 0, total_steps_count: 1, context: { x: 'present' }, tenant_id: 't1' }] };
      }
      return { rows: [] };
    }
  };
}

describe('WorkflowExecutionEngine', () => {
  it('refuses the retired engine before recording simulated effects or completion', () => {
    const db = createMockDb();
    const logger = { info: vi.fn(), error: vi.fn() };
    expect(() => new WorkflowExecutionEngine(db, logger)).toThrowError(expect.objectContaining({ code: 'PARALLEL_WORKFLOW_RETIRED' }));
    expect(db.calls).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
