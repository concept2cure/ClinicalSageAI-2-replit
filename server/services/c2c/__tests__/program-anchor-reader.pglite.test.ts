/**
 * readProgramAnchorRow — the one reader of a program's anchor row (PF-08).
 *
 * Its four copies read `.limit(1)` with no order, so a program with two anchor
 * rows resolved to whichever the plan met first: one export could file under
 * one project and the next under the other. On real SQL (PGlite, drizzle):
 * the lowest id is read — the row intake links — and the second is named in
 * the log; another organization's row is never read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({
  createScopedLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { readProgramAnchorRow, resolveProgramProjectAnchor } from '../program-project-anchor';
import type { RequestDb } from '../../../db/requestDb';

const PROGRAM = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const LONE = '9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d';

let pg: PGlite;
let db: RequestDb;

beforeAll(async () => {
  pg = new PGlite();
  // The columns the reader selects and filters on, as shared/schema.ts names them.
  await pg.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL,
      client_workspace_id integer, regulatory_program_id uuid);
    -- Inserted high id first, so heap order is not id order.
    INSERT INTO projects VALUES (40, 7, 4, '${PROGRAM}'), (12, 7, 2, '${PROGRAM}'), (5, 8, 9, '${PROGRAM}'), (30, 7, 3, '${LONE}');
  `);
  db = drizzle(pg) as unknown as RequestDb;
});
afterAll(async () => {
  await pg?.close();
});
beforeEach(() => warn.mockClear());

const read = (programId: string, orgId = 7) => readProgramAnchorRow(db, { programId, orgId, context: 'test' });

describe('readProgramAnchorRow', () => {
  it('two anchor rows: reads the lowest id of the organization and names both', async () => {
    expect(await read(PROGRAM)).toEqual({ id: 12, clientWorkspaceId: 2 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatchObject({ context: 'test', programId: PROGRAM, projectIds: [12, 40] });
    // The canonical resolver agrees.
    expect(await resolveProgramProjectAnchor(db, { programId: PROGRAM, orgId: 7, context: 'test', strict: true })).toBe(12);
  });

  it("another organization's anchor is never read: project 5 is the lowest id but organization 8's", async () => {
    expect(await read(PROGRAM, 8)).toEqual({ id: 5, clientWorkspaceId: 9 });
    expect(await read(PROGRAM, 9)).toBeNull();
  });

  it('one anchor row: read, nothing logged', async () => {
    expect(await read(LONE)).toEqual({ id: 30, clientWorkspaceId: 3 });
    expect(warn).not.toHaveBeenCalled();
  });
});
