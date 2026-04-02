/**
 * RTM Export Routes
 *
 * Generates Requirements Traceability Matrix exports in CSV and JSON formats.
 * Pulls data from evidence_claims + evidence_claim_links + evidence_sources tables.
 *
 * @module server/routes/rtm-export
 */

import { Router, Request, Response } from 'express';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';
import { db } from '../db';
import { eq, and, isNull } from 'drizzle-orm';
import {
  evidenceSources,
  evidenceClaims,
  evidenceClaimLinks,
  evidenceTraceabilitySnapshots,
} from '../../shared/schema';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('rtm-export');
const router = Router();

function getOrganizationId(req: Request): number {
  const raw = (req as any).tenantId || (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
  const orgId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (isNaN(orgId) || orgId <= 0) {
    throw new Error('Missing or invalid organization context');
  }
  return orgId;
}

/**
 * Fetch claims and links for a program (shared query logic).
 */
async function fetchRTMData(programId: number, organizationId: number) {
  const claims = await db
    .select({
      claimId: evidenceClaims.id,
      claimText: evidenceClaims.claimText,
      claimType: evidenceClaims.claimType,
      confidence: evidenceClaims.confidence,
      extractionMethod: evidenceClaims.extractionMethod,
      sourceTitle: evidenceSources.title,
      sourceType: evidenceSources.sourceType,
      contentHash: evidenceSources.contentHash,
      sourceFileName: evidenceSources.fileName,
    })
    .from(evidenceClaims)
    .innerJoin(evidenceSources, eq(evidenceClaims.sourceId, evidenceSources.id))
    .where(
      and(
        eq(evidenceClaims.programId, programId),
        eq(evidenceClaims.organizationId, organizationId),
        eq(evidenceClaims.isCurrent, true)
      )
    );

  const links = await db
    .select({
      claimId: evidenceClaimLinks.claimId,
      documentId: evidenceClaimLinks.documentId,
      sectionId: evidenceClaimLinks.sectionId,
      linkType: evidenceClaimLinks.linkType,
      strength: evidenceClaimLinks.strength,
    })
    .from(evidenceClaimLinks)
    .innerJoin(evidenceClaims, eq(evidenceClaimLinks.claimId, evidenceClaims.id))
    .where(
      and(
        eq(evidenceClaims.programId, programId),
        eq(evidenceClaims.organizationId, organizationId),
        isNull(evidenceClaimLinks.deletedAt)
      )
    );

  const linksByClaimId = new Map<number, typeof links>();
  for (const link of links) {
    const existing = linksByClaimId.get(link.claimId) || [];
    existing.push(link);
    linksByClaimId.set(link.claimId, existing);
  }

  return { claims, links, linksByClaimId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/programs/:programId/rtm — Generate RTM data
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/programs/:programId/rtm', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programId = parseInt(req.params.programId, 10);
    if (isNaN(programId)) {
      return res.status(400).json({ error: 'Invalid program ID' });
    }

    const { claims, links, linksByClaimId } = await fetchRTMData(programId, organizationId);

    const matrix = claims.map(claim => ({
      ...claim,
      linkedSections: linksByClaimId.get(claim.claimId) || [],
      isMapped: (linksByClaimId.get(claim.claimId) || []).length > 0,
    }));

    const totalClaims = matrix.length;
    const tracedClaims = matrix.filter(m => m.isMapped).length;
    const coverageScore = totalClaims > 0 ? Math.round((tracedClaims / totalClaims) * 100) : 0;

    return res.json({
      programId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalClaims,
        tracedClaims,
        untracedClaims: totalClaims - tracedClaims,
        coverageScore,
      },
      matrix,
    });
  } catch (error: any) {
    logger.error('Failed to generate RTM', { error: error.message });
    if (error.message.includes('Missing or invalid')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to generate traceability matrix' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/programs/:programId/rtm/csv — Export RTM as CSV
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/programs/:programId/rtm/csv', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programId = parseInt(req.params.programId, 10);
    if (isNaN(programId)) {
      return res.status(400).json({ error: 'Invalid program ID' });
    }

    const { claims, linksByClaimId } = await fetchRTMData(programId, organizationId);

    const escapeCSV = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = [
      'Claim ID', 'Claim Text', 'Claim Type', 'Confidence',
      'Source Title', 'Source Type', 'Source File',
      'Linked Section', 'Link Type', 'Strength', 'Status',
    ];

    const rows: string[] = [header.join(',')];

    for (const claim of claims) {
      const claimLinks = linksByClaimId.get(claim.claimId) || [];
      if (claimLinks.length === 0) {
        rows.push([
          escapeCSV(claim.claimId),
          escapeCSV(claim.claimText),
          escapeCSV(claim.claimType),
          escapeCSV(claim.confidence),
          escapeCSV(claim.sourceTitle),
          escapeCSV(claim.sourceType),
          escapeCSV(claim.sourceFileName),
          '', '', '', 'Untraced',
        ].join(','));
      } else {
        for (const link of claimLinks) {
          rows.push([
            escapeCSV(claim.claimId),
            escapeCSV(claim.claimText),
            escapeCSV(claim.claimType),
            escapeCSV(claim.confidence),
            escapeCSV(claim.sourceTitle),
            escapeCSV(claim.sourceType),
            escapeCSV(claim.sourceFileName),
            escapeCSV(link.sectionId),
            escapeCSV(link.linkType),
            escapeCSV(link.strength),
            'Traced',
          ].join(','));
        }
      }
    }

    const csvContent = rows.join('\n');
    const filename = `RTM_Program_${programId}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Register governed export (fail-closed for regulated outputs)
    const user = (req as any).user;
    const governanceResult = await registerExportGovernanceQuick({
      organizationId: user?.organizationId || 1,
      projectId: Number(programId) || 0,
      userId: user?.id || 0,
      userName: user?.name || user?.email || 'unknown',
      title: `RTM Export: Program ${programId}`,
      exportFormat: 'csv',
      exportFilename: filename,
      exportFileSize: Buffer.byteLength(csvContent, 'utf-8'),
      docType: 'rtm_export',
      backendRoute: `/api/rtm/programs/${programId}/rtm/csv`,
      ipAddress: req.ip,
    });
    if (!governanceResult) {
      return res.status(500).json({
        error: 'Governed export registration failed',
        code: 'EXPORT_GOVERNANCE_REQUIRED',
      });
    }

    return res.send(csvContent);
  } catch (error: any) {
    logger.error('Failed to export RTM CSV', { error: error.message });
    if (error.message.includes('Missing or invalid')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to export traceability matrix' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/programs/:programId/rtm/snapshot — Save a traceability snapshot
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/programs/:programId/rtm/snapshot', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programId = parseInt(req.params.programId, 10);
    if (isNaN(programId)) {
      return res.status(400).json({ error: 'Invalid program ID' });
    }

    const { snapshotName, snapshotType = 'manual' } = req.body;
    if (!snapshotName) {
      return res.status(400).json({ error: 'snapshotName is required' });
    }

    const { claims, links, linksByClaimId } = await fetchRTMData(programId, organizationId);

    const totalClaims = claims.length;
    const totalLinks = links.length;
    const tracedClaimIds = new Set(links.map(l => l.claimId));
    const tracedCount = claims.filter(c => tracedClaimIds.has(c.claimId)).length;
    const overallScore = totalClaims > 0
      ? Math.round((tracedCount / totalClaims) * 10000) / 100
      : 0;

    const [snapshot] = await db
      .insert(evidenceTraceabilitySnapshots)
      .values({
        programId,
        organizationId,
        snapshotName,
        snapshotType,
        totalClaims,
        totalLinks,
        overallScore: String(overallScore),
        rtmData: { claims, links, generatedAt: new Date().toISOString() },
      })
      .returning();

    logger.info('RTM snapshot saved', { snapshotId: snapshot.id, programId, overallScore });
    return res.status(201).json({ snapshot });
  } catch (error: any) {
    logger.error('Failed to save RTM snapshot', { error: error.message });
    if (error.message.includes('Missing or invalid')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to save traceability snapshot' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/programs/:programId/rtm/snapshots — List traceability snapshots
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/programs/:programId/rtm/snapshots', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programId = parseInt(req.params.programId, 10);
    if (isNaN(programId)) {
      return res.status(400).json({ error: 'Invalid program ID' });
    }

    const snapshots = await db
      .select({
        id: evidenceTraceabilitySnapshots.id,
        snapshotName: evidenceTraceabilitySnapshots.snapshotName,
        snapshotType: evidenceTraceabilitySnapshots.snapshotType,
        totalClaims: evidenceTraceabilitySnapshots.totalClaims,
        totalLinks: evidenceTraceabilitySnapshots.totalLinks,
        overallScore: evidenceTraceabilitySnapshots.overallScore,
        createdAt: evidenceTraceabilitySnapshots.createdAt,
      })
      .from(evidenceTraceabilitySnapshots)
      .where(
        and(
          eq(evidenceTraceabilitySnapshots.programId, programId),
          eq(evidenceTraceabilitySnapshots.organizationId, organizationId)
        )
      );

    return res.json({ snapshots, total: snapshots.length });
  } catch (error: any) {
    logger.error('Failed to list RTM snapshots', { error: error.message });
    if (error.message.includes('Missing or invalid')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to list traceability snapshots' });
  }
});

export default router;
