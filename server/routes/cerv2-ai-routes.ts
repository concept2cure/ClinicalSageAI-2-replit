/**
 * CERV2 AI Auto-Populate Stub Routes
 *
 * POST /api/cerv2/ai/suggest            – Generate section-level AI suggestions
 * POST /api/cerv2/ai/equivalence        – SE / equivalence placeholder text
 * POST /api/cerv2/ai/benefit-risk       – Benefit-risk analysis stub
 * GET  /api/cerv2/ai/templates/:docType – Pre-built section templates per doc type
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';

const router = Router();

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
    ifu:
      '[DEVICE NAME] is intended for [INTENDED USE] in [TARGET POPULATION]. The device is indicated for use in [USE ENVIRONMENT].',
    summary:
      '[DEVICE NAME] is a [CLASS/PRODUCT CODE] device intended for [INTENDED USE]. Regulation Number: 21 CFR [REGULATION]. Classification: [CLASS] with [SPECIAL CONTROLS, if applicable].',
    desc:
      '[DEVICE NAME] consists of the following primary components: [LIST COMPONENTS]. The device measures [DIMENSIONS] and weighs [WEIGHT]. Key technical specifications include: [SPECS].',
    device_description:
      '[DEVICE NAME] consists of the following primary components: [LIST COMPONENTS]. The device measures [DIMENSIONS] and weighs [WEIGHT]. Key technical specifications include: [SPECS].',
    pred:
      'The primary predicate device is [PREDICATE DEVICE] ([K-NUMBER]), manufactured by [MANUFACTURER]. The reference predicate is [REFERENCE DEVICE] ([K-NUMBER]).',
    predicate_comparison:
      'The primary predicate device is [PREDICATE DEVICE] ([K-NUMBER]), manufactured by [MANUFACTURER]. The reference predicate is [REFERENCE DEVICE] ([K-NUMBER]).',
    se:
      '[DEVICE NAME] is substantially equivalent to [PREDICATE DEVICE] ([PREDICATE K]) with respect to intended use, technological characteristics, and performance specifications. The subject device shares the same intended use as the predicate: [INTENDED USE]. Differences include: [LIST DIFFERENCES]. These differences do not raise new questions of safety or effectiveness.',
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
    clin:
      'The [STUDY NAME] pivotal trial was a prospective, randomized, [BLINDING]-blind, [CONTROL TYPE]-controlled, multi-center study enrolling [N] subjects at [SITES] sites. Primary endpoint: [ENDPOINT]. Results: Active group achieved [RESULT] vs. [CONTROL RESULT] in the control group (p [P-VALUE]).',
    study_design:
      'The [STUDY NAME] pivotal trial was a prospective, randomized, [BLINDING]-blind, [CONTROL TYPE]-controlled, multi-center study enrolling [N] subjects at [SITES] sites.',
    clinical_results:
      'Primary endpoint: [ENDPOINT]. Results: Active group achieved [RESULT] vs. [CONTROL RESULT] in the control group (p [P-VALUE]). Responder rate: [RATE]% active vs. [CONTROL RATE]% control.',
    mfgqa:
      '[DEVICE NAME] is manufactured at [COMPANY NAME]\'s ISO 13485:2016 certified facility. The facility is compliant with 21 CFR Part 820 Quality System Regulation. All critical suppliers are qualified under a documented supplier management program.',
    labeling:
      'Proposed labeling includes: Physician\'s Manual, Patient\'s Manual, and Surgical Technique Guide. Labeling includes required Class III warnings, precautions, and a detailed summary of clinical trial results.',
    risk:
      'The benefits of [DEVICE NAME] significantly outweigh the risks for the intended patient population. The pivotal trial demonstrated clinically meaningful and statistically significant improvement in [OUTCOME] with an acceptable safety profile.',
    risk_analysis:
      'The benefits of [DEVICE NAME] significantly outweigh the risks for the intended patient population. The pivotal trial demonstrated clinically meaningful and statistically significant improvement in [OUTCOME] with an acceptable safety profile.',
    pms:
      'A post-approval study (PAS) is proposed to monitor long-term safety and effectiveness over [YEARS] years in [N] patients across [SITES] sites. Annual interim reports will be submitted.',
    pms_plan:
      'A post-approval study (PAS) is proposed to monitor long-term safety and effectiveness over [YEARS] years in [N] patients across [SITES] sites. Annual interim reports will be submitted.',
  },
  cerv2_cer: {
    // docTypes.js IDs: sota, device, dataset, appraisal, benefitrisk, gspr, pms, concl
    sota:
      'This Clinical Evaluation Report (CER) is prepared in accordance with EU MDR 2017/745 Article 61 and Annex XIV, following MEDDEV 2.7/1 rev. 4 methodology for [DEVICE NAME]. Current state of the art for [DEVICE CATEGORY] involves [STATE OF ART DESCRIPTION].',
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
    gspr:
      'General Safety and Performance Requirements (GSPRs) per MDR Annex I have been systematically mapped to supporting evidence. All [N] applicable GSPRs are addressed.',
    gspr_overview:
      'General Safety and Performance Requirements (GSPRs) per MDR Annex I have been systematically mapped to supporting evidence. All [N] applicable GSPRs are addressed.',
    pms:
      'A Post-Market Surveillance (PMS) plan and Post-Market Clinical Follow-up (PMCF) plan have been established in accordance with MDR Articles 83–86 and Annex XIV Part B.',
    pms_plan:
      'A Post-Market Surveillance (PMS) plan and Post-Market Clinical Follow-up (PMCF) plan have been established in accordance with MDR Articles 83–86 and Annex XIV Part B.',
    concl:
      'Based on the clinical evaluation performed in accordance with MEDDEV 2.7/1 rev. 4, [DEVICE NAME] meets the relevant General Safety and Performance Requirements of MDR 2017/745. The benefit-risk profile is favorable.',
    overall_conclusion:
      'Based on the clinical evaluation performed in accordance with MEDDEV 2.7/1 rev. 4, [DEVICE NAME] meets the relevant General Safety and Performance Requirements of MDR 2017/745. The benefit-risk profile is favorable.',
  },
};

// ── POST /suggest ──────────────────────────────────────────────────────────────
// Returns a GPT-style suggestion for a specific section/field.
// Currently returns template text; will be wired to OpenAI in a future phase.
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
      const templates = sectionTemplates[docType] || {};

      // Look for a template matching fieldId or sectionId
      let suggestion = templates[fieldId] || templates[sectionId] || '';

      // Replace placeholders with context if provided
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
        note: 'Template-based suggestion. Full GPT integration available in Phase 8.',
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

      return res.json({
        text,
        source: 'template',
        note: 'Template-based SE text. Full GPT integration available in Phase 8.',
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

      return res.json({
        text,
        source: 'template',
        note: 'Template-based benefit-risk text. Full GPT integration available in Phase 8.',
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

export default router;
