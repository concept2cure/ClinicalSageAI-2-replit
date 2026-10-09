/**
 * The drafting task routes answer only for the session's own programs.
 *
 * Security audit 2026-09-24, IAM-11 (plan P1-8): POST /api/v1/drafting/start_task
 * recorded a task against any project_id a caller named, and
 * GET /api/v1/drafting/task_status/:task_id returned any task by id, both with
 * no tenant predicate. When the table was unavailable each fell back to a
 * process-wide in-memory map that any authenticated caller could read: a
 * fabricated success and a cross-tenant read in one. drafting_tasks has no
 * organisation column; its project_id names a program, and the program row
 * carries the organisation, so ownership is the program's.
 *
 * The pool is a double keyed on the statements the routes issue, as the other
 * misc-inline-routes test does (tenant-isolation-vault-list.contract.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { createMiscInlineRoutes } from '../misc-inline-routes';

const OWNER_ORG = 9;
const OTHER_ORG = 7;
const TASK = {
  task_id: 'task_1', project_id: 'prog-9', ectd_section: '2.5', document_title: 'Clinical Overview', template: null,
  status: 'COMPLETED', draft_content: 'body', created_at: new Date('2026-09-26T09:00:00Z'), updated_at: new Date('2026-09-26T09:00:00Z'),
};

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
const failing = { insert: false, select: false };

// Answers by statement. A query object (the drizzle shape) is read by its text
// and values so the pre-fix routes are driven by the same double.
const pool = {
  query: vi.fn(async (q: unknown, params?: unknown[]) => {
    const sql = typeof q === 'string' ? q : String((q as { text?: string })?.text ?? '');
    const p = params ?? ((q as { values?: unknown[] })?.values ?? []);
    calls.push({ sql, params: p });
    if (/from\s+"?regulatory_programs"?/i.test(sql)) {
      return String(p[1]) === String(OWNER_ORG) ? { rows: [{ id: 'prog-9' }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/insert\s+into\s+"?drafting_tasks"?/i.test(sql)) {
      if (failing.insert) throw new Error('relation "drafting_tasks" does not exist');
      return { rows: [], rowCount: 1 };
    }
    if (/from\s+"?drafting_tasks"?/i.test(sql)) {
      if (failing.select) throw new Error('connection terminated');
      // The task belongs to org 9: a read predicated on the organisation sees it there only.
      if (/organization_id/i.test(sql)) return String(p[1]) === String(OWNER_ORG) ? { rows: [TASK], rowCount: 1 } : { rows: [], rowCount: 0 };
      return { rows: [TASK], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
};

function app(orgId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = orgId == null ? { id: 1 } : { id: 1, organizationId: orgId };
    next();
  });
  const passthroughAuth = (_req: Request, _res: Response, next: NextFunction) => next();
  a.use('/api', createMiscInlineRoutes(pool as any, passthroughAuth));
  return a;
}

const programReads = () => calls.filter(c => /from\s+"?regulatory_programs"?/i.test(c.sql));
const taskInserts = () => calls.filter(c => /insert\s+into\s+"?drafting_tasks"?/i.test(c.sql));
const START = { project_id: 'prog-9', ectd_section: '2.5', document_title: 'Clinical Overview' };

beforeEach(() => {
  calls.length = 0;
  failing.insert = false;
  failing.select = false;
  delete (global as any).draftingTasks;
});

describe('POST /api/v1/drafting/start_task: the program must be the organisation\'s own', () => {
  it('records a task for a program the session\'s organisation owns (202), having read the program with the organisation as a predicate', async () => {
    const res = await request(app(OWNER_ORG)).post('/api/v1/drafting/start_task').send(START);
    expect(res.status).toBe(202);
    expect(res.body.task_id).toMatch(/^task_/);
    expect(programReads()).toHaveLength(1);
    expect(programReads()[0].sql).toMatch(/organization_id\s*=\s*\$2/);
    expect(String(programReads()[0].params[1])).toBe(String(OWNER_ORG));
    expect(taskInserts()).toHaveLength(1);
  });

  it('refuses a program of another organisation (404) and writes nothing', async () => {
    const res = await request(app(OTHER_ORG)).post('/api/v1/drafting/start_task').send(START);
    expect(res.status).toBe(404);
    expect(taskInserts()).toHaveLength(0);
  });

  it('refuses a session with no organisation (401) before any read', async () => {
    const res = await request(app(null)).post('/api/v1/drafting/start_task').send(START);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('a task that could not be recorded is an error (503), never a success held in process memory', async () => {
    failing.insert = true;
    const res = await request(app(OWNER_ORG)).post('/api/v1/drafting/start_task').send(START);
    expect(res.status).toBe(503);
    expect((global as any).draftingTasks).toBeUndefined();
  });
});

describe('GET /api/v1/drafting/task_status/:task_id: the task is read within the organisation', () => {
  it('returns the organisation\'s own task (200)', async () => {
    const res = await request(app(OWNER_ORG)).get('/api/v1/drafting/task_status/task_1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'task_1', project_id: 'prog-9', status: 'COMPLETED', draft_content: 'body' });
    const read = calls.find(c => /from\s+"?drafting_tasks"?/i.test(c.sql));
    expect(read?.sql).toMatch(/organization_id/);
    expect(String(read?.params[1])).toBe(String(OWNER_ORG));
  });

  it('is 404 for another organisation\'s task', async () => {
    const res = await request(app(OTHER_ORG)).get('/api/v1/drafting/task_status/task_1');
    expect(res.status).toBe(404);
  });

  it('refuses a session with no organisation (401)', async () => {
    const res = await request(app(null)).get('/api/v1/drafting/task_status/task_1');
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('a read that failed is an error (503), not "not found" and not a memory copy', async () => {
    failing.select = true;
    const res = await request(app(OWNER_ORG)).get('/api/v1/drafting/task_status/task_1');
    expect(res.status).toBe(503);
  });
});
