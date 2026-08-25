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
import { z } from 'zod';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';
import { createScopedLogger } from '../utils/logger.js';
import { classifyIvdrAnnexVIII } from '../services/regulatory/ivdr-classification';
import { getEntry as getKnowledgeEntry } from '../services/ivd-knowledge/knowledge.service';
import { calculateClinical2x2 } from '../../shared/ivdr/manifest';

const log = createScopedLogger('ivdr-routes');

// ─── Zod Schemas for IVDR Input Validation ───────────────────────────────────

const classifySchema = z.object({
  deviceName: z.string().min(1, 'deviceName is required'),
  intendedPurpose: z.string().min(1, 'intendedPurpose is required'),
  isSelfTest: z.boolean().optional(),
  isNearPatient: z.boolean().optional(),
  isCompanionDiagnostic: z.boolean().optional(),
  detectsTransmissibleAgent: z.boolean().optional(),
  bloodScreening: z.boolean().optional(),
  detectsCancer: z.boolean().optional(),
  prenatalScreening: z.boolean().optional(),
  riskToPatient: z.enum(['low', 'medium', 'high']).optional(),
  isGeneticTest: z.boolean().optional(),
  analytes: z.array(z.string()).default([]),
});

const validationSchema = z.object({
  deviceName: z.string().min(1),
  validationType: z.enum(['analytical', 'clinical', 'performance']),
  analyteName: z.string().min(1),
  matrixType: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

const clinicalEvidenceSchema = z.object({
  deviceName: z.string().min(1),
  evidenceType: z.enum(['performance_study', 'clinical_investigation', 'literature_review', 'post_market']),
  studyTitle: z.string().min(1),
  sampleSize: z.number().int().positive().optional(),
  sensitivity: z.number().min(0).max(100).optional(),
  specificity: z.number().min(0).max(100).optional(),
  ppv: z.number().min(0).max(100).optional(),
  npv: z.number().min(0).max(100).optional(),
});

const clinicalResultsSchema = z.object({
  truePositive: z.number().int().nonnegative(),
  falsePositive: z.number().int().nonnegative(),
  trueNegative: z.number().int().nonnegative(),
  falseNegative: z.number().int().nonnegative(),
  prevalence: z.number().min(0).max(1).optional(),
}).passthrough();

const cdxWorkflowSchema = z.object({
  deviceName: z.string().min(1),
  companionTherapy: z.string().min(1),
  biomarker: z.string().min(1),
  therapeuticArea: z.string().optional(),
  regulatoryStrategy: z.string().optional(),
});

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

  function getAuthenticatedActorId(req: Request): string | null {
    const raw = (req as any).userId ?? (req as any).user?.id;
    if (raw === undefined || raw === null) return null;
    const actorId = String(raw).trim();
    return actorId.length > 0 ? actorId : null;
  }

  /* ── Optional programme scoping ───────────────────────────────────────
     The IVD workbench names one diagnostic programme in its header but its
     classification, validation and clinical-evidence panels were reading the
     whole organisation. A user could attribute another assay's Class C
     determination, LoD or sensitivity to the device in front of them.

     `program_id` is optional so existing callers keep the portfolio-wide
     view. A malformed value is rejected rather than ignored: silently
     returning the unscoped list for a typo'd UUID is how a scoped panel
     starts showing everything again. */
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /** Sentinel distinguishing "absent" (undefined) from "present but bad". */
  const INVALID = Symbol('invalid-program-id');

  function parseProgramId(req: Request): string | undefined | typeof INVALID {
    const raw = req.query.program_id;
    if (raw === undefined || raw === '') return undefined;
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) return INVALID;
    return raw;
  }

  /**
   * Safe error response — never leaks raw error.message to client.
   * Returns 503 IVDR_NOT_PROVISIONED for missing IVDR tables (42P01).
   */
  function safeError(res: Response, error: any, code: string, label: string): Response {
    // 42P01 = undefined_table — IVDR tables not yet migrated
    if (error?.code === '42P01') {
      log.warn(`[IVDR] ${label}: table not found — denying until migrated`);
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
    log.error(`[IVDR] ${label}:`, error);
    return res.status(500).json({
      error: `${label} failed`,
      code,
    });
  }

  /* ivdr_gspr_assessments used to be created HERE, lazily, on the request
     pool — runtime DDL the non-superuser runtime role must refuse, and a
     second source of truth for the table's shape. The D11d IVDR consolidation
     moved the one definition to migrations/20260813c_ivdr_schema_
     reconciliation.sql (on the durable deploy path). An unmigrated database
     now fails closed: 42P01 → 503 IVDR_NOT_PROVISIONED via safeError. */

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

      const parsed = classifySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
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
        analytes,
      } = parsed.data;

      // Org from authenticated session — NEVER from req.body
      const orgId = getServerOrgId(req);

      // ── Annex VIII Rule Engine (server/services/regulatory/ivdr-classification.ts) ──
      const classification = classifyIvdrAnnexVIII({
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
        analytes,
      });
      const classResult = classification.classification;
      const ruleTrace = classification.ruleTrace;

      // Persist classification result — CANONICAL columns only (D11d IVDR
      // consolidation): ivdr_class / companion_diagnostic / self_test /
      // near_patient_test are the one vocabulary; the legacy shape-1 names
      // (classification / is_cdx / ...) are deprecated and unwritten.
      const insertResult = await pool.query(
        `INSERT INTO ivdr_classifications
         (device_name, intended_purpose, ivdr_class, companion_diagnostic,
          self_test, near_patient_test, notified_body_required, rule_trace,
          analytes, organization_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          deviceName,
          intendedPurpose,
          classResult,
          isCompanionDiagnostic || false,
          isSelfTest || false,
          isNearPatient || false,
          classification.notifiedBodyRequired,
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
        notifiedBodyRequired: classification.notifiedBodyRequired,
        // Citable knowledge-base entries justifying the classification.
        knowledge: classification.knowledgeRefs
          .map(id => {
            const e = getKnowledgeEntry(id);
            return e ? { id: e.id, title: e.title, summary: e.summary, citations: e.citations } : null;
          })
          .filter(Boolean),
      });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_CLASSIFY_ERROR', 'Classification');
    }
  });

  /* GET /classifications was DELETED in the D11d IVDR consolidation: it was a
     second list API over the same store as GET /api/mdx/ivdr/classifications,
     reading the deprecated shape-1 column names. The mdx router is the ONE
     classification list/CRUD API (canonical columns, program_id + ivdr_class
     filters, soft-delete aware); the client hook useIvdClassifications now
     calls it. This router keeps what is unique to the IVDR module: the Annex
     VIII rule engine (POST /classify), the governed report export, and the
     validation / clinical-evidence / CDx / GSPR lifecycles. */

  /**
   * GET /api/ivdr/classify/:id/report
   * Download full classification report artifact (JSON) for technical file
   */
  router.get('/classify/:id/report', async (req: Request, res: Response) => {
    try {
      const { id } = req.params as { id: string };
      const orgId = getServerOrgId(req);
      /* Canonical columns (D11d consolidation) — the report's OUTPUT keys are
         unchanged; only the source vocabulary converged. */
      const result = await pool.query(
        `SELECT id, device_name, intended_purpose, ivdr_class, companion_diagnostic, self_test, near_patient_test, rule_trace, analytes, organization_id, created_at FROM ivdr_classifications WHERE id = $1 AND organization_id = $2`,
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
          class: record.ivdr_class,
          isCDx: record.companion_diagnostic,
          isSelfTest: record.self_test,
          isNearPatient: record.near_patient_test,
        },
        ruleTrace,
        matchedRules: (ruleTrace || []).filter((r: any) => r.matched),
        regulatoryPath: getClassPath(record.ivdr_class),
        metadata: {
          recordId: record.id,
          organizationId: record.organization_id,
          createdAt: record.created_at,
        },
      };
      res.setHeader('Content-Type', 'application/json');
      const safeId = String(id).replace(/[^a-zA-Z0-9\-_]/g, '');
      res.setHeader('Content-Disposition', `attachment; filename="ivdr-classification-${safeId}.json"`);

      // Register governed export (fail-closed for governed flows)
      const user = (req as any).user;
      if (!user?.id) {
        return res.status(401).json({ error: 'Authenticated user context required' });
      }
      await registerExportGovernanceQuick({
        organizationId: Number(user?.organizationId || orgId),
        projectId: 0,
        userId: Number(user.id),
        userName: user?.name || user?.email || 'unknown',
        title: `IVDR Classification Report: ${record.device_name}`,
        exportFormat: 'zip', // JSON report mapped to zip for governance
        exportFilename: `ivdr-classification-${safeId}.json`,
        exportFileSize: Buffer.byteLength(JSON.stringify(report), 'utf-8'),
        docType: 'ivdr_classification_report',
        backendRoute: `/api/ivdr/classify/${id}/report`,
        ipAddress: req.ip,
      });

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
      const parsed = validationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }
      const { deviceName, analyteName, validationType, matrixType, parameters } = parsed.data;
      const classificationId = req.body.classificationId || null;
      const orgId = getServerOrgId(req);

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
      const programId = parseProgramId(req);
      if (programId === INVALID) return res.status(422).json({ error: 'program_id must be a UUID' });

      /* Validations reach a programme through their classification. The join
         stays LEFT so an unclassified validation is still visible in the
         portfolio view; adding the programme predicate necessarily excludes
         those rows when scoping, which is correct — a validation with no
         classification cannot be claimed for a programme. */
      /* Joined columns come from the CANONICAL names (D11d consolidation);
         the response keys keep their historical spelling via aliases so the
         API contract is unchanged. */
      const scoped = programId !== undefined;
      const result = await pool.query(
        `SELECT v.*, c.ivdr_class AS classification, c.companion_diagnostic AS is_cdx
         FROM ivdr_analytical_validations v
         LEFT JOIN ivdr_classifications c ON v.classification_id = c.id
         WHERE v.organization_id = $1${scoped ? ' AND c.program_id = $2' : ''}
         ORDER BY v.created_at DESC`,
        scoped ? [orgId, programId] : [orgId]
      );
      return res.json({
        validations: result.rows,
        meta: { scope: scoped ? 'program' : 'organization' },
      });
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
      const { id } = req.params as { id: string };
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
      const { id } = req.params as { id: string };
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
      const parsed = clinicalEvidenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }
      // Extract additional fields not in schema but used by the insert
      const {
        classificationId,
        validationId,
        registryId,
        performanceClaims,
        populationDefinition,
        inclusionCriteria,
        exclusionCriteria,
        sourceDocuments,
      } = req.body;
      const { studyTitle, sampleSize } = parsed.data;
      const studyType = parsed.data.evidenceType;
      const orgId = getServerOrgId(req);

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
      const programId = parseProgramId(req);
      if (programId === INVALID) return res.status(422).json({ error: 'program_id must be a UUID' });

      /* Same reachability as validations: clinical evidence belongs to a
         programme via its classification. Sensitivity and specificity are
         exactly the numbers a user must not read off the wrong assay. */
      const scoped = programId !== undefined;
      const result = await pool.query(
        `SELECT e.*, c.device_name, c.ivdr_class AS classification, c.companion_diagnostic AS is_cdx
         FROM ivdr_clinical_evidence e
         LEFT JOIN ivdr_classifications c ON e.classification_id = c.id
         WHERE e.organization_id = $1${scoped ? ' AND c.program_id = $2' : ''}
         ORDER BY e.created_at DESC`,
        scoped ? [orgId, programId] : [orgId]
      );
      return res.json({
        evidence: result.rows,
        meta: { scope: scoped ? 'program' : 'organization' },
      });
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
      const { id } = req.params as { id: string };
      const orgId = getServerOrgId(req);
      const parsed = clinicalResultsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ error: 'Invalid diagnostic counts', details: parsed.error.issues });
      }
      const {
        performanceClaims,
        comparisonMethod,
        conclusionText,
        populationDefinition,
        inclusionCriteria,
        exclusionCriteria,
        sourceDocuments,
        reason,
      } = req.body;
      const { truePositive, falsePositive, trueNegative, falseNegative } = parsed.data;
      const userId = getAuthenticatedActorId(req);
      if (!userId) {
        return res.status(403).json({ error: 'An authenticated actor is required for clinical evidence changes' });
      }

      const tp = truePositive;
      const fp = falsePositive;
      const tn = trueNegative;
      const fn = falseNegative;
      const calculatedMetrics = calculateClinical2x2({ tp, fp, tn, fn });

      // Update + immutable history are one statement: a missing/foreign row
      // cannot create orphan history, and either both effects commit or neither.
      const result = await pool.query(
        `WITH updated AS (
         UPDATE ivdr_clinical_evidence SET
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
         RETURNING *
       ), history AS (
         INSERT INTO ivdr_evidence_result_history
           (evidence_id, results, updated_by, reason, created_at)
         SELECT id, $19, $20, $21, NOW() FROM updated
         RETURNING evidence_id
       )
       SELECT updated.* FROM updated
       INNER JOIN history ON history.evidence_id = updated.id`,
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
          JSON.stringify({ ...req.body, calculatedMetrics }),
          userId,
          reason || null,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Clinical evidence was not found' });
      }

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
      const { id } = req.params as { id: string };
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
      const parsed = cdxWorkflowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      }
      // Map schema fields + extract additional body fields for DB insert
      const medicinalProductName = parsed.data.companionTherapy;
      const biomarker = parsed.data.biomarker;
      const {
        classificationId,
        activeSubstance,
        therapeuticIndication,
        treatmentDecision,
        regulatoryReference,
        notifiedBodyId,
        intendedUseStatement,
        biomarkerType,
        clinicalEvidenceIds,
      } = req.body;
      const orgId = getServerOrgId(req);

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
        `SELECT w.*, c.device_name, c.ivdr_class AS classification
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

      const { id } = req.params as { id: string };
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
      const { id } = req.params as { id: string };
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
          `SELECT ivdr_class AS classification, COUNT(*) as count FROM ivdr_classifications WHERE organization_id = $1 GROUP BY ivdr_class`,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // GSPR (General Safety and Performance Requirements) CHECKLIST — Annex I
  // ═══════════════════════════════════════════════════════════════════════════

  const GSPR_REQUIREMENTS = [
    // Chapter I: General requirements (GSPRs 1–9)
    { id: 'gspr-1', chapter: 'I', number: 1, title: 'Safety and performance in normal conditions', description: 'Devices shall achieve the performance intended by their manufacturer and shall be designed and manufactured in such a way that, during normal conditions of use, they are suitable for their intended purpose.' },
    { id: 'gspr-2', chapter: 'I', number: 2, title: 'Risk management', description: 'The requirement to reduce risks as far as possible means the reduction of risks as far as possible without adversely affecting the benefit-risk ratio.' },
    { id: 'gspr-3', chapter: 'I', number: 3, title: 'Risk control measures', description: 'Manufacturers shall establish, implement, document, and maintain a risk management system. Risk control measures adopted shall be such that residual risk and undesirable side-effects are acceptable.' },
    { id: 'gspr-4', chapter: 'I', number: 4, title: 'Benefit-risk determination', description: 'Devices shall be designed and manufactured in such a way that the risks associated are reduced as far as possible and acceptable when weighed against the evaluated benefits to the patient and/or user.' },
    { id: 'gspr-5', chapter: 'I', number: 5, title: 'Performance evaluation', description: 'Devices shall achieve the performance claimed by the manufacturer and designed so that they are suitable for the intended purpose. Scientific validity, analytical performance, and clinical performance shall be confirmed.' },
    { id: 'gspr-6', chapter: 'I', number: 6, title: 'Known and foreseeable risks and undesirable effects', description: 'The known and foreseeable risks and any undesirable effects shall be minimized and acceptable when weighed against the evaluated benefits.' },
    { id: 'gspr-7', chapter: 'I', number: 7, title: 'Device suitable for intended users', description: 'Devices shall be suitable for the intended users, taking account of their technical knowledge, experience, education, training, and use environment.' },
    { id: 'gspr-8', chapter: 'I', number: 8, title: 'Device lifetime considerations', description: 'The characteristics and performance of a device shall not be adversely affected during transport and storage, including changes in temperature and humidity.' },
    { id: 'gspr-9', chapter: 'I', number: 9, title: 'Devices for non-medical purposes', description: 'Devices listed in Annex XVI that are without an intended medical purpose shall fulfil the general safety and performance requirements.' },
    // Chapter II: Requirements regarding performance, design and manufacture (GSPRs 10–18)
    { id: 'gspr-10', chapter: 'II', number: 10, title: 'Chemical, physical and biological properties', description: 'Devices shall be designed and manufactured to ensure that the characteristics and performance requirements are fulfilled regarding chemical, physical, and biological properties.' },
    { id: 'gspr-11', chapter: 'II', number: 11, title: 'Infection and microbial contamination', description: 'Devices and their manufacturing processes shall be designed to eliminate or reduce infection risk to patients, users, and third persons. The design shall allow easy and safe handling.' },
    { id: 'gspr-12', chapter: 'II', number: 12, title: 'Devices incorporating substances considered to be medicinal products', description: 'Where a device incorporates a substance which, if used separately, may be considered to be a medicinal product, the quality, safety and usefulness of the substance shall be verified.' },
    { id: 'gspr-13', chapter: 'II', number: 13, title: 'Devices composed of substances or combinations of substances that are absorbed by or locally dispersed in the human body', description: 'Devices composed of substances intended to be introduced into the human body shall comply with relevant requirements for medicinal products.' },
    { id: 'gspr-14', chapter: 'II', number: 14, title: 'Devices incorporating materials of biological origin', description: 'Devices utilising tissues, cells, and substances of animal or human origin shall be sourced and processed to ensure safety and shall meet requirements for risk minimisation.' },
    { id: 'gspr-15', chapter: 'II', number: 15, title: 'Construction of devices and interaction with their environment', description: 'Devices shall be designed and manufactured in such a way as to reduce risks linked to their physical features, including ergonomic aspects and the environment of use.' },
    { id: 'gspr-16', chapter: 'II', number: 16, title: 'Devices with diagnostic or measuring function', description: 'Diagnostic devices and devices with a measuring function shall be designed and manufactured to provide sufficient accuracy, precision, and stability for their intended purpose.' },
    { id: 'gspr-17', chapter: 'II', number: 17, title: 'Protection against radiation', description: 'Devices shall be designed and manufactured to reduce exposure of patients, users, and other persons to radiation as far as possible while not restricting application of appropriate levels for treatment and diagnosis.' },
    { id: 'gspr-18', chapter: 'II', number: 18, title: 'Electronic programmable systems and software', description: 'Devices that incorporate electronic programmable systems, including software, or software that are devices in themselves, shall be designed to ensure repeatability, reliability, and performance in line with their intended use.' },
    // Chapter III: Requirements regarding the information supplied with the device (GSPRs 19–23)
    { id: 'gspr-19', chapter: 'III', number: 19, title: 'Label and instructions for use — general requirements', description: 'Each device shall be accompanied by the information needed to identify the device and its manufacturer, and by relevant safety and performance information for user and patient.' },
    { id: 'gspr-20', chapter: 'III', number: 20, title: 'Label', description: 'The label shall bear the information laid down in this section. The information shall be provided on the device itself; if not practicable, on the packaging for each unit or the packaging of multiple devices.' },
    { id: 'gspr-21', chapter: 'III', number: 21, title: 'Information on the packaging (sales packaging)', description: 'The sterile packaging and sales packaging shall bear the information set out in this section, including trade name, manufacturer, description, lot/serial number, storage conditions, and warnings.' },
    { id: 'gspr-22', chapter: 'III', number: 22, title: 'Instructions for use', description: 'Each device shall be accompanied by instructions for use. By way of exception, instructions for use shall not be required for Class A and Class B devices if they can be used safely without such instructions.' },
    { id: 'gspr-23', chapter: 'III', number: 23, title: 'EU declaration of conformity', description: 'The EU declaration of conformity shall state the manufacturer details, product identification, applicable directives, standards, and that the device conforms to the applicable requirements of this Regulation.' },
  ];

  /**
   * POST /api/ivdr/gspr-checklist
   * Create a GSPR assessment for a project. Initializes all Annex I requirements.
   */
  router.post('/gspr-checklist', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId, deviceName, classification } = req.body;
      const userId = (req as any).userId || 'system';

      if (!projectId || !deviceName) {
        return res.status(400).json({ error: 'projectId and deviceName are required' });
      }

      // Check for existing assessment
      const existing = await pool.query(
        `SELECT id FROM ivdr_gspr_assessments WHERE project_id = $1 AND organization_id = $2`,
        [projectId, orgId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'GSPR assessment already exists for this project',
          code: 'IVDR_GSPR_EXISTS',
          existingId: existing.rows[0].id,
        });
      }

      // Initialize all requirements with default status
      const requirements = GSPR_REQUIREMENTS.map((r) => ({
        ...r,
        applicable: true,
        status: 'not_assessed',
        evidenceLinks: [],
        notes: '',
      }));

      const result = await pool.query(
        `INSERT INTO ivdr_gspr_assessments
         (organization_id, project_id, device_name, classification, requirements, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [orgId, projectId, deviceName, classification || null, JSON.stringify(requirements), userId]
      );

      return res.status(201).json({ assessment: result.rows[0] });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_GSPR_CREATE_ERROR', 'Create GSPR checklist');
    }
  });

  /**
   * GET /api/ivdr/gspr-checklist/:projectId
   * Get GSPR checklist with compliance status for a project
   */
  router.get('/gspr-checklist/:projectId', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId } = req.params;

      const result = await pool.query(
        `SELECT * FROM ivdr_gspr_assessments WHERE project_id = $1 AND organization_id = $2`,
        [projectId, orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No GSPR assessment found for this project', code: 'IVDR_GSPR_NOT_FOUND' });
      }

      const assessment = result.rows[0];
      const requirements = assessment.requirements || [];

      // Compute compliance summary
      const summary = {
        total: requirements.length,
        compliant: requirements.filter((r: any) => r.status === 'compliant').length,
        partiallyCompliant: requirements.filter((r: any) => r.status === 'partially_compliant').length,
        nonCompliant: requirements.filter((r: any) => r.status === 'non_compliant').length,
        notAssessed: requirements.filter((r: any) => r.status === 'not_assessed').length,
        notApplicable: requirements.filter((r: any) => r.status === 'not_applicable').length,
      };

      return res.json({ assessment, complianceSummary: summary });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_GSPR_GET_ERROR', 'Get GSPR checklist');
    }
  });

  /**
   * PUT /api/ivdr/gspr-checklist/:projectId/requirements/:reqId
   * Update a single GSPR requirement's status and evidence links
   */
  router.put('/gspr-checklist/:projectId/requirements/:reqId', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId, reqId } = req.params;
      const { status, applicable, evidenceLinks, notes } = req.body;
      const userId = (req as any).userId || 'system';

      const validStatuses = ['not_assessed', 'compliant', 'partially_compliant', 'non_compliant', 'not_applicable'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const result = await pool.query(
        `SELECT * FROM ivdr_gspr_assessments WHERE project_id = $1 AND organization_id = $2`,
        [projectId, orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No GSPR assessment found for this project', code: 'IVDR_GSPR_NOT_FOUND' });
      }

      const assessment = result.rows[0];
      const requirements = assessment.requirements || [];
      const reqIndex = requirements.findIndex((r: any) => r.id === reqId);

      if (reqIndex === -1) {
        return res.status(404).json({ error: `Requirement ${reqId} not found`, code: 'IVDR_GSPR_REQ_NOT_FOUND' });
      }

      // Update fields if provided
      if (status !== undefined) requirements[reqIndex].status = status;
      if (applicable !== undefined) requirements[reqIndex].applicable = applicable;
      if (evidenceLinks !== undefined) requirements[reqIndex].evidenceLinks = evidenceLinks;
      if (notes !== undefined) requirements[reqIndex].notes = notes;

      // Append-only audit: record the change
      if (!requirements[reqIndex].auditTrail) {
        requirements[reqIndex].auditTrail = [];
      }
      requirements[reqIndex].auditTrail.push({
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
        changes: { status, applicable, evidenceLinks, notes },
      });

      await pool.query(
        `UPDATE ivdr_gspr_assessments SET requirements = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [JSON.stringify(requirements), assessment.id, orgId]
      );

      return res.json({ requirement: requirements[reqIndex] });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_GSPR_UPDATE_ERROR', 'Update GSPR requirement');
    }
  });

  /**
   * GET /api/ivdr/gspr-checklist/:projectId/matrix
   * Get compliance matrix summary grouped by chapter
   */
  router.get('/gspr-checklist/:projectId/matrix', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId } = req.params;

      const result = await pool.query(
        `SELECT * FROM ivdr_gspr_assessments WHERE project_id = $1 AND organization_id = $2`,
        [projectId, orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No GSPR assessment found for this project', code: 'IVDR_GSPR_NOT_FOUND' });
      }

      const assessment = result.rows[0];
      const requirements = assessment.requirements || [];

      // Group by chapter
      const chapters: Record<string, any> = {
        I: { title: 'Chapter I: General requirements (GSPRs 1-9)', requirements: [], summary: {} },
        II: { title: 'Chapter II: Requirements regarding performance, design and manufacture (GSPRs 10-18)', requirements: [], summary: {} },
        III: { title: 'Chapter III: Requirements regarding the information supplied with the device (GSPRs 19-23)', requirements: [], summary: {} },
      };

      for (const req of requirements) {
        if (chapters[req.chapter]) {
          chapters[req.chapter].requirements.push({
            id: req.id,
            number: req.number,
            title: req.title,
            status: req.status,
            applicable: req.applicable,
            hasEvidence: (req.evidenceLinks || []).length > 0,
          });
        }
      }

      // Compute per-chapter summaries
      for (const key of Object.keys(chapters)) {
        const reqs = chapters[key].requirements;
        chapters[key].summary = {
          total: reqs.length,
          compliant: reqs.filter((r: any) => r.status === 'compliant').length,
          partiallyCompliant: reqs.filter((r: any) => r.status === 'partially_compliant').length,
          nonCompliant: reqs.filter((r: any) => r.status === 'non_compliant').length,
          notAssessed: reqs.filter((r: any) => r.status === 'not_assessed').length,
          notApplicable: reqs.filter((r: any) => r.status === 'not_applicable').length,
        };
      }

      // Overall compliance percentage (excluding not_applicable)
      const applicableReqs = requirements.filter((r: any) => r.status !== 'not_applicable');
      const compliantCount = applicableReqs.filter((r: any) => r.status === 'compliant').length;
      const overallCompliance = applicableReqs.length > 0
        ? Math.round((compliantCount / applicableReqs.length) * 100)
        : 0;

      return res.json({
        projectId,
        deviceName: assessment.device_name,
        classification: assessment.classification,
        overallCompliancePercent: overallCompliance,
        chapters,
      });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_GSPR_MATRIX_ERROR', 'GSPR compliance matrix');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBMISSION PACKAGE EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  // In-memory store for submission package generation status (with TTL cleanup)
  //
  // TODO(phase-2): move job tracking to a durable store. The binder build
  // queue (ivdr_pack_build_jobs) is NOT a clean fit: ivdr-pack-worker claims
  // any QUEUED row via FOR UPDATE SKIP LOCKED with no pack_type filter and
  // runs a binder pack build on it, so parking submission-package jobs there
  // would hand them to the wrong worker. Until the Phase-2 rebuild lands,
  // jobs are lost on process restart and every response declares
  // jobDurability: 'ephemeral' so callers cannot mistake this for a queue.
  const submissionJobs: Record<string, { status: string; startedAt: string; completedAt?: string; manifest?: any; error?: string }> = {};

  // Periodically clean up completed/failed jobs older than 1 hour
  const JOB_TTL_MS = 60 * 60 * 1000;
  setInterval(() => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const key of Object.keys(submissionJobs)) {
      const job = submissionJobs[key];
      if (job.completedAt && new Date(job.completedAt).getTime() < cutoff) {
        delete submissionJobs[key];
      } else if (!job.completedAt && new Date(job.startedAt).getTime() < cutoff) {
        delete submissionJobs[key]; // Stale in-progress job
      }
    }
  }, 10 * 60 * 1000).unref(); // Every 10 minutes, unref so it doesn't keep process alive

  /**
   * POST /api/ivdr/submission-package/:projectId
   * Generate a submission package gathering the project's IVDR data.
   *
   * :projectId is the regulatory programme UUID. Classifications carry it
   * directly (program_id — canonical shape, guaranteed on every path by
   * 20260813c_ivdr_schema_reconciliation.sql); validations, clinical evidence
   * and CDx workflows reach it through their classification, mirroring the
   * scoped list endpoints above. Rows with no programme assignment (legacy
   * shape-1 data) are excluded and counted — never silently attributed to the
   * requested project.
   */
  router.post('/submission-package/:projectId', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId } = req.params as { projectId: string };
      const userId = (req as any).userId || 'system';
      const jobKey = `${orgId}-${projectId}`;

      /* A malformed project id is rejected rather than ignored — silently
         falling back to an org-wide gather is exactly the defect this
         endpoint had (every project's data in every project's package). */
      if (!UUID_RE.test(projectId)) {
        return res.status(422).json({
          error: 'projectId must be a regulatory programme UUID',
          code: 'IVDR_SUBMISSION_BAD_PROJECT',
        });
      }

      /* Fail closed on ownership: the programme must exist in this
         organisation before anything is gathered (same convention as
         ownsProgram in mdx-ivdr.ts). A cross-tenant probe gets 404 —
         never data, and never a 403 that confirms the project exists. */
      const ownership = await pool.query(
        `SELECT 1 FROM regulatory_programs
          WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          LIMIT 1`,
        [projectId, orgId]
      );
      if (ownership.rows.length === 0) {
        return res.status(404).json({
          error: 'Project not found in this organization',
          code: 'IVDR_SUBMISSION_PROJECT_NOT_FOUND',
        });
      }

      // Mark job as in-progress (ephemeral — see TODO(phase-2) at the Map)
      submissionJobs[jobKey] = { status: 'generating', startedAt: new Date().toISOString() };

      // Gather the project's IVDR data in parallel
      const [classifications, validations, evidence, cdxWorkflows, gsprAssessment, unassignedResult] = await Promise.all([
        pool.query(
          `SELECT * FROM ivdr_classifications
            WHERE organization_id = $1 AND program_id = $2
            ORDER BY created_at DESC`,
          [orgId, projectId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT v.* FROM ivdr_analytical_validations v
            LEFT JOIN ivdr_classifications c ON v.classification_id = c.id
            WHERE v.organization_id = $1 AND c.program_id = $2
            ORDER BY v.created_at DESC`,
          [orgId, projectId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT e.* FROM ivdr_clinical_evidence e
            LEFT JOIN ivdr_classifications c ON e.classification_id = c.id
            WHERE e.organization_id = $1 AND c.program_id = $2
            ORDER BY e.created_at DESC`,
          [orgId, projectId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT w.* FROM ivdr_cdx_workflows w
            LEFT JOIN ivdr_classifications c ON w.classification_id = c.id
            WHERE w.organization_id = $1 AND c.program_id = $2
            ORDER BY w.created_at DESC`,
          [orgId, projectId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT * FROM ivdr_gspr_assessments WHERE project_id = $1 AND organization_id = $2`,
          [projectId, orgId]
        ).catch(() => ({ rows: [] })),
        /* Rows this organisation owns that cannot be attributed to ANY
           programme — no classification link, or a classification whose
           program_id is NULL (the legacy 001-shape). They are excluded from
           every project's package; count them so the exclusion is visible,
           not silent. */
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM ivdr_classifications
               WHERE organization_id = $1 AND program_id IS NULL) AS classifications,
             (SELECT COUNT(*)::int FROM ivdr_analytical_validations v
               LEFT JOIN ivdr_classifications c ON v.classification_id = c.id
               WHERE v.organization_id = $1 AND c.program_id IS NULL) AS validations,
             (SELECT COUNT(*)::int FROM ivdr_clinical_evidence e
               LEFT JOIN ivdr_classifications c ON e.classification_id = c.id
               WHERE e.organization_id = $1 AND c.program_id IS NULL) AS evidence,
             (SELECT COUNT(*)::int FROM ivdr_cdx_workflows w
               LEFT JOIN ivdr_classifications c ON w.classification_id = c.id
               WHERE w.organization_id = $1 AND c.program_id IS NULL) AS cdx`,
          [orgId]
        ).catch(() => null),
      ]);

      /* Honest empty state: null means the counts could not be computed
         (e.g. table missing), NOT that nothing was excluded. */
      const unassignedRow = unassignedResult?.rows?.[0] ?? null;
      const unassigned = unassignedRow
        ? {
            classifications: Number(unassignedRow.classifications) || 0,
            analyticalValidations: Number(unassignedRow.validations) || 0,
            clinicalEvidence: Number(unassignedRow.evidence) || 0,
            companionDiagnostics: Number(unassignedRow.cdx) || 0,
          }
        : null;
      const unassignedTotal = unassigned
        ? unassigned.classifications +
          unassigned.analyticalValidations +
          unassigned.clinicalEvidence +
          unassigned.companionDiagnostics
        : null;

      // Build the structured manifest
      const manifest = {
        meta: {
          packageVersion: '1.0.0',
          generatedAt: new Date().toISOString(),
          generatedBy: userId,
          projectId,
          organizationId: orgId,
          regulatoryFramework: 'IVDR EU 2017/746',
          scope: 'project',
        },
        sections: {
          classification: {
            count: classifications.rows.length,
            records: classifications.rows,
          },
          analyticalValidation: {
            count: validations.rows.length,
            records: validations.rows,
          },
          clinicalEvidence: {
            count: evidence.rows.length,
            records: evidence.rows,
          },
          companionDiagnostics: {
            count: cdxWorkflows.rows.length,
            records: cdxWorkflows.rows,
          },
          gsprChecklist: {
            available: gsprAssessment.rows.length > 0,
            assessment: gsprAssessment.rows[0] || null,
          },
        },
        exclusions: {
          unassignedRecordsExcluded: unassignedTotal,
          bySection: unassigned,
          message:
            unassignedTotal === null
              ? 'Unassigned-record counts unavailable'
              : `${unassignedTotal} unassigned records excluded (no program assignment)`,
        },
        completeness: {
          hasClassification: classifications.rows.length > 0,
          hasValidation: validations.rows.length > 0,
          hasClinicalEvidence: evidence.rows.length > 0,
          hasGSPR: gsprAssessment.rows.length > 0,
          sectionsComplete: [
            classifications.rows.length > 0,
            validations.rows.length > 0,
            evidence.rows.length > 0,
            gsprAssessment.rows.length > 0,
          ].filter(Boolean).length,
          totalSections: 4,
        },
      };

      submissionJobs[jobKey] = {
        status: 'completed',
        startedAt: submissionJobs[jobKey].startedAt,
        completedAt: new Date().toISOString(),
        manifest,
      };

      return res.status(201).json({
        status: 'completed',
        projectId,
        jobDurability: 'ephemeral',
        unassignedRecordsExcluded: unassignedTotal,
        manifest,
      });
    } catch (error: any) {
      const orgId = (() => { try { return getServerOrgId(req); } catch { return 'unknown'; } })();
      const jobKey = `${orgId}-${req.params.projectId}`;
      submissionJobs[jobKey] = {
        status: 'failed',
        startedAt: submissionJobs[jobKey]?.startedAt || new Date().toISOString(),
        error: 'Package generation failed',
      };
      return safeError(res, error, 'IVDR_SUBMISSION_PKG_ERROR', 'Generate submission package');
    }
  });

  /**
   * GET /api/ivdr/submission-package/:projectId/status
   * Check generation status of a submission package
   */
  router.get('/submission-package/:projectId/status', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId } = req.params;
      const jobKey = `${orgId}-${projectId}`;

      const job = submissionJobs[jobKey];
      if (!job) {
        /* Jobs live in process memory only (see TODO(phase-2) at the Map):
           a restart forgets them, so "not found" may mean "lost". Declare
           the durability so callers can tell the two apart. */
        return res.status(404).json({
          error: 'No submission package job found for this project',
          code: 'IVDR_SUBMISSION_NOT_FOUND',
          jobDurability: 'ephemeral',
        });
      }

      return res.json({
        projectId,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt || null,
        hasManifest: !!job.manifest,
        error: job.error || null,
        jobDurability: 'ephemeral',
      });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_SUBMISSION_STATUS_ERROR', 'Submission package status');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EUDAMED DATA EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/ivdr/eudamed-export/:projectId
   * Export EUDAMED-compatible device registration data
   */
  router.get('/eudamed-export/:projectId', async (req: Request, res: Response) => {
    try {
      const orgId = getServerOrgId(req);
      const { projectId } = req.params;

      // Gather classification and GSPR data
      const [classResult, gsprResult, cdxResult, evidenceResult] = await Promise.all([
        pool.query(
          `SELECT * FROM ivdr_classifications WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [orgId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT * FROM ivdr_gspr_assessments WHERE project_id = $1 AND organization_id = $2`,
          [projectId, orgId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT * FROM ivdr_cdx_workflows WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [orgId]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as completed FROM ivdr_clinical_evidence WHERE organization_id = $1`,
          [orgId]
        ).catch(() => ({ rows: [{ total: 0, completed: 0 }] })),
      ]);

      const classification = classResult.rows[0] || null;
      const gspr = gsprResult.rows[0] || null;
      const cdx = cdxResult.rows[0] || null;
      const evidenceSummary = evidenceResult.rows[0] || { total: 0, completed: 0 };

      // Compute GSPR compliance stats if available
      let gsprCompliancePercent = 0;
      if (gspr && gspr.requirements) {
        const reqs = gspr.requirements;
        const applicable = reqs.filter((r: any) => r.status !== 'not_applicable');
        const compliant = applicable.filter((r: any) => r.status === 'compliant');
        gsprCompliancePercent = applicable.length > 0
          ? Math.round((compliant.length / applicable.length) * 100)
          : 0;
      }

      // Build EUDAMED-compatible export
      const eudamedExport = {
        exportVersion: '1.0.0',
        exportDate: new Date().toISOString(),
        regulatoryFramework: 'IVDR EU 2017/746',
        deviceIdentification: {
          // UDI-DI / Basic UDI-DI / manufacturer SRN are issued by GS1/HIBCC/EUDAMED
          // and must not be synthesized from internal IDs. No stored registration
          // record exists for this org/project, so they are reported as null
          // (identifiers not yet issued/recorded).
          basicUdiDi: null,
          udiDi: null,
          deviceName: classification?.device_name || gspr?.device_name || 'Unknown Device',
          tradeName: classification?.device_name || gspr?.device_name || null,
          manufacturerSRN: null,
        },
        manufacturer: {
          organizationId: orgId,
          role: 'manufacturer',
          registrationStatus: 'not_registered',
        },
        classification: {
          riskClass: classification?.ivdr_class || 'Not classified',
          classificationRule: classification?.rule_trace ? 'Annex VIII' : null,
          ruleTrace: classification?.rule_trace || [],
          intendedPurpose: classification?.intended_purpose || null,
        },
        riskClass: classification?.ivdr_class || 'Not classified',
        companionDiagnostic: {
          isCDx: cdx ? true : false,
          linkedMedicinalProduct: cdx?.therapeutic_area || null,
          cdxStatus: cdx?.status || null,
        },
        certificates: {
          euDeclarationOfConformity: classification?.ivdr_class === 'A' ? 'self-declaration' : 'notified_body_required',
          notifiedBodyRequired: classification?.ivdr_class !== 'A',
          // No certificate record is tracked here; do not fabricate a status.
          certificateStatus: null,
        },
        clinicalEvidence: {
          totalStudies: Number(evidenceSummary.total) || 0,
          completedStudies: Number(evidenceSummary.completed) || 0,
          performanceEvaluationAvailable: Number(evidenceSummary.total) > 0,
        },
        gsprCompliance: {
          assessmentAvailable: !!gspr,
          compliancePercent: gsprCompliancePercent,
          totalRequirements: gspr ? gspr.requirements.length : 23,
        },
        postMarketSurveillance: {
          pmsPlanRequired: true,
          psurFrequency: classification?.ivdr_class === 'D' || classification?.ivdr_class === 'C' ? 'annual' : 'biennial',
          vigilanceSystem: 'required',
        },
      };

      return res.json({ eudamedExport });
    } catch (error: any) {
      return safeError(res, error, 'IVDR_EUDAMED_EXPORT_ERROR', 'EUDAMED data export');
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
