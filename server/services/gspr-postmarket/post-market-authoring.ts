/**
 * Post-Market Document Authoring
 *
 * Authors DRAFT post-market documents (EU MDR/IVDR) and persists them through
 * the EXISTING post-market service (createDocument → validateDocument →
 * approve/lock lifecycle). This is the authoring counterpart to the existing
 * per-type completeness validators in post-market.service.ts — one content
 * builder per document type, each emitting exactly the keys that type's
 * validator requires.
 *
 * Honesty (same contract as the PMCF plan generator):
 *  - Every generated document is `draft`, explicitly marked DRAFT, and names
 *    what the sponsor must supply — especially FACTUAL fields (sales volumes,
 *    user-population size, data analysed) which are placeholders the sponsor
 *    MUST replace with real figures, never fabricated numbers.
 *  - The generator never approves, locks, sets a signature, or asserts
 *    sufficiency. The human validate → approve → e-signature gate still applies.
 */

import { db } from '../../db';
import { cerReports } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  createDocument,
  listProgramDocuments,
  validateDocument,
  type PostMarketValidationResult,
} from './post-market.service';
import type {
  PostMarketDocument,
  PostMarketDocumentType,
} from '../../../shared/schema/gspr-postmarket';
import { buildPmcfPlanContent } from './pmcf-plan-generator';
import { DRAFT_SENTINEL as DRAFT } from './scaffold-sentinel';

export interface DeviceAuthoringContext {
  deviceName: string;
  deviceClass?: string | null;
  regulation?: 'MDR' | 'IVDR';
  cerReference?: string | null;
}

type ContentRecord = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Per-type content builders — each returns exactly the keys its validator checks
// ─────────────────────────────────────────────────────────────────────────────

export function buildPmsPlanContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  const reg = ctx.regulation ?? 'MDR';
  const annex = reg === 'IVDR' ? 'IVDR Article 78 / Annex III' : 'MDR Article 84 / Annex III §1.1';
  return {
    proactiveCollectionMethods:
      `Proactive post-market data collection for ${d} per ${annex}: structured user feedback, ` +
      'literature/standards surveillance, registry and real-world data review. ' +
      `${DRAFT} specify sources, cadence and responsible roles.`,
    complaintHandlingProcess:
      `Complaint intake, triage, investigation and vigilance-reporting workflow for ${d}, including ` +
      'serious-incident and FSCA decision criteria. ' +
      `${DRAFT} reference the SOP, timelines and competent-authority reporting thresholds.`,
    trendReportingProcess:
      'Statistically based trend detection on non-serious incidents and expected side-effects, with ' +
      'pre-defined thresholds triggering investigation (MDR Article 88). ' +
      `${DRAFT} define the metrics, thresholds and review frequency.`,
    performanceMonitoring:
      `Ongoing monitoring of ${d} safety and performance against the clinical evaluation claims and ` +
      'state of the art. ' +
      `${DRAFT} list the performance indicators and acceptance limits.`,
    communicationPlan:
      'Plan for communicating PMS outcomes to competent authorities, notified body, economic operators ' +
      'and users (FSN, label/IFU updates). ' +
      `${DRAFT} define channels, owners and timelines.`,
  };
}

export function buildPmsReportContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  return {
    summaryOfFindings:
      `Summary of PMS data collected for ${d} during the reporting period (complaints, incidents, ` +
      'trend analysis, literature). ' +
      `${DRAFT} insert the actual figures and findings for the period; do not leave illustrative text.`,
    correctivePreventiveActions:
      'Corrective and preventive actions taken or planned as a result of the PMS findings (CAPA, FSCA, ' +
      'label/IFU or design changes). ' +
      `${DRAFT} record the real CAPA references and status.`,
    concludingAssessment:
      `Concluding assessment of whether the benefit-risk determination for ${d} remains acceptable and ` +
      'whether the CER/PMS plan needs updating. ' +
      `${DRAFT} state the evidence-based conclusion.`,
  };
}

