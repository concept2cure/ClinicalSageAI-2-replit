/**
 * @fileoverview CSR Builder API Routes
 * @module server/routes/csr-builder-routes
 *
 * Endpoints for AI-powered CSR generation, cross-study comparison,
 * safety signal analysis, and ICH E3 section drafting.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  launchCSRBuild,
  getICHE3Structure,
  draftCSRSection,
  compareWithExistingCSRs,
  analyzeCSRSafetySignals,
} from '../services/csr-builder.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Module-level AI client (shared across routes, avoids repeated dynamic imports)
// ─────────────────────────────────────────────────────────────────────────────
let aiClient: { complete: (messages: unknown[], options?: Record<string, unknown>) => Promise<string> } | null = null;
try {
  const mod = await import('../lib/unified-ai-client.js');
  aiClient = mod.ai;
} catch {
  console.warn('[CSR Builder Routes] AI client not available — narrative/benefit-risk will use templates');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract auth context from request (populated by auth middleware). */
function getAuthContext(req: Request) {
  const authUser = (req as Record<string, unknown>).user as Record<string, unknown> | undefined;
  const tenantCtx = (req as Record<string, unknown>).tenantContext as Record<string, unknown> | undefined;
  const organizationId = Number(tenantCtx?.organizationId || authUser?.organizationId);
  if (!organizationId) {
    throw new Error('Organization context required');
  }
  const userId = Number(authUser?.id || authUser?.userId);
  if (!userId) {
    throw new Error('User context required');
  }
  return { organizationId, userId };
}

/** Safe error message for client — never leak stack traces or internal details. */
function safeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message && !err.message.includes('at ') && err.message.length < 200) {
    return err.message;
  }
  return fallback;
}

/**
 * Parse a JSON object from an AI response string.
 * Uses a non-greedy regex and validates the result is a plain object.
 */
function parseJsonFromAIResponse(response: string): Record<string, unknown> | null {
  // Find first balanced { ... } block (non-greedy inner match)
  const jsonMatch = response.match(/\{[\s\S]*?\}(?=[^}]*$)|\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch { /* invalid JSON */ }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

// ICH E3 valid section numbers
const VALID_SECTION_NUMBERS = [
  '1', '2', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10',
  '3', '4', '5', '6', '7', '8', '8.1', '8.2',
  '9', '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7',
  '10', '10.1', '10.2', '11', '11.1', '11.2', '11.3', '11.4',
  '12', '12.1', '12.2', '12.3', '12.4', '12.5', '13', '14', '15', '16',
] as const;

const validSectionSet = new Set<string>(VALID_SECTION_NUMBERS);

const studyInfoSchema = z.object({
  title: z.string().min(1).max(500),
  protocolNumber: z.string().min(1).max(100),
  phase: z.string().min(1).max(50),
  indication: z.string().min(1).max(500),
  sponsor: z.string().min(1).max(300),
  investigationalProduct: z.string().min(1).max(300),
  comparator: z.string().max(300).optional(),
  studyDesign: z.string().min(1).max(500),
  primaryEndpoint: z.string().min(1).max(500),
  secondaryEndpoints: z.array(z.string().max(500)).max(20).optional(),
  sampleSize: z.number().int().positive().max(1000000).optional(),
  treatmentDuration: z.string().max(200).optional(),
  targetAgencies: z.array(z.string().max(50)).max(10).optional(),
});

const buildRequestSchema = z.object({
  projectId: z.number().int().positive().optional(),
  studyInfo: studyInfoSchema,
  sectionsToGenerate: z.array(z.string()).max(50).optional().refine(
    (sections) => !sections || sections.every(s => validSectionSet.has(s)),
    { message: 'sectionsToGenerate contains invalid ICH E3 section numbers' }
  ),
});

const draftSectionSchema = z.object({
  sectionNumber: z.enum(VALID_SECTION_NUMBERS),
  studyInfo: studyInfoSchema,
});

const compareSchema = z.object({
  indication: z.string().min(1).max(500),
  phase: z.string().min(1).max(50),
  endpoint: z.string().min(1).max(500),
});

const safetySchema = z.object({
  drugName: z.string().min(1).max(300),
  indication: z.string().min(1).max(500),
});

const narrativeSchema = z.object({
  studyId: z.string().max(100).optional(),
  patientId: z.string().max(100).optional(),
  eventDescription: z.string().min(1).max(2000),
  medicalHistory: z.string().max(5000).optional(),
  concomitantMeds: z.string().max(2000).optional(),
});

const benefitRiskSchema = z.object({
  drugName: z.string().min(1).max(300),
  indication: z.string().min(1).max(500),
  efficacyData: z.string().max(5000).optional(),
  safetyData: z.string().max(5000).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/csr-builder or /api/csr
 * Lightweight status endpoint for namespace discovery.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'CSR Builder API available',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/csr-builder/structure
 * Returns the full ICH E3 section hierarchy.
 */
router.get('/structure', (_req: Request, res: Response) => {
  const structure = getICHE3Structure();
  res.json({
    success: true,
    structure,
    totalSections: structure.reduce(
      (count, s) => count + 1 + (s.childSections?.length || 0),
      0
    ),
  });
});

/**
 * POST /api/csr-builder/build
 * Launch a full CSR build job with AI-powered drafting.
 */
router.post('/build', async (req: Request, res: Response) => {
  try {
    const validation = buildRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { organizationId, userId } = getAuthContext(req);

    const job = await launchCSRBuild({
      organizationId,
      userId,
      ...validation.data,
    });

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        sectionCount: job.sections.length,
        draftedSections: job.sections.filter(s => s.status === 'drafted').length,
        createdAt: job.createdAt,
      },
      sections: job.sections,
    });
  } catch (err) {
    console.error('[CSR Builder] Build failed:', err);
    res.status(500).json({ error: safeErrorMessage(err, 'CSR build failed') });
  }
});

