/**
 * CERV2 AI Auto-Populate Stub Routes  (Phase 7.3 – Enhanced)
 *
 * POST /api/cerv2/ai/suggest            – Generate section-level AI suggestions
 * POST /api/cerv2/ai/equivalence        – SE / equivalence placeholder text
 * POST /api/cerv2/ai/benefit-risk       – Benefit-risk analysis stub
 * POST /api/cerv2/ai/analyze-section    – Deep section analysis w/ realistic mock content
 * GET  /api/cerv2/ai/templates/:docType – Pre-built section templates per doc type
 * GET  /api/cerv2/ai/health             – Health check for AI service
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../auth';
import { ai } from '../lib/unified-ai-client';
import { getIntelligencePrefix } from '../services/lumen-context-builder.js';
import { getGateway } from '../services/ai-gateway/gateway.js';
import ragService from '../services/biotechRagService.js';

const router = Router();

// ── Rate limiting for AI endpoints (prevents runaway OpenAI costs) ──────────
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // 20 AI requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests — please wait before trying again.' },
  keyGenerator: (req: any) => {
    // Rate limit by user + org to prevent abuse
    const userId = req.userId || req.user?.id || 'anon';
    const orgId = req.header('x-organization-id') || 'unknown';
    return `cerv2-ai:${orgId}:${userId}`;
  },
});

// Apply to all AI generation routes (suggest, equivalence, benefit-risk, analyze-section)
router.use(['/suggest', '/equivalence', '/benefit-risk', '/analyze-section'], aiRateLimiter);

// ── Auth guard ─────────────────────────────────────────────────────────────────
const allowedRoles = new Set(['admin', 'owner', 'editor', 'super_admin']);
const requireEditorAccess = (req: any, res: any, next: () => void) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !allowedRoles.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  // Verify organization context exists (prevents cross-org access)
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const orgId = headerOrg || tenantOrg || userOrg;
  if (!orgId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  // Attach resolved org for downstream use
  req.resolvedOrganizationId = Number(orgId);
  return next();
};

// ── Validation ─────────────────────────────────────────────────────────────────
const validDocTypes = ['cerv2_510k', 'cerv2_pma', 'cerv2_cer'] as const;

const suggestSchema = z.object({
  docType: z.enum(validDocTypes),
  sectionId: z.string().min(1),
  fieldId: z.string().min(1),
  context: z
    .object({
      deviceName: z.string().optional(),
      predicateDevice: z.string().optional(),
      indication: z.string().optional(),
      existingContent: z.string().optional(),
    })
    .optional(),
});

const equivalenceSchema = z.object({
  deviceName: z.string().min(1),
  predicateDevice: z.string().min(1),
  predicateK: z.string().optional(),
  similarities: z.array(z.string()).optional(),
  differences: z.array(z.string()).optional(),
});

const benefitRiskSchema = z.object({
  docType: z.enum(validDocTypes),
  deviceName: z.string().min(1),
  benefits: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
});

// ── Placeholder templates per doc type ─────────────────────────────────────────

const sectionTemplates: Record<string, Record<string, string>> = {
  cerv2_510k: {
    // Keys match both docTypes.js section IDs AND editor field IDs
    // docTypes.js IDs: admin, ifu, desc, pred, se, testing, labeling, concl
    admin:
      'Administrative information for this 510(k) premarket notification submitted to the U.S. Food and Drug Administration for [DEVICE NAME]. Submitter: [COMPANY NAME]. Contact: [CONTACT INFORMATION].',
    cover_letter:
      'This 510(k) premarket notification is submitted to the U.S. Food and Drug Administration for [DEVICE NAME], a [DEVICE CLASS] medical device. The submitter, [COMPANY NAME], respectfully requests a determination of substantial equivalence to [PREDICATE DEVICE] ([PREDICATE K-NUMBER]).',
    ifu: '[DEVICE NAME] is intended for [INTENDED USE] in [TARGET POPULATION]. The device is indicated for use in [USE ENVIRONMENT].',
    summary:
      '[DEVICE NAME] is a [CLASS/PRODUCT CODE] device intended for [INTENDED USE]. Regulation Number: 21 CFR [REGULATION]. Classification: [CLASS] with [SPECIAL CONTROLS, if applicable].',
    desc: '[DEVICE NAME] consists of the following primary components: [LIST COMPONENTS]. The device measures [DIMENSIONS] and weighs [WEIGHT]. Key technical specifications include: [SPECS].',
    device_description:
      '[DEVICE NAME] consists of the following primary components: [LIST COMPONENTS]. The device measures [DIMENSIONS] and weighs [WEIGHT]. Key technical specifications include: [SPECS].',
    pred: 'The primary predicate device is [PREDICATE DEVICE] ([K-NUMBER]), manufactured by [MANUFACTURER]. The reference predicate is [REFERENCE DEVICE] ([K-NUMBER]).',
    predicate_comparison:
      'The primary predicate device is [PREDICATE DEVICE] ([K-NUMBER]), manufactured by [MANUFACTURER]. The reference predicate is [REFERENCE DEVICE] ([K-NUMBER]).',
    se: '[DEVICE NAME] is substantially equivalent to [PREDICATE DEVICE] ([PREDICATE K]) with respect to intended use, technological characteristics, and performance specifications. The subject device shares the same intended use as the predicate: [INTENDED USE]. Differences include: [LIST DIFFERENCES]. These differences do not raise new questions of safety or effectiveness.',
    se_discussion:
      '[DEVICE NAME] is substantially equivalent to [PREDICATE DEVICE] ([PREDICATE K]) with respect to intended use, technological characteristics, and performance specifications. The subject device shares the same intended use as the predicate: [INTENDED USE]. Differences include: [LIST DIFFERENCES]. These differences do not raise new questions of safety or effectiveness.',
    testing:
      'Bench testing was conducted per applicable FDA-recognized consensus standards including: [LIST STANDARDS]. Software validation was performed per IEC 62304. Biocompatibility testing was completed per the ISO 10993 series.',
    performance_testing:
      'Bench testing was conducted per applicable FDA-recognized consensus standards including: [LIST STANDARDS]. Software validation was performed per IEC 62304. Biocompatibility testing was completed per the ISO 10993 series.',
    labeling:
      'Proposed labeling includes: Instructions for Use (IFU), Quick Start Guide, and packaging labels. All labeling complies with 21 CFR 801 requirements.',
    concl:
      'Based on the comparison of intended use, technological characteristics, and performance data, [DEVICE NAME] is substantially equivalent to [PREDICATE DEVICE] and should be cleared for commercial distribution.',
    conclusion:
      'Based on the comparison of intended use, technological characteristics, and performance data, [DEVICE NAME] is substantially equivalent to [PREDICATE DEVICE] and should be cleared for commercial distribution.',
  },
  cerv2_pma: {
    // docTypes.js IDs: summary, nonclin, clin, mfgqa, labeling, risk, pms
    summary:
      'This Premarket Approval (PMA) application is submitted for [DEVICE NAME], a Class III [DEVICE TYPE] intended for [INDICATION]. Applicant: [COMPANY NAME]. Device Classification: Class III – Product Code: [CODE]. Regulation: 21 CFR [REGULATION].',
    summary_overview:
      'This Premarket Approval (PMA) application is submitted for [DEVICE NAME], a Class III [DEVICE TYPE] intended for [INDICATION]. Applicant: [COMPANY NAME]. Device Classification: Class III – Product Code: [CODE]. Regulation: 21 CFR [REGULATION].',
    nonclin:
      'Comprehensive nonclinical testing was performed including benchtop characterization, biocompatibility (ISO 10993), electrical safety (IEC 60601-1), EMC (IEC 60601-1-2), and accelerated lifetime testing.',
    bench_testing:
      'Comprehensive nonclinical testing was performed including benchtop characterization, biocompatibility (ISO 10993), electrical safety (IEC 60601-1), EMC (IEC 60601-1-2), and accelerated lifetime testing.',
    clin: 'The [STUDY NAME] pivotal trial was a prospective, randomized, [BLINDING]-blind, [CONTROL TYPE]-controlled, multi-center study enrolling [N] subjects at [SITES] sites. Primary endpoint: [ENDPOINT]. Results: Active group achieved [RESULT] vs. [CONTROL RESULT] in the control group (p [P-VALUE]).',
    study_design:
      'The [STUDY NAME] pivotal trial was a prospective, randomized, [BLINDING]-blind, [CONTROL TYPE]-controlled, multi-center study enrolling [N] subjects at [SITES] sites.',
    clinical_results:
      'Primary endpoint: [ENDPOINT]. Results: Active group achieved [RESULT] vs. [CONTROL RESULT] in the control group (p [P-VALUE]). Responder rate: [RATE]% active vs. [CONTROL RATE]% control.',
    mfgqa:
      "[DEVICE NAME] is manufactured at [COMPANY NAME]'s ISO 13485:2016 certified facility. The facility is compliant with 21 CFR Part 820 Quality System Regulation. All critical suppliers are qualified under a documented supplier management program.",
    labeling:
      "Proposed labeling includes: Physician's Manual, Patient's Manual, and Surgical Technique Guide. Labeling includes required Class III warnings, precautions, and a detailed summary of clinical trial results.",
    risk: 'The benefits of [DEVICE NAME] significantly outweigh the risks for the intended patient population. The pivotal trial demonstrated clinically meaningful and statistically significant improvement in [OUTCOME] with an acceptable safety profile.',
    risk_analysis:
      'The benefits of [DEVICE NAME] significantly outweigh the risks for the intended patient population. The pivotal trial demonstrated clinically meaningful and statistically significant improvement in [OUTCOME] with an acceptable safety profile.',
    pms: 'A post-approval study (PAS) is proposed to monitor long-term safety and effectiveness over [YEARS] years in [N] patients across [SITES] sites. Annual interim reports will be submitted.',
    pms_plan:
      'A post-approval study (PAS) is proposed to monitor long-term safety and effectiveness over [YEARS] years in [N] patients across [SITES] sites. Annual interim reports will be submitted.',
  },
  cerv2_cer: {
    // docTypes.js IDs: sota, device, dataset, appraisal, benefitrisk, gspr, pms, concl
    sota: 'This Clinical Evaluation Report (CER) is prepared in accordance with EU MDR 2017/745 Article 61 and Annex XIV, following MEDDEV 2.7/1 rev. 4 methodology for [DEVICE NAME]. Current state of the art for [DEVICE CATEGORY] involves [STATE OF ART DESCRIPTION].',
    current_knowledge:
      'This Clinical Evaluation Report (CER) is prepared in accordance with EU MDR 2017/745 Article 61 and Annex XIV, following MEDDEV 2.7/1 rev. 4 methodology for [DEVICE NAME]. Current state of the art for [DEVICE CATEGORY] involves [STATE OF ART DESCRIPTION].',
    device:
      '[DEVICE NAME] is a [MDR CLASS] medical device consisting of: [COMPONENTS]. Intended Purpose: [INTENDED PURPOSE] per MDR Article 2(12).',
    device_description:
      '[DEVICE NAME] is a [MDR CLASS] medical device consisting of: [COMPONENTS]. Intended Purpose: [INTENDED PURPOSE] per MDR Article 2(12).',
    dataset:
      'A systematic literature review was conducted following MEDDEV 2.7/1 rev. 4 Appendix A10. Databases searched: PubMed, Embase, Cochrane Library. Search dates: [DATE RANGE]. Initial results: [N] articles; after screening: [N] articles included.',
    search_strategy:
      'A systematic literature review was conducted following MEDDEV 2.7/1 rev. 4 Appendix A10. Databases searched: PubMed, Embase, Cochrane Library. Search dates: [DATE RANGE]. Initial results: [N] articles; after screening: [N] articles included.',
    appraisal:
      'Each identified study was appraised per MEDDEV 2.7/1 rev. 4 criteria: scientific validity, relevance to the device, and methodological quality.',
    appraisal_methodology:
      'Each identified study was appraised per MEDDEV 2.7/1 rev. 4 criteria: scientific validity, relevance to the device, and methodological quality.',
    benefitrisk:
      'Benefits: [LIST BENEFITS]. Risk reduction: [QUANTIFY]. Risks: [LIST RISKS WITH RATES]. The benefit-risk profile is favorable and supports conformity with the General Safety and Performance Requirements of MDR 2017/745.',
    clinical_benefits:
      'Benefits: [LIST BENEFITS]. Risk reduction: [QUANTIFY]. Quality of life improvement: [MEASURES].',
    residual_risks:
      'Risks: [LIST RISKS WITH RATES]. All risks are consistent with established [DEVICE CATEGORY] devices and are mitigated by [MITIGATION MEASURES].',
    gspr: 'General Safety and Performance Requirements (GSPRs) per MDR Annex I have been systematically mapped to supporting evidence. All [N] applicable GSPRs are addressed.',
    gspr_overview:
      'General Safety and Performance Requirements (GSPRs) per MDR Annex I have been systematically mapped to supporting evidence. All [N] applicable GSPRs are addressed.',
    pms: 'A Post-Market Surveillance (PMS) plan and Post-Market Clinical Follow-up (PMCF) plan have been established in accordance with MDR Articles 83–86 and Annex XIV Part B.',
    pms_plan:
      'A Post-Market Surveillance (PMS) plan and Post-Market Clinical Follow-up (PMCF) plan have been established in accordance with MDR Articles 83–86 and Annex XIV Part B.',
    concl:
      'Based on the clinical evaluation performed in accordance with MEDDEV 2.7/1 rev. 4, [DEVICE NAME] meets the relevant General Safety and Performance Requirements of MDR 2017/745. The benefit-risk profile is favorable.',
    overall_conclusion:
      'Based on the clinical evaluation performed in accordance with MEDDEV 2.7/1 rev. 4, [DEVICE NAME] meets the relevant General Safety and Performance Requirements of MDR 2017/745. The benefit-risk profile is favorable.',
  },
};

// ── Helper: RAG-augmented AI generation ──────────────────────────────────────
async function generateWithRAG(
  prompt: string,
  ragQuery: string,
  systemPrompt: string,
  organizationId?: number
): Promise<{ text: string; source: string; ragSources: any[] }> {
  // Inject client/project intelligence so CERV2 reads SKILL/.MD context
  const intelligencePrefix = await getIntelligencePrefix(organizationId).catch(() => '');
  systemPrompt = intelligencePrefix + systemPrompt;
  // Step 1: Retrieve relevant context from RAG
  let ragContext = '';
  let ragSources: any[] = [];
  try {
    const searchResults = await ragService.search({
      query: ragQuery,
      topK: 5,
      minScore: 0.5,
      searchMode: 'hybrid',
    });
    if (searchResults?.results?.length > 0) {
      ragSources = searchResults.results.map((r: any) => ({
        title: r.documentTitle || r.sectionTitle || 'Document',
        score: r.score,
        snippet: (r.content || '').substring(0, 200),
      }));
      ragContext = searchResults.results
        .map((r: any) => r.content)
        .join('\n\n---\n\n');
    }
  } catch (ragErr) {
    console.warn('[CERV2 AI] RAG retrieval failed, continuing without context:', ragErr);
  }

  // Step 2: Generate with LLM via AI Gateway (Claude primary)
  try {
    const gw = getGateway();
    if (gw.getEnabledProviders().length > 0) {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];
      if (ragContext) {
        messages.push({
          role: 'system',
          content: `Relevant regulatory and clinical context from the knowledge base:\n\n${ragContext}`,
        });
      }
      messages.push({ role: 'user', content: prompt });

      const gwResponse = await gw.route({
        taskType: 'document_drafting',
        messages,
        temperature: 0.3,
        maxTokens: 2000,
        callerModule: 'cerv2-ai-routes/generateWithRAG',
      });
      const text = gwResponse.content || '';
      if (text.length > 50) {
        return { text, source: ragContext ? 'rag+ai' : 'ai', ragSources };
      }
    }
  } catch (aiErr) {
    console.warn('[CERV2 AI] AI Gateway generation failed, falling back to template:', aiErr);
  }

  // Step 3: Fallback — return empty to let caller use template
  return { text: '', source: 'template', ragSources };
}

// ── POST /suggest ──────────────────────────────────────────────────────────────
// RAG-augmented AI suggestions for section content. Falls back to templates.
router.post(
  '/suggest',
  authMiddleware,
  requireEditorAccess,
  async (req: Request, res: Response) => {
    try {
      const validation = suggestSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: validation.error.flatten() });
      }

      const { docType, sectionId, fieldId, context } = validation.data;

      // Build a meaningful query for RAG retrieval
      const deviceInfo = context?.deviceName || 'medical device';
      const ragQuery = `${docType === 'cerv2_510k' ? '510(k)' : docType === 'cerv2_pma' ? 'PMA' : 'CER'} ${sectionId} ${fieldId} ${deviceInfo} ${context?.predicateDevice || ''} ${context?.indication || ''}`.trim();

      const systemPrompt = `You are a regulatory affairs expert specializing in FDA and EU MDR medical device submissions. Generate professional, regulatory-compliant content for a ${docType === 'cerv2_510k' ? '510(k) premarket notification' : docType === 'cerv2_pma' ? 'PMA application' : 'EU MDR Clinical Evaluation Report'}. Section: ${sectionId}/${fieldId}. Be specific, use proper regulatory language, and cite applicable standards where appropriate.`;

      const userPrompt = `Generate content for the "${fieldId}" field in section "${sectionId}" of a ${docType} submission.${context?.deviceName ? ` Device: ${context.deviceName}.` : ''}${context?.predicateDevice ? ` Predicate: ${context.predicateDevice}.` : ''}${context?.indication ? ` Intended use: ${context.indication}.` : ''}${context?.existingContent ? `\n\nExisting content to improve:\n${context.existingContent}` : ''}`;

      const { text: aiText, source, ragSources } = await generateWithRAG(
        userPrompt,
        ragQuery,
        systemPrompt,
        (req as any).resolvedOrganizationId
      );

      // If AI generated content, use it; otherwise fall back to template
      let suggestion = aiText;
      let finalSource = source;

      if (!suggestion) {
        const templates = sectionTemplates[docType] || {};
        suggestion = templates[fieldId] || templates[sectionId] || '';
        finalSource = 'template';

        // Replace all known placeholders with context or descriptive defaults
        if (context?.deviceName) {
          suggestion = suggestion.replace(/\[DEVICE NAME\]/g, context.deviceName);
        }
        if (context?.predicateDevice) {
          suggestion = suggestion.replace(/\[PREDICATE DEVICE\]/g, context.predicateDevice);
          suggestion = suggestion.replace(/\[PREDICATE K\]/g, context.predicateDevice);
          suggestion = suggestion.replace(/\[PREDICATE K-NUMBER\]/g, context.predicateDevice);
          suggestion = suggestion.replace(/\[PREDICATE\]/g, context.predicateDevice);
          suggestion = suggestion.replace(/\[K-NUMBER\]/g, context.predicateDevice);
          suggestion = suggestion.replace(/\[REFERENCE DEVICE\]/g, context.predicateDevice);
        }
        if (context?.indication) {
          suggestion = suggestion.replace(/\[INTENDED USE\]/g, context.indication);
          suggestion = suggestion.replace(/\[INDICATION\]/g, context.indication);
          suggestion = suggestion.replace(/\[INTENDED PURPOSE\]/g, context.indication);
        }
        // Remove any remaining bracket placeholders so clients never see raw [TOKENS]
        suggestion = suggestion.replace(/\[[A-Z][A-Z _/,()]{2,}\]/g, '___');
      }

      return res.json({
        suggestion,
        source: finalSource,
        ragSources,
        docType,
        sectionId,
        fieldId,
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Suggest error:', err);
      res.status(500).json({ error: 'Suggestion failed', message: err.message });
    }
  }
);

// ── POST /equivalence ──────────────────────────────────────────────────────────
// Generate placeholder substantial equivalence text for 510(k)
router.post(
  '/equivalence',
  authMiddleware,
  requireEditorAccess,
  async (req: Request, res: Response) => {
    try {
      const validation = equivalenceSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: validation.error.flatten() });
      }

      const {
        deviceName,
        predicateDevice,
        predicateK,
        similarities = [],
        differences = [],
      } = validation.data;

      const simText =
        similarities.length > 0
          ? `Both devices share the following characteristics: ${similarities.join('; ')}.`
          : 'Detailed comparison of technological characteristics demonstrates equivalence in intended use and fundamental technology.';

      const diffText =
        differences.length > 0
          ? `Differences include: ${differences.join('; ')}. These differences do not raise new questions of safety or effectiveness.`
          : 'No significant technological differences exist between the subject and predicate devices.';

      const text = [
        `${deviceName} is substantially equivalent to ${predicateDevice}${predicateK ? ` (${predicateK})` : ''} with respect to intended use, technological characteristics, and performance specifications.`,
        '',
        'Intended Use Comparison:',
        `The subject device (${deviceName}) shares the same intended use as the predicate device (${predicateDevice}): [INTENDED USE].`,
        '',
        'Technological Characteristics Comparison:',
        simText,
        '',
        'Differences:',
        diffText,
        '',
        'Performance Data:',
        `Performance testing data demonstrates that ${deviceName} performs at least as well as ${predicateDevice} for all validated test methods. [INSERT SPECIFIC PERFORMANCE COMPARISON DATA].`,
        '',
        'Conclusion:',
        `Based on the foregoing comparison, ${deviceName} is substantially equivalent to ${predicateDevice} and should be cleared for commercial distribution in the United States.`,
      ].join('\n');

      // Clean any remaining bracket placeholders
      const cleanedText = text.replace(/\[[A-Z][A-Z _/,()]{2,}\]/g, '___');

      return res.json({
        text: cleanedText,
        source: 'template',
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Equivalence error:', err);
      res.status(500).json({ error: 'Equivalence generation failed', message: err.message });
    }
  }
);

// ── POST /benefit-risk ─────────────────────────────────────────────────────────
// Generate placeholder benefit-risk determination text
router.post(
  '/benefit-risk',
  authMiddleware,
  requireEditorAccess,
  async (req: Request, res: Response) => {
    try {
      const validation = benefitRiskSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: validation.error.flatten() });
      }

      const { docType, deviceName, benefits = [], risks = [] } = validation.data;

      const isCer = docType === 'cerv2_cer';
      const framework = isCer
        ? 'EU MDR 2017/745 Annex I General Safety and Performance Requirements'
        : 'FDA guidance on benefit-risk determinations for medical devices';

      const benefitText =
        benefits.length > 0
          ? `Key clinical benefits include: ${benefits.join('; ')}.`
          : `The clinical benefits of ${deviceName} include [LIST QUANTIFIED BENEFITS].`;

      const riskText =
        risks.length > 0
          ? `Identified residual risks include: ${risks.join('; ')}. All identified risks are mitigated to acceptable levels through design controls, labeling, and post-market surveillance.`
          : `Residual risks include [LIST RISKS WITH RATES]. Risk mitigation measures include [LIST MEASURES].`;

      const text = [
        `Benefit-Risk Determination for ${deviceName}`,
        '',
        `This analysis is conducted in accordance with ${framework}.`,
        '',
        'Benefits:',
        benefitText,
        '',
        'Risks:',
        riskText,
        '',
        'Determination:',
        `Based on the totality of evidence, the benefits of ${deviceName} for the intended patient population significantly outweigh the identified risks. The benefit-risk profile is favorable${isCer ? ' and supports conformity with the General Safety and Performance Requirements of MDR 2017/745' : ' and supports a reasonable assurance of safety and effectiveness'}.`,
      ].join('\n');

      // Clean any remaining bracket placeholders
      const cleanedText = text.replace(/\[[A-Z][A-Z _/,()]{2,}\]/g, '___');

      return res.json({
        text: cleanedText,
        source: 'template',
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Benefit-risk error:', err);
      res.status(500).json({ error: 'Benefit-risk generation failed', message: err.message });
    }
  }
);

// ── GET /templates/:docType ────────────────────────────────────────────────────
// Return all pre-built section templates for a doc type (for bulk auto-populate)
router.get(
  '/templates/:docType',
  authMiddleware,
  requireEditorAccess,
  (req: Request, res: Response) => {
    try {
      const docType = req.params.docType;
      if (!validDocTypes.includes(docType as any)) {
        return res.status(400).json({
          error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
        });
      }

      return res.json({
        docType,
        templates: sectionTemplates[docType] || {},
        note: 'Template text — fill in device-specific details before use.',
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Templates error:', err);
      res.status(500).json({ error: 'Failed to retrieve templates', message: err.message });
    }
  }
);

// ── POST /analyze-section ──────────────────────────────────────────────────────
// Phase 7.3: Deep section-aware analysis returning realistic mock content
// for equivalence, benefit-risk, and regulatory-template generation.
const analyzeSectionSchema = z.object({
  docType: z.enum(validDocTypes),
  sectionId: z.string().min(1),
  content: z.string().optional(),
  deviceContext: z
    .object({
      deviceName: z.string().optional(),
      manufacturer: z.string().optional(),
      predicateDevice: z.string().optional(),
      predicateK: z.string().optional(),
      intendedUse: z.string().optional(),
      deviceClass: z.string().optional(),
    })
    .optional(),
});

// Enhanced realistic mock content keyed by docType → sectionId
const enhancedMockContent: Record<string, Record<string, (ctx: any) => string>> = {
  cerv2_510k: {
    se: ctx =>
      [
        `## Substantial Equivalence Discussion`,
        ``,
        `### 1. Intended Use Comparison`,
        `The subject device, ${ctx.deviceName || '[DEVICE NAME]'}, shares the same intended use as the predicate device, ${ctx.predicateDevice || '[PREDICATE]'}: ${ctx.intendedUse || '[INTENDED USE]'}. Both devices are intended to be used by healthcare professionals in hospital and clinical settings for the same patient population.`,
        ``,
        `### 2. Technological Characteristics`,
        `Both the subject and predicate devices employ the same fundamental technology. The subject device utilizes the same operating principle and energy type as the predicate. Key design parameters including materials, dimensions, and performance specifications are comparable.`,
        ``,
        `### 3. Performance Data Summary`,
        `Bench testing per applicable FDA-recognized consensus standards demonstrates the subject device performs at least as well as the predicate device across all validated test methods. Software verification and validation (per IEC 62304) confirm equivalent functionality.`,
        ``,
        `### 4. Conclusion`,
        `The technological differences between the subject and predicate devices do not raise new questions of safety or effectiveness. ${ctx.deviceName || '[DEVICE NAME]'} is substantially equivalent to ${ctx.predicateDevice || '[PREDICATE]'}${ctx.predicateK ? ` (${ctx.predicateK})` : ''}.`,
      ].join('\n'),

    testing: ctx =>
      [
        `## Performance Testing Summary`,
        ``,
        `### Biocompatibility (ISO 10993 series)`,
        `All patient-contacting materials passed cytotoxicity (ISO 10993-5), sensitization (ISO 10993-10), and irritation testing at an ISO 17025 accredited laboratory.`,
        ``,
        `### Electrical Safety (IEC 60601-1)`,
        `The device meets all applicable requirements of IEC 60601-1:2005+A1:2012 and IEC 60601-1-2:2014 (EMC). Leakage currents and dielectric strength are within specified limits.`,
        ``,
        `### Software Verification & Validation (IEC 62304)`,
        `Software lifecycle processes comply with IEC 62304:2006+A1:2015. Unit, integration, and system testing achieved ≥95% code coverage with zero critical defects.`,
        ``,
        `### Performance Specifications`,
        `Quantitative performance testing confirms ${ctx.deviceName || 'the device'} meets or exceeds all design input specifications under normal and fault conditions.`,
      ].join('\n'),

    concl: ctx =>
      `Based on the foregoing comparison of intended use, technological characteristics, and performance data, ${ctx.deviceName || '[DEVICE NAME]'} is substantially equivalent to ${ctx.predicateDevice || '[PREDICATE DEVICE]'}${ctx.predicateK ? ` (${ctx.predicateK})` : ''} and should be cleared for marketing in the United States per Section 510(k) of the Federal Food, Drug, and Cosmetic Act.`,
  },

  cerv2_pma: {
    clin: ctx =>
      [
        `## Clinical Data Summary`,
        ``,
        `### Study Design`,
        `A prospective, randomized, double-blind, controlled, multi-center pivotal trial was conducted to evaluate the safety and effectiveness of ${ctx.deviceName || '[DEVICE NAME]'}.`,
        ``,
        `### Enrollment`,
        `A total of 300 subjects were enrolled at 15 investigational sites. The Intent-to-Treat (ITT) population comprised 285 subjects and the Per-Protocol (PP) population comprised 270 subjects.`,
        ``,
        `### Primary Endpoint`,
        `The primary effectiveness endpoint was met with a responder rate of 78.5% in the active group vs. 42.3% in the control group (p < 0.001). The pre-specified performance goal of 60% was exceeded.`,
        ``,
        `### Safety`,
        `The overall adverse event rate was 12.8% (active) vs. 11.5% (control), with no statistically significant difference between groups. No unanticipated adverse device effects (UADEs) were reported.`,
      ].join('\n'),

    risk: ctx =>
      [
        `## Benefit-Risk Determination`,
        ``,
        `The probable benefits of ${ctx.deviceName || '[DEVICE NAME]'} include clinically meaningful improvement in primary efficacy outcomes, demonstrated by a statistically significant difference from control (p < 0.001). The benefit is durable through the 12-month follow-up period.`,
        ``,
        `Probable risks include device-related adverse events occurring at a rate consistent with the predicate/comparator (12.8% vs. 11.5%). All risks are mitigatable through proper patient selection, labeling, and post-market surveillance.`,
        ``,
        `**Determination:** The probable benefits to health from use of ${ctx.deviceName || '[DEVICE NAME]'} outweigh its probable risks when used as intended, providing a reasonable assurance of safety and effectiveness.`,
      ].join('\n'),
  },

  cerv2_cer: {
    benefitrisk: ctx =>
      [
        `## Benefit-Risk Analysis (EU MDR 2017/745)`,
        ``,
        `### Clinical Benefits`,
        `The clinical evaluation demonstrates that ${ctx.deviceName || '[DEVICE NAME]'} provides the following clinical benefits:`,
        `- Reduction in procedure time by approximately 30% vs. standard of care`,
        `- Improvement in primary clinical outcome measure (effect size: 0.65, 95% CI: 0.42–0.88)`,
        `- Enhanced patient quality of life scores at 6 and 12 months post-intervention`,
        ``,
        `### Residual Risks`,
        `After implementation of risk controls per ISO 14971:2019, the following residual risks remain:`,
        `- Minor procedural complications: 3.2% (comparable to State of the Art)`,
        `- Device-related adverse events: 1.8% (below the threshold established in MEDDEV 2.7/1 rev. 4)`,
        ``,
        `### Conclusion`,
        `The benefit-risk ratio is favorable. The demonstrated clinical benefits significantly outweigh the residual risks, supporting conformity with the General Safety and Performance Requirements of MDR 2017/745 Annex I.`,
      ].join('\n'),

    gspr: ctx =>
      [
        `## GSPR Compliance Mapping`,
        ``,
        `All applicable General Safety and Performance Requirements per MDR 2017/745 Annex I have been systematically evaluated:`,
        ``,
        `| GSPR # | Requirement | Status | Evidence Reference |`,
        `|--------|-------------|--------|-------------------|`,
        `| 1 | General requirements | ✅ Compliant | Risk Management File, DHF |`,
        `| 2 | Risk management | ✅ Compliant | ISO 14971 Risk Analysis Report |`,
        `| 3 | Design & manufacture | ✅ Compliant | QMS (ISO 13485), DHF |`,
        `| 4 | Safety and performance | ✅ Compliant | V&V Reports, Clinical Data |`,
        `| 5 | Acceptable benefit-risk | ✅ Compliant | CER Section – B/R Analysis |`,
        `| 6 | Chemical properties | ✅ Compliant | Biocompatibility Report |`,
        `| 7 | Infection & microbial | ${ctx.deviceClass === 'III' ? '✅ Compliant' : 'N/A'} | Sterility Validation |`,
        ``,
        `Detailed traceability is maintained in the GSPR Compliance Matrix (Annex A).`,
      ].join('\n'),

    sota: ctx =>
      [
        `## State of the Art – ${ctx.deviceName || '[DEVICE CATEGORY]'}`,
        ``,
        `### Current Clinical Knowledge`,
        `The current state of the art for devices in this therapeutic area is characterized by:`,
        `- Established clinical pathways with well-documented outcomes`,
        `- Multiple device options from various manufacturers with at least 5 years of market history`,
        `- Published consensus standards and clinical guidelines (e.g., ESC, AHA, NICE)`,
        ``,
        `### Available Alternatives`,
        `Alternative treatment options include pharmacological management, surgical intervention, and competitor medical devices. The subject device addresses known limitations of current alternatives, including [SPECIFIC ADVANTAGES].`,
        ``,
        `### Unmet Clinical Need`,
        `Gaps in current treatment approaches include limited long-term durability data, patient compliance challenges, and the need for less-invasive options. ${ctx.deviceName || '[DEVICE NAME]'} addresses these gaps through [MECHANISM].`,
      ].join('\n'),
  },
};

router.post(
  '/analyze-section',
  authMiddleware,
  requireEditorAccess,
  async (req: Request, res: Response) => {
    try {
      const validation = analyzeSectionSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: validation.error.flatten() });
      }

      const { docType, sectionId, content: existingContent, deviceContext } = validation.data;
      const ctx = deviceContext || {};

      // Try RAG + AI generation first
      const docLabel = docType === 'cerv2_510k' ? '510(k)' : docType === 'cerv2_pma' ? 'PMA' : 'EU MDR CER';
      const ragQuery = `${docLabel} ${sectionId} ${ctx.deviceName || 'medical device'} ${ctx.predicateDevice || ''} ${ctx.intendedUse || ''}`.trim();
      const systemPrompt = `You are an expert regulatory writer. Generate detailed, professional content for section "${sectionId}" of a ${docLabel} submission. Use proper regulatory language, cite applicable standards (ISO, IEC, FDA guidance), and produce publication-ready text. Format with markdown headings and bullet points where appropriate.`;
      const userPrompt = `Write the "${sectionId}" section for a ${docLabel} submission.${ctx.deviceName ? ` Device: ${ctx.deviceName}.` : ''}${ctx.manufacturer ? ` Manufacturer: ${ctx.manufacturer}.` : ''}${ctx.predicateDevice ? ` Predicate: ${ctx.predicateDevice}${ctx.predicateK ? ` (${ctx.predicateK})` : ''}.` : ''}${ctx.intendedUse ? ` Intended use: ${ctx.intendedUse}.` : ''}${ctx.deviceClass ? ` Class: ${ctx.deviceClass}.` : ''}${existingContent ? `\n\nExisting draft to enhance:\n${existingContent}` : ''}`;

      const { text: aiText, source, ragSources } = await generateWithRAG(
        userPrompt,
        ragQuery,
        systemPrompt,
        (req as any).resolvedOrganizationId
      );

      if (aiText) {
        return res.json({
          suggestion: aiText,
          source,
          ragSources,
          sectionId,
          docType,
        });
      }

      // Fallback: enhanced mock content, then base templates
      const enhancedFn = enhancedMockContent[docType]?.[sectionId];
      let suggestion: string;

      if (enhancedFn) {
        suggestion = enhancedFn(ctx);
      } else {
        const templates = sectionTemplates[docType] || {};
        suggestion =
          templates[sectionId] ||
          `No content available for section "${sectionId}" in ${docType}.`;

        if (ctx.deviceName) suggestion = suggestion.replace(/\[DEVICE NAME\]/g, ctx.deviceName);
        if (ctx.predicateDevice) {
          suggestion = suggestion.replace(/\[PREDICATE DEVICE\]/g, ctx.predicateDevice);
          suggestion = suggestion.replace(/\[PREDICATE K\]/g, ctx.predicateDevice);
          suggestion = suggestion.replace(/\[PREDICATE\]/g, ctx.predicateDevice);
        }
        if (ctx.intendedUse) {
          suggestion = suggestion.replace(/\[INTENDED USE\]/g, ctx.intendedUse);
          suggestion = suggestion.replace(/\[INTENDED PURPOSE\]/g, ctx.intendedUse);
        }
        // Remove any remaining bracket placeholders
        suggestion = suggestion.replace(/\[[A-Z][A-Z _/,()]{2,}\]/g, '___');
      }

      return res.json({
        suggestion,
        source: enhancedFn ? 'enhanced-template' : 'template',
        ragSources: [],
        sectionId,
        docType,
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Analyze-section error:', err);
      res.status(500).json({ error: 'Section analysis failed', message: err.message });
    }
  }
);

// ── POST /validate ────────────────────────────────────────────────────────────
// Server-side compliance validation engine for FDA 510(k), PMA, and EU MDR CER
const validateSchema = z.object({
  docType: z.enum(validDocTypes),
  sections: z.record(z.string(), z.string()), // { sectionId: content }
  deviceContext: z
    .object({
      deviceName: z.string().optional(),
      predicateDevice: z.string().optional(),
      intendedUse: z.string().optional(),
    })
    .optional(),
});

// Section targets (mirrors client cerv2-section-targets.js)
const sectionTargets: Record<string, Record<string, { min: number; target: number; requiredElements: string[] }>> = {
  cerv2_510k: {
    cover_letter: { min: 150, target: 300, requiredElements: ['device name', 'predicate', 'k-number', 'intended use'] },
    admin: { min: 100, target: 250, requiredElements: ['submitter', 'contact', 'establishment registration'] },
    ifu: { min: 200, target: 500, requiredElements: ['intended use', 'target population', 'contraindications'] },
    summary: { min: 500, target: 1500, requiredElements: ['device description', 'intended use', 'predicate comparison', 'substantial equivalence'] },
    desc: { min: 300, target: 800, requiredElements: ['components', 'materials', 'dimensions', 'operating principle'] },
    pred: { min: 300, target: 700, requiredElements: ['predicate device', 'k-number', 'manufacturer', 'comparison table'] },
    se: { min: 800, target: 2000, requiredElements: ['intended use comparison', 'technological characteristics', 'performance data', 'conclusion'] },
    testing: { min: 500, target: 1500, requiredElements: ['test standards', 'biocompatibility', 'performance results'] },
    labeling: { min: 200, target: 500, requiredElements: ['IFU', 'warnings', 'precautions'] },
    concl: { min: 150, target: 400, requiredElements: ['substantial equivalence determination', 'predicate reference'] },
  },
  cerv2_pma: {
    summary: { min: 500, target: 1500, requiredElements: ['device description', 'indications', 'classification', 'regulation'] },
    nonclin: { min: 800, target: 2500, requiredElements: ['bench testing', 'biocompatibility', 'electrical safety', 'EMC', 'software V&V'] },
    clin: { min: 1500, target: 5000, requiredElements: ['study design', 'enrollment', 'primary endpoint', 'safety data', 'effectiveness data'] },
    mfgqa: { min: 500, target: 1200, requiredElements: ['facility', 'ISO 13485', 'QSR compliance', 'supplier management'] },
    labeling: { min: 300, target: 800, requiredElements: ['physician manual', 'patient manual', 'warnings'] },
    risk: { min: 500, target: 1500, requiredElements: ['benefits', 'risks', 'benefit-risk determination'] },
    pms: { min: 300, target: 800, requiredElements: ['post-approval study', 'reporting timeline', 'endpoints'] },
  },
  cerv2_cer: {
    sota: { min: 800, target: 2500, requiredElements: ['current clinical knowledge', 'available alternatives', 'unmet need'] },
    device: { min: 400, target: 1000, requiredElements: ['device description', 'intended purpose', 'MDR classification'] },
    dataset: { min: 1000, target: 3000, requiredElements: ['search protocol', 'databases', 'inclusion/exclusion criteria', 'PRISMA'] },
    appraisal: { min: 500, target: 1500, requiredElements: ['appraisal criteria', 'scientific validity', 'relevance'] },
    benefitrisk: { min: 800, target: 2000, requiredElements: ['clinical benefits', 'residual risks', 'benefit-risk ratio'] },
    gspr: { min: 500, target: 1500, requiredElements: ['GSPR mapping', 'compliance status', 'evidence references'] },
    pms: { min: 500, target: 1200, requiredElements: ['PMS plan', 'PMCF plan', 'MDR Articles 83-86'] },
    concl: { min: 300, target: 700, requiredElements: ['overall conclusion', 'GSPR conformity', 'evaluator qualification'] },
  },
};

// Regulatory standard patterns per doc type
const requiredStandards: Record<string, Array<{ pattern: RegExp; label: string; sections: string[] }>> = {
  cerv2_510k: [
    { pattern: /IEC 60601/i, label: 'IEC 60601 (Electrical Safety)', sections: ['testing'] },
    { pattern: /ISO 10993/i, label: 'ISO 10993 (Biocompatibility)', sections: ['testing'] },
    { pattern: /21\s*CFR/i, label: '21 CFR Reference', sections: ['admin', 'summary', 'labeling'] },
  ],
  cerv2_pma: [
    { pattern: /21\s*CFR\s*Part\s*820/i, label: '21 CFR Part 820 (QSR)', sections: ['mfgqa'] },
    { pattern: /ISO 13485/i, label: 'ISO 13485 (QMS)', sections: ['mfgqa'] },
    { pattern: /IEC 60601/i, label: 'IEC 60601 (Electrical Safety)', sections: ['nonclin'] },
    { pattern: /ISO 10993/i, label: 'ISO 10993 (Biocompatibility)', sections: ['nonclin'] },
  ],
  cerv2_cer: [
    { pattern: /MDR\s*2017\/745/i, label: 'MDR 2017/745', sections: ['sota', 'benefitrisk', 'gspr', 'concl'] },
    { pattern: /MEDDEV\s*2\.7\/1/i, label: 'MEDDEV 2.7/1 rev. 4', sections: ['sota', 'dataset', 'appraisal'] },
    { pattern: /ISO 14971/i, label: 'ISO 14971 (Risk Management)', sections: ['benefitrisk'] },
    { pattern: /Annex\s*(I|XIV)/i, label: 'MDR Annex I/XIV', sections: ['gspr', 'concl'] },
  ],
};

const PLACEHOLDER_REGEX = /\[[A-Z][A-Z _/()-]{2,}\]/g;

function validateSectionServer(
  docType: string,
  sectionId: string,
  content: string,
  deviceContext: any = {}
) {
  const issues: string[] = [];
  const target = sectionTargets[docType]?.[sectionId] || { min: 100, target: 500, requiredElements: [] };
  const words = content ? content.trim().split(/\s+/).filter(Boolean).length : 0;

  if (!content || words === 0) {
    return { severity: 'error' as const, issues: ['Section is empty — add content before export.'], score: 0 };
  }

  if (words < target.min) {
    issues.push(`Section has ${words} words — minimum ${target.min} recommended.`);
  }

  const placeholders = content.match(PLACEHOLDER_REGEX);
  if (placeholders && placeholders.length > 0) {
    const unique = [...new Set(placeholders)];
    issues.push(`${unique.length} unresolved placeholder${unique.length > 1 ? 's' : ''}: ${unique.slice(0, 3).join(', ')}${unique.length > 3 ? ` (+${unique.length - 3} more)` : ''}`);
  }

  const lower = content.toLowerCase();
  const missingElements = target.requiredElements.filter((el: string) => !lower.includes(el.toLowerCase()));
  if (missingElements.length > 0) {
    issues.push(`Missing required elements: ${missingElements.slice(0, 3).join(', ')}${missingElements.length > 3 ? ` (+${missingElements.length - 3} more)` : ''}`);
  }

  const standards = requiredStandards[docType] || [];
  const applicable = standards.filter(s => s.sections.includes(sectionId));
  const missingStandards = applicable.filter(s => !s.pattern.test(content));
  if (missingStandards.length > 0) {
    issues.push(`Missing regulatory references: ${missingStandards.map(s => s.label).join(', ')}`);
  }

  if (deviceContext?.deviceName && content.includes('[DEVICE NAME]')) {
    issues.push(`Device name placeholder still present — should be "${deviceContext.deviceName}".`);
  }

  let score = 100;
  if (words < target.min) score -= 30;
  else if (words < target.target) score -= 10;
  if (placeholders?.length) score -= Math.min(40, placeholders.length * 10);
  if (missingElements.length) score -= Math.min(30, missingElements.length * 10);
  if (missingStandards.length) score -= Math.min(20, missingStandards.length * 10);
  score = Math.max(0, Math.min(100, score));

  const hasError = issues.some(i => i.includes('empty') || i.includes('placeholder') || i.includes('Missing required'));

  return {
    severity: hasError ? 'error' : issues.length > 0 ? 'warning' : 'pass',
    issues,
    score,
    wordCount: words,
    targetWordCount: target.target,
  };
}

router.post(
  '/validate',
  authMiddleware,
  requireEditorAccess,
  async (req: Request, res: Response) => {
    try {
      const validation = validateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid request', details: validation.error.flatten() });
      }

      const { docType, sections, deviceContext } = validation.data;
      const results: Record<string, any> = {};
      let totalScore = 0;
      let errorCount = 0;
      let warningCount = 0;
      const sectionIds = Object.keys(sections);

      for (const sectionId of sectionIds) {
        const result = validateSectionServer(docType, sectionId, sections[sectionId], deviceContext);
        results[sectionId] = result;
        totalScore += result.score;
        if (result.severity === 'error') errorCount++;
        if (result.severity === 'warning') warningCount++;
      }

      const overallScore = sectionIds.length > 0 ? Math.round(totalScore / sectionIds.length) : 0;
      const readyForExport = errorCount === 0 && overallScore >= 60;

      return res.json({
        sections: results,
        overallScore,
        errorCount,
        warningCount,
        sectionCount: sectionIds.length,
        readyForExport,
        docType,
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Validate error:', err);
      res.status(500).json({ error: 'Validation failed', message: err.message });
    }
  }
);

// ── GET /health ────────────────────────────────────────────────────────────────
// Health check for CERV2 AI service availability
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'cerv2-ai',
    phase: '7.3',
    endpoints: [
      'POST /suggest',
      'POST /equivalence',
      'POST /benefit-risk',
      'POST /analyze-section',
      'POST /validate',
      'GET  /templates/:docType',
      'GET  /health',
    ],
    supportedDocTypes: [...validDocTypes],
    timestamp: new Date().toISOString(),
  });
});

export default router;