export function buildPmcfEvaluationContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  const cer = ctx.cerReference?.trim() ? ` (CER ${ctx.cerReference.trim()})` : '';
  return {
    dataAnalyzed:
      `PMCF data analysed for ${d} during the reporting period (study/registry/survey results, ` +
      'literature, real-world data). ' +
      `${DRAFT} insert the actual datasets, sample sizes and results — not placeholders.`,
    conclusionsOnBenefitRisk:
      `Conclusions on the benefit-risk profile of ${d} in light of the PMCF data, against the residual ` +
      `risks and claims in the clinical evaluation${cer}. ` +
      `${DRAFT} state quantified conclusions and any new risks identified.`,
    updatesToCer:
      'Required updates to the Clinical Evaluation Report, PMS plan, risk management file and IFU arising ' +
      'from this PMCF evaluation. ' +
      `${DRAFT} list the specific documents and changes, or state "none required" with justification.`,
  };
}

export function buildPsurContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  return {
    summaryOfBenefitRisk:
      `Summary of the benefit-risk determination for ${d} over the reporting period and main conclusions ` +
      'of PMS data (MDR Article 86 / IVDR Article 81). ' +
      `${DRAFT} state the evidence-based conclusion.`,
    mainPmcfFindings:
      `Main findings of the PMCF (or PMPF for IVD) for ${d}, including any updates to the clinical/` +
      'performance evaluation. ' +
      `${DRAFT} summarise the actual PMCF/PMPF results for the period.`,
    volumeOfSales:
      `${DRAFT} FACTUAL FIELD — insert the actual volume of sales / number of ${d} units placed on the ` +
      'market during the reporting period. This must be the real figure; it is not generated.',
    sizeAndCharacteristicsOfUsersPopulation:
      `${DRAFT} FACTUAL FIELD — insert the actual estimated size and characteristics of the population ` +
      `using ${d}, and where available the usage frequency. This must be the real figure; it is not generated.`,
  };
}

