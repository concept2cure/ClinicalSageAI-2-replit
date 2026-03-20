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
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const studyInfoSchema = z.object({
  title: z.string().min(1),
  protocolNumber: z.string().min(1),
  phase: z.string().min(1),
  indication: z.string().min(1),
  sponsor: z.string().min(1),
  investigationalProduct: z.string().min(1),
  comparator: z.string().optional(),
  studyDesign: z.string().min(1),
  primaryEndpoint: z.string().min(1),
  secondaryEndpoints: z.array(z.string()).optional(),
  sampleSize: z.number().optional(),
  treatmentDuration: z.string().optional(),
  targetAgencies: z.array(z.string()).optional(),
});

const buildRequestSchema = z.object({
  organizationId: z.number().default(1),
  userId: z.number().default(1),
  projectId: z.number().optional(),
  studyInfo: studyInfoSchema,
  sectionsToGenerate: z.array(z.string()).optional(),
});

const draftSectionSchema = z.object({
  sectionNumber: z.string().min(1),
  studyInfo: studyInfoSchema,
});

const compareSchema = z.object({
  indication: z.string().min(1),
  phase: z.string().min(1),
  endpoint: z.string().min(1),
});

const safetySchema = z.object({
  drugName: z.string().min(1),
  indication: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/csr-builder/structure
 * Returns the full ICH E3 section hierarchy.
 */
router.get('/structure', (_req: Request, res: Response) => {
  res.json({
    success: true,
    structure: getICHE3Structure(),
    totalSections: getICHE3Structure().reduce(
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

    const job = await launchCSRBuild(validation.data);

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
  } catch (err: any) {
    console.error('[CSR Builder] Build failed:', err.message);
    res.status(500).json({ error: 'CSR build failed', details: err.message });
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
  } catch (err: any) {
    console.error('[CSR Builder] Section draft failed:', err.message);
    res.status(500).json({ error: 'Section draft failed', details: err.message });
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

    const { indication, phase, endpoint } = validation.data;
    const comparisons = await compareWithExistingCSRs(indication, phase, endpoint);

    res.json({
      success: true,
      query: { indication, phase, endpoint },
      matchCount: comparisons.length,
      comparisons,
    });
  } catch (err: any) {
    console.error('[CSR Builder] Comparison failed:', err.message);
    res.status(500).json({ error: 'Comparison failed', details: err.message });
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
  } catch (err: any) {
    console.error('[CSR Builder] Safety analysis failed:', err.message);
    res.status(500).json({ error: 'Safety analysis failed', details: err.message });
  }
});

/**
 * POST /api/csr-builder/generate-narrative
 * Generate a patient case narrative for a CSR safety section.
 */
router.post('/generate-narrative', async (req: Request, res: Response) => {
  try {
    const { studyId, patientId, eventDescription, medicalHistory, concomitantMeds } = req.body;

    if (!eventDescription) {
      return res.status(400).json({ error: 'eventDescription is required' });
    }

    // Try AI narrative generation
    let narrative = '';
    let isAI = false;

    try {
      const mod = await import('../lib/unified-ai-client.js');
      const aiClient = mod.ai;

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
      narrative = `PATIENT NARRATIVE — ${patientId || 'Subject [ID]'}\n\nA [age]-year-old [sex] patient (${patientId || 'Subject [ID]'}) enrolled in study ${studyId || '[Study ID]'} experienced ${eventDescription}.\n\nMedical History: ${medicalHistory || '[To be documented]'}\nConcomitant Medications: ${concomitantMeds || '[To be documented]'}\n\n[Onset, clinical course, treatment actions, and outcome to be completed from source data]`;
    }

    res.json({
      success: true,
      narrative,
      isAI,
      studyId,
      patientId,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Narrative generation failed', details: err.message });
  }
});

/**
 * POST /api/csr-builder/analyze-benefit-risk
 * AI-powered benefit-risk assessment for CSR Section 13.
 */
router.post('/analyze-benefit-risk', async (req: Request, res: Response) => {
  try {
    const { drugName, indication, efficacyData, safetyData } = req.body;

    if (!drugName || !indication) {
      return res.status(400).json({ error: 'drugName and indication are required' });
    }

    let result: Record<string, unknown> = {};
    let isAI = false;

    try {
      const mod = await import('../lib/unified-ai-client.js');
      const aiClient = mod.ai;

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

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { overallAssessment: response };
        }
      } catch {
        result = { overallAssessment: response };
      }
      isAI = true;
    } catch {
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
  } catch (err: any) {
    res.status(500).json({ error: 'Benefit-risk analysis failed', details: err.message });
  }
});

export default router;
