/**
 * Regulatory Graph Service
 *
 * Read-only traversal queries over the canonical claim/evidence graph:
 *   evidence_claims        (claim nodes — extended with lifecycle status,
 *                           risk metadata, population/site, source linkage)
 *   evidence_claim_links   (typed adjacency: link_type column)
 *
 * Composes with the existing claim-evidence-engine and contradiction-engine —
 * does not replace them.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  evidenceClaims,
  evidenceClaimLinks,
  type EvidenceClaim,
  type EvidenceClaimLink,
} from '../../../shared/schema';

// link_type values commonly used by evidenceClaimLinks; the column is varchar
// so we treat anything outside this set as 'other'.
export type ClaimLinkType =
  | 'supports'
  | 'contradicts'
  | 'references'
  | 'supersedes'
  | string;

export interface ClaimEvidenceTrace {
  claim: EvidenceClaim;
  supporting: EvidenceClaimLink[];
  contradicting: EvidenceClaimLink[];
  referencing: EvidenceClaimLink[];
}

export interface OrphanClaim {
  claim: EvidenceClaim;
  reason: 'no_links' | 'no_supporting_links';
}

export interface ContradictedClaim {
  claim: EvidenceClaim;
  contradictionCount: number;
  supportingCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Traversal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return every claim_link pointing at this claim, partitioned by link_type.
 * 'supersedes' links are intentionally not surfaced (they're an evidence
 * replacement edge, not claim support).
 */
export async function traceClaimEvidence(claimId: number): Promise<ClaimEvidenceTrace | null> {
  const claimRows = await db
    .select()
    .from(evidenceClaims)
    .where(eq(evidenceClaims.id, claimId))
    .limit(1);
  const claim = claimRows[0];
  if (!claim) return null;

  const links = await db
    .select()
    .from(evidenceClaimLinks)
    .where(and(eq(evidenceClaimLinks.claimId, claimId), isNull(evidenceClaimLinks.deletedAt)));

  const partitioned: ClaimEvidenceTrace = {
    claim,
    supporting: [],
    contradicting: [],
    referencing: [],
  };
  for (const l of links) {
    if (l.linkType === 'supports') partitioned.supporting.push(l);
    else if (l.linkType === 'contradicts') partitioned.contradicting.push(l);
    else if (l.linkType === 'references') partitioned.referencing.push(l);
  }
  return partitioned;
}

/** Reverse traversal: every claim a given document is linked to via claim_links. */
export async function traceClaimsForDocument(documentId: number): Promise<
  Array<{ link: EvidenceClaimLink; claim: EvidenceClaim }>
> {
  const links = await db
    .select()
    .from(evidenceClaimLinks)
    .where(
      and(eq(evidenceClaimLinks.documentId, documentId), isNull(evidenceClaimLinks.deletedAt))
    );
  if (!links.length) return [];

  const claims = await db
    .select()
    .from(evidenceClaims)
    .where(
      inArray(
        evidenceClaims.id,
        links.map(l => l.claimId)
      )
    );
  const byId = new Map(claims.map(c => [c.id, c]));

  return links
    .map(link => {
      const claim = byId.get(link.claimId);
      return claim ? { link, claim } : null;
    })
    .filter((x): x is { link: EvidenceClaimLink; claim: EvidenceClaim } => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claims with zero links, or with links but none that 'supports'.
 * Skips claims whose status is withdrawn / superseded, and claims that are
 * not the current version (isCurrent=false).
 */
export async function findOrphanClaims(programId: number): Promise<OrphanClaim[]> {
  const claims = await db
    .select()
    .from(evidenceClaims)
    .where(
      and(
        eq(evidenceClaims.programId, programId),
        eq(evidenceClaims.isCurrent, true),
        sql`${evidenceClaims.status} not in ('withdrawn','superseded')`
      )
    );
  if (!claims.length) return [];

  const links = await db
    .select({ claimId: evidenceClaimLinks.claimId, linkType: evidenceClaimLinks.linkType })
    .from(evidenceClaimLinks)
    .where(
      and(
        inArray(
          evidenceClaimLinks.claimId,
          claims.map(c => c.id)
        ),
        isNull(evidenceClaimLinks.deletedAt)
      )
    );

  const counts = new Map<number, { total: number; supports: number }>();
  for (const c of claims) counts.set(c.id, { total: 0, supports: 0 });
  for (const l of links) {
    const cur = counts.get(l.claimId);
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
 * Claims with at least one 'contradicts' link. Surfaces them so the existing
 * contradiction-engine can decide what to do; this is just the query.
 */
export async function findContradictedClaims(programId: number): Promise<ContradictedClaim[]> {
  const claims = await db
    .select()
    .from(evidenceClaims)
    .where(
      and(
        eq(evidenceClaims.programId, programId),
        eq(evidenceClaims.isCurrent, true),
        sql`${evidenceClaims.status} not in ('withdrawn','superseded')`
      )
    );
  if (!claims.length) return [];

  const links = await db
    .select({ claimId: evidenceClaimLinks.claimId, linkType: evidenceClaimLinks.linkType })
    .from(evidenceClaimLinks)
    .where(
      and(
        inArray(
          evidenceClaimLinks.claimId,
          claims.map(c => c.id)
        ),
        isNull(evidenceClaimLinks.deletedAt)
      )
    );

  const counts = new Map<number, { supports: number; contradicts: number }>();
  for (const c of claims) counts.set(c.id, { supports: 0, contradicts: 0 });
  for (const l of links) {
    const cur = counts.get(l.claimId);
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
 * Program-level summary the reviewer simulator and /coverage route consume.
 * Section coverage is intentionally NOT included — sections live in
 * per-framework tables (cer_sections, cmc_module3_sections, …) and a
 * cross-framework section coverage report needs to be built per-framework.
 */
export async function programClaimsReport(programId: number) {
  const [orphanClaims, contradictedClaims] = await Promise.all([
    findOrphanClaims(programId),
    findContradictedClaims(programId),
  ]);

  return {
    programId,
    orphanClaims,
    contradictedClaims,
    summary: {
      orphanClaimCount: orphanClaims.length,
      contradictedClaimCount: contradictedClaims.length,
    },
  };
}