export function buildSscpContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  const cls = ctx.deviceClass?.trim() || 'unspecified class';
  const cer = ctx.cerReference?.trim() ? ` (CER ${ctx.cerReference.trim()})` : '';
  return {
    deviceIdentification:
      `Device identification for ${d} (${cls}): manufacturer, Basic UDI-DI, device name and model. ` +
      `${DRAFT} insert the Basic UDI-DI, SRN and exact catalogue identifiers.`,
    intendedPurpose:
      `Intended purpose of ${d}: indications, intended patient population, intended users and use ` +
      'environment, and contraindications. ' +
      `${DRAFT} align verbatim with the IFU and CER.`,
    deviceDescription:
      `Description of ${d}, including how it achieves its intended purpose and any accessories or ` +
      'combination products. ' +
      `${DRAFT} ensure it is intelligible to the intended lay/professional audience (MDCG 2019-9).`,
    risksAndUndesirableEffects:
      `Residual risks, warnings, precautions and undesirable side-effects for ${d} from the risk ` +
      'management file. ' +
      `${DRAFT} list the actual residual risks and their frequencies.`,
    summaryOfClinicalEvaluation:
      `Summary of the clinical evaluation of ${d} and the clinical evidence supporting safety and ` +
      `performance${cer}. ` +
      `${DRAFT} summarise the CER conclusions for the intended audience.`,
    pmcfSummary:
      `Summary of the PMCF plan and, where available, PMCF findings for ${d}. ` +
      `${DRAFT} reference the current PMCF plan/evaluation.`,
    suggestedProfileForUsers:
      `Suggested profile and training for intended users of ${d}. ` +
      `${DRAFT} state any required qualifications or training.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry: type → builder, code, and whether it needs a reporting period
// ─────────────────────────────────────────────────────────────────────────────

interface TypeSpec {
  code: string;
  needsReportingPeriod: boolean;
  build: (ctx: DeviceAuthoringContext) => ContentRecord;
  titleNoun: string;
}

const TYPE_SPECS: Record<PostMarketDocumentType, TypeSpec> = {
  pms_plan: { code: 'PMS-PLAN', needsReportingPeriod: false, build: buildPmsPlanContent, titleNoun: 'PMS Plan' },
  pms_report: { code: 'PMS-REPORT', needsReportingPeriod: true, build: buildPmsReportContent, titleNoun: 'PMS Report' },
  pmcf_plan: {
    code: 'PMCF-PLAN',
    needsReportingPeriod: false,
    build: ctx => buildPmcfPlanContent(ctx) as unknown as ContentRecord,
    titleNoun: 'PMCF Plan',
  },
  pmcf_evaluation: {
    code: 'PMCF-EVAL',
    needsReportingPeriod: true,
    build: buildPmcfEvaluationContent,
    titleNoun: 'PMCF Evaluation',
  },
  psur: { code: 'PSUR', needsReportingPeriod: true, build: buildPsurContent, titleNoun: 'PSUR' },
  sscp: { code: 'SSCP', needsReportingPeriod: false, build: buildSscpContent, titleNoun: 'SSCP' },
};

export const AUTHORABLE_DOCUMENT_TYPES = Object.keys(TYPE_SPECS) as PostMarketDocumentType[];

export interface AuthorPostMarketArgs {
  organizationId: number;
  programId: string;
  createdBy: string;
  documentType: PostMarketDocumentType;
  deviceName?: string;
  deviceClass?: string | null;
  regulation?: 'MDR' | 'IVDR';
  relatedCerReportId?: number;
  title?: string;
  reportingPeriodStart?: Date;
  reportingPeriodEnd?: Date;
}

export interface AuthorPostMarketResult {
  document: PostMarketDocument;
  validation: PostMarketValidationResult;
}

/**
 * Author and persist a DRAFT post-market document of the given type. Reporting
 * periods are required for report-style documents; when omitted, a DRAFT
 * default trailing-12-month period is set and flagged so the gate still forces
 * the sponsor to confirm it. Versions are computed per (org, program, code).
 */
export async function authorPostMarketDocument(
  args: AuthorPostMarketArgs
): Promise<AuthorPostMarketResult> {
  const spec = TYPE_SPECS[args.documentType];
  if (!spec) {
    throw Object.assign(new Error(`Unsupported documentType: ${args.documentType}`), {
      code: 'PM_BAD_TYPE',
    });
  }

  let deviceName = args.deviceName?.trim() || '';
  let deviceClass = args.deviceClass ?? null;
  let cerReference: string | null = null;

  if (args.relatedCerReportId != null) {
    const [cer] = await db
      .select()
      .from(cerReports)
      .where(
        and(
          eq(cerReports.id, args.relatedCerReportId),
          eq(cerReports.organizationId, args.organizationId)
        )
      )
      .limit(1);
    if (cer) {
      deviceName = deviceName || (cer.deviceName ?? '').trim();
      deviceClass = deviceClass ?? cer.deviceClass ?? null;
      cerReference = cer.reportId ?? cer.cerNumber ?? null;
    }
  }

  if (!deviceName) {
    throw Object.assign(new Error('deviceName is required (or a resolvable relatedCerReportId)'), {
      code: 'PM_NO_DEVICE',
    });
  }

  const regulation =
    args.regulation ?? (deviceClass && /ivd/i.test(deviceClass) ? 'IVDR' : 'MDR');
  const content = spec.build({ deviceName, deviceClass, regulation, cerReference });

  // Reporting period for report-style documents.
  let reportingPeriodStart: Date | null = args.reportingPeriodStart ?? null;
  let reportingPeriodEnd: Date | null = args.reportingPeriodEnd ?? null;
  let periodNote = '';
  if (spec.needsReportingPeriod && (!reportingPeriodStart || !reportingPeriodEnd)) {
    reportingPeriodEnd = reportingPeriodEnd ?? new Date();
    reportingPeriodStart =
      reportingPeriodStart ??
      new Date(reportingPeriodEnd.getTime() - 365 * 24 * 60 * 60 * 1000);
    periodNote = ' Reporting period defaulted to a trailing 12 months — confirm the actual period.';
  }

  const existing = await listProgramDocuments(args.organizationId, args.programId, args.documentType);
  const nextVersion =
    existing
      .filter(doc => doc.code === spec.code)
      .reduce((max, doc) => Math.max(max, doc.version ?? 1), 0) + 1;

  const document = await createDocument({
    organizationId: args.organizationId,
    programId: args.programId,
    documentType: args.documentType,
    code: spec.code,
    version: nextVersion,
    title: args.title?.trim() || `${spec.titleNoun} — ${deviceName} (draft)`,
    deviceSubjectName: deviceName,
    reportingPeriodStart,
    reportingPeriodEnd,
    content,
    summary:
      `DRAFT ${spec.titleNoun} generated for ${deviceName}. Requires sponsor specialisation before ` +
      `approval; generated content is a scaffold, not a sufficiency determination.${periodNote}`,
    status: 'draft',
    relatedCerReportId: args.relatedCerReportId ?? null,
    metadata: {
      generated: true,
      requiresSpecialization: true,
      generator: 'post-market-authoring',
      documentType: args.documentType,
    },
    createdBy: args.createdBy,
    updatedBy: args.createdBy,
  });

  return { document, validation: validateDocument(document) };
}
