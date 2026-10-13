/** A working copy keeps its exact original dependency through later exports.
 * Keeping extracted data permits renditions; withdrawing data does not. */
import type { AuthoringImportOrigin } from '../../../shared/authoring/source-import';
import { capturedDataEligibleSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility';
import { programInOrganization } from '../c2c/program-access';
import type { Queryable } from './authoring-evidence';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;

function hasVerifiedImportIdentity(source: AuthoringImportOrigin): boolean {
  if (typeof source.id !== 'string' || typeof source.sha256 !== 'string' || !HASH.test(source.sha256)) return false;
  if (source.kind === 'vault') return UUID.test(source.id);
  return source.kind === 'data-room' && /^[1-9]\d*$/.test(source.id);
}

function importMatchesProject(source: AuthoringImportOrigin, programId: unknown): boolean {
  return typeof programId === 'string' && UUID.test(programId) && typeof source.programId === 'string'
    && source.programId.toLowerCase() === programId.toLowerCase();
}

export function savedImportSource(doc: { provenance?: unknown; client_program_id?: unknown }): AuthoringImportOrigin | null {
  const provenance = doc.provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
  const value = (provenance as Record<string, unknown>).importSource;
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved import origin');
  const source = value as AuthoringImportOrigin;
  if (!importMatchesProject(source, doc.client_program_id) || !hasVerifiedImportIdentity(source)) {
    throw new Error('Invalid saved import identity or version');
  }
  return source;
}

export async function verifySavedImportSource(doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable, organizationId: number): Promise<void> {
  const source = savedImportSource(doc);
  if (!source) return;
  if (!(await programInOrganization(q, source.programId, organizationId))) throw new Error('Imported source project unavailable');
  const result = source.kind === 'vault'
    ? await q.query(`SELECT d.content_hash AS hash FROM vault.documents d
        WHERE d.id=$1 AND d.program_id=$2 AND d.deleted_at IS NULL
          AND to_jsonb(d)->>'organization_id'=$3::text AND ${vaultDataEligibleSql('d')} FOR SHARE OF d`,
      [source.id, source.programId, organizationId])
    : await q.query(`SELECT s.checksum AS hash FROM cre_evidence_sources s
        WHERE s.id=$1 AND s.client_program_id=$2 AND s.organization_id=$3
          AND s.source_type='client_document' AND s.is_current IS NOT FALSE AND s.deleted_at IS NULL
          AND ${capturedDataEligibleSql('s')} FOR SHARE OF s`, [source.id, source.programId, organizationId]);
  if (result.rows.length !== 1 || String(result.rows[0].hash ?? '').trim().toLowerCase() !== source.sha256.toLowerCase()) {
    throw new Error('Imported source unavailable or changed');
  }
}
