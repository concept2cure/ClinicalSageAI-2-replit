/**
 * Governed decision lineage — decision-trail read.
 *
 * GET /api/decision-lineage → the org's governed artifacts, each with its
 * immutable, Part-11 hash-chained decision graph, shaped to exactly the keys
 * the v2 DecisionLineage surface renders ({ rootEntityType, rootEntityId,
 * artifactLabel, nodes, edges, metadata }). nodes/edges/metadata rehydrate
 * from JSONB straight into the surface's LineageGraph shape. Org scoped; 403
 * without org context; fails closed to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT root_entity_type, root_entity_id, artifact_label, nodes, edges, metadata
         FROM c2c_decision_lineage
        WHERE organization_id = $1
        ORDER BY sort_order, root_entity_id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      rootEntityType: r.root_entity_type,
      rootEntityId: r.root_entity_id,
      artifactLabel: r.artifact_label,
      nodes: r.nodes ?? [],
      edges: r.edges ?? [],
      metadata: r.metadata ?? {},
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read decision lineage.' } });
  }
});

export default router;
