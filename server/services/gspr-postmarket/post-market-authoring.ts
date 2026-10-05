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
  /** PSUR only: sales and serious-incident figures the sponsor supplied. */
  psurExposure?: PsurExposureFigures;
}

/**
 * Figures for a PSUR's reporting period that only the sponsor can supply. The
 * generator never invents them: without them the PSUR keeps its FACTUAL FIELD
 * placeholder and states no rate.
 */
export interface PsurExposureFigures {
  /** Units placed on the market in the reporting period (the volume of sales). */
  unitsPlacedOnMarket: number;
  /** Serious incidents reported in the reporting period. */
  seriousIncidentCount: number;
}

function badInput(message: string): Error {
  return Object.assign(new Error(message), { code: 'PM_BAD_INPUT' });
}

/**
 * Serious incidents per unit placed on the market in the reporting period.
 * Deterministic; the one figure the retired report-authoring.ts buildPsur
 * computed, moved here so the PSUR has a single builder. Not rounded: buildPsur
 * rounded to 1e-6, which reported one incident in ten million units as zero.
 * Returns null, never 0, when no units were placed on the market, because the
 * rate is then undefined. The numerator can exceed the denominator: incidents in
 * the period may involve units placed on the market earlier.
 */
export function computePsurIncidentRate(f: PsurExposureFigures): number | null {
  for (const [name, v] of [
    ['unitsPlacedOnMarket', f.unitsPlacedOnMarket],
    ['seriousIncidentCount', f.seriousIncidentCount],
  ] as const) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw badInput(`${name} must be a non-negative integer (got ${String(v)}).`);
    }
  }
  if (f.unitsPlacedOnMarket === 0) return null;
  return f.seriousIncidentCount / f.unitsPlacedOnMarket;
}

type ContentRecord = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Per-type content builders — each returns exactly the keys its validator checks
// ─────────────────────────────────────────────────────────────────────────────

export function buildPmsPlanContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  const reg = ctx.regulation ?? 'MDR';
  const annex = reg === 'IVDR' ? 'IVDR Article 79 / Annex III' : 'MDR Article 84 / Annex III §1.1';
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
  const exposure = ctx.psurExposure;
  const rate = exposure ? computePsurIncidentRate(exposure) : null;
  const incidents = exposure
    ? `${exposure.seriousIncidentCount} serious ${exposure.seriousIncidentCount === 1 ? 'incident' : 'incidents'}`
    : '';
  const figures: ContentRecord = exposure
    ? {
        volumeOfSales:
          `${exposure.unitsPlacedOnMarket} units of ${d} placed on the market during the reporting ` +
          'period, as supplied by the sponsor.',
        seriousIncidentRate:
          rate === null
            ? `${incidents} in the reporting period; no rate, ` +
              'because no units were placed on the market in the period.'
            : `${incidents} over ${exposure.unitsPlacedOnMarket} units ` +
              `placed on the market in the reporting period: ${Number((rate * 1000).toPrecision(6))} per ` +
              '1,000 units (computed).',
      }
    : {};
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
    ...figures,
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

/**
 * IVDR Summary of Safety and Performance (Article 29; Class C and D). Keys match
 * validateSsp. The field list is recall of Art 29(2) (a)–(h); MDCG 2022-9 (the
 * SSP template) has not been re-read.
 */
export function buildSspContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  const cls = ctx.deviceClass?.trim() || 'unspecified class';
  return {
    deviceIdentification:
      `Device identification for ${d} (IVDR ${cls}): trade name, Basic UDI-DI, manufacturer name and SRN. ` +
      `${DRAFT} insert the Basic UDI-DI, SRN and exact catalogue identifiers.`,
    intendedPurpose:
      `Intended purpose of ${d}: what is detected or measured, its function (screening, diagnosis, ` +
      'monitoring, companion diagnostic), indications, contra-indications and target populations. ' +
      `${DRAFT} align verbatim with the IFU and performance evaluation report.`,
    deviceDescription:
      `Description of ${d}, including previous generations or variants and the differences, and any ` +
      'accessories, other devices or products intended to be used with it. ' +
      `${DRAFT} describe the actual device configuration.`,
    standardsApplied:
      `Harmonised standards and common specifications applied to ${d}. ` +
      `${DRAFT} list each standard or CS with its version.`,
    summaryOfPerformanceEvaluation:
      `Summary of the performance evaluation of ${d} (scientific validity, analytical and clinical ` +
      'performance) and relevant information on the post-market performance follow-up. ' +
      `${DRAFT} summarise the PER conclusions and PMPF status for the intended audience.`,
    metrologicalTraceability:
      `Metrological traceability of the values assigned to calibrators and control materials of ${d}. ` +
      `${DRAFT} state the reference materials or procedures of higher order, or state that none apply.`,
    suggestedProfileForUsers:
      `Suggested profile and training for users of ${d}. ` +
      `${DRAFT} state any required qualifications or training.`,
    risksAndUndesirableEffects:
      `Residual risks, undesirable effects, warnings and precautions for ${d} from the risk management file. ` +
      `${DRAFT} list the actual residual risks, including the consequences of false results.`,
  };
}

/**
 * IVDR PMPF plan (Annex XIII Part B). Keys match validatePmpfPlan. The IVDR
 * follow-up instrument is PMPF, not the MDR's PMCF.
 */
