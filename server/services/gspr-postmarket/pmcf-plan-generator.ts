/**
 * PMCF Plan Generator
 *
 * Authors a DRAFT Post-Market Clinical Follow-up plan (EU MDR Annex XIV Part B
 * §6.2) for a device/program and persists it through the EXISTING post-market
 * service (createDocument) so it flows through the same validate → approve →
 * lock lifecycle. This is the authoring counterpart to the existing
 * validatePmcfPlan completeness checker — it does not duplicate persistence,
 * validation, or the document model.
 *
 * Honesty: the generated content is a device-PARAMETERISED scaffold, explicitly
 * marked DRAFT, that the sponsor must specialise before approval. A generic
 * PMCF plan is not sufficient under MDCG 2020-7; every section names what the
 * sponsor must add. The document is created in `draft` status and still has to
 * pass the human approval gate (validation + e-signature). The generator never
 * approves, locks, or claims sufficiency.
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
import type { PostMarketDocument } from '../../../shared/schema/gspr-postmarket';

const PMCF_PLAN_CODE = 'PMCF-PLAN';

export interface PmcfPlanContext {
  deviceName: string;
  deviceClass?: string | null;
  regulation?: 'MDR' | 'IVDR';
  /** Optional human-readable CER reference, woven into the rationale. */
  cerReference?: string | null;
}

/** PMCF plan content keyed exactly as validatePmcfPlan expects. */
export interface PmcfPlanContent {
  generalMethods: string;
  specificMethods: string;
  rationale: string;
  milestones: string;
  evaluationCriteria: string;
}

/** Device-class-appropriate specific-method expectation (MDCG 2020-7). */
function specificMethodExpectation(deviceClass?: string | null): string {
  const cls = (deviceClass ?? '').toUpperCase();
  if (cls.includes('III') || cls.includes('IMPLANT')) {
    return 'a prospective PMCF study and/or participation in a device/implant registry is generally expected';
  }
  if (cls.includes('IIB') || cls === 'IIB') {
    return 'a PMCF study or registry participation proportionate to the residual risks, plus structured user surveys';
  }
  if (cls.includes('IIA') || cls === 'IIA') {
    return 'targeted user surveys, registry participation, or a focused PMCF study proportionate to risk';
  }
  if (cls === 'I' || cls.includes('CLASS I')) {
    return 'structured user feedback and systematic literature monitoring may be sufficient, subject to documented justification';
  }
  return 'PMCF activities proportionate to the device risk class and residual uncertainties';
}

/**
 * Build the (deterministic, device-parameterised) DRAFT PMCF plan content.
 * Pure — no DB — so it is directly testable.
 */
export function buildPmcfPlanContent(ctx: PmcfPlanContext): PmcfPlanContent {
  const device = ctx.deviceName.trim();
  const cls = ctx.deviceClass?.trim() || 'unspecified class';
  const reg = ctx.regulation ?? 'MDR';
  const cerRef = ctx.cerReference?.trim()
    ? ` (clinical evaluation reference: ${ctx.cerReference.trim()})`
    : '';

  return {
    generalMethods:
      `General PMCF methods for ${device} (${cls}) per EU ${reg} Annex XIV Part B §6.2(a): ` +
      '(1) systematic review of scientific literature and other sources of clinical data; ' +
      '(2) analysis of post-market surveillance data, complaints, vigilance and trend reports; ' +
      '(3) gathering of clinical experience from users and patient registries where available. ' +
      'DRAFT — the sponsor must specify the search strategy, databases, periodicity and responsible roles.',
    specificMethods:
      `Device-specific PMCF activities for ${device} per Annex XIV Part B §6.2(b): ` +
      `${specificMethodExpectation(cls)}. ` +
      'DRAFT — replace with the concrete study/registry/survey design appropriate to the ' +
      'residual risks and clinical claims; generic surveillance alone is not sufficient (MDCG 2020-7).',
    rationale:
      `Rationale linking each PMCF activity to the residual risks and open clinical questions ` +
      `identified in the clinical evaluation of ${device}${cerRef}. ` +
      'DRAFT — cite the specific residual risks, uncertainties and performance/safety claims that ' +
      'each method is intended to address.',
    milestones:
      'Indicative PMCF schedule: protocol finalisation, data-collection start, interim PMCF ' +
      'evaluation, and a PMCF Evaluation Report feeding the next Clinical Evaluation Report update. ' +
      'DRAFT — set concrete dates aligned to the PMS/PSUR reporting cycle.',
    evaluationCriteria:
      'Criteria for evaluating PMCF results: pre-defined acceptance thresholds, benefit-risk ' +
      'acceptability, and triggers for CAPA, field safety action or CER update. ' +
      'DRAFT — define quantitative acceptance criteria and decision thresholds.',
  };
}

export interface GeneratePmcfPlanArgs {
  organizationId: number;
  programId: string;
  createdBy: string;
  deviceName: string;
  deviceClass?: string | null;
  regulation?: 'MDR' | 'IVDR';
  /** Optional CER report to derive device context + reference from. */
  relatedCerReportId?: number;
  /** Optional title override; otherwise derived from the device name. */
  title?: string;
}

export interface GeneratePmcfPlanResult {
  document: PostMarketDocument;
  validation: PostMarketValidationResult;
}

/**
 * Generate and persist a DRAFT PMCF plan for a program. Versions are computed
 * per (org, program, PMCF-PLAN code) so repeated generation does not collide
 * with the unique (org, program, type, code, version) index.
 */
export async function generatePmcfPlan(
  args: GeneratePmcfPlanArgs
): Promise<GeneratePmcfPlanResult> {
  let deviceName = args.deviceName?.trim();
  let deviceClass = args.deviceClass ?? null;
  let cerReference: string | null = null;

  // Enrich from a CER report when provided (tenant-scoped).
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
      code: 'PMCF_NO_DEVICE',
    });
  }

  const regulation =
    args.regulation ?? (deviceClass && /ivd/i.test(deviceClass) ? 'IVDR' : 'MDR');

  const content = buildPmcfPlanContent({ deviceName, deviceClass, regulation, cerReference });

  // Next version for this program's PMCF plan line.
  const existing = await listProgramDocuments(args.organizationId, args.programId, 'pmcf_plan');
  const nextVersion =
    existing
      .filter(d => d.code === PMCF_PLAN_CODE)
      .reduce((max, d) => Math.max(max, d.version ?? 1), 0) + 1;

  const document = await createDocument({
    organizationId: args.organizationId,
    programId: args.programId,
    documentType: 'pmcf_plan',
    code: PMCF_PLAN_CODE,
    version: nextVersion,
    title: args.title?.trim() || `PMCF Plan — ${deviceName} (draft)`,
    deviceSubjectName: deviceName,
    content,
    summary:
      `DRAFT PMCF plan generated for ${deviceName}. Requires sponsor specialisation before ` +
      'approval; generated content is a scaffold, not a sufficiency determination.',
    status: 'draft',
    relatedCerReportId: args.relatedCerReportId ?? null,
    metadata: { generated: true, requiresSpecialization: true, generator: 'pmcf-plan-generator' },
    createdBy: args.createdBy,
    updatedBy: args.createdBy,
  });

  return { document, validation: validateDocument(document) };
}
