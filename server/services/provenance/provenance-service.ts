/**
 * Provenance spine (Capability C2C-02 — seed)
 *
 * A generic, tenant-scoped link store: a source record (e.g. a certified
 * financial disclosure) bound to a target record (e.g. a submission's Module 1
 * entry) with a role. This is the seed of the ALCOA+ provenance spine — every
 * future capability threads source → document → HA-response through it.
 *
 * Writes happen inside the caller's transaction (same client) so the link and
 * the governed action commit or roll back together.
 *
 * @module server/services/provenance/provenance-service
 */

import { pool } from '../../db';

/** A minimal client surface (the pg pool or a checked-out client). */
interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export interface ProvenanceLinkInput {
  organizationId: number;
  userId: number;
  sourceType: string;
  sourceId: number;
  targetType: string;
  targetId: number;
  /** e.g. 'supports', 'derives_from', 'fulfills'. */
  linkRole: string;
}

/**
 * Insert a provenance link in the caller's transaction. Idempotent on the
 * (org, source, target, role) tuple — re-linking returns the existing row.
 */
export async function linkProvenanceTx(client: Queryable, input: ProvenanceLinkInput): Promise<{ id: number }> {
  const existing = await client.query(
    `SELECT id FROM provenance_links
      WHERE organization_id = $1 AND source_type = $2 AND source_id = $3
        AND target_type = $4 AND target_id = $5 AND link_role = $6 AND deleted_at IS NULL
      LIMIT 1`,
    [input.organizationId, input.sourceType, input.sourceId, input.targetType, input.targetId, input.linkRole],
  );
  if (existing.rows.length > 0) return { id: Number(existing.rows[0].id) };

  const { rows } = await client.query(
    `INSERT INTO provenance_links
       (organization_id, source_type, source_id, target_type, target_id, link_role, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [input.organizationId, input.sourceType, input.sourceId, input.targetType, input.targetId, input.linkRole, input.userId],
  );
  return { id: Number(rows[0].id) };
}

export interface ProvenanceLinkRow {
  id: number;
  sourceType: string;
  sourceId: number;
  targetType: string;
  targetId: number;
  linkRole: string;
}

/** List links where the given record is the source (org-scoped). */
export async function listProvenanceFromSource(
  organizationId: number,
  sourceType: string,
  sourceId: number,
): Promise<ProvenanceLinkRow[]> {
  const { rows } = await pool.query(
    `SELECT id, source_type, source_id, target_type, target_id, link_role
       FROM provenance_links
      WHERE organization_id = $1 AND source_type = $2 AND source_id = $3 AND deleted_at IS NULL
      ORDER BY id`,
    [organizationId, sourceType, sourceId],
  );
  return rows.map(mapRow);
}

/** List links where the given record is the target (org-scoped). */
export async function listProvenanceToTarget(
  organizationId: number,
  targetType: string,
  targetId: number,
): Promise<ProvenanceLinkRow[]> {
  const { rows } = await pool.query(
    `SELECT id, source_type, source_id, target_type, target_id, link_role
       FROM provenance_links
      WHERE organization_id = $1 AND target_type = $2 AND target_id = $3 AND deleted_at IS NULL
      ORDER BY id`,
    [organizationId, targetType, targetId],
  );
  return rows.map(mapRow);
}

function mapRow(r: any): ProvenanceLinkRow {
  return {
    id: Number(r.id),
    sourceType: r.source_type,
    sourceId: Number(r.source_id),
    targetType: r.target_type,
    targetId: Number(r.target_id),
    linkRole: r.link_role,
  };
}
