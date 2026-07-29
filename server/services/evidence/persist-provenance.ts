/**
 * Persist in-flight provenance to the durable lineage trail.
 *
 * The provenance envelope (`ProvenanceRecord`) travels with evidence while a
 * turn is being answered; this bridge writes it to `data_lineage_records` so the
 * citation becomes a permanent, append-only 21 CFR Part 11 / ICH E6(R3) audit
 * record linking each SOURCE (the cited evidence) to a TARGET (the answer,
 * section, claim, or artifact it grounded).
 *
 * It reuses the existing `recordLineageBatch` write path (append-only, hashed,
 * indexed) rather than touching the table directly. The recorder is injectable
 * so this is unit-testable with no database.
 *
 * @module server/services/evidence/persist-provenance
 */

import { recordLineageBatch, type LineageEntry } from '../data-lineage-service.js';
import { toLineageSource, type ProvenanceRecord } from './provenance.js';

/** The thing a set of evidence grounded — the TARGET side of the lineage link. */
export interface ProvenanceTarget {
  organizationId: number;
  projectId?: number;
  /** e.g. 'answer', 'section', 'claim', 'recommendation', 'artifact'. */
  targetObjectType: string;
  /** Stable id of the target (message id, section code, artifact id, …). */
  targetObjectId: string;
  targetTitle?: string;
  /** Specific field/section within the target. */
  targetField?: string;
  createdById?: number;
  /** Model that produced the answer, when AI-generated. */
  aiModelUsed?: string;
  /** Lineage linkage verb; defaults to 'cited_by' (source is cited by target). */
  linkageType?: string;
}

/** Recorder signature — `recordLineageBatch` by default; injectable for tests. */
export type LineageRecorder = (entries: LineageEntry[]) => Promise<number>;

/**
 * Map a provenance record onto a SOURCE→TARGET lineage entry. Source columns
 * come from `toLineageSource` (single source of truth for the projection);
 * target columns and linkage come from the supplied target.
 */
export function provenanceToLineageEntry(
  record: ProvenanceRecord,
  target: ProvenanceTarget
): LineageEntry {
  const src = toLineageSource(record);
  return {
    organizationId: target.organizationId,
    projectId: target.projectId,
    sourceObjectType: src.sourceObjectType,
    sourceObjectId: src.sourceObjectId,
    sourceTitle: src.sourceTitle,
    targetObjectType: target.targetObjectType,
    targetObjectId: target.targetObjectId,
    targetField: target.targetField,
    targetTitle: target.targetTitle,
    linkageType: target.linkageType ?? 'cited_by',
    transformationType: 'ai_generation',
    confidenceScore: src.confidenceScore ?? undefined,
    confidenceBasis: src.confidenceBasis,
    createdById: target.createdById,
    aiModelUsed: target.aiModelUsed,
    metadata: {
      sourceId: record.sourceId,
      sourceType: record.sourceType,
      retrievalMethod: record.retrievalMethod,
      peerReviewed: record.peerReviewed,
      authority: record.authority,
      retrievedAt: record.retrievedAt,
      query: record.query,
      url: record.citation.url,
      caveats: record.caveats,
    },
  };
}

/**
 * Persist a batch of provenance records as lineage links to one target. Returns
 * the number of rows written (0 when there is nothing to persist). Never throws
 * — persistence failures are swallowed by the underlying recorder and surfaced
 * as a low count, so an audit-write hiccup never breaks answering.
 */
export async function persistProvenance(
  records: ProvenanceRecord[],
  target: ProvenanceTarget,
  recordBatch: LineageRecorder = recordLineageBatch
): Promise<number> {
  if (!records || records.length === 0) return 0;
  const entries = records.map(r => provenanceToLineageEntry(r, target));
  return recordBatch(entries);
}
