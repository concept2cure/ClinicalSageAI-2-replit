/**
 * Post-Market Lifecycle Service
 *
 * CRUD + lifecycle (draft → under_review → approved → superseded → withdrawn)
 * for the post_market_documents table. One service, six document types
 * discriminated by `document_type`:
 *   pms_plan         MDR Article 84 / IVDR Article 78
 *   pms_report       MDR Article 85 (Class I) / Article 86 (others) / IVDR Art. 80–81
 *   pmcf_plan        MDR Annex XIV Part B
 *   pmcf_evaluation  MDR Annex XIV Part B
 *   psur             device PSUR — MDR Article 86 / IVDR Article 81
 *   sscp             MDR Article 32 (Class III + implantable Class IIb)
 *
 * Per-type completeness checks live in `validateDocument` — deterministic,
 * no LLM, every finding cites the relevant MDR/IVDR article.
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  postMarketDocuments,
  type PostMarketDocument,
  type PostMarketDocumentType,
  type InsertPostMarketDocument,
} from '../../../shared/schema/gspr-postmarket';
import { publishRegulatoryChange } from '../living-file/publish';
import { DRAFT_SENTINEL } from './scaffold-sentinel';

// ─────────────────────────────────────────────────────────────────────────────
// Validator
// ─────────────────────────────────────────────────────────────────────────────

export type DocFindingSeverity = 'critical' | 'warning' | 'info';

export interface PostMarketFinding {
  code: string;
  severity: DocFindingSeverity;
  message: string;
  citation: string;
}

export interface PostMarketValidationResult {
  documentId: string;
  documentType: PostMarketDocumentType;
  findings: PostMarketFinding[];
  criticalCount: number;
  warningCount: number;
  passesGate: boolean;
}

const has = (v: string | null | undefined): boolean =>
  typeof v === 'string' && v.trim().length > 0;

function checkContentField(
  content: unknown,
  key: string
): boolean {
  if (!content || typeof content !== 'object') return false;
  const v = (content as Record<string, unknown>)[key];
  if (typeof v !== 'string' || v.trim().length === 0) return false;
  // Presence is not sufficiency. The generators fill every required field with
  // non-empty guidance prose that embeds the scaffold sentinel (e.g. "… DRAFT —
  // state the evidence-based conclusion." or "DRAFT — FACTUAL FIELD — insert the
  // actual volume of sales …"). A field still carrying that marker is
  // unspecialised boilerplate, not real regulatory content — treat it as ABSENT
  // so passesGate stays false and the document cannot be approved / Part-11
  // locked until the sponsor replaces it with the real figure/conclusion. This
  // is self-clearing: once the sponsor overwrites the field, the marker is gone
  // and the field counts.
  if (v.includes(DRAFT_SENTINEL)) return false;
  return true;
}

const F = (
  code: string,
  severity: DocFindingSeverity,
  message: string,
  citation: string
): PostMarketFinding => ({ code, severity, message, citation });

function validatePmsPlan(doc: PostMarketDocument): PostMarketFinding[] {
  const c = doc.content;
  const out: PostMarketFinding[] = [];
  // MDR Annex III §1.1 — proactive collection, complaints, public databases,
  //                      trends, performance, safety, communication
  for (const [key, label] of [
    ['proactiveCollectionMethods', 'proactive data collection methods'],
    ['complaintHandlingProcess', 'complaint handling process'],
    ['trendReportingProcess', 'trend reporting process'],
    ['performanceMonitoring', 'performance monitoring'],
    ['communicationPlan', 'communication plan with authorities + users'],
  ] as const) {
    if (!checkContentField(c, key)) {
      out.push(
        F(
          'PMS-001',
          'critical',
          `PMS Plan is missing ${label} (content.${key}).`,
          'EU MDR 2017/745 Annex III §1.1'
        )
      );
    }
  }
  return out;
}

function validatePmsReport(doc: PostMarketDocument): PostMarketFinding[] {
  const out: PostMarketFinding[] = [];
  if (!doc.reportingPeriodStart || !doc.reportingPeriodEnd) {
    out.push(
      F(
        'PMSR-001',
        'critical',
        'PMS Report must declare a reporting period (start + end).',
        'EU MDR Article 85'
      )
    );
  }
  for (const key of ['summaryOfFindings', 'correctivePreventiveActions', 'concludingAssessment']) {
    if (!checkContentField(doc.content, key)) {
      out.push(
        F(
          'PMSR-002',
          'critical',
          `PMS Report is missing content.${key}.`,
          'EU MDR Article 85; Annex III §1.2'
        )
      );
    }
  }
  return out;
}

function validatePmcfPlan(doc: PostMarketDocument): PostMarketFinding[] {
  const out: PostMarketFinding[] = [];
  for (const key of [
    'generalMethods',
    'specificMethods',
    'rationale',
    'milestones',
    'evaluationCriteria',
  ]) {
    if (!checkContentField(doc.content, key)) {
      out.push(
        F(
          'PMCFP-001',
          'critical',
          `PMCF Plan is missing content.${key}.`,
          'EU MDR Annex XIV Part B §6.2'
        )
      );
    }
  }
  return out;
}

function validatePmcfEvaluation(doc: PostMarketDocument): PostMarketFinding[] {
  const out: PostMarketFinding[] = [];
  if (!doc.reportingPeriodStart || !doc.reportingPeriodEnd) {
    out.push(
      F(
        'PMCFE-001',
        'critical',
        'PMCF Evaluation must declare a reporting period.',
        'EU MDR Annex XIV Part B'
      )
    );
  }
  for (const key of ['dataAnalyzed', 'conclusionsOnBenefitRisk', 'updatesToCer']) {
    if (!checkContentField(doc.content, key)) {
      out.push(
        F(
          'PMCFE-002',
          'critical',
          `PMCF Evaluation is missing content.${key}.`,
          'EU MDR Annex XIV Part B'
        )
      );
    }
  }
  return out;
}

function validatePsur(doc: PostMarketDocument): PostMarketFinding[] {
  const out: PostMarketFinding[] = [];
  if (!doc.reportingPeriodStart || !doc.reportingPeriodEnd) {
    out.push(F('PSUR-001', 'critical', 'PSUR must declare a reporting period.', 'EU MDR Article 86'));
  }
  for (const key of [
    'summaryOfBenefitRisk',
    'mainPmcfFindings',
    'volumeOfSales',
    'sizeAndCharacteristicsOfUsersPopulation',
  ]) {
    if (!checkContentField(doc.content, key)) {
      out.push(
        F(
          'PSUR-002',
          'critical',
          `PSUR is missing content.${key}.`,
          'EU MDR Article 86; IVDR Article 81'
        )
      );
    }
  }
  return out;
}

function validateSscp(doc: PostMarketDocument): PostMarketFinding[] {
  const out: PostMarketFinding[] = [];
  // SSCP per MDR Article 32 + MDCG 2019-9 Rev 1 (2022)
  for (const key of [
    'deviceIdentification',
    'intendedPurpose',
    'deviceDescription',
    'risksAndUndesirableEffects',
    'summaryOfClinicalEvaluation',
    'pmcfSummary',
    'suggestedProfileForUsers',
  ]) {
    if (!checkContentField(doc.content, key)) {
      out.push(
        F(
          'SSCP-001',
          'critical',
          `SSCP is missing content.${key}.`,
          'EU MDR Article 32; MDCG 2019-9 Rev 1'
        )
      );
    }
  }
  return out;
}

const VALIDATORS: Record<PostMarketDocumentType, (d: PostMarketDocument) => PostMarketFinding[]> = {
  pms_plan: validatePmsPlan,
  pms_report: validatePmsReport,
  pmcf_plan: validatePmcfPlan,
  pmcf_evaluation: validatePmcfEvaluation,
  psur: validatePsur,
  sscp: validateSscp,
};

export function validateDocument(doc: PostMarketDocument): PostMarketValidationResult {
  const findings = VALIDATORS[doc.documentType as PostMarketDocumentType]?.(doc) ?? [];
  if (doc.locked && doc.status !== 'approved' && doc.status !== 'superseded') {
    findings.push(
      F(
        'PM-099',
        'critical',
        `Document is locked but status is "${doc.status}".`,
        '21 CFR Part 11 §11.10(e)'
      )
    );
  }
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  return {
    documentId: doc.id,
    documentType: doc.documentType as PostMarketDocumentType,
    findings,
    criticalCount,
    warningCount: findings.filter(f => f.severity === 'warning').length,
    passesGate: criticalCount === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function getDocument(
  organizationId: number,
  documentId: string
): Promise<PostMarketDocument | null> {
  const [row] = await db
    .select()
    .from(postMarketDocuments)
    .where(
      and(
        eq(postMarketDocuments.id, documentId),
        eq(postMarketDocuments.organizationId, organizationId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function listProgramDocuments(
  organizationId: number,
  programId: string,
  documentType?: PostMarketDocumentType
): Promise<PostMarketDocument[]> {
  const conditions = [
    eq(postMarketDocuments.organizationId, organizationId),
    eq(postMarketDocuments.programId, programId),
  ];
  if (documentType) conditions.push(eq(postMarketDocuments.documentType, documentType));
  return db
    .select()
    .from(postMarketDocuments)
    .where(and(...conditions))
    .orderBy(asc(postMarketDocuments.documentType), desc(postMarketDocuments.updatedAt));
}

export async function createDocument(
  values: InsertPostMarketDocument
): Promise<PostMarketDocument> {
  const [row] = await db.insert(postMarketDocuments).values(values).returning();
  return row;
}

export async function updateDocument(
  organizationId: number,
  documentId: string,
  patch: Partial<InsertPostMarketDocument>
): Promise<PostMarketDocument | null> {
  const existing = await getDocument(organizationId, documentId);
  if (!existing) return null;
  if (existing.locked) {
    throw Object.assign(new Error('Document is locked'), { code: 'PM_LOCKED' });
  }
  const [row] = await db
    .update(postMarketDocuments)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(postMarketDocuments.id, documentId))
    .returning();
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export interface ApproveArgs {
  organizationId: number;
  documentId: string;
  approvedBy: string;
  signatureId?: string;
}

export async function approveDocument(
  args: ApproveArgs
): Promise<
  | { document: PostMarketDocument; validation: PostMarketValidationResult }
  | { error: 'NOT_FOUND' }
  | { error: 'ALREADY_LOCKED' }
  | { error: 'GATE_BLOCKED'; validation: PostMarketValidationResult }
> {
  const doc = await getDocument(args.organizationId, args.documentId);
  if (!doc) return { error: 'NOT_FOUND' };
  if (doc.locked) return { error: 'ALREADY_LOCKED' };

  const validation = validateDocument(doc);
  if (!validation.passesGate) return { error: 'GATE_BLOCKED', validation };

  const [updated] = await db
    .update(postMarketDocuments)
    .set({
      status: 'approved',
      locked: true,
      approvedBy: args.approvedBy,
      approvedAt: new Date(),
      signatureId: args.signatureId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(postMarketDocuments.id, doc.id))
    .returning();

  // Living-file: an approved post-market doc updates the device profile's
  // post-market posture. Sufficiency assessments and reviewer sims should
  // refresh; defense packets that referenced the prior version may need
  // staleness propagation through the reactive layer.
  await publishRegulatoryChange({
    organizationId: updated.organizationId,
    programId: updated.programId,
    event: 'device_profile_changed',
    sourceId: updated.programId,
    sourceLabel: `${updated.documentType} ${updated.code} v${updated.version} approved`,
    reason: `post_market_${updated.documentType}_approved`,
    userId: args.approvedBy,
  });

  return { document: updated, validation };
}

export async function supersedeDocument(
  organizationId: number,
  oldDocumentId: string,
  patch: { newTitle?: string; createdBy?: string } = {}
): Promise<PostMarketDocument | null> {
  const old = await getDocument(organizationId, oldDocumentId);
  if (!old) return null;

  const newVersion = old.version + 1;
  const [newDoc] = await db
    .insert(postMarketDocuments)
    .values({
      organizationId: old.organizationId,
      programId: old.programId,
      documentType: old.documentType,
      code: old.code,
      version: newVersion,
      previousDocumentId: old.id,
      title: patch.newTitle ?? old.title,
      deviceSubjectName: old.deviceSubjectName,
      reportingPeriodStart: old.reportingPeriodStart,
      reportingPeriodEnd: old.reportingPeriodEnd,
      content: old.content,
      summary: old.summary,
      risksIdentified: old.risksIdentified,
      benefitRiskConclusion: old.benefitRiskConclusion,
      status: 'draft',
      locked: false,
      relatedCerReportId: old.relatedCerReportId,
      relatedPredicateKNumber: old.relatedPredicateKNumber,
      metadata: old.metadata,
      createdBy: patch.createdBy ?? old.createdBy,
    })
    .returning();

  await db
    .update(postMarketDocuments)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(eq(postMarketDocuments.id, old.id));

  // Living-file: superseding a post-market doc creates a new draft baseline
  // — surface this as a device-profile-changed event so downstream artifacts
  // get re-evaluated through the reactive layer.
  await publishRegulatoryChange({
    organizationId: old.organizationId,
    programId: old.programId,
    event: 'device_profile_changed',
    sourceId: old.programId,
    sourceLabel: `${old.documentType} ${old.code} v${old.version} superseded by v${newDoc.version}`,
    reason: `post_market_${old.documentType}_superseded`,
    userId: patch.createdBy,
  });

  return newDoc;
}
