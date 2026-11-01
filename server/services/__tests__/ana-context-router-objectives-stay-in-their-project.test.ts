/**
 * AnA's objectives context holds the organisation's own objectives and the open
 * project's, never another project's.
 *
 * Until 2026-11-01 buildWisdomRouterContext read the top three active
 * objectives of every project in the organisation into each project's context,
 * across client workspaces. The database is replaced. The objectives query's
 * WHERE is rendered to SQL and read.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ wheres: [] as unknown[] }));

vi.mock('../../db', () => {
  const chain = (rows: unknown[]) => {
    const c: any = {
      from: () => c,
      where: (cond: unknown) => { h.wheres.push(cond); return c; },
      orderBy: () => c,
      limit: async () => rows,
    };
    return c;
  };
  return { db: { select: () => chain([]) } };
});

import { buildWisdomRouterContext } from '../ana-context-router';

const dialect = new PgDialect();
const objectivesWhere = () => dialect.sqlToQuery(h.wheres[1] as never).sql.toLowerCase();

beforeEach(() => { h.wheres.length = 0; });

describe('buildWisdomRouterContext objectives', () => {
  it("with a project open, reads that project's objectives and the organisation's own", async () => {
    await buildWisdomRouterContext(5, 7);
    const sql = objectivesWhere();
    expect(sql).toContain('"project_id" is null');
    expect(sql).toContain('"project_id" = $');
  });

  it("with no project, reads only the organisation's own objectives", async () => {
    await buildWisdomRouterContext(5);
    const sql = objectivesWhere();
    expect(sql).toContain('"project_id" is null');
    expect(sql).not.toContain('"project_id" = $');
  });
});
