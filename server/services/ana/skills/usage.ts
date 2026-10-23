/**
 * How often AnA used each skill: counted from the organization's sealed turn
 * records (`ana_turn_records.record_text`, whose `context.skills` names every
 * skill a turn's model call carried, and whether the person picked it, a
 * project deployed it, or AnA chose it). Nothing is stored for this: the
 * counts are the records, read back.
 *
 * Read for administrators tuning the library (Admin and access → Skills): a
 * skill that never loads is worth a look at its trigger phrases; one that loads
 * on every turn may be too broad. The window is bounded, and so is the number
 * of records read; when the bound is reached the answer says so rather than
 * presenting a partial count as the whole.
 *
 * @module server/services/ana/skills/usage
 */

import type { SkillReadClient } from '../../account-skill-bundles.js';

export const USAGE_MAX_DAYS = 365;
/** The most turn records one read counts; the answer says when it stopped there. */
export const USAGE_MAX_RECORDS = 5000;

export interface SkillUsageRow {
  key: string;
  /** Turns whose model call carried the skill. */
  turns: number;
  /** Of those, picked in the conversation. */
  picked: number;
  /** Of those, deployed to the project. */
  deployed: number;
  lastUsedAt: string | null;
}

export interface SkillUsage {
  days: number;
  /** Turn records read in the window (at most USAGE_MAX_RECORDS). */
  turnsRead: number;
  /** Of those, turns that carried at least one skill. */
  turnsWithSkills: number;
  /** True when the window held more records than were read. */
  capped: boolean;
  skills: SkillUsageRow[];
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

/**
 * The organization's skill use over the last `days` days, newest records first
 * up to the bound. Read on the request's tenant-scoped connection.
 */
export async function readSkillUsage(client: SkillReadClient, organizationId: number, days: number): Promise<SkillUsage> {
  const window = Math.min(USAGE_MAX_DAYS, Math.max(1, Math.floor(days)));
  // `recent` reads one more record than the bound, to know whether the window held more.
  const params = [organizationId, window, USAGE_MAX_RECORDS + 1, USAGE_MAX_RECORDS];
  const [totals, rows] = await Promise.all([
    client.query(
      `WITH recent AS (
         SELECT started_at, record_text::jsonb -> 'context' -> 'skills' AS skills
           FROM ana_turn_records
          WHERE organization_id = $1 AND started_at >= now() - make_interval(days => $2)
          ORDER BY started_at DESC
          LIMIT $3
       )
       SELECT (SELECT count(*) FROM recent)::int AS in_window,
              count(*)::int AS turns_read,
              count(*) FILTER (WHERE jsonb_typeof(r.skills) = 'array' AND jsonb_array_length(r.skills) > 0)::int AS turns_with_skills
         FROM (SELECT * FROM recent LIMIT $4) r`,
      params,
    ),
    client.query(
      `WITH recent AS (
         SELECT started_at, record_text::jsonb -> 'context' -> 'skills' AS skills
           FROM ana_turn_records
          WHERE organization_id = $1 AND started_at >= now() - make_interval(days => $2)
          ORDER BY started_at DESC
          LIMIT $3
       )
       SELECT s.value ->> 'key' AS key,
              count(*)::int AS turns,
              count(*) FILTER (WHERE s.value ->> 'chosen' = 'picked')::int AS picked,
              count(*) FILTER (WHERE s.value ->> 'chosen' = 'deployed')::int AS deployed,
              max(r.started_at) AS last_used_at
         FROM (SELECT * FROM recent LIMIT $4) r
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(r.skills) = 'array' THEN r.skills ELSE '[]'::jsonb END
         ) s
        WHERE s.value ->> 'key' IS NOT NULL
        GROUP BY 1
        ORDER BY turns DESC, key`,
      params,
    ),
  ]);
  const t = totals.rows[0] ?? {};
  return {
    days: window,
    turnsRead: Number(t.turns_read ?? 0),
    turnsWithSkills: Number(t.turns_with_skills ?? 0),
    capped: Number(t.in_window ?? 0) > USAGE_MAX_RECORDS,
    skills: rows.rows.map(r => ({
      key: String(r.key),
      turns: Number(r.turns),
      picked: Number(r.picked),
      deployed: Number(r.deployed),
      lastUsedAt: iso(r.last_used_at),
    })),
  };
}
