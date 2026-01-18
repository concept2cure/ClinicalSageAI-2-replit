import { cerv2Evidence, cerv2EvidenceLinks, cerv2Outcomes, cerv2Standards, regulatoryClaims } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import type { WorkbenchData } from './workbench-store';

type DbClient = any;

const buildLinkMap = (links: any[]) => {
  const evidenceCounts: Record<string, { claims: number; standards: number; outcomes: number }> = {};
  const entityCounts: Record<string, number> = {};

  links.forEach(link => {
    const evidenceId = String(link.evidenceId);
    if (!evidenceCounts[evidenceId]) {
      evidenceCounts[evidenceId] = { claims: 0, standards: 0, outcomes: 0 };
    }
    if (link.entityType === 'claim') evidenceCounts[evidenceId].claims += 1;
    if (link.entityType === 'standard') evidenceCounts[evidenceId].standards += 1;
    if (link.entityType === 'outcome') evidenceCounts[evidenceId].outcomes += 1;

    const key = `${link.entityType}:${link.entityId}`;
    entityCounts[key] = (entityCounts[key] || 0) + 1;
  });

  return { evidenceCounts, entityCounts };
};

export const buildWorkbenchDataFromDb = async (
  db: DbClient,
  organizationId: number,
  programId: string,
  fallback: WorkbenchData
): Promise<WorkbenchData> => {
  if (!db) return fallback;

  const evidenceRows = await db
    .select()
    .from(cerv2Evidence)
    .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)))
    .limit(100);

  const links = await db
    .select()
    .from(cerv2EvidenceLinks)
    .where(and(eq(cerv2EvidenceLinks.organizationId, organizationId), eq(cerv2EvidenceLinks.programId, programId)));

  const { evidenceCounts, entityCounts } = buildLinkMap(links);

  const evidence = evidenceRows.length
    ? evidenceRows.map((row: any) => {
        const counts = evidenceCounts[String(row.evidenceId)] || { claims: 0, standards: 0, outcomes: 0 };
        return {
          id: String(row.evidenceId),
          name: row.name,
          type: row.evidenceType,
          status: row.status,
          hash: row.hash || '',
          tags: Array.isArray(row.tags) ? row.tags : [],
          linkedClaims: counts.claims,
          linkedStandards: counts.standards,
          linkedOutcomes: counts.outcomes,
          uploadedAt: row.uploadedAt ? new Date(row.uploadedAt).toISOString().split('T')[0] : '',
          owner: row.owner || 'Reg Affairs',
        };
      })
    : fallback.evidence;

  const claimsRows = await db
    .select()
    .from(regulatoryClaims)
    .where(eq(regulatoryClaims.submissionId, programId))
    .limit(200);

  const claims = claimsRows.map((claim: any, index: number) => ({
    id: `claim-${claim.claimId || index}`,
    text: claim.proposedClaim,
    type: claim.claimType || 'regulatory',
    risk: claim.riskLevel || 'medium',
    status: claim.status || 'pending',
    strength: claim.strengthScore ? Math.round(claim.strengthScore * 100) : 0,
    linkedEvidence: entityCounts[`claim:claim-${claim.claimId || index}`] || 0,
    evidenceIds: Array.isArray(claim.evidenceAvailable) ? claim.evidenceAvailable : [],
  }));

  const standardsRows = await db
    .select()
    .from(cerv2Standards)
    .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId)))
    .limit(200);

  const standards = standardsRows.map((row: any) => ({
    id: row.standardId,
    name: row.name,
    requirement: row.requirement,
    status: row.status,
    owner: row.owner || 'Reg Affairs',
    linkedEvidence: entityCounts[`standard:${row.standardId}`] || 0,
    evidenceIds: [],
  }));

  const outcomesRows = await db
    .select()
    .from(cerv2Outcomes)
    .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId)))
    .limit(200);

  const outcomes = outcomesRows.map((row: any) => ({
    id: row.outcomeId,
    name: row.name,
    timepoint: row.timepoint || '',
    comparator: row.comparator || '',
    confidence: row.confidence || 'low',
    status: row.status,
    linkedEvidence: entityCounts[`outcome:${row.outcomeId}`] || 0,
    evidenceIds: [],
  }));

  return {
    evidence,
    claims,
    standards,
    outcomes,
  };
};
