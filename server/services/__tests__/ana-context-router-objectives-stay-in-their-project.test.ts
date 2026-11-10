/**
 * AnA's objectives context holds the organisation's own objectives and the open
 * project's, never another project's.
 *
 * Until 2026-11-01 buildWisdomRouterContext read the top three active
 * objectives of every project in the organisation into each project's context,
 * across client workspaces. The database is replaced. The objectives query's
 * WHERE is rendered to SQL and read.
 */
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ wheres: [] as unknown[], tables: [] as string[], objectives: [] as unknown[] }));

vi.mock('../../db', () => {
  const chain = (rows: unknown[]) => {
    const c: any = {
      from: (table: never) => {
        const name = getTableName(table); h.tables.push(name);
        rows = name === 'ana_platform_wisdom' ? [{ category: 'risk_reduction', patternDescription: 'PRIVATE_LEGACY_CANARY', recommendation: 'PRIVATE_STRATEGY_CANARY' }]
          : name === 'ana_client_objectives' ? h.objectives : [];
        return c;
      },
      where: (cond: unknown) => { h.wheres.push(cond); return c; },
      orderBy: () => c,
      limit: async () => rows,
    };
    return c;
  };
  return { db: { select: () => chain([]) } };
});

import { buildMergedContext, buildWisdomRouterContext, buildUserContext } from '../ana-context-router';

const dialect = new PgDialect();
const objectivesWhere = () => dialect.sqlToQuery(h.wheres[0] as never).sql.toLowerCase();

beforeEach(() => { h.wheres.length = 0; h.tables.length = 0; h.objectives = []; });

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


describe('legacy global wisdom cannot enter the live context', () => {
  it('reads scoped objectives while never requesting an active poisonous legacy row', async () => {
    h.objectives = [{ objective: 'CURRENT_PROJECT_OBJECTIVE', priority: 'high', status: 'on_track', targetDate: null }];
    const block = await buildWisdomRouterContext(5, 7);
    expect(block).toContain('CURRENT_PROJECT_OBJECTIVE');
    expect(block).not.toMatch(/PRIVATE_LEGACY|PRIVATE_STRATEGY/);
    expect(h.tables).toEqual(['ana_client_objectives']);
  });
  it('does not request legacy wisdom from the full merged context path', async () => {
    const block = await buildMergedContext({ organizationId: 5, projectId: 7 });
    expect(h.tables).not.toContain('ana_platform_wisdom');
    expect(block.contextBlock).not.toMatch(/PRIVATE_LEGACY|PRIVATE_STRATEGY/);
  });
});

describe('instruction scope in the live context assembly', () => {
  it('carries project > company > personal precedence even without a saved user profile', async () => {
    const result = await buildMergedContext({ organizationId: 5, projectId: 7 });
    expect(result.layers.user).toBeNull();
    expect(result.contextBlock).toContain('Project instructions take precedence over company instructions');
    expect(result.contextBlock).toContain('which take precedence over personal defaults');
    expect(result.contextBlock).toContain('A hard gate at any scope remains binding');
    expect(result.contextBlock).toContain('surface the conflict for a human decision before the affected action');
    expect(result.contextBlock).toContain('governed actions still require their runtime gates');
  });
});


describe('owner-private user preferences never enter generic prompt capture', () => {
  it('does not read or render the private profile before a protected SDK context is admitted', async () => {
    const block = await buildUserContext(3, 5);
    expect(block).toContain('not included in the shared context');
    expect(h.tables).not.toContain('user_intelligence_profiles');
    const merged = await buildMergedContext({ organizationId: 5, projectId: 7, userId: 3 });
    expect(merged.layers.user).toContain('protected owner context');
    expect(merged.contextBlock).toContain('Private approval rules remain enforced independently');
    expect(h.tables).not.toContain('user_intelligence_profiles');
  });
});
