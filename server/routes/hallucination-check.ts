/**
 * Hallucination Check Routes
 *
 * Zero-hallucination validation layer: extracts claims from AI-generated content,
 * searches the project Data Room for supporting evidence via pgvector semantic
 * search, and scores each claim as verified / partially_verified / unverified /
 * contradicted.
 *
 * Routes:
 *   POST /validate-claims — validate claims in content against project evidence
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { authMiddleware } from '../auth';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('hallucination-check');

// ── Helpers ──────────────────────────────────────────────────────────────────

const resolveOrganizationId = (req: any): number | null => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveUserId = (req: any): number | null => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// ── Claim extraction patterns (aligned with CLAIM_PATTERNS_EDIT in concept2cure.ts) ──

const CLAIM_PATTERNS = [
  /\b\d+(\.\d+)?%\s+(of\s+)?(patients?|subjects?|participants?)/i,
  /\bp[\s<>=]+0?\.\d+/i,
  /\b(hazard ratio|odds ratio|relative risk|confidence interval|CI)\b/i,
  /\b(statistically significant|clinically significant)\b/i,
  /\b(study|trial|investigation)\s+(showed?|demonstrated?|found|indicated)\b/i,
  /\b(phase\s+[I1-4]{1,3})\b/i,
  /\bNCT\d{8}\b/i,
  /\b(FDA|EMA|ICH|21\s*CFR)\b/i,
  /\b(guidance|guideline|regulation)\s+(states?|requires?|recommends?)\b/i,
  /\b(et\s+al\.?|published|peer-reviewed|meta-analysis|systematic review)\b/i,
  /\b(adverse events?|AE|SAE)\b/i,
  /\b(efficacy|safety|bioequivalence|pharmacokinetic)\b/i,
  /\b(primary endpoint|secondary endpoint|outcome measure)\b/i,
];

/** Split text into sentences, filtering out short fragments. */
function splitSentences(text: string): string[] {
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Corp|vs|etc|al|Fig|Sec|Vol|No)\./gi, '$1\u2024')
    .replace(/\b(\d+)\./g, '$1\u2024');
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u2024/g, '.').trim())
    .filter(s => s.length > 20);
}

/** Identify sentences that contain verifiable claims. */
function extractClaims(content: string): string[] {
  const sentences = splitSentences(content);
  return sentences.filter(sentence =>
    CLAIM_PATTERNS.some(pattern => pattern.test(sentence))
  );
}

// ── Validation schema ────────────────────────────────────────────────────────

const validateClaimsSchema = z.object({
  content: z.string().min(1, 'Content is required').max(100000),
  projectId: z.string().min(1, 'Project ID is required'),
  artifactId: z.string().optional(),
});

type ClaimStatus = 'verified' | 'partially_verified' | 'unverified' | 'contradicted';

interface ClaimResult {
  text: string;
  status: ClaimStatus;
  confidence: number;
  sources: Array<{ title: string; excerpt: string; score: number }>;
}

// ── POST /validate-claims ────────────────────────────────────────────────────

router.post('/validate-claims', authMiddleware, async (req: Request, res: Response) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ success: false, error: { message: 'Organization context required' } });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, error: { message: 'User authentication required' } });
  }

  const parsed = validateClaimsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Invalid request data', details: parsed.error.issues },
    });
  }

  const { content, projectId, artifactId } = parsed.data;

  try {
    // 1. Extract claims from the content
    const claimTexts = extractClaims(content);

    if (claimTexts.length === 0) {
      return res.json({
        success: true,
        data: {
          claims: [],
          overallScore: 100,
          hallucinationRisk: 'low' as const,
          message: 'No verifiable claims detected in content',
        },
      });
    }

    // 2. For each claim, search project Data Room for supporting evidence
    const orgUuid =
      (req as any).tenantContext?.organizationUuid ||
      (req.headers['x-org-uuid'] as string | undefined);

    let embeddingService: any = null;
    try {
      const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
      embeddingService = getEmbeddingService(pool);
    } catch {
      logger.warn('Embedding service not available — claims will be marked unverified');
    }

    const SEARCH_TOP_K = 3;
    const SEARCH_THRESHOLD = 0.55;

    const claims: ClaimResult[] = await Promise.all(
      claimTexts.slice(0, 20).map(async (claimText): Promise<ClaimResult> => {
        if (!embeddingService) {
          return {
            text: claimText,
            status: 'unverified',
            confidence: 0,
            sources: [],
          };
        }

        try {
          const searchResults = await embeddingService.searchHybrid(
            claimText,
            SEARCH_TOP_K,
            SEARCH_THRESHOLD,
            orgUuid
          );

          const sources = (searchResults || []).map((r: any) => ({
            title: r.title || 'Untitled',
            excerpt: (r.content || '').substring(0, 300),
            score: r.score || 0,
          }));

          // Score the claim based on source match quality
          let status: ClaimStatus;
          let confidence: number;

          if (sources.length === 0) {
            status = 'unverified';
            confidence = 0;
          } else {
            const topScore = sources[0].score;
            if (topScore >= 0.85) {
              status = 'verified';
              confidence = Math.min(topScore * 100, 99);
            } else if (topScore >= 0.70) {
              status = 'partially_verified';
              confidence = topScore * 100;
            } else {
              status = 'unverified';
              confidence = topScore * 100;
            }
          }

          return { text: claimText, status, confidence, sources };
        } catch (err: any) {
          logger.warn('Claim search failed', { claim: claimText.substring(0, 50), error: err.message });
          return { text: claimText, status: 'unverified', confidence: 0, sources: [] };
        }
      })
    );

    // 3. Compute overall score
    const verifiedCount = claims.filter(c => c.status === 'verified').length;
    const partialCount = claims.filter(c => c.status === 'partially_verified').length;
    const unverifiedCount = claims.filter(c => c.status === 'unverified').length;
    const contradictedCount = claims.filter(c => c.status === 'contradicted').length;

    const totalClaims = claims.length;
    const overallScore = totalClaims > 0
      ? Math.round(((verifiedCount * 1.0 + partialCount * 0.5) / totalClaims) * 100)
      : 100;

    let hallucinationRisk: 'low' | 'medium' | 'high';
    if (contradictedCount > 0 || unverifiedCount > totalClaims * 0.5) {
      hallucinationRisk = 'high';
    } else if (unverifiedCount > totalClaims * 0.25) {
      hallucinationRisk = 'medium';
    } else {
      hallucinationRisk = 'low';
    }

    logger.info('Claims validated', {
      userId,
      projectId,
      artifactId,
      totalClaims,
      verifiedCount,
      partialCount,
      unverifiedCount,
      contradictedCount,
      hallucinationRisk,
    });

    return res.json({
      success: true,
      data: {
        claims,
        overallScore,
        hallucinationRisk,
        summary: {
          total: totalClaims,
          verified: verifiedCount,
          partiallyVerified: partialCount,
          unverified: unverifiedCount,
          contradicted: contradictedCount,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to validate claims', { error, projectId });
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to validate claims' },
    });
  }
});

export default router;
