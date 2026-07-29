/**
 * Medicare Coverage Analysis service (Capability C2C-15)
 *
 * Tenant-scoped transaction functions for the coverage-analysis lifecycle:
 * open an analysis for a study, make the NCD 310.1 qualifying-trial
 * determination, add and classify items, and finalize the audited billing grid.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 * The deterministic billing designation always comes from coverage-logic.ts; the
 * advisory AI-assist path (suggestItemClassifications) only attaches candidate
 * NCD/LCD citations and a proposed designation — it never commits a final one.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/coverage/coverage-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import {
  evaluateQualifyingTrial,
  classifyCoverageItem,
  evaluateCoverageReadiness,
  buildBillingGrid,
  type QualifyingTrialResult,
  type ItemClassificationResult,
  type CoverageReadiness,
  type BillingGrid,
} from './coverage-logic';
import type { ItemCategory } from '../../../shared/schema/coverage-analysis';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class CoverageError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'CoverageError';
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

// ─── Analyses ────────────────────────────────────────────────────────────────

export interface AnalysisInput {
  title: string;
  studyId?: number | null;
  irbSubmissionId?: number | null;
  nctId?: string | null;
  sponsor?: string | null;
}

/** Open a coverage analysis. Validates study/IRB linkage and threads IRB → analysis provenance. */
export async function createAnalysisTx(client: Queryable, orgId: number, userId: number, input: AnalysisInput): Promise<{ id: number; provenanceLinkId: number | null }> {
  if (input.studyId != null) {
    const s = await client.query(`SELECT id FROM clinical_studies WHERE id = $1 AND organization_id = $2 LIMIT 1`, [input.studyId, orgId]);
    if (s.rows.length === 0) throw new CoverageError('NOT_FOUND', 'Clinical study not found for this organization.');
  }
  if (input.irbSubmissionId != null) {
    const i = await client.query(`SELECT id FROM irb_submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.irbSubmissionId, orgId]);
    if (i.rows.length === 0) throw new CoverageError('NOT_FOUND', 'IRB submission not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO coverage_analyses (organization_id, study_id, irb_submission_id, nct_id, title, sponsor, qualifying_determination, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'pending','draft',$7) RETURNING id`,
    [orgId, input.studyId ?? null, input.irbSubmissionId ?? null, input.nctId ?? null, input.title, input.sponsor ?? null, userId],
  );
  const id = Number(rows[0].id);

  let provenanceLinkId: number | null = null;
  if (input.irbSubmissionId != null) {
    const link = await linkProvenanceTx(client, { organizationId: orgId, userId, sourceType: 'irb_submission', sourceId: input.irbSubmissionId, targetType: 'coverage_analysis', targetId: id, linkRole: 'supports' });
    provenanceLinkId = link.id;
  }
  return { id, provenanceLinkId };
}

async function assertAnalysis(client: Queryable, orgId: number, analysisId: number): Promise<{ qualifyingDetermination: string; status: string }> {
  const a = await client.query(`SELECT qualifying_determination, status FROM coverage_analyses WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [analysisId, orgId]);
  if (a.rows.length === 0) throw new CoverageError('NOT_FOUND', 'Coverage analysis not found for this organization.');
  return { qualifyingDetermination: a.rows[0].qualifying_determination, status: a.rows[0].status };
}

export interface QualifyingInput {
  hasTherapeuticIntent: boolean;
  enrollsDiagnosisTreatment: boolean;
  hasMedicareBenefitCategory: boolean;
  deemedQualifying?: boolean;
  desirableCharacteristicsCount?: number;
}

/** Make / update the NCD 310.1 qualifying-trial determination. Moves the analysis draft → in_progress. */
export async function setQualifyingDeterminationTx(client: Queryable, orgId: number, analysisId: number, input: QualifyingInput): Promise<QualifyingTrialResult> {
  const cur = await assertAnalysis(client, orgId, analysisId);
  if (cur.status === 'finalized' || cur.status === 'archived') throw new CoverageError('INVALID_STATE', `Analysis is ${cur.status}; reopen before changing the determination.`);
  const result = evaluateQualifyingTrial(input);
  const r = await client.query(
    `UPDATE coverage_analyses SET
        qualifying_determination = $3,
        has_therapeutic_intent = $4,
        enrolls_diagnosis_treatment = $5,
        has_medicare_benefit_category = $6,
        deemed_qualifying = $7,
        desirable_characteristics_count = $8,
        qualifying_rationale = $9,
        status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
        updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [analysisId, orgId, result.determination, input.hasTherapeuticIntent, input.enrollsDiagnosisTreatment, input.hasMedicareBenefitCategory,
      !!input.deemedQualifying, result.desirableCharacteristicsCount, result.rationale],
  );
  if ((r as any).rowCount === 0) throw new CoverageError('NOT_FOUND', 'Coverage analysis not found for this organization.');
  return result;
}

// ─── Items ───────────────────────────────────────────────────────────────────

export interface ItemInput {
  itemDescription: string;
  category?: ItemCategory | null;
  cptHcpcsCode?: string | null;
  icd10Code?: string | null;
  isStandardOfCare?: boolean;
  sponsorPaidInBudget?: boolean;
}

export async function addItemTx(client: Queryable, orgId: number, userId: number, analysisId: number, input: ItemInput): Promise<{ id: number }> {
  await assertAnalysis(client, orgId, analysisId);
  const { rows } = await client.query(
    `INSERT INTO coverage_analysis_items (organization_id, analysis_id, item_description, category, cpt_hcpcs_code, icd10_code, is_standard_of_care, sponsor_paid_in_budget, classification, billing_designation, suggestion_source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unclear','hold','manual',$9) RETURNING id`,
    [orgId, analysisId, input.itemDescription, input.category ?? null, input.cptHcpcsCode ?? null, input.icd10Code ?? null,
      !!input.isStandardOfCare, !!input.sponsorPaidInBudget, userId],
  );
  return { id: Number(rows[0].id) };
}

export interface ClassifyItemInput {
  isStandardOfCare: boolean;
  sponsorPaidInBudget: boolean;
  ncdCitation?: string | null;
  lcdCitation?: string | null;
  coverageDocUrl?: string | null;
}

/**
 * Classify an item against the parent analysis's qualifying determination. The
 * billing designation is computed deterministically by classifyCoverageItem and
 * always overrides any prior LLM suggestion. Citations are persisted as supplied.
 */
export async function classifyItemTx(client: Queryable, orgId: number, itemId: number, input: ClassifyItemInput): Promise<ItemClassificationResult> {
  const it = await client.query(
    `SELECT i.id, a.qualifying_determination, a.status AS analysis_status
       FROM coverage_analysis_items i JOIN coverage_analyses a ON a.id = i.analysis_id
      WHERE i.id = $1 AND i.organization_id = $2 AND i.deleted_at IS NULL LIMIT 1`,
    [itemId, orgId],
  );
  if (it.rows.length === 0) throw new CoverageError('NOT_FOUND', 'Coverage item not found for this organization.');
  if (it.rows[0].analysis_status === 'finalized' || it.rows[0].analysis_status === 'archived') {
    throw new CoverageError('INVALID_STATE', `Analysis is ${it.rows[0].analysis_status}; reopen before reclassifying items.`);
  }
  const result = classifyCoverageItem({
    trialQualifies: it.rows[0].qualifying_determination === 'qualifying',
    isStandardOfCare: input.isStandardOfCare,
    sponsorPaidInBudget: input.sponsorPaidInBudget,
  });
  await client.query(
    `UPDATE coverage_analysis_items SET
        is_standard_of_care = $3, sponsor_paid_in_budget = $4,
        classification = $5, billing_designation = $6,
        ncd_citation = COALESCE($7, ncd_citation), lcd_citation = COALESCE($8, lcd_citation),
        coverage_doc_url = COALESCE($9, coverage_doc_url),
        rationale = $10, suggestion_source = 'deterministic', updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [itemId, orgId, input.isStandardOfCare, input.sponsorPaidInBudget, result.classification, result.billingDesignation,
      input.ncdCitation ?? result.citation, input.lcdCitation ?? null, input.coverageDocUrl ?? null, result.rationale],
  );
  return result;
}

/** Record an ICD-10 indication and whether it has been validated (validation runs in the route/AnA via the ICD-10 service). */
export async function setItemIcd10Tx(client: Queryable, orgId: number, itemId: number, input: { icd10Code: string; validated: boolean }): Promise<void> {
  const r = await client.query(
    `UPDATE coverage_analysis_items SET icd10_code = $3, icd10_validated = $4, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [itemId, orgId, input.icd10Code, input.validated],
  );
  if ((r as any).rowCount === 0) throw new CoverageError('NOT_FOUND', 'Coverage item not found for this organization.');
}

// ─── Finalize (gated) ────────────────────────────────────────────────────────

/** Finalize a coverage analysis — gated: determination made and every item classified (no unclear/hold). */
export async function finalizeAnalysisTx(client: Queryable, orgId: number, userId: number, analysisId: number): Promise<{ finalized: true; readiness: CoverageReadiness }> {
  const cur = await assertAnalysis(client, orgId, analysisId);
  if (cur.status === 'finalized') throw new CoverageError('INVALID_STATE', 'Analysis is already finalized.');
  if (cur.status === 'archived') throw new CoverageError('INVALID_STATE', 'Analysis is archived.');
  const items = await client.query(
    `SELECT classification, billing_designation, icd10_validated FROM coverage_analysis_items WHERE analysis_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [analysisId, orgId],
  );
  const readiness = evaluateCoverageReadiness({
    qualifyingDetermination: cur.qualifyingDetermination as any,
    items: items.rows.map((r) => ({ classification: r.classification, billingDesignation: r.billing_designation, icd10Validated: r.icd10_validated })),
  });
  if (!readiness.readyToFinalize) throw new CoverageError('INVALID_STATE', `Cannot finalize coverage analysis — ${readiness.blockers.join(' ')}`);
  await client.query(
    `UPDATE coverage_analyses SET status = 'finalized', finalized_by = $3, finalized_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [analysisId, orgId, userId],
  );
  return { finalized: true, readiness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listAnalyses(orgId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, study_id, irb_submission_id, nct_id, title, sponsor, qualifying_determination, status, finalized_at, created_at
       FROM coverage_analyses WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [orgId],
  );
  return rows;
}

export async function getAnalysis(orgId: number, analysisId: number): Promise<any | null> {
  const { rows } = await pool.query(
    `SELECT * FROM coverage_analyses WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [analysisId, orgId],
  );
  return rows[0] ?? null;
}

export async function listItems(orgId: number, analysisId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, item_description, category, cpt_hcpcs_code, icd10_code, icd10_validated, is_standard_of_care, sponsor_paid_in_budget,
            classification, billing_designation, ncd_citation, lcd_citation, coverage_doc_url, rationale, suggestion_source
       FROM coverage_analysis_items WHERE analysis_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [analysisId, orgId],
  );
  return rows;
}

/** Assemble the exportable billing grid (read-only). Throws NOT_FOUND if the analysis is missing. */
export async function getBillingGrid(orgId: number, analysisId: number): Promise<BillingGrid> {
  const a = await pool.query(`SELECT qualifying_determination FROM coverage_analyses WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [analysisId, orgId]);
  if (a.rows.length === 0) throw new CoverageError('NOT_FOUND', 'Coverage analysis not found for this organization.');
  const items = await listItems(orgId, analysisId);
  const readiness = evaluateCoverageReadiness({
    qualifyingDetermination: a.rows[0].qualifying_determination,
    items: items.map((r) => ({ classification: r.classification, billingDesignation: r.billing_designation, icd10Validated: r.icd10_validated })),
  });
  return buildBillingGrid(
    items.map((r) => ({
      itemDescription: r.item_description, category: r.category, cptHcpcsCode: r.cpt_hcpcs_code, icd10Code: r.icd10_code,
      classification: r.classification, billingDesignation: r.billing_designation, ncdCitation: r.ncd_citation, rationale: r.rationale,
    })),
    readiness,
  );
}

// ─── Advisory AI-assist (read-only) ──────────────────────────────────────────

export interface CoverageSuggestion {
  itemId: number;
  itemDescription: string;
  suggestedClassification: ItemClassificationResult['classification'];
  suggestedBillingDesignation: ItemClassificationResult['billingDesignation'];
  rationale: string;
  candidateCitations: { documentId: string; title: string; url: string }[];
}

/**
 * Advisory: for each still-unclear item, compute the deterministic designation
 * (from current flags + the parent determination) and attach candidate NCD/LCD
 * citations from the CMS Coverage database. Does NOT persist final designations —
 * a governed classifyItemTx call commits them. Network failures degrade softly
 * (no citations attached). Read-only.
 */
export async function suggestItemClassifications(orgId: number, analysisId: number): Promise<{ analysisId: number; suggestions: CoverageSuggestion[] }> {
  const a = await pool.query(`SELECT qualifying_determination FROM coverage_analyses WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [analysisId, orgId]);
  if (a.rows.length === 0) throw new CoverageError('NOT_FOUND', 'Coverage analysis not found for this organization.');
  const trialQualifies = a.rows[0].qualifying_determination === 'qualifying';
  const items = await pool.query(
    `SELECT id, item_description, is_standard_of_care, sponsor_paid_in_budget FROM coverage_analysis_items
      WHERE analysis_id = $1 AND organization_id = $2 AND deleted_at IS NULL AND (classification = 'unclear' OR billing_designation = 'hold') ORDER BY id`,
    [analysisId, orgId],
  );

  let searchMedicareCoverage: ((p: { keyword?: string; type?: 'ncd' | 'lcd'; limit?: number }) => Promise<any>) | null = null;
  try {
    ({ searchMedicareCoverage } = await import('../integrations/cms-coverage-client.js'));
  } catch {
    searchMedicareCoverage = null;
  }

  const suggestions: CoverageSuggestion[] = [];
  for (const row of items.rows) {
    const det = classifyCoverageItem({ trialQualifies, isStandardOfCare: row.is_standard_of_care, sponsorPaidInBudget: row.sponsor_paid_in_budget });
    let candidateCitations: CoverageSuggestion['candidateCitations'] = [];
    if (searchMedicareCoverage) {
      try {
        const res = await searchMedicareCoverage({ keyword: row.item_description, type: 'ncd', limit: 3 });
        candidateCitations = (res?.documents ?? []).map((d: any) => ({ documentId: d.documentId, title: d.title, url: d.url }));
      } catch {
        candidateCitations = [];
      }
    }
    suggestions.push({
      itemId: Number(row.id),
      itemDescription: row.item_description,
      suggestedClassification: det.classification,
      suggestedBillingDesignation: det.billingDesignation,
      rationale: det.rationale,
      candidateCitations,
    });
  }
  return { analysisId, suggestions };
}

export { today };
