/**
 * Regulatory Graph Service
 *
 * Traversal queries over the regulatory knowledge graph:
 *   nodes  : device_claims, evidence_objects, submission_sections,
 *            regulatory_standards, standards_applicability
 *   edges  : evidence_links (typed: supports | contradicts | references | supersedes)
 *
 * Read-only by design. Mutations happen through the existing service surfaces
 * (claims editor, evidence-management, etc.). This module is the query layer
 * the SE Engine, CER engine, reviewer simulator, and contradiction engine all
 * compose against.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  evidenceLinks,
  evidenceObjects,
  type EvidenceLink,
  type EvidenceObject,
} from '../../../shared/schema/programs';
import {
  deviceClaims,
  submissionSections,
  type DeviceClaim,
  type SubmissionSection,
} from '../../../shared/schema/regulatory-graph';

export type EvidenceLinkType = 'supports' | 'contradicts' | 'references' | 'supersedes';

export interface ClaimEvidenceTrace {
  claim: DeviceClaim;
  supporting: Array<{ link: EvidenceLink; evidence: EvidenceObject }>;
  contradicting: Array<{ link: EvidenceLink; evidence: EvidenceObject }>;
  referencing: Array<{ link: EvidenceLink; evidence: EvidenceObject }>;
}

export interface SectionCoverage {
  section: SubmissionSection;
  requiredEvidenceTypes: string[];
  presentEvidenceTypes: string[];
  missingEvidenceTypes: string[];
  evidenceCount: number;
  contradictionCount: number;
}

export interface OrphanClaim {
  claim: DeviceClaim;
  reason: 'no_links' | 'no_supporting_links';
}

export interface ContradictedClaim {
  claim: DeviceClaim;
  contradictionCount: number;
  supportingCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Traversal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return every evidence object linked to a claim, partitioned by link type.
 */
export async function traceClaimEvidence(claimId: string): Promise<ClaimEvidenceTrace | null> {
  const claimRows = await db
    .select()
    .from(deviceClaims)
    .where(eq(deviceClaims.id, claimId))
    .limit(1);
  const claim = claimRows[0];
  if (!claim) return null;

  const links = await db
    .select()
    .from(evidenceLinks)
    .where(and(eq(evidenceLinks.targetType, 'claim'), eq(evidenceLinks.targetId, claimId)));

  const evidenceIds = links.map(l => l.evidenceId);
  const evidence = evidenceIds.length
    ? await db.select().from(evidenceObjects).where(inArray(evidenceObjects.id, evidenceIds))
    : [];
  const evidenceById = new Map(evidence.map(e => [e.id, e]));

  const partitioned: ClaimEvidenceTrace = {
    claim,
    supporting: [],
    contradicting: [],
    referencing: [],
  };

  for (const link of links) {
    const ev = evidenceById.get(link.evidenceId);
    if (!ev) continue;
    if (link.linkType === 'supports') partitioned.supporting.push({ link, evidence: ev });
    else if (link.linkType === 'contradicts') partitioned.contradicting.push({ link, evidence: ev });
    else if (link.linkType === 'references') partitioned.referencing.push({ link, evidence: ev });
    // 'supersedes' is intentionally not surfaced in this view; it's
    // an evidence-replacement edge, not claim support.
  }

  return partitioned;
}

/**
 * Reverse traversal: every claim that any link from this evidence object points at.
 */
export async function tracingClaimsForEvidence(evidenceId: string): Promise<
  Array<{ link: EvidenceLink; claim: DeviceClaim }>
> {
  const links = await db
    .select()
    .from(evidenceLinks)
    .where(and(eq(evidenceLinks.evidenceId, evidenceId), eq(evidenceLinks.targetType, 'claim')));

  if (!links.length) return [];

  const claims = await db
    .select()
    .from(deviceClaims)
    .where(
      inArray(
        deviceClaims.id,
        links.map(l => l.targetId)
      )
    );
  const byId = new Map(claims.map(c => [c.id, c]));

  return links
    .map(link => {
      const claim = byId.get(link.targetId);
      return claim ? { link, claim } : null;
    })
    .filter((x): x is { link: EvidenceLink; claim: DeviceClaim } => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claims with zero links, or with links but none that 'supports'.
 */
export async function findOrphanClaims(programId: string): Promise<OrphanClaim[]> {
  const claims = await db
    .select()
    .from(deviceClaims)
    .where(
      and(
        eq(deviceClaims.programId, programId),
        sql`${deviceClaims.status} not in ('withdrawn','superseded')`
      )
    );
  if (!claims.length) return [];

  const links = await db
    .select({
      targetId: evidenceLinks.targetId,
      linkType: evidenceLinks.linkType,
    })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.targetType, 'claim'),
        inArray(
          evidenceLinks.targetId,
          claims.map(c => c.id)
        )
      )
    );

  const counts = new Map<string, { total: number; supports: number }>();
  for (const c of claims) counts.set(c.id, { total: 0, supports: 0 });
  for (const l of links) {
    const cur = counts.get(l.targetId);
    if (!cur) continue;
    cur.total += 1;
    if (l.linkType === 'supports') cur.supports += 1;
  }

  const orphans: OrphanClaim[] = [];
  for (const claim of claims) {
    const c = counts.get(claim.id)!;
    if (c.total === 0) orphans.push({ claim, reason: 'no_links' });
    else if (c.supports === 0) orphans.push({ claim, reason: 'no_supporting_links' });
  }
  return orphans;
}

