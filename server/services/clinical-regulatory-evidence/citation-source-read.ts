import type { CitationSource } from '@shared/authoring/citations';
import { visibleOrgClause } from './evidence-spine.service';
import type { Queryable } from './span-lineage.service';
import { capturedDataEligibleSql } from '../document-data-disposition/eligibility';
import { CRE_SOURCE_CITATION } from './source-usage.service';

import { numericIds } from './source-usage.service';

function isoDay(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s || null;
}

export async function listCitationSources(
  orgId: number,
  sourceIds: Array<number | string>,
  context: { documentId: string; sectionId: string },
  executor: Queryable,
): Promise<CitationSource[]> {
  const ids = numericIds(sourceIds);
  if (ids.length === 0) return [];
  const c = visibleOrgClause(orgId, 2);
  const { rows } = await executor.query(
    `SELECT src.id, src.title, src.sponsor, src.source_type, src.document_date,
            COALESCE(NULLIF(src.source_record_identifier, ''),
                     NULLIF(src.trial_registry_identifier, ''),
                     NULLIF(src.application_number, '')) AS identifier
       FROM cre_evidence_sources src
      WHERE src.id = ANY($1::int[]) AND ${c.sql} AND src.deleted_at IS NULL AND ${capturedDataEligibleSql('src')}
        AND EXISTS (SELECT 1 FROM authoring_citations cite
          JOIN authoring_sections sec ON sec.id=cite.section_id AND sec.tenant_id=cite.tenant_id
          JOIN authoring_documents doc ON doc.id=sec.doc_id AND doc.tenant_id=sec.tenant_id
          WHERE cite.tenant_id=$2 AND doc.id=$3 AND sec.id=$4 AND cite.source=$5 AND cite.reference_id=src.id::text
            AND (doc.client_program_id IS NULL OR src.client_program_id IS NULL OR doc.client_program_id=src.client_program_id))`,
    [ids, c.param, context.documentId, context.sectionId, CRE_SOURCE_CITATION],
  );
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    title: (r.title as string) ?? null,
    sponsor: (r.sponsor as string) ?? null,
    sourceType: (r.source_type as string) ?? null,
    date: isoDay(r.document_date),
    identifier: (r.identifier as string) ?? null,
  }));
}