/**
 * POST /api/csr-builder/draft-section
 * Draft a single CSR section with AI.
 */
router.post('/draft-section', async (req: Request, res: Response) => {
  try {
    const validation = draftSectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { sectionNumber, studyInfo } = validation.data;
    const result = await draftCSRSection(sectionNumber, studyInfo);

    res.json({
      success: true,
      sectionNumber,
      content: result.content,
      isAI: result.isAI,
      provider: result.isAI ? 'claude-ai-gateway' : 'template',
    });
  } catch (err) {
    console.error('[CSR Builder] Section draft failed:', err);
    res.status(500).json({ error: safeErrorMessage(err, 'Section draft failed') });
  }
});

/**
 * POST /api/csr-builder/compare
 * Cross-study comparison — find similar CSRs and compare key metrics.
 */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const validation = compareSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { organizationId } = getAuthContext(req);
    const { indication, phase, endpoint } = validation.data;
    const comparisons = await compareWithExistingCSRs(indication, phase, endpoint, organizationId);

    res.json({
      success: true,
      query: { indication, phase, endpoint },
      matchCount: comparisons.length,
      comparisons,
    });
  } catch (err) {
    console.error('[CSR Builder] Comparison failed:', err);
    res.status(500).json({ error: safeErrorMessage(err, 'Comparison failed') });
  }
});

/**
 * POST /api/csr-builder/safety-signals
 * AI-powered safety signal analysis for a drug/indication pair.
 */
router.post('/safety-signals', async (req: Request, res: Response) => {
  try {
    const validation = safetySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { drugName, indication } = validation.data;
    const result = await analyzeCSRSafetySignals(drugName, indication);

    res.json({
      success: true,
      drugName,
      indication,
      signalCount: result.signals.length,
      signals: result.signals,
      summary: result.summary,
    });
  } catch (err) {
    console.error('[CSR Builder] Safety analysis failed:', err);
    res.status(500).json({ error: safeErrorMessage(err, 'Safety analysis failed') });
  }
});

/**
 * POST /api/csr-builder/generate-narrative
 * Generate a patient case narrative for a CSR safety section.
 */
