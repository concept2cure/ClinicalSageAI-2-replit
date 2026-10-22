/** Lightweight protocol identity reads, scoped to the tenant and explicit program. */
import { pool } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';

export interface ProtocolReadScope { programId?: string; documentId?: number }

/** The selected full document, or the bounded legacy organization read. */
export async function loadPdevProtocolRows(orgId: number, scope: ProtocolReadScope, executor: RequestSqlClient = pool): Promise<Record<string, unknown>[]> {
  const result = await executor.query(
    `SELECT id, protocol_kind, protocol_number, title, design_type, phase, version, status, updated_at, sponsor, principal_investigator,
            study_design_id, study_design_linked_at, to_jsonb(protocol_documents)->>'program_id' AS program_id
       FROM protocol_documents WHERE organization_id = $1 AND deleted_at IS NULL
         AND ($2::text IS NULL OR ($2 = 'unfiled' AND to_jsonb(protocol_documents)->>'program_id' IS NULL)
           OR to_jsonb(protocol_documents)->>'program_id' = $2)
         AND ($3::integer IS NULL OR id = $3)
       ORDER BY updated_at DESC, id DESC LIMIT $4`,
    [...protocolReadParams(orgId, scope), scope.documentId ? 1 : 25],
  );
  return result.rows;
}

/** A small index of every live document, so older documents remain selectable. */
export async function listPdevProtocolIndex(orgId: number, scope: ProtocolReadScope = {}, executor: RequestSqlClient = pool): Promise<Record<string, unknown>[]> {
  const result = await executor.query(
    `SELECT id, title, protocol_number, protocol_kind, version, status,
            to_jsonb(protocol_documents)->>'program_id' AS program_id
       FROM protocol_documents WHERE organization_id = $1 AND deleted_at IS NULL
         AND ($2::text IS NULL OR ($2 = 'unfiled' AND to_jsonb(protocol_documents)->>'program_id' IS NULL)
           OR to_jsonb(protocol_documents)->>'program_id' = $2)
         AND ($3::integer IS NULL OR id = $3)
       ORDER BY updated_at DESC, id DESC`, protocolReadParams(orgId, scope),
  );
  return result.rows.map((row) => ({ id: String(row.id), title: row.title,
    shortTitle: row.protocol_number, kind: row.protocol_kind, version: row.version,
    status: row.status, programId: row.program_id ?? null }));
}

function protocolReadParams(orgId: number, scope: ProtocolReadScope): unknown[] {
  return [orgId, scope.programId?.toLowerCase() || null, scope.documentId || null];
}

