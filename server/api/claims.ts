import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { cerv2510kSections, regulatoryClaims } from '@shared/schema';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

const analyzeClaimsSchema = z.object({
  submissionId: z.string().min(1),
  sectionId: z.string().min(1).default('6.0'),
  sectionContent: z.string().optional(),
});

const memoryClaimsBySubmission = new Map<string, any[]>();

const toNumberOrNull = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

router.post('/analyze', authenticateToken, async (req, res) => {
  try {
    const { submissionId, sectionId, sectionContent } = analyzeClaimsSchema.parse(req.body);

    if (!process.env.KIMI_API_KEY) {
      return res.status(500).json({
        status: 'error',
        message: 'KIMI_API_KEY not configured',
      });
    }

    let sourceContent = sectionContent?.trim() || '';

    if (!sourceContent && db) {
      const documentId = toNumberOrNull(submissionId);
      const conditions = [eq(cerv2510kSections.sectionNumber, sectionId)];

      if (documentId !== null) {
        conditions.push(eq(cerv2510kSections.documentId, documentId));
      }

      if ((req as any).user?.organizationId) {
        conditions.push(eq(cerv2510kSections.organizationId, Number((req as any).user.organizationId)));
      }

      const sectionRows = await db
        .select({ content: cerv2510kSections.content })
        .from(cerv2510kSections)
        .where(and(...conditions))
        .limit(1);

      const clinicalSection = sectionRows?.[0];
      sourceContent = clinicalSection?.content || '';
    }

    if (!sourceContent) {
      return res.status(404).json({
        status: 'error',
        message: 'No section content available for claims analysis',
      });
    }

    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'moonshot-v1-32k',
        messages: [
          {
            role: 'system',
            content: `You are a regulatory claims analyst with 20 years of FDA/EU experience.
Extract ALL marketing and clinical claims from the provided text.
For each claim, provide:
1. claim_text: The exact claim wording
2. claim_type: One of ['marketing', 'regulatory', 'labeling']
3. evidence_strength: Score 0.0-1.0 based on provided data
4. risk_level: One of ['low', 'medium', 'high', 'critical']
5. risk_flags: Array of specific concerns (e.g., ['small_sample', 'no_control_group'])
6. safer_alternative: Reworded claim that reduces regulatory risk
7. test_standard_mapping: Relevant ISO/IEC/FDA standards
8. evidence_required: What would strengthen this claim

Output MUST be valid JSON array of claim objects.`,
          },
          { role: 'user', content: sourceContent },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Kimi API error: ${response.status} ${response.statusText}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Invalid response from Kimi API');
    }

    let claims: any[] = [];
    try {
      claims = JSON.parse(rawContent);
      if (!Array.isArray(claims)) throw new Error('AI response is not an array');
    } catch (parseError: any) {
      console.error('Failed to parse AI response:', rawContent);
      throw new Error(`AI response parse error: ${parseError.message}`);
    }

    const now = new Date();
    const claimsWithMetadata = claims.map((claim: any) => ({
      submissionId,
      proposedClaim: claim.claim_text || claim.proposedClaim || '',
      claimType: claim.claim_type || claim.claimType || null,
      evidenceRequired: claim.evidence_required || claim.evidenceRequired || [],
      evidenceAvailable: claim.evidence_available || claim.evidenceAvailable || null,
      strengthScore: claim.evidence_strength || claim.strengthScore || 0.5,
      riskLevel: claim.risk_level || claim.riskLevel || 'medium',
      riskFlags: claim.risk_flags || claim.riskFlags || [],
      saferAlternative: claim.safer_alternative || claim.saferAlternative || null,
      testStandardMapping: claim.test_standard_mapping || claim.testStandardMapping || [],
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }));

    memoryClaimsBySubmission.set(submissionId, claimsWithMetadata);

    if (db) {
      try {
        await db.delete(regulatoryClaims).where(eq(regulatoryClaims.submissionId, submissionId));

        if (claimsWithMetadata.length > 0) {
          await db.insert(regulatoryClaims).values(claimsWithMetadata);
        }
      } catch (dbError) {
        console.warn('Claims persisted in memory only:', dbError);
      }
    }

    const summary = {
      totalClaims: claimsWithMetadata.length,
      highRisk: claimsWithMetadata.filter((c) => ['high', 'critical'].includes(c.riskLevel)).length,
      evidenceReady: claimsWithMetadata.filter((c) => (c.strengthScore ?? 0) >= 0.8).length,
      averageStrength:
        claimsWithMetadata.length > 0
          ? claimsWithMetadata.reduce((sum, c) => sum + (c.strengthScore || 0), 0) /
            claimsWithMetadata.length
          : 0,
    };

    return res.json({
      status: 'success',
      claims: claimsWithMetadata,
      summary,
      generatedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Claims analysis error:', error);
    return res.status(500).json({
      status: 'error',
      message: error?.message || 'Claims analysis failed',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    });
  }
});

router.get('/matrix', authenticateToken, async (req, res) => {
  try {
    const submissionId = String(req.query.submission_id || '').trim();

    if (!submissionId) {
      return res.status(400).json({
        status: 'error',
        message: 'submission_id required',
      });
    }

    let claims = memoryClaimsBySubmission.get(submissionId) || [];

    if (db) {
      try {
        claims = await db
          .select()
          .from(regulatoryClaims)
          .where(eq(regulatoryClaims.submissionId, submissionId))
          .orderBy(desc(regulatoryClaims.strengthScore));
      } catch (dbError) {
        console.warn('Using in-memory claims cache:', dbError);
      }
    }

    const summary = claims.length
      ? {
          totalClaims: claims.length,
          highRisk: claims.filter((c) => ['high', 'critical'].includes(c.riskLevel || '')).length,
          evidenceReady: claims.filter((c) => (c.strengthScore ?? 0) >= 0.8).length,
          averageStrength:
            claims.reduce((sum, c) => sum + (c.strengthScore || 0), 0) / claims.length,
        }
      : null;

    return res.json({
      status: 'success',
      claims,
      summary,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      message: error?.message || 'Failed to fetch claims matrix',
    });
  }
});

export default router;
