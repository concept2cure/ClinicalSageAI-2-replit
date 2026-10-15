/**
 * One report section from one SQL statement, capped.
 *
 * Every section reads at most SECTION_ROW_CAP rows. The statement is run with
 * one row more than the cap so a section that reached it says so
 * (`truncated: true`) instead of presenting a partial list as the whole.
 *
 * @module server/services/audit/compliance-reports/queries/section
 */
import type { SqlClient, SectionResult } from '../types';

export const SECTION_ROW_CAP = 50_000;

export async function cappedSection(client: SqlClient, sql: string, params: unknown[]): Promise<SectionResult> {
  const { rows } = await client.query(`${sql}\n LIMIT ${SECTION_ROW_CAP + 1}`, params);
  const truncated = rows.length > SECTION_ROW_CAP;
  return { rows: truncated ? rows.slice(0, SECTION_ROW_CAP) : rows, truncated };
}

/** Column definitions from `[key, label]` pairs, so a section's shape reads as a table. */
export function columns(pairs: ReadonlyArray<readonly [string, string]>): { key: string; label: string }[] {
  return pairs.map(([key, label]) => ({ key, label }));
}

/**
 * The SQL that joins a past actor's name and email (public.actor_name,
 * migrations/20260929_actor_names.sql: members and past actors of the calling
 * organisation, nobody else). Wrapped in `LIMIT 1` so the planner counts the
 * one row it returns: the function carries the default 1,000-row estimate,
 * which multiplies per join — two joins on an empty table planned a
 * million-row result and spent ~0.7 s in JIT compilation.
 * `userIdSql` and `alias` are fixed SQL written in this directory, never input.
 */
export function actorJoin(userIdSql: string, alias: string): string {
  return `LEFT JOIN LATERAL (SELECT x.name, x.email FROM public.actor_name(${userIdSql}) x LIMIT 1) ${alias} ON TRUE`;
}

/*
 * Timestamps (review round 1, item 10). Every timestamp a report carries is
 * rendered in SQL as ISO-8601 UTC text, so a file means the same instant on any
 * reader's machine. `timestamp with time zone` values are converted to UTC.
 * `timestamp without time zone` values carry no zone: they are written by
 * now() in a database session, or from a JS Date by the node-postgres driver
 * in the server process's local time, and the server image (node:22-slim, no TZ
 * set) and the database (RDS default, no timezone parameter in this
 * repository) both run in UTC — so the stored wall-clock time is UTC, and is
 * shown as UTC. NAIVE_UTC_NOTE states that assumption in each section that
 * relies on it. Period bounds are compared the same way: as instants against
 * zoned columns, as UTC wall-clock time against unzoned ones.
 */
const ISO_UTC_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

/** ISO-8601 UTC text of a `timestamp with time zone` expression. */
export function isoUtc(expr: string): string {
  return `to_char((${expr}) AT TIME ZONE 'UTC', ${ISO_UTC_FORMAT})`;
}

/** ISO-8601 UTC text of a `timestamp without time zone` expression, whose stored value is UTC. */
export function isoNaiveUtc(expr: string): string {
  return `to_char(${expr}, ${ISO_UTC_FORMAT})`;
}

/** A `timestamp without time zone` expression as the UTC instant it stores. */
export function naiveAsUtc(expr: string): string {
  return `((${expr}) AT TIME ZONE 'UTC')`;
}

/** Parameter `$n` (an instant) as UTC wall-clock time, to compare with an unzoned column. */
export function utcWallClock(n: number): string {
  return `($${n}::timestamptz AT TIME ZONE 'UTC')`;
}

/** The section note for columns stored without a time zone. */
export function naiveUtcNote(what: string): string {
  return `Times are UTC. ${what} are stored without a time zone; the server and its database run in UTC, so they are written, and shown, as UTC.`;
}
