/**
 * The AnA executor suites' pool, over one in-process PGlite connection.
 *
 * `query` answers both shapes production's pg client is called with: pg's
 * `query(text, values)`, and Drizzle's `query({ text, values, rowMode })` —
 * the completion cascade runs Drizzle over the board write's own client
 * (task-side-effects `cascadeUnblockOnCompletionOnClient`). For Drizzle's
 * calls, timestamps and dates come back as the raw strings its node-postgres
 * driver asks pg for. PGlite is one connection, so `connect()` hands back that
 * connection: BEGIN, the writes and COMMIT/ROLLBACK through it are one real
 * transaction.
 *
 * TASK_GRAPH_PGLITE_DDL is `task_dependencies` exactly as the migration set's
 * baseline creates it: every completion reads it.
 */
import type { PGlite } from '@electric-sql/pglite';
import { extractTableDdl } from '../../../../tests/golden-journeys/harness';

type DrizzleCall = { text: string; values?: unknown[]; rowMode?: string };
const RAW = (v: string) => v;

export function pglitePool(pg: () => PGlite) {
  const query = async (textOrConfig: string | DrizzleCall, params?: unknown[]) => {
    const drizzleCall = typeof textOrConfig !== 'string';
    const { text, values, rowMode } = drizzleCall ? textOrConfig : { text: textOrConfig, values: params, rowMode: undefined };
    const r = await pg().query(text, (values ?? params ?? []) as unknown[], {
      ...(rowMode === 'array' ? { rowMode: 'array' as const } : {}),
      ...(drizzleCall ? { parsers: { 1114: RAW, 1184: RAW, 1082: RAW } } : {}),
    });
    const rows = r.rows as Array<Record<string, unknown>>;
    return { rows, rowCount: (r as { affectedRows?: number }).affectedRows ?? rows.length, fields: r.fields ?? [] };
  };
  const client = { query, release: () => undefined };
  return { query, connect: async () => client, client };
}

export const TASK_GRAPH_PGLITE_DDL = extractTableDdl('migrations/0000_sweet_joseph.sql', ['task_dependencies']);
