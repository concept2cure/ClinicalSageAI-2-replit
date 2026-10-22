import { vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

interface SsoDbState {
  rows: Record<string, Record<string, unknown>[]>;
  inserts: { table: string; values: Record<string, unknown> }[];
  updates: { table: string; values: Record<string, unknown> }[];
  selectWheres: { table: string; sql: string; params: unknown[] }[];
  nextId: number;
}

/** Evaluate each rendered WHERE conjunction so tenant-binding regressions cannot pass on an unscoped stub. */
export function createSsoDbFixture(dbState: SsoDbState) {
  const dialect = new PgDialect();
  const camel = (s: string) => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const holds = (row: Record<string, unknown>, sql: string, params: unknown[]) => {
    const re = /"[^"]+"\."([^"]+)"\s*=\s*\$(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      if (row[camel(m[1])] !== params[Number(m[2]) - 1]) return false;
    }
    return true;
  };
  const select = () => ({
    from: (table: unknown) => {
      const name = getTableName(table as never);
      let rows = dbState.rows[name] ?? [];
      const chain = {
        where: (cond: unknown) => {
          const q = dialect.sqlToQuery(cond as never);
          dbState.selectWheres.push({ table: name, sql: q.sql, params: q.params });
          rows = rows.filter(r => holds(r, q.sql, q.params));
          return chain;
        },
        limit: async (n: number) => rows.slice(0, n),
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    },
  });
  const insert = (table: unknown) => ({
    values: (v: Record<string, unknown>) => {
      const name = getTableName(table as never);
      const row = { id: dbState.nextId++, ...v };
      dbState.inserts.push({ table: name, values: v });
      (dbState.rows[name] ??= []).push(row);
      return {
        returning: async () => [row],
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve([row]).then(res, rej),
      };
    },
  });
  const update = (table: unknown) => ({
    set: (v: Record<string, unknown>) => ({
      where: async () => {
        dbState.updates.push({ table: getTableName(table as never), values: v });
      },
    }),
  });
  const db = { select, insert, update };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return { db, pool, getPool: () => pool, getDb: () => db, query: pool.query };
}
