/**
 * The document's measured provenance completeness, as the lineage dossier
 * carries it (P-26, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08) — kept
 * beside lineage-dossier.ts, as its holds are, so the dossier gains a field and
 * not a reader.
 *
 * The measure is the lineage engine's own: `summarizeDocumentAttribution`
 * (clinical-regulatory-evidence/span-lineage.service.ts) partitions every
 * character of a document's current text by the provenance its span lineage
 * records — the figure Authoring's attribution bar shows ("N% of this document
 * has a recorded origin"). The evidence & provenance trace takes it as its
 * confidence (report-os/lineage-trace-report.ts lineageTraceConfidence).
 *
 * @module server/services/ana/lineage-dossier-completeness
 */
import { getPool } from '../../db/runtime.js';

/**
 * The document's measured provenance completeness (P-26, 2026-10-08): its
 * current text partitioned by the provenance the span lineage records for each
 * character (`summarizeDocumentAttribution`, the measure Authoring's
 * attribution bar shows), and the share of it that has a recorded origin.
 *
 * `percent` is attributed characters over the text, FLOORED: a figure that a
 * finalize threshold reads is never rounded up past it. It is null when the
 * document holds no text, because there is nothing to measure.
 */
export interface DossierProvenanceCompleteness {
  percent: number | null;
  contentLength: number;
  attributedChars: number;
  unattributedChars: number;
  /** The partition of `attributedChars` (span-lineage KIND_PRECEDENCE). */
  byKind: { fromSources: number; authorAsserted: number; machineDrafted: number; machineDraftedUnaccepted: number };
  /** Of `byKind.fromSources`, characters whose cited source has changed since it was cited. */
  staleChars: number;
}

/**
 * The provenance completeness of a document, from the span lineage's own
 * partition of its text (summarizeDocumentAttribution). Pure. Attributed over
 * the whole text, floored; null for a document with no text.
 */
export function measureProvenanceCompleteness(summary: {
  contentLength: number;
  attributedChars: number;
  unattributedChars: number;
  byKind: DossierProvenanceCompleteness['byKind'];
  staleChars: number;
}): DossierProvenanceCompleteness {
  const contentLength = Math.max(0, Math.floor(summary.contentLength));
  const attributedChars = Math.max(0, Math.min(contentLength, Math.floor(summary.attributedChars)));
  return {
    percent: contentLength === 0 ? null : Math.floor((attributedChars / contentLength) * 100),
    contentLength,
    attributedChars,
    unattributedChars: contentLength - attributedChars,
    byKind: { ...summary.byKind },
    staleChars: summary.staleChars,
  };
}

/**
 * Measure the artifact's provenance completeness over its CURRENT text: the
 * length of `concept2cure_artifacts.content` and the span lineage recorded
 * against that row (document_table 'concept2cure_artifacts', the numeric id —
 * the key every governed writer records its spans under). Null when either
 * read fails: an unread lineage is not measured, never 0% and never 100%.
 */
export async function loadProvenanceCompleteness(
  artifactPk: number,
  organizationId: number,
): Promise<DossierProvenanceCompleteness | null> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT COALESCE(char_length(content), 0)::int AS len
         FROM concept2cure_artifacts
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [artifactPk, organizationId],
    );
    if (rows.length === 0) return null;
    const contentLength = Number((rows[0] as { len?: unknown }).len);
    if (!Number.isFinite(contentLength) || contentLength < 0) return null;
    // Loaded on use: the span-lineage service pulls in the evidence spine,
    // which a dossier read that never reaches here should not load.
    const { summarizeDocumentAttribution } = await import(
      '../clinical-regulatory-evidence/span-lineage.service.js'
    );
    const summary = await summarizeDocumentAttribution(
      organizationId,
      { documentTable: 'concept2cure_artifacts', documentId: String(artifactPk) },
      contentLength,
      pool,
    );
    return measureProvenanceCompleteness(summary);
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== '42P01') {
      // Constant format string; the values travel as a structured argument.
      console.warn('[lineage-dossier] load failed', { source: 'provenance completeness', error: (err as Error | null)?.message });
    }
    return null;
  }
}