export function buildPmpfPlanContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  return {
    generalMethods:
      `General PMPF methods for ${d}: gathering of performance experience, user feedback, screening of ` +
      'scientific literature and other sources of performance or scientific data. ' +
      `${DRAFT} name the sources, cadence and responsible roles.`,
    specificMethods:
      `Specific PMPF methods for ${d}, such as ring trials and other quality-assurance activities, ` +
      'epidemiological studies, evaluation of suitable registries or post-market performance studies. ' +
      `${DRAFT} state which apply, or why none are needed.`,
    rationale:
      `Rationale for the appropriateness of the chosen methods for ${d}, with reference to the performance ` +
      'evaluation report and the residual risks. ' +
      `${DRAFT} tie each method to the evidence gap or risk it addresses.`,
    specificObjectives:
      `Specific objectives the PMPF for ${d} addresses. ` +
      `${DRAFT} state measurable objectives.`,
    timeSchedule:
      `Time schedule for the PMPF activities for ${d} and for the PMPF evaluation report. ` +
      `${DRAFT} give dates; do not leave the schedule open.`,
  };
}

/** IVDR PMPF evaluation report (Annex XIII Part B). Keys match validatePmpfEvaluation. */
export function buildPmpfEvaluationContent(ctx: DeviceAuthoringContext): ContentRecord {
  const d = ctx.deviceName.trim();
  return {
    dataAnalyzed:
      `PMPF data analysed for ${d} during the reporting period (ring-trial, registry, study, literature ` +
      'and user-feedback results). ' +
      `${DRAFT} insert the actual datasets, sample sizes and results — not placeholders.`,
    conclusionsOnBenefitRisk:
      `Conclusions on the benefit-risk of ${d} and on its analytical and clinical performance in light of ` +
      'the PMPF data. ' +
      `${DRAFT} state the evidence-based conclusions and any new risks identified.`,
    updatesToPerformanceEvaluation:
      'Required updates to the performance evaluation report, PMS plan, risk management file and IFU ' +
      'arising from this PMPF evaluation. ' +
      `${DRAFT} list the specific documents and changes, or state "none required" with justification.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry: type → builder, code, and whether it needs a reporting period
// ─────────────────────────────────────────────────────────────────────────────

type Regulation = 'MDR' | 'IVDR';

interface TypeSpec {
  code: string;
  needsReportingPeriod: boolean;
  build: (ctx: DeviceAuthoringContext) => ContentRecord;
  titleNoun: string;
  /** The regulations whose instrument this type is. */
  regulations: readonly Regulation[];
  /** The other regulation's equivalent, named in the refusal. */
  counterpart?: PostMarketDocumentType;
}

const BOTH: readonly Regulation[] = ['MDR', 'IVDR'];

const TYPE_SPECS: Record<PostMarketDocumentType, TypeSpec> = {
  pms_plan: { code: 'PMS-PLAN', needsReportingPeriod: false, build: buildPmsPlanContent, titleNoun: 'PMS Plan', regulations: BOTH },
  pms_report: { code: 'PMS-REPORT', needsReportingPeriod: true, build: buildPmsReportContent, titleNoun: 'PMS Report', regulations: BOTH },
  pmcf_plan: {
    code: 'PMCF-PLAN',
    needsReportingPeriod: false,
    build: ctx => buildPmcfPlanContent(ctx) as unknown as ContentRecord,
    titleNoun: 'PMCF Plan',
    regulations: ['MDR'],
    counterpart: 'pmpf_plan',
  },
  pmcf_evaluation: {
    code: 'PMCF-EVAL',
    needsReportingPeriod: true,
    build: buildPmcfEvaluationContent,
    titleNoun: 'PMCF Evaluation',
    regulations: ['MDR'],
    counterpart: 'pmpf_evaluation',
  },
  psur: { code: 'PSUR', needsReportingPeriod: true, build: buildPsurContent, titleNoun: 'PSUR', regulations: BOTH },
  sscp: { code: 'SSCP', needsReportingPeriod: false, build: buildSscpContent, titleNoun: 'SSCP', regulations: ['MDR'], counterpart: 'ssp' },
  ssp: { code: 'SSP', needsReportingPeriod: false, build: buildSspContent, titleNoun: 'SSP', regulations: ['IVDR'], counterpart: 'sscp' },
  pmpf_plan: {
    code: 'PMPF-PLAN',
    needsReportingPeriod: false,
    build: buildPmpfPlanContent,
    titleNoun: 'PMPF Plan',
    regulations: ['IVDR'],
    counterpart: 'pmcf_plan',
  },
  pmpf_evaluation: {
    code: 'PMPF-EVAL',
    needsReportingPeriod: true,
    build: buildPmpfEvaluationContent,
    titleNoun: 'PMPF Evaluation Report',
    regulations: ['IVDR'],
    counterpart: 'pmcf_evaluation',
  },
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
  /** PSUR only: the sponsor's sales and serious-incident figures for the period. */
  psurExposure?: PsurExposureFigures;
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

  // The device decides the regulation first: an explicit regulation, else an
  // IVD class. Only when neither says does a type that is one regulation's
  // instrument fix it. Asking for a type under the other regulation is refused
  // with the right type named (an IVDR device has no SSCP or PMCF; an MDR
  // device has no SSP or PMPF).
  const regulation: Regulation =
    args.regulation ??
    (deviceClass && /ivd/i.test(deviceClass)
      ? 'IVDR'
      : spec.regulations.length === 1
        ? spec.regulations[0]
        : 'MDR');
  if (!spec.regulations.includes(regulation)) {
    const instead = spec.counterpart ? ` The ${regulation} document is ${spec.counterpart}.` : '';
    throw Object.assign(
      new Error(`${args.documentType} is not an ${regulation} post-market document.${instead}`),
      { code: 'PM_BAD_TYPE' }
    );
  }
  if (args.psurExposure && args.documentType !== 'psur') {
    throw badInput(`psurExposure applies to a PSUR only, not to ${args.documentType}.`);
  }
  const content = spec.build({
    deviceName,
    deviceClass,
    regulation,
    cerReference,
    psurExposure: args.psurExposure,
  });

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
