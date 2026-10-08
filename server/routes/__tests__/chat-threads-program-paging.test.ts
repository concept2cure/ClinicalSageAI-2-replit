/**
 * GET /api/chat/threads?program_id= — a project's older conversations are
 * reachable.
 *
 * QA 2026-10-08 (j5, "Project conversation list shows only the newest 8
 * threads with no way to see the rest"): the project page asked for 8 and the
 * route took no position in the list, so the ninth conversation and every one
 * after it could not be opened from the project at all. The route now takes
 * `offset`, so the page can ask for the next ones; it stays the caller's own
 * conversations in the program, newest first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { listThreads } from '../chat/threads';

const PROGRAM = '50c41bb6-5796-4dc6-a848-72e4d1246ebd';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { tenantId: unknown }).tenantId = 1;
    (req as unknown as { user: unknown }).user = { id: 7 };
    next();
  });
  a.get('/api/chat/threads', listThreads);
  return a;
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

const lastCall = () => query.mock.calls[query.mock.calls.length - 1] as [string, unknown[]];

describe('a program’s conversations page past the first screenful', () => {
  it('takes an offset, after the order, bound as a parameter', async () => {
    const res = await request(app()).get(`/api/chat/threads?program_id=${PROGRAM}&limit=9&offset=8`);
    expect(res.status).toBe(200);
    const [sql, params] = lastCall();
    expect(sql).toMatch(/ORDER BY COALESCE\(t\.updated_at, t\.created_at\) DESC, t\.id DESC\s+LIMIT \$3 OFFSET \$5/);
    expect(params).toEqual([1, PROGRAM, 9, 7, 8]);
  });

  it('starts at the newest when no offset, or no usable one, is given', async () => {
    for (const q of ['', '&offset=-4', '&offset=abc', '&offset=2.5']) {
      await request(app()).get(`/api/chat/threads?program_id=${PROGRAM}&limit=9${q}`);
      expect(lastCall()[1][4], q || 'none').toBe(0);
    }
  });

  it('is still the caller’s own conversations in the program', async () => {
    await request(app()).get(`/api/chat/threads?program_id=${PROGRAM}&limit=9&offset=16`);
    const [sql] = lastCall();
    expect(sql).toMatch(/WHERE t\.organization_id = \$1 AND t\.program_id = \$2 AND t\.user_id = \$4/);
  });
});