router.post('/generate-narrative', async (req: Request, res: Response) => {
  try {
    const validation = narrativeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { studyId, patientId, eventDescription, medicalHistory, concomitantMeds } = validation.data;

    let narrative = '';
    let isAI = false;

    if (aiClient) {
      try {
        narrative = await aiClient.complete(
          [
            {
              role: 'system',
              content: `You are an expert medical writer drafting patient case narratives for Clinical Study Reports per ICH E3 Section 12.3.
Write professional, factual narratives using passive voice and regulatory terminology.
Include: patient demographics (if known), relevant medical history, event onset, clinical course, outcome, and investigator causality assessment.`,
            },
            {
              role: 'user',
              content: `Draft a patient case narrative for inclusion in a CSR safety section:
Study: ${studyId || '[Study ID]'}
Patient: ${patientId || '[Patient ID]'}
Event: ${eventDescription}
Medical History: ${medicalHistory || 'Not provided'}
Concomitant Medications: ${concomitantMeds || 'Not provided'}`,
            },
          ],
          {
            taskType: 'document_drafting',
            maxTokens: 2048,
            temperature: 0.3,
            callerModule: 'csr-builder/narrative',
          }
        );
        isAI = true;
      } catch {
        // AI failed — fall through to template
      }
    }

    if (!isAI) {
      narrative = `PATIENT NARRATIVE — ${patientId || 'Subject [ID]'}\n\nA [age]-year-old [sex] patient (${patientId || 'Subject [ID]'}) enrolled in study ${studyId || '[Study ID]'} experienced ${eventDescription}.\n\nMedical History: ${medicalHistory || '[To be documented]'}\nConcomitant Medications: ${concomitantMeds || '[To be documented]'}\n\n[Onset, clinical course, treatment actions, and outcome to be completed from source data]`;
    }

    res.json({
      success: true,
      narrative,
      isAI,
      studyId: studyId || null,
      patientId: patientId || null,
    });
  } catch (err) {
    console.error('[CSR Builder] Narrative generation failed:', err);
    res.status(500).json({ error: safeErrorMessage(err, 'Narrative generation failed') });
  }
});

/**
 * POST /api/csr-builder/analyze-benefit-risk
 * AI-powered benefit-risk assessment for CSR Section 13.
 */
router.post('/analyze-benefit-risk', async (req: Request, res: Response) => {
  try {
    const validation = benefitRiskSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
    }

    const { drugName, indication, efficacyData, safetyData } = validation.data;

    let result: Record<string, unknown> = {};
    let isAI = false;

    if (aiClient) {
      try {
        const response = await aiClient.complete(
          [
            {
              role: 'system',
              content: `You are a regulatory affairs expert specializing in benefit-risk assessments for FDA submissions.
Generate a structured benefit-risk analysis suitable for ICH E3 Section 13 (Discussion and Overall Conclusions).
Return JSON with: { "benefitSummary": "...", "riskSummary": "...", "overallAssessment": "...", "recommendations": ["..."] }`,
            },
            {
              role: 'user',
              content: `Analyze benefit-risk for ${drugName} in ${indication}.\n\nEfficacy Data: ${efficacyData || 'Not yet available'}\nSafety Data: ${safetyData || 'Not yet available'}`,
            },
          ],
          {
            taskType: 'regulatory_review',
            maxTokens: 4096,
            temperature: 0.3,
            callerModule: 'csr-builder/benefit-risk',
          }
        );

        const parsed = parseJsonFromAIResponse(response);
        result = parsed || { overallAssessment: response };
        isAI = true;
      } catch {
        // AI failed — fall through to template
      }
    }

    if (!isAI) {
      result = {
        benefitSummary: `[Efficacy benefits of ${drugName} in ${indication} to be summarized from study data]`,
        riskSummary: `[Safety risks of ${drugName} to be summarized from adverse event data]`,
        overallAssessment: `Based on the available data, the benefit-risk profile of ${drugName} for the treatment of ${indication} should be evaluated considering the totality of efficacy and safety evidence.`,
        recommendations: [
          'Complete primary endpoint analysis',
          'Finalize integrated safety summary',
          'Compare with standard of care outcomes',
          'Assess unmet medical need context',
        ],
      };
    }

    res.json({ success: true, isAI, ...result });
  } catch (err) {
    console.error('[CSR Builder] Benefit-risk analysis failed:', err);
    res.status(500).json({ error: safeErrorMessage(err, 'Benefit-risk analysis failed') });
  }
});

export default router;
