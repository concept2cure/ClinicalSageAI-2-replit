/** Projection of recorded citation facts; no inferred source or document access. */
import type { SectionSourceUsage, UsageState } from './source-usage.service';

function usageState(
  citedChecksum: string | null,
  currentChecksum: string | null,
  resolved: boolean,
  sourceIsCurrent: boolean | null,
): UsageState {
  if (!resolved) return 'unresolved';
  // SUPERSEDED OUTRANKS THE CHECKSUM COMPARISON, and has to.
  //
  // A source's checksum is never rewritten: a revised document is ingested as a
  // NEW row and the old row keeps its bytes and its hash forever. So the cited
  // and current checksums still MATCH on a source that has been replaced, and
  // this would report 'current' — "content unchanged since cited" — for exactly
  // the citation a reviewer most needs to look at.
  //
  // `is_current = FALSE` is the fact that says otherwise, recorded by the ingest
  // path when it links a successor. NULL means the column was not read, or no
  // successor is known; neither is evidence of supersession, so both fall
  // through rather than being treated as one.
  if (sourceIsCurrent === false) return 'superseded';
  if (!citedChecksum || !currentChecksum) return 'unverified';
  return citedChecksum === currentChecksum ? 'current' : 'changed';
}


/** The joined source, or null when the reference did not resolve for this caller. */
function adaptUsageSource(r: Record<string, unknown>): SectionSourceUsage['source'] {
  if (r.source_id == null) return null;
  return {
    id: Number(r.source_id),
    title: (r.title as string) ?? null,
    checksum: (r.checksum as string) ?? null,
    sourceType: (r.source_type as string) ?? null,
    ingestionStatus: (r.ingestion_status as string) ?? null,
    extractionStatus: (r.extraction_status as string) ?? null,
    mimeType: (r.mime_type as string) ?? null,
    fileUploadId: (r.file_upload_id as string) ?? null,
    updatedAt: r.source_updated_at ? new Date(r.source_updated_at as string).toISOString() : null,
  };
}

export function adaptUsageRow(r: Record<string, unknown>): SectionSourceUsage {
  return {
    citationId: String(r.id),
    sectionId: String(r.section_id),
    citedAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
    citedBy: (r.created_by as string) ?? null,
    citationText: (r.citation_text as string) ?? null,
    citedChecksum: (r.payload_sha256 as string) ?? null,
    state: usageState(
      (r.payload_sha256 as string) ?? null,
      (r.checksum as string) ?? null,
      r.source_id != null,
      r.source_is_current == null ? null : Boolean(r.source_is_current),
    ),
    source: adaptUsageSource(r),
  };
}
