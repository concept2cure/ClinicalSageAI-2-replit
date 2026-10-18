import type { Queryable } from './authoring-evidence';
import type { ProtocolCompositionSnapshot } from '../protocol-export/protocol-export-service';

export interface RetiredProtocolMatrixEndpoint { id: number; removed: true }
export interface RetiredProtocolMatrixEndpoints {
  visits: RetiredProtocolMatrixEndpoint[];
  assessments: RetiredProtocolMatrixEndpoint[];
}

function missingEndpointIds(cells: Record<string, unknown>[], live: Record<string, unknown>[], field: 'visit_id' | 'assessment_id'): number[] {
  const active = new Set(live.map(row => row.id));
  return [...new Set(cells.map(cell => Number(cell[field])).filter(id => !active.has(id)))].sort((a, b) => a - b);
}

function verifiedRemovedRows(rows: Array<{ id: unknown; removed: unknown }>, ids: number[]): RetiredProtocolMatrixEndpoint[] | null {
  const expected = new Set(ids);
  if (rows.length !== expected.size || !rows.every(row => typeof row.id === 'number' && expected.has(row.id) && row.removed === true)) return null;
  if (new Set(rows.map(row => row.id)).size !== rows.length) return null;
  return rows.map((row): RetiredProtocolMatrixEndpoint => ({ id: Number(row.id), removed: true })).sort((a, b) => a.id - b.id);
}

/** The canonical removal writers retain cells after soft-removing a visit or
 * assessment. Verify those missing live endpoints against their exact recorded
 * protocol/tenant identities; missing or foreign endpoints remain corruption.
 * Healthy snapshots make no extra reads and keep their existing fingerprints. */
export async function verifyRetainedProtocolMatrixEndpoints(q: Queryable, organizationId: number, documentId: number,
  source: ProtocolCompositionSnapshot['sourceRows']): Promise<RetiredProtocolMatrixEndpoints | null> {
  const visitIds = missingEndpointIds(source.cells, source.visits, 'visit_id');
  const assessmentIds = missingEndpointIds(source.cells, source.assessments, 'assessment_id');
  const [visits, assessments] = await Promise.all([
    visitIds.length ? q.query(`SELECT id, deleted_at IS NOT NULL AS removed FROM protocol_schedule_visits
      WHERE organization_id=$1 AND protocol_document_id=$2 AND id=ANY($3::integer[]) ORDER BY id`,
    [organizationId, documentId, visitIds]) : Promise.resolve({ rows: [] }),
    assessmentIds.length ? q.query(`SELECT id, deleted_at IS NOT NULL AS removed FROM protocol_soa_assessments
      WHERE organization_id=$1 AND protocol_document_id=$2 AND id=ANY($3::integer[]) ORDER BY id`,
    [organizationId, documentId, assessmentIds]) : Promise.resolve({ rows: [] }),
  ]);
  const retiredVisits = verifiedRemovedRows(visits.rows, visitIds);
  const retiredAssessments = verifiedRemovedRows(assessments.rows, assessmentIds);
  return retiredVisits && retiredAssessments ? { visits: retiredVisits, assessments: retiredAssessments } : null;
}
