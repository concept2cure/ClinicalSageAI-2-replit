/**
 * A project's recorded activity, newest first (GET /api/c2c/projects/:id/activity,
 * the Project home feed). Moved unchanged from the route on 2026-10-21, with two
 * additions, so a governed act on the project reads as what it was:
 *   - `reason`: the reason recorded with the row (audit_logs.reason; 21 CFR
 *     11.10(e), "available for review"). Adding a market records one, and the
 *     feed showed none of it;
 *   - `event` and `event_agency`: the governed action's own event and agency
 *     (c2c_ana_actions.payload, joined by the row's ana_action_id), so a market
 *     added is named as that, not as "c2c.work.transition".
 * The caller checks the project is the organization's before calling.
 *
 * @module server/services/c2c/project-activity
 */
interface Queryable { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }

export interface ProjectActivityRow {
  id: string;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  actor_id: number | string | null;
  details: unknown;
  actor_name: string | null;
  occurred_at: string | null;
  ip_address: string | null;
  reason: string | null;
  event: string | null;
  event_agency: string | null;
}

export async function readProjectActivity(db: Queryable, programId: string, orgId: number, limit: number): Promise<ProjectActivityRow[]> {
  // Columns aliased from what audit_logs ACTUALLY has (table_name /
  // record_id / new_values — see migrations/0000_sweet_joseph.sql plus the
  // chain fields from 20260527_mutation_primitives.sql) to the names the
  // client's ActivityRow reads. The projection previously named
  // resource_type / resource_id / details, none of which are columns, so
  // every request raised 42703 into the route's catch and the feed rendered
  // empty no matter how much audited activity a project had.
  const { rows } = await db.query(
    `SELECT
       al.id, al.action, al.table_name AS resource_type, al.record_id AS resource_id,
       COALESCE(al.actor_id, al.user_id) AS actor_id, al.new_values AS details,
       COALESCE(u.name, u.email) AS actor_name,
       al.occurred_at, al.ip_address,
       NULLIF(btrim(al.reason), '') AS reason,
       aa.payload->>'event' AS event, aa.payload->>'agency' AS event_agency
     FROM audit_logs al
     LEFT JOIN LATERAL public.actor_name(COALESCE(al.actor_id, al.user_id)) u ON TRUE
     LEFT JOIN c2c_ana_actions aa ON aa.id = al.ana_action_id AND aa.org_id = al.tenant_id
     WHERE al.tenant_id = $2
       AND (al.record_id = $1
            OR al.target = 'regulatory_program:' || $1
            OR al.new_values->>'project_id' = $1
            OR al.new_values->>'programId' = $1
            -- A governed action on one of the project's own filing documents
            -- names its target (document:<id>), not the project (PF-17): the
            -- scaffold that created the project's dossier was invisible here.
            OR (al.target_type = 'document' AND al.target_id IN (
                  SELECT d.id::text FROM c2c_documents d WHERE d.project_id = $1::uuid AND d.org_id = $2)))
     ORDER BY al.occurred_at DESC NULLS LAST
     LIMIT $3`,
    [programId, orgId, limit],
  );
  return rows as ProjectActivityRow[];
}
