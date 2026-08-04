/**
 * Backfill span lineage for sections written before lineage was recorded.
 *
 * THE RULE THIS FOLLOWS: NEVER INVENT AN AUTHOR
 * Every span it writes is attributed to someone the database can prove wrote
 * that exact text. `doc_revisions` stores (content, created_by, created_at) —
 * one row per edit — so when a section's CURRENT content is byte-identical to a
 * revision's content, that revision's author demonstrably produced the text now
 * in the section. That is evidence, not inference, and it is the only case this
 * backfill attributes.
 *
 * Everything else is left alone. A section whose content matches no revision
 * gets no lineage rows, so Data Origins reports it as having no recorded origin
 * — which is true. The alternative, attributing it to the last person who
 * touched the document or to a placeholder identity, would manufacture an
 * attestation that nobody made. In a system whose purpose is to say where text
 * came from, a confident wrong answer is worse than a visible gap, and a Part 11
 * record that names the wrong author is worse still.
 *
 * SAFETY PROPERTIES
 *   • Idempotent — sections that already carry lineage are skipped, so a rerun
 *     after an interruption resumes rather than duplicates.
 *   • Tenant-scoped — one organisation per invocation, never a global sweep.
 *   • Dry-run by default at the script layer; this function only writes when
 *     asked.
 *   • Bounded — processes a batch at a time so a large tenant cannot hold one
 *     transaction open across the whole table.
 *
 * @module server/services/clinical-regulatory-evidence/span-lineage-backfill
 */

import { pool } from '../../db';
import { detectSpans } from '../sentenceTraceabilityService';
import { replaceAuthorSpans, type Queryable } from './span-lineage.service';

const DOCUMENT_TABLE = 'authoring_sections';

export interface BackfillOptions {
  /** Write rows. When false, the same analysis runs and nothing is written. */
  apply?: boolean;
  /** Sections examined per invocation. */
  limit?: number;
  exec?: Queryable;
}

export interface BackfillReport {
  organizationId: number;
  examined: number;
  /** Sections given lineage, attributed to a provable author. */
  attributed: number;
  /** Spans written across those sections. */
  spansWritten: number;
  /** Sections left alone because no revision proves who wrote the text. */
  unattributable: number;
  /** Sections already carrying lineage. */
  alreadyCovered: number;
  /** Ids left unattributed, so the gap is reportable rather than silent. */
  unattributableIds: string[];
  applied: boolean;
}

interface SectionRow {
  id: string;
  content: string | null;
}

/**
 * Backfill one tenant's authoring sections.
 *
 * Returns what it did — and, as importantly, what it declined to do. The
 * unattributable list is the point of the report: it is the honest measure of
 * how much of the existing corpus cannot be accounted for, which is a number
 * worth knowing rather than hiding behind a total.
 */
export async function backfillSectionLineage(
  orgId: number,
  opts: BackfillOptions = {},
): Promise<BackfillReport> {
  const exec = opts.exec ?? (pool as unknown as Queryable);
  const apply = opts.apply === true;
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 2_000));

  // Sections with text but no lineage. The NOT EXISTS is what makes a rerun
  // resume: anything already done drops out of the candidate set.
  const { rows: sections } = await exec.query<SectionRow>(
    `SELECT s.id, s.content
       FROM authoring_sections s
      WHERE s.tenant_id = $1
        AND s.content IS NOT NULL
        AND length(btrim(s.content)) > 0
        AND NOT EXISTS (
          SELECT 1 FROM document_span_lineage l
           WHERE l.organization_id = $1
             AND l.document_table = $2
             AND l.document_id = s.id::text
             AND l.deleted_at IS NULL
        )
      ORDER BY s.id
      LIMIT $3`,
    [orgId, DOCUMENT_TABLE, limit],
  );

  const report: BackfillReport = {
    organizationId: orgId,
    examined: sections.length,
    attributed: 0,
    spansWritten: 0,
    unattributable: 0,
    alreadyCovered: 0,
    unattributableIds: [],
    applied: apply,
  };

  for (const section of sections) {
    const content = section.content ?? '';
    if (!content.trim()) continue;

    // The evidence: a revision whose content IS this text. Exact match only —
    // "close enough" is how a backfill starts attributing text to people who
    // did not write it. Most recent wins when an identical revision recurs.
    const { rows: revisions } = await exec.query<{
      created_by: string | null;
      created_at: Date | null;
    }>(
      `SELECT created_by, created_at
         FROM doc_revisions
        WHERE section_id = $1
          AND tenant_id = $2
          AND content = $3
          AND created_by IS NOT NULL
          AND btrim(created_by) <> ''
        ORDER BY created_at DESC
        LIMIT 1`,
      [section.id, orgId, content],
    );

    const author = revisions[0]?.created_by;
    if (!author) {
      // No proof of authorship. Leave it — the absence is the true answer.
      report.unattributable++;
      report.unattributableIds.push(section.id);
      continue;
    }

    const spans = detectSpans(content, 'clause').map((s) => ({
      charStart: s.charStart,
      charEnd: s.charEnd,
      spanText: s.text,
    }));
    if (spans.length === 0) {
      report.unattributable++;
      report.unattributableIds.push(section.id);
      continue;
    }

    report.attributed++;
    report.spansWritten += spans.length;

    if (apply) {
      await replaceAuthorSpans(
        orgId,
        { documentTable: DOCUMENT_TABLE, documentId: section.id },
        spans,
        {
          assertedBy: author,
          // The moment the text was actually authored, not the moment this
          // backfill ran. Stamping "now" would date every historical assertion
          // to the migration and destroy the timeline the record exists for.
          assertedAt: revisions[0]?.created_at ?? undefined,
          createdBy: 'span-lineage-backfill',
        },
        exec,
      );
    }
  }

  return report;
}
