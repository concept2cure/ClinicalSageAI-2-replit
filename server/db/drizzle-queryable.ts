/**
 * One adapter from a Drizzle runner (the db handle, a request-scoped db, or a
 * Drizzle TRANSACTION) to the pg-style `query(text, params)` the shared
 * writers take — the version writer, the lineage gate, the signature writer.
 *
 * Why it exists: those writers must run on the SAME connection as the content
 * write they describe, so a route that holds a Drizzle transaction cannot hand
 * them a fresh pool client (that would put the lineage on a different
 * connection from the content, and the two would no longer commit or roll back
 * together). The transaction is adapted rather than escaped.
 *
 * The writer's `$n` placeholders are re-bound as Drizzle parameters; the
 * statement text passes through raw and NO value is ever interpolated into it.
 * `sql.param` rather than a bare interpolation, because Drizzle expands a bare
 * array value into a `(a, b, c)` tuple of separate placeholders, which turns a
 * `text[]` parameter into a row expression the column will not take.
 *
 * This used to live as two identical private copies (routes/cerv2-sections.ts,
 * services/part11/signature-persistence.ts); one adapter, one place to be wrong.
 */
import { sql, type SQL } from 'drizzle-orm';

/** A Drizzle runner: the db handle, a request-scoped db, or a transaction. */
export interface DrizzleRunner {
  execute: (query: SQL) => Promise<unknown>;
}

/** The pg-style client shape every shared writer accepts. */
export interface DrizzleQueryable {
  query: <R = any>(text: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
}

export function queryableFromDrizzle(runner: DrizzleRunner): DrizzleQueryable {
  return {
    query: async <R = any>(text: string, params: unknown[] = []) => {
      const parts = text.split(/\$(\d+)/g);
      const chunks: SQL[] = [];
      for (let i = 0; i < parts.length; i += 1) {
        chunks.push(
          i % 2 === 0 ? sql.raw(parts[i]) : sql`${sql.param(params[Number(parts[i]) - 1])}`,
        );
      }
      const result = (await runner.execute(sql.join(chunks))) as
        | { rows?: unknown[]; rowCount?: number | null }
        | unknown[];
      const rows = Array.isArray(result) ? result : (result?.rows ?? []);
      const rowCount = Array.isArray(result) ? rows.length : (result?.rowCount ?? rows.length);
      return { rows: rows as R[], rowCount };
    },
  };
}
