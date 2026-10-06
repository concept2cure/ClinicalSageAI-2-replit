/** Selected source context after original-file withdrawal. Existing extraction
 * only: no storage read, OCR, inference, or rewriting of the captured identity. */
import { pool } from '../../db.js';
import { createHash } from 'node:crypto';
import { capturedDataEligibleSql, capturedDispositionChoiceSql } from '../document-data-disposition/eligibility.js';
import { sourceIdList } from './evidence-spine.service.js';

export interface RetainedSourceContext {
  sourceId: number;
  title: string;
  sha256: string;
  textSha256: string;
  text: string;
  truncated: boolean;
  originalFileAvailable: false;
  representationId: string;
}

export async function readRetainedSourceContexts(
  organizationId: number,
  programId: string | null,
  sourceIds: unknown,
): Promise<RetainedSourceContext[]> {
  if (!programId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) return [];
  const ids = [...new Set(sourceIdList(sourceIds))].slice(0, 20);
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT s.id, s.title, s.checksum, text_record.content, text_record.representation_id
       FROM cre_evidence_sources s
       JOIN public.document_data_dispositions dd ON dd.organization_id = s.organization_id
         AND dd.program_id = s.client_program_id AND dd.source_sha256 = s.checksum
         AND dd.choice = 'keep_data'
       JOIN LATERAL (
         SELECT d.extracted_text AS content, 'vault:' || d.id::text AS representation_id, 0 AS priority
           FROM vault.documents d
           JOIN regulatory_programs rp ON rp.id = d.program_id AND rp.organization_id = s.organization_id
          WHERE (d.organization_id IS NULL OR d.organization_id = s.organization_id) AND d.program_id = s.client_program_id
            AND d.content_hash = s.checksum AND d.deleted_at IS NULL
            AND length(btrim(d.extracted_text)) > 0
            AND dd.linked_ids->'vaultDocumentIds' @> jsonb_build_array(d.id::text)
         UNION ALL
         SELECT a.content, 'artifact:' || a.artifact_id, 1 AS priority
           FROM concept2cure_artifacts a
           JOIN projects p ON p.id = a.project_id AND p.organization_id = a.organization_id
          WHERE a.organization_id = s.organization_id AND p.regulatory_program_id = s.client_program_id
            AND length(btrim(a.content)) > 0
            AND dd.linked_ids->'artifactIds' @> jsonb_build_array(a.artifact_id)
         ORDER BY priority, representation_id LIMIT 1
       ) text_record ON length(btrim(text_record.content)) > 0
      WHERE s.organization_id = $1 AND s.client_program_id = $2 AND s.id = ANY($3::int[])
        AND s.deleted_at IS NULL AND ${capturedDataEligibleSql('s')}
        AND ${capturedDispositionChoiceSql('s')} = 'keep_data'
      ORDER BY s.id`,
    [organizationId, programId, ids],
  );
  let remaining = 64000;
  return rows.flatMap((r) => {
    if (remaining <= 0) return [];
    const text = String(r.content).slice(0, Math.min(remaining, 16000));
    remaining -= text.length;
    return [{ sourceId: Number(r.id), title: String(r.title ?? 'Retained source'), sha256: String(r.checksum),
      textSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
      text, truncated: text.length < String(r.content).length, originalFileAvailable: false as const,
      representationId: String(r.representation_id) }];
  });
}