/**
 * Claims with at least one 'contradicts' link. The contradiction-engine-service
 * decides what to do about it; this just surfaces them.
 */
export async function findContradictedClaims(programId: string): Promise<ContradictedClaim[]> {
  const claims = await db
    .select()
    .from(deviceClaims)
    .where(
      and(
        eq(deviceClaims.programId, programId),
        sql`${deviceClaims.status} not in ('withdrawn','superseded')`
      )
    );
  if (!claims.length) return [];

  const links = await db
    .select({
      targetId: evidenceLinks.targetId,
      linkType: evidenceLinks.linkType,
    })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.targetType, 'claim'),
        inArray(
          evidenceLinks.targetId,
          claims.map(c => c.id)
        )
      )
    );

  const counts = new Map<string, { supports: number; contradicts: number }>();
  for (const c of claims) counts.set(c.id, { supports: 0, contradicts: 0 });
  for (const l of links) {
    const cur = counts.get(l.targetId);
    if (!cur) continue;
    if (l.linkType === 'supports') cur.supports += 1;
    else if (l.linkType === 'contradicts') cur.contradicts += 1;
  }

  return claims
    .map(claim => {
      const c = counts.get(claim.id)!;
      return c.contradicts > 0
        ? {
            claim,
            contradictionCount: c.contradicts,
            supportingCount: c.supports,
          }
        : null;
    })
    .filter((x): x is ContradictedClaim => x !== null);
}

/**
 * Per-section coverage report. Compares each section's required_evidence_types
 * against the evidence_types of evidence_objects linked to that section.
 */
export async function computeSectionCoverage(programId: string): Promise<SectionCoverage[]> {
  const sections = await db
    .select()
    .from(submissionSections)
    .where(eq(submissionSections.programId, programId));
  if (!sections.length) return [];

  const links = await db
    .select()
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.targetType, 'section'),
        inArray(
          evidenceLinks.targetId,
          sections.map(s => s.id)
        )
      )
    );

  const evidenceIds = Array.from(new Set(links.map(l => l.evidenceId)));
  const evidence = evidenceIds.length
    ? await db.select().from(evidenceObjects).where(inArray(evidenceObjects.id, evidenceIds))
    : [];
  const evidenceById = new Map(evidence.map(e => [e.id, e]));

  return sections.map(section => {
    const required = section.requiredEvidenceTypes ?? [];
    const sectionLinks = links.filter(l => l.targetId === section.id);

    const presentTypes = new Set<string>();
    let contradictionCount = 0;
    for (const link of sectionLinks) {
      const ev = evidenceById.get(link.evidenceId);
      if (!ev) continue;
      if (link.linkType === 'supports' || link.linkType === 'references') {
        presentTypes.add(ev.evidenceType);
      } else if (link.linkType === 'contradicts') {
        contradictionCount += 1;
      }
    }

    const presentArr = Array.from(presentTypes);
    const missing = required.filter(t => !presentTypes.has(t));

    return {
      section,
      requiredEvidenceTypes: required,
      presentEvidenceTypes: presentArr,
      missingEvidenceTypes: missing,
      evidenceCount: sectionLinks.length,
      contradictionCount,
    };
  });
}

/**
 * One-shot program-level report. Used by the reviewer simulator and by the
 * /coverage route. Pure query; no side effects.
 */
export async function programCoverageReport(programId: string) {
  const [sectionCoverage, orphanClaims, contradictedClaims] = await Promise.all([
    computeSectionCoverage(programId),
    findOrphanClaims(programId),
    findContradictedClaims(programId),
  ]);

  const incompleteSections = sectionCoverage.filter(s => s.missingEvidenceTypes.length > 0);

  return {
    programId,
    sectionCoverage,
    incompleteSectionCount: incompleteSections.length,
    totalSections: sectionCoverage.length,
    orphanClaims,
    contradictedClaims,
    summary: {
      sectionsWithGaps: incompleteSections.length,
      orphanClaimCount: orphanClaims.length,
      contradictedClaimCount: contradictedClaims.length,
    },
  };
}
