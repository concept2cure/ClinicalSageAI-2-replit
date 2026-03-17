/**
 * IVDR (In Vitro Diagnostic Regulation EU 2017/746) Backend Routes
 *
 * Provides full lifecycle API for:
 *   1. Annex VIII Classification (A/B/C/D) with rule trace
 *   2. Analytical Validation tracking (LoD, LoQ, precision, etc.)
 *   3. Clinical Evidence management (2x2 tables, performance claims)
 *   4. CDx (Companion Diagnostic) flag + special workflow
 *
 * All endpoints are append-only for audit compliance.
 *
 * @module routes/ivdr-routes
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export default function createIVDRRoutes(pool: Pool): Router {
  const router = Router();

  // ── Server-side org extraction (NEVER trust client-provided org) ───────
  // Uses the authenticated session's tenantId / tenantContext set by authMiddleware.
  // requireIVDRAccess has already verified tenantId exists, so this is safe.
  function getServerOrgId(req: Request): number {
    const fromTenant = (req as any).tenantId;
    const fromContext = (req as any).tenantContext?.organizationId;
    const orgId = fromTenant || fromContext;
    if (!orgId) {
      // Should never reach here — requireIVDRAccess gates this.
      // Defensive: throw rather than silently default to org 1.
      throw new Error('IVDR_NO_TENANT: organization context is missing from session');
    }
    const n = typeof orgId === 'string' ? Number(orgId) : orgId;
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('IVDR_BAD_TENANT: invalid organization ID in session');
    }
    return n;
  }

  /**
   * Safe error response — never leaks raw error.message to client.
   * Returns 503 IVDR_NOT_PROVISIONED for missing IVDR tables (42P01).
   */
  function safeError(res: Response, error: any, code: string, label: string): Response {
    // 42P01 = undefined_table — IVDR tables not yet migrated
    if (error?.code === '42P01') {
      console.warn(`[IVDR] ${label}: table not found — denying until migrated`);
      return res.status(503).json({
        error: 'IVDR tables not yet provisioned — run migrations',
        code: 'IVDR_NOT_PROVISIONED',
      });
    }
    // IVDR_BAD_TENANT from getServerOrgId → 403
    if (error?.message?.includes('IVDR_BAD_TENANT')) {
      return res.status(403).json({
        error: 'Invalid organization context',
        code: 'IVDR_BAD_TENANT',
      });
    }
    // IVDR_NO_TENANT from getServerOrgId → 403
    if (error?.message?.includes('IVDR_NO_TENANT')) {
      return res.status(403).json({
        error: 'Organization context required',
        code: 'IVDR_NO_TENANT',
      });
    }
    console.error(`[IVDR] ${label}:`, error);
    return res.status(500).json({
      error: `${label} failed`,
      code,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANNEX VIII CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ivdr/classify
   * Run Annex VIII classifier: takes device intent answers → returns class + rule trace
   */
  router.post('/classify', async (req: Request, res: Response) => {
    try {
      // Route-level permission: classification requires ivdr:classify
      const perms: Set<string> = (req as any).ivdrPermissions || new Set();
      if (!perms.has('*') && !perms.has('ivdr:classify')) {
        return res.status(403).json({
          error: 'Classification requires ivdr:classify permission',
          code: 'IVDR_CLASSIFY_DENIED',
        });
      }

      const {
        deviceName,
        intendedPurpose,
        isSelfTest,
        isNearPatient,
        isCompanionDiagnostic,
        detectsTransmissibleAgent,
        bloodScreening,
        detectsCancer,
        prenatalScreening,
        riskToPatient,
        isGeneticTest,
        analytes = [],
      } = req.body;

      // Org from authenticated session — NEVER from req.body
      const orgId = getServerOrgId(req);

      if (!deviceName || !intendedPurpose) {
        return res.status(400).json({ error: 'deviceName and intendedPurpose are required' });
      }

      // ── Annex VIII Rule Engine ───────────────────────────────────────────
      const ruleTrace: Array<{ rule: string; description: string; matched: boolean }> = [];
      let classResult: 'A' | 'B' | 'C' | 'D' = 'A'; // Default lowest risk

      // Rule 1 — Class D: Blood/tissue screening for transmissible agents
      const rule1Match = bloodScreening === true && detectsTransmissibleAgent === true;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 1 (Class D)',
        description:
          'IVDs intended to be used for blood screening, assessing eligibility of blood/tissue donations, and detecting transmissible agents (HIV, HBV, HCV, HTLV, Treponema pallidum, CMV, Chlamydia, RhD, Kell, Duffy/Kidd)',
        matched: rule1Match,
      });
      if (rule1Match) classResult = 'D';

      // Rule 2 — Class D: Blood group typing (ABO, Rh, Kell, Kidd, Duffy)
      const isBloodGrouping =
        intendedPurpose.toLowerCase().includes('blood group') ||
        intendedPurpose.toLowerCase().includes('blood typing');
      ruleTrace.push({
        rule: 'Annex VIII, Rule 2 (Class D)',
        description:
          'IVDs intended for blood grouping or tissue typing to ensure immunological compatibility of blood, blood components, cells, tissues, or organs intended for transfusion/transplant (ABO, Rh, anti-Kell)',
        matched: isBloodGrouping,
      });
      if (isBloodGrouping && classResult !== 'D') classResult = 'D';

      // Rule 3a — Class C: Companion Diagnostics
      const rule3aMatch = isCompanionDiagnostic === true;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 3a (Class C)',
        description:
          'IVDs intended as companion diagnostics — devices essential for the safe and effective use of a corresponding medicinal product, to identify patients most likely to benefit or at increased risk of serious adverse reactions',
        matched: rule3aMatch,
      });
      if (rule3aMatch && classResult < 'C') classResult = 'C';

      // Rule 3b — Class C: Cancer screening/diagnosis as first-line
      const rule3bMatch = detectsCancer === true;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 3b (Class C)',
        description:
          'IVDs intended for screening, diagnosis, or staging of cancer. First-line standalone diagnostic use for detecting cancer markers (CEA, PSA, CA-125, HER2, etc.)',
        matched: rule3bMatch,
      });
      if (rule3bMatch && classResult < 'C') classResult = 'C';

      // Rule 3c — Class C: Genetic testing with direct patient management impact
      const rule3cMatch = isGeneticTest === true;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 3c (Class C)',
        description:
          'IVDs intended to provide information about genetic predisposition. Human genetic testing whose results directly lead to patient management decisions (pharmacogenomic, hereditary condition screening)',
        matched: rule3cMatch,
      });
      if (rule3cMatch && classResult < 'C') classResult = 'C';

      // Rule 3d — Class C: Prenatal screening / congenital abnormalities
      const rule3dMatch = prenatalScreening === true;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 3d (Class C)',
        description:
          'IVDs intended for prenatal screening of women to determine their immune status, for detecting congenital abnormalities of the foetus, or for determining foetal status where there is an imminent risk to the foetus',
        matched: rule3dMatch,
      });
      if (rule3dMatch && classResult < 'C') classResult = 'C';

      // Rule 4 — Class B: Self-testing devices
      const rule4Match = isSelfTest === true;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 4 (Class B)',
        description:
          'IVDs intended for self-testing — devices intended to be used by lay persons including tests for self-monitoring of chronic conditions (glucose, coagulation, cholesterol self-tests)',
        matched: rule4Match,
      });
      if (rule4Match && classResult < 'B') classResult = 'B';

      // Rule 5 — Class B: Near-patient testing
      const rule5Match = isNearPatient === true && !isSelfTest;
      ruleTrace.push({
        rule: 'Annex VIII, Rule 5 (Class B)',
        description:
          'IVDs intended for near-patient testing (point-of-care) — devices intended to be used outside a laboratory environment, including in the immediate patient environment (bedside, ambulance, pharmacy, workplace)',
        matched: rule5Match,
      });
      if (rule5Match && classResult < 'B') classResult = 'B';

      // Rule 6 — Class B: Devices whose failure poses risk
      const rule6Match = riskToPatient === 'high' || riskToPatient === 'medium';
      ruleTrace.push({
        rule: 'Annex VIII, Rule 6 (Class B)',
        description:
          'IVDs not covered by higher classes but whose results could pose a medium/high risk to the individual patient or to public health. Includes IVDs measuring analytes used in critical patient management decisions',
        matched: rule6Match,
      });
      if (rule6Match && classResult < 'B') classResult = 'B';

      // Rule 7 — Class A: General IVDs / instruments / accessories
      ruleTrace.push({
        rule: 'Annex VIII, Rule 7 (Class A)',
        description:
          'All other IVDs not covered by Rules 1-6. General laboratory instruments, specimen receptacles, buffer solutions, wash solutions, general culture media, and laboratory equipment without specific risk classification',
        matched: classResult === 'A',
      });

      // Persist classification result
      const insertResult = await pool.query(
        `INSERT INTO ivdr_classifications
         (device_name, intended_purpose, classification, is_cdx, is_self_test,
          is_near_patient, rule_trace, analytes, organization_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING *`,
        [
          deviceName,
          intendedPurpose,
          classResult,
          isCompanionDiagnostic || false,
          isSelfTest || false,
          isNearPatient || false,
          JSON.stringify(ruleTrace),
          JSON.stringify(analytes),
          orgId,
        ]
      );

      return res.json({
        classification: classResult,
        ruleTrace,
        matchedRules: ruleTrace.filter(r => r.matched),
        record: insertResult.rows[0],
        regulatoryPath: getClassPath(classResult),
      });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CLASSIFY_ERROR', 'Classification');
    }
  });

  /**
   * GET /api/ivdr/classifications
   * List all classification records
   */
  router.get('/classifications', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT id, device_name, intended_purpose, classification, is_cdx, is_self_test, is_near_patient, rule_trace, analytes, organization_id, created_at FROM ivdr_classifications WHERE organization_id = $1 ORDER BY created_at DESC`,
        [orgId]
      );
      return res.json({ classifications: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_LIST_CLASS_ERROR', 'List classifications');
    }
  });

  /**
   * GET /api/ivdr/classify/:id/report
   * Download full classification report artifact (JSON) for technical file
   */
  router.get('/classify/:id/report', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT id, device_name, intended_purpose, classification, is_cdx, is_self_test, is_near_patient, rule_trace, analytes, organization_id, created_at FROM ivdr_classifications WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Classification not found' });
      }
      const record = result.rows[0];
      const ruleTrace =
        typeof record.rule_trace === 'string' ? JSON.parse(record.rule_trace) : record.rule_trace;
      const report = {
        reportType: 'IVDR Annex VIII Classification Report',
        generatedAt: new Date().toISOString(),
        regulation: 'EU 2017/746 (IVDR)',
        device: {
          name: record.device_name,
          intendedPurpose: record.intended_purpose,
          analytes: record.analytes,
        },
        classification: {
          class: record.classification,
          isCDx: record.is_cdx,
          isSelfTest: record.is_self_test,
          isNearPatient: record.is_near_patient,
        },
        ruleTrace,
        matchedRules: (ruleTrace || []).filter((r: any) => r.matched),
        regulatoryPath: getClassPath(record.classification),
        metadata: {
          recordId: record.id,
          organizationId: record.organization_id,
          createdAt: record.created_at,
        },
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="ivdr-classification-${id}.json"`);
      return res.json(report);
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CLASS_REPORT_ERROR', 'Classification report');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICAL VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ivdr/validations
   * Create a new analytical validation record
   */
  router.post('/validations', async (req: Request, res: Response) => {
    try {
      const { classificationId, deviceName, analyteName, validationType } = req.body;
      const orgId = getServerOrgId(req);

      if (!deviceName || !analyteName) {
        return res.status(400).json({ error: 'deviceName and analyteName are required' });
      }

      const result = await pool.query(
        `INSERT INTO ivdr_analytical_validations
         (classification_id, device_name, analyte_name, validation_type,
          status, organization_id, created_at)
         VALUES ($1, $2, $3, $4, 'in_progress', $5, NOW())
         RETURNING *`,
        [classificationId || null, deviceName, analyteName, validationType || 'quantitative', orgId]
      );

      return res.json({ validation: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CREATE_VALID_ERROR', 'Create validation');
    }
  });

  /**
   * GET /api/ivdr/validations
   * List all analytical validation records
   */
  router.get('/validations', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT v.*, c.classification, c.is_cdx
         FROM ivdr_analytical_validations v
         LEFT JOIN ivdr_classifications c ON v.classification_id = c.id
         WHERE v.organization_id = $1
         ORDER BY v.created_at DESC`,
        [orgId]
      );
      return res.json({ validations: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_LIST_VALID_ERROR', 'List validations');
    }
  });

  /**
   * PUT /api/ivdr/validations/:id/parameters
   * Update analytical validation parameters (LoD, LoQ, precision, etc.)
   * Append-only: creates a parameter_history entry, then updates current.
   * Now also accepts evidenceDocuments, acceptanceCriteria, and reason.
   */
  router.put('/validations/:id/parameters', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const userId = (req as any).userId || (req as any).user?.id || 'system';
      const {
        lod, // Limit of Detection
        loq, // Limit of Quantitation
        precisionCV, // Coefficient of Variation %
        withinRunCV,
        betweenRunCV,
        betweenDayCV,
        reproducibilityCV,
        interferenceStudy, // JSON: substances tested + results
        stability, // JSON: real-time, accelerated, freeze-thaw
        sensitivity, // true positive rate
        specificity, // true negative rate
        linearity, // JSON: range, r-squared
        accuracy, // bias %
        carryOver, // %
        hookEffect, // boolean / threshold
        referenceRange, // JSON: lower, upper, unit, method
        evidenceDocuments, // Array of { type, title, url, version }
        acceptanceCriteria, // { paramKey: { min?, max?, unit } }
        reason, // Change reason for audit trail
      } = req.body;

      // ── Compute real pass/fail against acceptance criteria ──────────
      const paramVals: Record<string, number | null> = {
        lod,
        loq,
        precisionCV,
        withinRunCV,
        betweenRunCV,
        betweenDayCV,
        reproducibilityCV,
        sensitivity,
        specificity,
        accuracy,
        carryOver,
      };
      const criteria = acceptanceCriteria || {};
      const passFailStatus: Record<string, string> = {};
      for (const [key, val] of Object.entries(paramVals)) {
        if (val == null) {
          passFailStatus[key] = 'pending';
          continue;
        }
        const crit = criteria[key];
        if (!crit) {
          passFailStatus[key] = 'recorded';
          continue;
        }
        const numVal = Number(val);
        let pass = true;
        if (crit.min != null && numVal < Number(crit.min)) pass = false;
        if (crit.max != null && numVal > Number(crit.max)) pass = false;
        passFailStatus[key] = pass ? 'pass' : 'fail';
      }

      // Append to parameter history (immutable audit trail)
      await pool.query(
        `INSERT INTO ivdr_validation_parameter_history
         (validation_id, parameters, updated_by, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, JSON.stringify(req.body), userId, reason || null]
      );

      // Update current parameters + new columns
      const result = await pool.query(
        `UPDATE ivdr_analytical_validations SET
           lod = COALESCE($2, lod),
           loq = COALESCE($3, loq),
           precision_cv = COALESCE($4, precision_cv),
           within_run_cv = COALESCE($5, within_run_cv),
           between_run_cv = COALESCE($6, between_run_cv),
           between_day_cv = COALESCE($7, between_day_cv),
           reproducibility_cv = COALESCE($8, reproducibility_cv),
           interference_study = COALESCE($9, interference_study),
           stability = COALESCE($10, stability),
           sensitivity = COALESCE($11, sensitivity),
           specificity = COALESCE($12, specificity),
           linearity = COALESCE($13, linearity),
           accuracy = COALESCE($14, accuracy),
           carry_over = COALESCE($15, carry_over),
           hook_effect = COALESCE($16, hook_effect),
           reference_range = COALESCE($17, reference_range),
           evidence_documents = COALESCE($18, evidence_documents),
           acceptance_criteria = COALESCE($19, acceptance_criteria),
           pass_fail_status = $20,
           updated_at = NOW()
         WHERE id = $1 AND organization_id = $21
         RETURNING *`,
        [
          id,
          lod,
          loq,
          precisionCV,
          withinRunCV,
          betweenRunCV,
          betweenDayCV,
          reproducibilityCV,
          interferenceStudy ? JSON.stringify(interferenceStudy) : null,
          stability ? JSON.stringify(stability) : null,
          sensitivity,
          specificity,
          linearity ? JSON.stringify(linearity) : null,
          accuracy,
          carryOver,
          hookEffect !== undefined ? JSON.stringify(hookEffect) : null,
          referenceRange ? JSON.stringify(referenceRange) : null,
          evidenceDocuments ? JSON.stringify(evidenceDocuments) : null,
          acceptanceCriteria ? JSON.stringify(acceptanceCriteria) : null,
          JSON.stringify(passFailStatus),
          orgId,
        ]
      );

      return res.json({ validation: result.rows[0], passFailStatus });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_UPDATE_VALID_ERROR', 'Update validation parameters');
    }
  });

  /**
   * GET /api/ivdr/validations/:id/history
   * Retrieve immutable parameter change history for audit
   */
  router.get('/validations/:id/history', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT h.* FROM ivdr_validation_parameter_history h
         INNER JOIN ivdr_analytical_validations v ON v.id = h.validation_id
         WHERE h.validation_id = $1 AND v.organization_id = $2
         ORDER BY h.created_at DESC`,
        [id, orgId]
      );
      return res.json({ history: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_VALID_HISTORY_ERROR', 'Validation history');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLINICAL EVIDENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ivdr/clinical-evidence
   * Create a new clinical evidence record
   */
  router.post('/clinical-evidence', async (req: Request, res: Response) => {
    try {
      const {
        classificationId,
        validationId,
        studyTitle,
        studyType, // 'prospective' | 'retrospective' | 'method_comparison' | 'lot_to_lot'
        registryId, // ISRCTN / ClinicalTrials.gov
        sampleSize,
        performanceClaims,
        populationDefinition,
        inclusionCriteria,
        exclusionCriteria,
        sourceDocuments,
      } = req.body;
      const orgId = getServerOrgId(req);

      if (!studyTitle || !studyType) {
        return res.status(400).json({ error: 'studyTitle and studyType are required' });
      }

      const result = await pool.query(
        `INSERT INTO ivdr_clinical_evidence
         (classification_id, validation_id, study_title, study_type,
          registry_id, sample_size, performance_claims, status,
          population_definition, inclusion_criteria, exclusion_criteria,
          source_documents, organization_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'planned', $8, $9, $10, $11, $12, NOW())
         RETURNING *`,
        [
          classificationId || null,
          validationId || null,
          studyTitle,
          studyType,
          registryId || null,
          sampleSize || null,
          performanceClaims ? JSON.stringify(performanceClaims) : null,
          populationDefinition || null,
          inclusionCriteria || null,
          exclusionCriteria || null,
          sourceDocuments ? JSON.stringify(sourceDocuments) : '[]',
          orgId,
        ]
      );

      return res.json({ evidence: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CREATE_EVID_ERROR', 'Create clinical evidence');
    }
  });

  /**
   * GET /api/ivdr/clinical-evidence
   * List all clinical evidence records
   */
  router.get('/clinical-evidence', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT e.*, c.device_name, c.classification, c.is_cdx
         FROM ivdr_clinical_evidence e
         LEFT JOIN ivdr_classifications c ON e.classification_id = c.id
         WHERE e.organization_id = $1
         ORDER BY e.created_at DESC`,
        [orgId]
      );
      return res.json({ evidence: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_LIST_EVID_ERROR', 'List clinical evidence');
    }
  });

  /**
   * PUT /api/ivdr/clinical-evidence/:id/results
   * Record 2x2 contingency table results + performance metrics + population
   */
  router.put('/clinical-evidence/:id/results', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const {
        truePositive,
        falsePositive,
        trueNegative,
        falseNegative,
        prevalence,
        performanceClaims,
        comparisonMethod,
        conclusionText,
        populationDefinition,
        inclusionCriteria,
        exclusionCriteria,
        sourceDocuments,
        reason,
      } = req.body;
      const userId = (req as any).userId || 'system';

      // Calculate derived metrics from 2x2 table
      const tp = Number(truePositive) || 0;
      const fp = Number(falsePositive) || 0;
      const tn = Number(trueNegative) || 0;
      const fn = Number(falseNegative) || 0;
      const total = tp + fp + tn + fn;

      const calculatedMetrics = {
        sensitivity: total > 0 ? tp / (tp + fn) : null,
        specificity: total > 0 ? tn / (tn + fp) : null,
        ppv: tp + fp > 0 ? tp / (tp + fp) : null, // Positive Predictive Value
        npv: tn + fn > 0 ? tn / (tn + fn) : null, // Negative Predictive Value
        accuracy: total > 0 ? (tp + tn) / total : null,
        prevalence: prevalence || (total > 0 ? (tp + fn) / total : null),
        total,
      };

      // Append to history (immutable)
      await pool.query(
        `INSERT INTO ivdr_evidence_result_history
         (evidence_id, results, updated_by, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, JSON.stringify({ ...req.body, calculatedMetrics }), userId, reason || null]
      );

      // Update current record including population + source docs
      const result = await pool.query(
        `UPDATE ivdr_clinical_evidence SET
           true_positive = $2,
           false_positive = $3,
           true_negative = $4,
           false_negative = $5,
           calculated_sensitivity = $6,
           calculated_specificity = $7,
           calculated_ppv = $8,
           calculated_npv = $9,
           calculated_accuracy = $10,
           performance_claims = COALESCE($11, performance_claims),
           comparison_method = $12,
           conclusion_text = $13,
           population_definition = COALESCE($14, population_definition),
           inclusion_criteria = COALESCE($15, inclusion_criteria),
           exclusion_criteria = COALESCE($16, exclusion_criteria),
           source_documents = COALESCE($17, source_documents),
           status = 'completed',
           updated_at = NOW()
         WHERE id = $1 AND organization_id = $18
         RETURNING *`,
        [
          id,
          tp,
          fp,
          tn,
          fn,
          calculatedMetrics.sensitivity,
          calculatedMetrics.specificity,
          calculatedMetrics.ppv,
          calculatedMetrics.npv,
          calculatedMetrics.accuracy,
          performanceClaims ? JSON.stringify(performanceClaims) : null,
          comparisonMethod || null,
          conclusionText || null,
          populationDefinition || null,
          inclusionCriteria || null,
          exclusionCriteria || null,
          sourceDocuments ? JSON.stringify(sourceDocuments) : null,
          orgId,
        ]
      );

      return res.json({
        evidence: result.rows[0],
        metrics: calculatedMetrics,
      });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_UPDATE_EVID_ERROR', 'Update evidence results');
    }
  });

  /**
   * GET /api/ivdr/clinical-evidence/:id/history
   * Retrieve immutable result change history for audit
   */
  router.get('/clinical-evidence/:id/history', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT h.* FROM ivdr_evidence_result_history h
         INNER JOIN ivdr_clinical_evidence e ON e.id = h.evidence_id
         WHERE h.evidence_id = $1 AND e.organization_id = $2
         ORDER BY h.created_at DESC`,
        [id, orgId]
      );
      return res.json({ history: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_EVID_HISTORY_ERROR', 'Evidence history');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CDx (COMPANION DIAGNOSTIC) WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ivdr/cdx-workflows
   * Create a CDx pairing record (IVD ↔ Medicinal Product)
   */
  router.post('/cdx-workflows', async (req: Request, res: Response) => {
    try {
      const {
        classificationId,
        medicinalProductName,
        activeSubstance,
        therapeuticIndication,
        biomarker,
        treatmentDecision,
        regulatoryReference,
        notifiedBodyId,
        intendedUseStatement,
        biomarkerType,
        clinicalEvidenceIds,
      } = req.body;
      const orgId = getServerOrgId(req);

      if (!medicinalProductName || !biomarker) {
        return res.status(400).json({ error: 'medicinalProductName and biomarker are required' });
      }

      const result = await pool.query(
        `INSERT INTO ivdr_cdx_workflows
         (classification_id, medicinal_product_name, active_substance,
          therapeutic_indication, biomarker, treatment_decision,
          regulatory_reference, notified_body_id, status,
          intended_use_statement, biomarker_type, clinical_evidence_ids,
          organization_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'initiation', $9, $10, $11, $12, NOW())
         RETURNING *`,
        [
          classificationId || null,
          medicinalProductName,
          activeSubstance || null,
          therapeuticIndication || null,
          biomarker,
          treatmentDecision || null,
          regulatoryReference || null,
          notifiedBodyId || null,
          intendedUseStatement || null,
          biomarkerType || null,
          clinicalEvidenceIds && clinicalEvidenceIds.length > 0 ? clinicalEvidenceIds : '{}',
          orgId,
        ]
      );

      return res.json({ workflow: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CREATE_CDX_ERROR', 'Create CDx workflow');
    }
  });

  /**
   * GET /api/ivdr/cdx-workflows
   * List all CDx workflow records
   */
  router.get('/cdx-workflows', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT w.*, c.device_name, c.classification
         FROM ivdr_cdx_workflows w
         LEFT JOIN ivdr_classifications c ON w.classification_id = c.id
         WHERE w.organization_id = $1
         ORDER BY w.created_at DESC`,
        [orgId]
      );
      return res.json({ workflows: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_LIST_CDX_ERROR', 'List CDx workflows');
    }
  });

  /**
   * PUT /api/ivdr/cdx-workflows/:id/status
   * Advance CDx workflow status (append-only with audit)
   */
  router.put('/cdx-workflows/:id/status', async (req: Request, res: Response) => {
    try {
      // Route-level permission: stage advancement requires ivdr:approve
      const perms: Set<string> = (req as any).ivdrPermissions || new Set();
      if (!perms.has('*') && !perms.has('ivdr:approve')) {
        return res.status(403).json({
          error: 'Stage advancement requires ivdr:approve permission',
          code: 'IVDR_APPROVE_DENIED',
        });
      }

      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const { status, notes } = req.body;
      const userId = (req as any).userId || 'system';

      const validStatuses = [
        'initiation',
        'analytical_validation',
        'clinical_validation',
        'notified_body_review',
        'eu_declaration',
        'post_market',
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      // Append to status history (immutable audit)
      await pool.query(
        `INSERT INTO ivdr_cdx_status_history
         (workflow_id, status, notes, updated_by, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, status, notes || null, userId]
      );

      const result = await pool.query(
        `UPDATE ivdr_cdx_workflows SET status = $2, updated_at = NOW() WHERE id = $1 AND organization_id = $3 RETURNING *`,
        [id, status, orgId]
      );

      return res.json({ workflow: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_UPDATE_CDX_ERROR', 'Update CDx status');
    }
  });

  /**
   * GET /api/ivdr/cdx-workflows/:id/history
   * Retrieve immutable status transition history for audit
   */
  router.get('/cdx-workflows/:id/history', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const orgId = getServerOrgId(req);
      const result = await pool.query(
        `SELECT h.* FROM ivdr_cdx_status_history h
         INNER JOIN ivdr_cdx_workflows w ON w.id = h.workflow_id
         WHERE h.workflow_id = $1 AND w.organization_id = $2
         ORDER BY h.created_at DESC`,
        [id, orgId]
      );
      return res.json({ history: result.rows });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CDX_HISTORY_ERROR', 'CDx history');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD / SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/ivdr/dashboard
   * Aggregated IVDR module dashboard metrics
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);

      const [classResults, validResults, evidResults, cdxResults] = await Promise.all([
        pool.query(
          `SELECT classification, COUNT(*) as count FROM ivdr_classifications WHERE organization_id = $1 GROUP BY classification`,
          [orgId]
        ),
        pool.query(
          `SELECT status, COUNT(*) as count FROM ivdr_analytical_validations WHERE organization_id = $1 GROUP BY status`,
          [orgId]
        ),
        pool.query(
          `SELECT status, COUNT(*) as count FROM ivdr_clinical_evidence WHERE organization_id = $1 GROUP BY status`,
          [orgId]
        ),
        pool.query(
          `SELECT status, COUNT(*) as count FROM ivdr_cdx_workflows WHERE organization_id = $1 GROUP BY status`,
          [orgId]
        ),
      ]);

      return res.json({
        classifications: {
          byClass: Object.fromEntries(
            classResults.rows.map((r: any) => [r.classification, Number(r.count)])
          ),
          total: classResults.rows.reduce((s: number, r: any) => s + Number(r.count), 0),
        },
        validations: {
          byStatus: Object.fromEntries(
            validResults.rows.map((r: any) => [r.status, Number(r.count)])
          ),
          total: validResults.rows.reduce((s: number, r: any) => s + Number(r.count), 0),
        },
        clinicalEvidence: {
          byStatus: Object.fromEntries(
            evidResults.rows.map((r: any) => [r.status, Number(r.count)])
          ),
          total: evidResults.rows.reduce((s: number, r: any) => s + Number(r.count), 0),
        },
        cdxWorkflows: {
          byStatus: Object.fromEntries(
            cdxResults.rows.map((r: any) => [r.status, Number(r.count)])
          ),
          total: cdxResults.rows.reduce((s: number, r: any) => s + Number(r.count), 0),
        },
      });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_DASHBOARD_ERROR', 'Dashboard');
    }
  });

  return router;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getClassPath(classification: string) {
  switch (classification) {
    case 'D':
      return {
        class: 'D',
        conformityAssessment: 'EU Reference Laboratory + Notified Body (Annex IX Chapters I & III)',
        technicalDocumentation: 'Full Annex II + Annex III',
        performanceEvaluation:
          'Required: Annex XIII Part A (scientific validity, analytical & clinical performance)',
        qualityManagement: 'Full QMS, ISO 13485 certified, Notified Body audits',
        postMarket: 'PMCF plan mandatory, PSUR every year, proactive safety updates',
        euDeclaration: 'Required, CE mark with Notified Body number',
        timeline: '18-24 months typical',
      };
    case 'C':
      return {
        class: 'C',
        conformityAssessment: 'Notified Body (Annex IX Chapters I & III or Annex X + XI)',
        technicalDocumentation: 'Full Annex II + Annex III',
        performanceEvaluation: 'Required: Annex XIII Part A',
        qualityManagement: 'Full QMS, ISO 13485 certified',
        postMarket: 'PMCF plan mandatory, PSUR every 2 years',
        euDeclaration: 'Required, CE mark with Notified Body number',
        timeline: '12-18 months typical',
      };
    case 'B':
      return {
        class: 'B',
        conformityAssessment:
          'Notified Body (Annex IX Chapter I + Annex IX Chapter III or Annex XI Part A)',
        technicalDocumentation: 'Full Annex II',
        performanceEvaluation: 'Required: Annex XIII Part A',
        qualityManagement: 'QMS, ISO 13485 recommended',
        postMarket: 'PMCF plan, PSUR every 2 years',
        euDeclaration: 'Required',
        timeline: '9-12 months typical',
      };
    default:
      return {
        class: 'A',
        conformityAssessment: 'Self-declaration (Annex IX Chapter I — manufacturer QMS only)',
        technicalDocumentation: 'Annex II (basic)',
        performanceEvaluation: 'Required: Annex XIII Part A (basic performance evaluation)',
        qualityManagement: 'QMS minimum, ISO 13485 recommended',
        postMarket: 'PMS plan, report rather than PSUR',
        euDeclaration: 'Self-declaration, CE mark without Notified Body number',
        timeline: '3-6 months typical',
      };
  }
}
