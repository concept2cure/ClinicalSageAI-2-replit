/**
 * CERV2 AI Auto-Populate Routes  (Phase 7.3 → Wave 3: Real OpenAI)
 *
 * POST /api/cerv2/ai/suggest            – Generate section-level AI suggestions (OpenAI-backed)
 * POST /api/cerv2/ai/equivalence        – SE / equivalence text (OpenAI-backed)
 * POST /api/cerv2/ai/benefit-risk       – Benefit-risk analysis (OpenAI-backed)
 * POST /api/cerv2/ai/analyze-section    – Deep section analysis (OpenAI-backed)
 * GET  /api/cerv2/ai/templates/:docType – Pre-built section templates per doc type
 * GET  /api/cerv2/ai/health             – Health check for AI service
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import OpenAI from 'openai';
import { authMiddleware } from '../auth';

const router = Router();

// ── OpenAI client (null when key not configured) ───────────────────────────────
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ── Auth guard ─────────────────────────────────────────────────────────────────
const allowedRoles = new Set(['admin', 'owner', 'editor', 'super_admin']);
const requireEditorAccess = (req: any, res: any, next: () => void) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !allowedRoles.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
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

// ── POST /suggest ──────────────────────────────────────────────────────────────
// Returns a GPT-backed suggestion for a specific section/field.
// Falls back to template text when OpenAI key is not configured.
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

      // ── Try OpenAI first ──────────────────────────────────────────────
      if (openai) {
        try {
          const docLabel =
            docType === 'cerv2_510k'
              ? 'FDA 510(k) premarket notification'
              : docType === 'cerv2_pma'
                ? 'FDA PMA application'
                : 'EU MDR Clinical Evaluation Report (CER)';

          const deviceInfo = [
            context?.deviceName && `Device: ${context.deviceName}`,
            context?.predicateDevice && `Predicate: ${context.predicateDevice}`,
            context?.indication && `Intended use: ${context.indication}`,
            context?.existingContent && `Existing draft:\n${context.existingContent}`,
          ]
            .filter(Boolean)
            .join('\n');

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert FDA regulatory writer specializing in medical device submissions. Write professional, compliant content for a ${docLabel}. Use specific regulatory language per 21 CFR and FDA guidance. Be precise and factual. Do not use bracket placeholders like [DEVICE NAME] — use the provided device context. If context is missing, write generic but plausible professional content.`,
              },
              {
                role: 'user',
                content: `Write the "${fieldId}" content for the "${sectionId}" section of a ${docLabel}.\n\n${deviceInfo || 'No device context provided — write generic professional content.'}`,
              },
            ],
            max_tokens: 1500,
            temperature: 0.3,
          });

          const suggestion = completion.choices[0]?.message?.content || '';
          return res.json({
            suggestion,
            source: 'openai',
            model: 'gpt-4o-mini',
            docType,
            sectionId,
            fieldId,
          });
        } catch (aiErr: any) {
          console.error(
            '[CERV2 AI] OpenAI suggest error, falling back to template:',
            aiErr.message
          );
          // Fall through to template
        }
      }

      // ── Fallback: template text ───────────────────────────────────────
      const templates = sectionTemplates[docType] || {};
      let suggestion = templates[fieldId] || templates[sectionId] || '';

      if (context?.deviceName) {
        suggestion = suggestion.replace(/\[DEVICE NAME\]/g, context.deviceName);
      }
      if (context?.predicateDevice) {
        suggestion = suggestion.replace(/\[PREDICATE DEVICE\]/g, context.predicateDevice);
        suggestion = suggestion.replace(/\[PREDICATE K\]/g, context.predicateDevice);
        suggestion = suggestion.replace(/\[PREDICATE K-NUMBER\]/g, context.predicateDevice);
      }
      if (context?.indication) {
        suggestion = suggestion.replace(/\[INTENDED USE\]/g, context.indication);
        suggestion = suggestion.replace(/\[INDICATION\]/g, context.indication);
        suggestion = suggestion.replace(/\[INTENDED PURPOSE\]/g, context.indication);
      }

      return res.json({
        suggestion,
        source: 'template',
        note: 'OpenAI unavailable — using template fallback.',
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
// Generate substantial equivalence text for 510(k) — OpenAI-backed with template fallback
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

      // ── Try OpenAI first ──────────────────────────────────────────────
      if (openai) {
        try {
          const contextParts = [
            `Subject device: ${deviceName}`,
            `Predicate device: ${predicateDevice}${predicateK ? ` (${predicateK})` : ''}`,
            similarities.length > 0 && `Known similarities: ${similarities.join('; ')}`,
            differences.length > 0 && `Known differences: ${differences.join('; ')}`,
          ]
            .filter(Boolean)
            .join('\n');

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert FDA regulatory writer specializing in 510(k) substantial equivalence (SE) discussions. Write a complete, professional SE section comparing the subject device to the predicate device. Cover: intended use comparison, technological characteristics comparison, performance data summary, and conclusion. Use specific 21 CFR 807.87 language. Write in formal regulatory prose — no bullet points, no bracket placeholders.`,
              },
              {
                role: 'user',
                content: `Write a comprehensive Substantial Equivalence discussion for:\n\n${contextParts}`,
              },
            ],
            max_tokens: 2000,
            temperature: 0.3,
          });

          const text = completion.choices[0]?.message?.content || '';
          return res.json({ text, source: 'openai', model: 'gpt-4o-mini' });
        } catch (aiErr: any) {
          console.error(
            '[CERV2 AI] OpenAI equivalence error, falling back to template:',
            aiErr.message
          );
        }
      }

      // ── Fallback: template text ───────────────────────────────────────

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

      return res.json({
        text,
        source: 'template',
        note: 'OpenAI unavailable — using template fallback.',
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Equivalence error:', err);
      res.status(500).json({ error: 'Equivalence generation failed', message: err.message });
    }
  }
);

// ── POST /benefit-risk ─────────────────────────────────────────────────────────
// Generate benefit-risk determination text — OpenAI-backed with template fallback
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

      // ── Try OpenAI first ──────────────────────────────────────────────
      if (openai) {
        try {
          const contextParts = [
            `Device: ${deviceName}`,
            `Framework: ${framework}`,
            benefits.length > 0 && `Known benefits: ${benefits.join('; ')}`,
            risks.length > 0 && `Known risks: ${risks.join('; ')}`,
          ]
            .filter(Boolean)
            .join('\n');

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert regulatory writer. Write a professional benefit-risk determination for a medical device submission under ${framework}. Include: identified benefits with clinical significance, identified risks with mitigation measures, and a formal determination statement. Write in formal regulatory prose. Do not use bracket placeholders.`,
              },
              {
                role: 'user',
                content: `Write a benefit-risk determination for:\n\n${contextParts}`,
              },
            ],
            max_tokens: 1500,
            temperature: 0.3,
          });

          const text = completion.choices[0]?.message?.content || '';
          return res.json({ text, source: 'openai', model: 'gpt-4o-mini' });
        } catch (aiErr: any) {
          console.error(
            '[CERV2 AI] OpenAI benefit-risk error, falling back to template:',
            aiErr.message
          );
        }
      }

      // ── Fallback: template text ───────────────────────────────────────

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

      return res.json({
        text,
        source: 'template',
        note: 'OpenAI unavailable — using template fallback.',
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
        note: 'Template text with [PLACEHOLDER] tokens. Replace before use.',
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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { docType, sectionId, content: _content, deviceContext } = validation.data;
      const ctx = deviceContext || {};

      // ── Try OpenAI first ──────────────────────────────────────────────
      if (openai) {
        try {
          const docLabel =
            docType === 'cerv2_510k' ? '510(k)' : docType === 'cerv2_pma' ? 'PMA' : 'CER (EU MDR)';

          const contextParts = [
            `Document type: ${docLabel}`,
            `Section: ${sectionId}`,
            ctx.deviceName && `Device: ${ctx.deviceName}`,
            ctx.manufacturer && `Manufacturer: ${ctx.manufacturer}`,
            ctx.predicateDevice && `Predicate device: ${ctx.predicateDevice}`,
            ctx.predicateK && `Predicate 510(k) number: ${ctx.predicateK}`,
            ctx.intendedUse && `Intended use: ${ctx.intendedUse}`,
            ctx.deviceClass && `Device class: ${ctx.deviceClass}`,
          ]
            .filter(Boolean)
            .join('\n');

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are an expert regulatory writer specializing in ${docLabel} submissions. Write professional, submission-ready content for the requested section. Use formal regulatory prose with proper structure (headings, tables where appropriate). Do not use bracket placeholders — write complete text using the provided device context. If information is missing, write reasonable professional prose that the author can refine.`,
              },
              {
                role: 'user',
                content: `Write the "${sectionId}" section for this ${docLabel} submission:\n\n${contextParts}`,
              },
            ],
            max_tokens: 2000,
            temperature: 0.3,
          });

          const suggestion = completion.choices[0]?.message?.content || '';
          return res.json({
            suggestion,
            source: 'openai',
            model: 'gpt-4o-mini',
            sectionId,
            docType,
          });
        } catch (aiErr: any) {
          console.error(
            '[CERV2 AI] OpenAI analyze-section error, falling back to template:',
            aiErr.message
          );
        }
      }

      // ── Fallback: enhanced mock / template ────────────────────────────
      const enhancedFn = enhancedMockContent[docType]?.[sectionId];
      let suggestion: string;

      if (enhancedFn) {
        suggestion =
          '⚠️ AI service unavailable — the following is a generic template. Review and replace all content with your actual device data before use.\n\n' +
          enhancedFn(ctx);
      } else {
        const templates = sectionTemplates[docType] || {};
        suggestion =
          templates[sectionId] ||
          `No enhanced content available for section "${sectionId}" in ${docType}.`;

        if (ctx.deviceName) suggestion = suggestion.replace(/\[DEVICE NAME\]/g, ctx.deviceName);
        if (ctx.predicateDevice) {
          suggestion = suggestion.replace(/\[PREDICATE DEVICE\]/g, ctx.predicateDevice);
          suggestion = suggestion.replace(/\[PREDICATE K\]/g, ctx.predicateDevice);
        }
        if (ctx.intendedUse) {
          suggestion = suggestion.replace(/\[INTENDED USE\]/g, ctx.intendedUse);
          suggestion = suggestion.replace(/\[INTENDED PURPOSE\]/g, ctx.intendedUse);
        }
      }

      return res.json({
        suggestion,
        source: enhancedFn ? 'enhanced-mock' : 'template',
        sectionId,
        docType,
        note: 'OpenAI unavailable — using template fallback.',
      });
    } catch (err: any) {
      console.error('[CERV2 AI] Analyze-section error:', err);
      res.status(500).json({ error: 'Section analysis failed', message: err.message });
    }
  }
);

// ── GET /health ────────────────────────────────────────────────────────────────
// Health check for CERV2 AI service availability
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'cerv2-ai',
    phase: 'wave-3',
    aiSource: openai ? 'openai' : 'template-fallback',
    endpoints: [
      'POST /suggest',
      'POST /equivalence',
      'POST /benefit-risk',
      'POST /analyze-section',
      'GET  /templates/:docType',
      'GET  /health',
    ],
    supportedDocTypes: [...validDocTypes],
    timestamp: new Date().toISOString(),
  });
});

export default router;
