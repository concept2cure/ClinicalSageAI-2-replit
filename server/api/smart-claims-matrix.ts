import { Router } from 'express';
import { z } from 'zod';
import { SmartMatrixOrchestrator } from '../../modules/smart-claims-matrix/src/core/smart-matrix-orchestrator';
import { db } from '../db';
import { cerv2510kSections, cerv2Evidence } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

const generateSchema = z.object({
  deviceId: z.string().min(1),
  cerIds: z.array(z.string()).min(1),
});

const memoryMatrix = new Map<string, any>();

const getOrgId = (req: any) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { deviceId, cerIds } = generateSchema.parse(req.body);

    const fetchCER = async (cerId: string) => {
      if (!db) return { deviceId, sections: [] };
      const documentId = Number.parseInt(cerId, 10);
      if (!Number.isFinite(documentId)) {
        return { deviceId, sections: [] };
      }

      const sections = await db
        .select({ sectionNumber: cerv2510kSections.sectionNumber, content: cerv2510kSections.content })
        .from(cerv2510kSections)
        .where(
          and(
            eq(cerv2510kSections.documentId, documentId),
            eq(cerv2510kSections.organizationId, getOrgId(req))
          )
        );

      return {
        deviceId,
        sections,
      };
    };

    const fetchEvidenceForClaim = async (_claimId: string) => {
      if (!db) return [];
      const evidenceRows = await db
        .select()
        .from(cerv2Evidence)
        .where(eq(cerv2Evidence.organizationId, getOrgId(req)))
        .limit(50);

      return evidenceRows.map(row => ({
        id: row.id,
        studyType: row.evidenceType || 'clinical-trial',
        source: row.source || 'internal',
        studyDesign: row.studyDesign || 'observational',
        sampleSize: row.sampleSize || 100,
        followUpMonths: row.followUpMonths || 6,
        primaryEndpoint: row.primaryEndpoint || 'Outcome',
        effectSize: row.effectSize || 0.2,
        pValue: row.pValue || 0.04,
        isPrimary: row.evidenceRole === 'primary',
      }));
    };

    const orchestrator = new SmartMatrixOrchestrator(fetchCER, fetchEvidenceForClaim);
    const matrix = await orchestrator.generateIntelligentMatrix(deviceId, cerIds);

    memoryMatrix.set(deviceId, matrix);

    return res.json({
      success: true,
      matrix,
      aiSummary: `Analyzed ${matrix.totalClaims} claims. Readiness: ${matrix.regulatoryReadiness}.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Smart matrix generation failed',
    });
  }
});

router.get('/latest', authenticateToken, async (req, res) => {
  const deviceId = String(req.query.deviceId || '');
  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId required' });
  }
  const matrix = memoryMatrix.get(deviceId) || null;
  return res.json({ success: true, matrix });
});

export default router;
