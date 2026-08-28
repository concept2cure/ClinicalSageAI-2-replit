/**
 * RTM Export Routes
 *
 * Generates Requirements Traceability Matrix exports in CSV and JSON formats.
 * Pulls data from evidence_claims + evidence_claim_links + evidence_sources tables.
 *
 * @module server/routes/rtm-export
 */

import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
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

/**
 * A Requirements Traceability Matrix is read by a regulatory reviewer, so it may
 * not report a state it did not establish.
 *
 * THE STORE THIS READS HAS NO WRITERS. `evidence_claims`, `evidence_sources` and
 * `evidence_claim_links` are created by db/migrations/20260319_evidence_fabric.sql,
 * which is on NO durable apply path — not in C2C_MIGRATION_FILES, not in the
 * drizzle journal — and nothing anywhere in the repo INSERTs into them. So on a
 * real database the queries below raise 42P01, and where the tables do exist
 * they are empty.
 *
 * Both outcomes used to be reported as an answer. Zero claims produced
 * `untracedClaims: 0` — which a reader takes as "nothing is untraced", i.e.
 * everything is traced — beside `coverageScore: 0`, a MEASURED nought asserted
 * where nothing was measured. And a missing relation produced a bare 500
 * "Failed to generate traceability matrix", indistinguishable from a transient
 * fault. The CSV route then registered a header-only file as a governed
 * regulated export titled "RTM Export: Program N", hashed and filed, with
 * nothing on the artifact saying it traces nothing.
 *
 * The rule is the repo's own (client/src/concept2cure/v2/assessmentState.ts): an
 * empty result is not a finding of "none". These three states are now distinct
 * everywhere they surface.
 */
type RtmState = 'store-unprovisioned' | 'no-claims-recorded' | 'claims-present';

/** Postgres: undefined_table / undefined_column — the store was never created. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  return code === '42P01' || code === '42703';
}

/**
 * An empty matrix must SAY it is empty, on the artifact itself.
 *
 * With no claims the CSV was a header line and nothing else, and that file was
 * hashed and filed as a governed regulated export titled "RTM Export: Program
 * N". A reviewer opening it cannot tell an empty program from a feature that was
 * never wired, while the governed record around it asserts a traceability matrix
 * was produced. One row in the first column removes the ambiguity without
 * blocking a legitimate export of a program that genuinely has no claims yet.
 */
const EMPTY_MATRIX_STATEMENT =
  'No evidence claims are recorded for this program. This matrix is empty because ' +
  'nothing has been recorded — it is not a finding that every claim is traced, and ' +
  'no coverage figure was measured.';

/**
 * The one place an RTM request failure becomes a response.
 *
 * Both routes had the same three-branch catch, differing only in wording. Two
 * copies of a fail-closed rule drift, and the branch that matters most here —
 * an unprovisioned claim store is a 503 that says so, never a generic 500 a
 * reader takes for a transient fault — is the one that must not drift.
 */
function respondToRtmFailure(
  res: Response,
  error: any,
  programId: unknown,
  verb: 'generate' | 'export',
): Response {
  if (isMissingRelation(error)) {
    logger.error('RTM requested but the claim store is not provisioned', { programId, verb });
    return res.status(503).json(STORE_UNPROVISIONED_BODY);
  }
  logger.error('RTM request failed', { error: error?.message, programId, verb });
  if (typeof error?.message === 'string' && error.message.includes('Missing or invalid')) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({
    error: verb === 'generate'
      ? 'Failed to generate traceability matrix'
      : 'Failed to export traceability matrix',
  });
}

const STORE_UNPROVISIONED_BODY = {
  error: {
    code: 'CLAIM_STORE_UNPROVISIONED',
    message:
      'The evidence-claim store is not provisioned in this deployment, so no traceability ' +
      'matrix can be produced. This is not an empty matrix — nothing was read.',
  },
} as const;

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
    const programId = parseInt(String(req.params.programId), 10);
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
    // null, not 0, when there is nothing to measure. A coverageScore of 0 is a
    // measurement — "we checked, and none of it is traced" — and that is a
    // different statement from "no claims are recorded". Only one of them is
    // true here, and it was reporting the other.
    const coverageScore = totalClaims > 0 ? Math.round((tracedClaims / totalClaims) * 100) : null;
    const state: RtmState = totalClaims > 0 ? 'claims-present' : 'no-claims-recorded';

    return res.json({
      programId,
      generatedAt: new Date().toISOString(),
      state,
      summary: {
        totalClaims,
        tracedClaims,
        // Only meaningful once claims exist. Previously `0 - 0 = 0`, which a
        // reader takes as "nothing is untraced" — i.e. everything is traced.
        untracedClaims: totalClaims > 0 ? totalClaims - tracedClaims : null,
        coverageScore,
      },
      matrix,
    });
  } catch (error: any) {
    return respondToRtmFailure(res, error, req.params.programId, 'generate');
  }
});

/**
 * The CSV body of a traceability matrix: one row per claim-link, or one
 * "Untraced" row for a claim with no links, under a fixed header.
 *
 * Extracted from the CSV route so that handler stays under the complexity
 * ceiling — the branching here (escaping, linked vs unlinked, the empty-matrix
 * statement) all belongs to row construction rather than to request handling.
 * Behaviour is unchanged, including the column order, which downstream
 * spreadsheets and any saved import mapping depend on.
 */
function buildRtmCsvRows(
  claims: Array<Record<string, any>>,
  linksByClaimId: Map<number, Array<Record<string, any>>>,
): string[] {
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

  if (claims.length === 0) rows.push(escapeCSV(EMPTY_MATRIX_STATEMENT));

  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/programs/:programId/rtm/csv — Export RTM as CSV
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/programs/:programId/rtm/csv', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programId = parseInt(String(req.params.programId), 10);
    if (isNaN(programId)) {
      return res.status(400).json({ error: 'Invalid program ID' });
    }

    const { claims, linksByClaimId } = await fetchRTMData(programId, organizationId);

    const rows = buildRtmCsvRows(claims, linksByClaimId);

    const csvContent = rows.join('\n');
    const filename = `RTM_Program_${programId}_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Register governed export (fail-closed for regulated outputs).
    // SECURITY: JWT-bound — the audit attribution must be the actual
    // principal, never a `|| 1` fallback that would silently rewrite
    // every export to org 1.
    const user = (req as any).user;
    const govOrgId = user?.organizationId ?? (req as any).tenantContext?.organizationId;
    if (govOrgId == null || user?.id == null) {
      return res.status(403).json({ error: 'Tenant context required for governed export' });
    }
    const governanceResult = await registerExportGovernanceQuick({
      organizationId: Number(govOrgId),
      projectId: Number(programId) || 0,
      userId: Number(user.id),
      userName: user?.name || user?.email || 'unknown',
      title: `RTM Export: Program ${programId}`,
      exportFormat: 'csv',
      exportFilename: filename,
      exportFileSize: Buffer.byteLength(csvContent, 'utf-8'),
      // Over the CSV actually sent below, not over its name and size — see the
      // note on the eCTD route for what the metadata fallback cannot prove.
      exportHash: createHash('sha256').update(csvContent, 'utf-8').digest('hex'),
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
    return respondToRtmFailure(res, error, req.params.programId, 'export');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/programs/:programId/rtm/snapshot — Save a traceability snapshot
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/programs/:programId/rtm/snapshot', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programId = parseInt(String(req.params.programId), 10);
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
    const programId = parseInt(String(req.params.programId), 10);
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
