/**
 * PDEV Contradiction Bridge — adapts the existing contradiction engine
 * to the PDEV-program view.
 *
 * The contradiction engine itself is production-grade (see
 * `server/services/contradiction-engine-service.ts` — 11 contradiction
 * types, structured-first detection, severity, authority states,
 * consequence paths, nightly scans). This bridge is a thin read-side
 * adapter that exposes only what a PDEV view needs:
 *   - findings for a given program (filtered by org + optional project id)
 *   - severity / review-state / authority-state filters
 *   - a compact shape suitable for a contradiction registry pane
 *
 * No detection logic lives here. No re-classification. No alternative
 * truth hierarchy. The engine remains the source of truth.
 *
 * @module server/services/pdev/pdev-contradiction-bridge
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  contradictionEngineService,
  type ContradictionFinding,
  type ContradictionType,
  type Severity,
  type ReviewState,
  type AuthorityState,
} from '../contradiction-engine-service';

export interface PdevContradictionListItem {
  id: string;
  title: string;
  description: string;
  contradictionType: ContradictionType;
  severity: Severity;
  authorityState: AuthorityState;
  reviewState: ReviewState;
  /** Object A label / type / id. */
  objectA: { type: string; id: string; label: string | null };
  /** Object B label / type / id. */
  objectB: { type: string; id: string; label: string | null };
  detectedBy: string;
  createdAt: string;
  resolvedAt: string | null;
  /** Consequence path, if executed. */
  consequenceType: ContradictionFinding['consequenceType'];
}

export interface PdevContradictionRegistry {
  programId: string;
  findings: PdevContradictionListItem[];
  counts: {
    total: number;
    bySeverity: Record<Severity, number>;
    byAuthorityState: Record<AuthorityState, number>;
    open: number;
    resolved: number;
  };
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const AUTHORITY_STATES: AuthorityState[] = [
  'advisory_only',
  'requires_review',
  'requires_approval',
  'blocks_promotion',
  'requires_escalation',
];

function emptyCounts(): PdevContradictionRegistry['counts'] {
  return {
    total: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    byAuthorityState: {
      advisory_only: 0,
      requires_review: 0,
      requires_approval: 0,
      blocks_promotion: 0,
      requires_escalation: 0,
    },
    open: 0,
    resolved: 0,
  };
}

export class PdevContradictionBridge {
  /**
   * Load contradiction findings for a program.
   *
   * Tenant gated by joining regulatory_programs first. The contradiction
   * engine's primary index is by (organizationId, projectId — numeric).
   * `regulatoryPrograms` does not currently FK to a numeric project id,
   * so we filter by organization at minimum and accept an optional
   * `projectId` numeric override the caller can pass (e.g. from a
   * `projects` row resolved separately).
   */
  async getRegistry(
    programId: string,
    organizationId: number,
    options?: {
      projectId?: number;
      severity?: Severity;
      authorityState?: AuthorityState;
      reviewState?: ReviewState;
      limit?: number;
    }
  ): Promise<PdevContradictionRegistry | null> {
    const programRows = await db
      .select({
        id: regulatoryPrograms.id,
        organizationId: regulatoryPrograms.organizationId,
      })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, programId),
          eq(regulatoryPrograms.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) return null;

    const findings = await contradictionEngineService.searchFindings({
      organizationId,
      projectId: options?.projectId,
      severity: options?.severity,
      authorityState: options?.authorityState,
      reviewState: options?.reviewState,
      limit: options?.limit ?? 100,
    });

    const items: PdevContradictionListItem[] = findings.map(f => ({
      id: f.id,
      title: f.title,
      description: f.description,
      contradictionType: f.contradictionType,
      severity: f.severity,
      authorityState: f.authorityState,
      reviewState: f.reviewState,
      objectA: { type: f.objectAType, id: f.objectAId, label: f.objectALabel },
      objectB: { type: f.objectBType, id: f.objectBId, label: f.objectBLabel },
      detectedBy: f.detectedBy,
      createdAt: f.createdAt,
      resolvedAt: f.resolvedAt,
      consequenceType: f.consequenceType,
    }));

    const counts = emptyCounts();
    counts.total = items.length;
    for (const sev of SEVERITIES) counts.bySeverity[sev] = 0;
    for (const st of AUTHORITY_STATES) counts.byAuthorityState[st] = 0;
    for (const it of items) {
      counts.bySeverity[it.severity] = (counts.bySeverity[it.severity] ?? 0) + 1;
      counts.byAuthorityState[it.authorityState] =
        (counts.byAuthorityState[it.authorityState] ?? 0) + 1;
      if (it.resolvedAt) counts.resolved += 1;
      else counts.open += 1;
    }

    return {
      programId,
      findings: items,
      counts,
    };
  }
}

export const pdevContradictionBridge = new PdevContradictionBridge();
