import express from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { getPool } from '../../db';
import {
  writeThroughDrugSubstance,
  writeThroughDrugProduct,
  writeThroughAnalyticalMethod,
  writeThroughQcTesting,
  writeThroughStabilityStudy,
  writeThroughProcessValidation,
  writeThroughChangeControl,
  writeThroughComparability,
  writeThroughContainerClosure,
  writeThroughReferenceStandard,
  writeThroughImpurityProfile,
  writeThroughDissolutionProfile,
  writeThroughMaterialSpec,
  writeThroughFormulationRecord,
  writeThroughManufacturingProcess,
  writeThroughCharacterizationStudy,
} from '../../services/cmc-write-through';
import {
  analyticalMethods,
  processValidation,
  stabilityStudies,
  qcTesting,
  cmcChangeControl,
  drugSubstances,
  drugProducts,
  cmcContainerClosures,
  cmcReferenceStandards,
  cmcImpurityProfiles,
  cmcDissolutionProfiles,
  cmcMaterialSpecs,
  cmcFormulationRecords,
  cmcCharacterizationStudies,
  insertAnalyticalMethodSchema,
  insertProcessValidationSchema,
  insertStabilityStudySchema,
  insertQcTestingSchema,
  insertCmcChangeControlSchema,
  insertDrugSubstanceSchema,
  insertDrugProductSchema,
  insertCmcContainerClosureSchema,
  insertCmcReferenceStandardSchema,
  insertCmcImpurityProfileSchema,
  insertCmcDissolutionProfileSchema,
  insertCmcMaterialSpecSchema,
  insertCmcFormulationRecordSchema,
  insertCmcCharacterizationStudySchema,
} from '../../../shared/schema';
/* manufacturing_processes is modelled in shared/cmc-schema.ts, where it has
   lived since before this register family existed. It is the same table
   ich-compliance-checker and qbd-analyzer read. */
import { manufacturingProcesses } from '../../../shared/cmc-schema';
import { eq, and, inArray, or, isNull, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
/* Reading a stability programme's recorded series, and the ICH Q1E poolability
   assessment over it, both live in services/cmc/recorded-stability. The
   eligibility rules there are the safety story for a shelf-life claim and have
   two callers — this route and AnA's `assess_recorded_batch_poolability` tool —
   so there is exactly one copy of them. */
import { assessRecordedPoolability } from '../../services/cmc/recorded-stability';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import { governedSignatureSchema, resolveActorUserId } from './governance';
import { createScopedLogger } from '../../utils/logger';
import * as metricsModule from '../../metrics.js';

const router = express.Router();
const logger = createScopedLogger('cmc-routes');

/**
 * Observe a failed canonical write-through to the Module 3 submission source
 * object. The primary response is intentionally NOT blocked on this — but the
 * failure MUST be observable (logged + metered) rather than silently swallowed.
 * TODO(GA): consider retry/queue for guaranteed write-through.
 */
function observeWriteThroughFailure(
  propagation: string,
  recordId: string | number,
  err: unknown
): void {
  logger.error('Module 3 canonical write-through failed', {
    recordId: String(recordId),
    propagation,
    error: err instanceof Error ? err.message : String(err),
  });
  try {
    (metricsModule as any).metrics.concept2cureErrors.inc({
      operation: `cmc_${propagation}`,
      error_type: 'propagation_failed',
    });
  } catch {
    /* metric increment must never affect request flow */
  }
}

// Helper to read organization ID from authenticated context
function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    ''
  );
  if (isNaN(orgId) || orgId <= 0) {
    throw new Error('Organization context required');
  }
  return orgId;
}

/* ── Date fields on a JSON boundary ──────────────────────────────────────────
 *
 * drizzle-zod maps a `timestamp` column onto `z.date()`. JSON has no date type,
 * so a browser or any other JSON client can only ever send a STRING — and every
 * insert schema below therefore rejected its own timestamp field:
 *
 *   insertQcTestingSchema.parse({ ..., testDate: '2026-08-14T00:00:00.000Z' })
 *     → ZodError: Expected date, received string
 *
 * `test_date` (qc_testing) and `start_date` (stability_studies) are NOT NULL, so
 * the failure was not partial: those two records could not be created at all,
 * and because the handlers caught everything into a generic
 * `500 Failed to create …` the cause was invisible from the client. That is why
 * the CMC registers have only ever been readable — the write path was closed.
 *
 * These wrappers accept an ISO string (or a Date) and normalise blank/absent to
 * undefined, so an optional timestamp left empty in a form is "not set" rather
 * than `new Date('')` → Invalid Date → a second confusing rejection.
 */
const requiredDate = z.coerce.date();
const optionalDate = z.preprocess(
  v => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.date().optional()
);

/**
 * Normalise a failed write into an honest response.
 *
 * A rejected field is the client's problem to fix and must say which field;
 * reporting it as `500 Failed to create X` (as every handler here did) tells the
 * operator the server is broken when the real answer is "matrix is required".
 */
function respondWriteError(
  res: express.Response,
  error: unknown,
  fallback: string
): express.Response {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload',
      details: error.errors,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Organization context required')) {
    return res.status(401).json({ success: false, error: 'Organization context required' });
  }
  /* The scoped logger, with the operation as DATA rather than interpolated into
     the message. A template-built log line is both a Semgrep format-string
     finding and a real hazard in a regulated audit trail: a value carrying a
     format specifier or a newline can forge the shape of a log record. The
     message is a constant; everything variable is a field. */
  logger.error('CMC write failed', {
    operation: fallback,
    error: message,
  });
  return res.status(500).json({ success: false, error: fallback });
}

/**
 * Strip the tenant key from a validated update body. The organization scope is
 * taken from the authenticated context and must never be settable by the caller.
 */
function withoutOrgId<T extends Record<string, unknown>>(data: T): Omit<T, 'organizationId'> {
  const { organizationId: _discard, ...rest } = data as { organizationId?: unknown } & T;
  return rest as Omit<T, 'organizationId'>;
}

// Analytical Methods Routes
router.get('/analytical-methods', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const methods = await db
      .select({
        id: analyticalMethods.id,
        methodCode: analyticalMethods.methodCode,
        title: analyticalMethods.title,
        technique: analyticalMethods.technique,
        purpose: analyticalMethods.purpose,
        /* analyte / matrix are NOT NULL on the table and are what an analytical
           scientist identifies a method by ("residual solvents in DS", not just
           "GC"); withholding them made the library unreadable as a method list.
           validationDate is the ICH Q2 evidence date the Specifications tab's
           "cannot approve without a validated method" rule points at. */
        analyte: analyticalMethods.analyte,
        matrix: analyticalMethods.matrix,
        validationDate: analyticalMethods.validationDate,
        /* Carried so an edit round-trips: without it the client can only send
           back an empty validation record and would erase the one on file. */
        ichQ2Parameters: analyticalMethods.ichQ2Parameters,
        status: analyticalMethods.status,
        organizationId: analyticalMethods.organizationId,
        createdAt: analyticalMethods.createdAt,
        updatedAt: analyticalMethods.updatedAt,
      })
      .from(analyticalMethods)
      .where(eq(analyticalMethods.organizationId, orgId));
    res.json({ success: true, data: methods });
  } catch (error) {
    console.error('Error fetching analytical methods:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytical methods' });
  }
});

/* Timestamp-bearing variants of the generated insert schemas — see the
   `requiredDate` / `optionalDate` note above. Each names exactly the timestamp
   columns its table carries, so a schema change that adds one is a compile-time
   prompt to decide how it crosses the JSON boundary rather than a silent 500.

   organizationId is OMITTED from every request body: the generated insert
   schemas require it (the column is NOT NULL with no default), but tenancy is
   the SESSION's fact — each handler stamps `organizationId: orgId` from the
   authenticated context after parse. Requiring it in the body meant every
   create from the product's own register surfaces (which rightly never send
   it) answered 400 "organizationId Required" — and accepting it would have
   invited a caller-supplied tenant, which is worse. */

/**
 * Drop the tenant key from a generated insert schema. The RUNTIME omit is
 * plain zod and correct (proven live: scripts/dev/cmc-staff-simulation.sh);
 * the TYPE-level mask is the problem — drizzle-zod's generated object types
 * resolve the omit-mask keys to `never`, so a literal
 * `.omit({ organizationId: true })` fails to compile. One cast, confined
 * here. The returned type still names organizationId; every handler stamps
 * the real one from the session immediately after parse, so nothing reads
 * the phantom.
 */
function withoutTenantKey<S extends z.AnyZodObject>(schema: S): S {
  return schema.omit({ organizationId: true } as never) as unknown as S;
}

const analyticalMethodBody = withoutTenantKey(insertAnalyticalMethodSchema).extend({
  validationDate: optionalDate,
});
const processValidationBody = withoutTenantKey(insertProcessValidationSchema).extend({
  approvalDate: optionalDate,
});
const stabilityStudyBody = withoutTenantKey(insertStabilityStudySchema).extend({
  startDate: requiredDate,
  plannedEndDate: optionalDate,
});
const qcTestingBody = withoutTenantKey(insertQcTestingSchema).extend({
  testDate: requiredDate,
  releaseDate: optionalDate,
});
const changeControlBody = withoutTenantKey(insertCmcChangeControlSchema).extend({
  implementationDate: optionalDate,
});
const drugSubstanceBody = withoutTenantKey(insertDrugSubstanceSchema);
const drugProductBody = withoutTenantKey(insertDrugProductSchema);
const containerClosureBody = withoutTenantKey(insertCmcContainerClosureSchema).extend({
  qualificationDate: optionalDate,
});
const referenceStandardBody = withoutTenantKey(insertCmcReferenceStandardSchema).extend({
  expiryDate: optionalDate,
  retestDate: optionalDate,
  qualificationDate: optionalDate,
});
const impurityProfileBody = withoutTenantKey(insertCmcImpurityProfileSchema).extend({
  /* The register's own GET returns qualificationDate as an ISO string, so a
     client that reads a row and writes it back would have been rejected by the
     z.date() drizzle-zod generates for the column. The field is stripped by
     withoutGovernedFields regardless — the coercion is what stops the whole
     request failing before it gets there. */
  qualificationDate: optionalDate,
});
const dissolutionProfileBody = withoutTenantKey(insertCmcDissolutionProfileSchema).extend({
  testDate: optionalDate,
});
const materialSpecBody = withoutTenantKey(insertCmcMaterialSpecSchema);
const formulationRecordBody = withoutTenantKey(insertCmcFormulationRecordSchema);
const characterizationStudyBody = withoutTenantKey(insertCmcCharacterizationStudySchema).extend({
  performedDate: optionalDate,
  qualificationDate: optionalDate,
});
/* manufacturing_processes predates this register family and is modelled in
   shared/cmc-schema.ts, not shared/schema.ts. Its projectId is a uuid column,
   so the body takes it as a uuid string; organizationId is set by the route. */
const manufacturingProcessBody = z.object({
  projectId: z.string().uuid().optional().nullable(),
  processName: z.string().min(1),
  processType: z.string().optional().nullable(),
  processDescription: z.string().optional().nullable(),
  processSteps: z.array(z.record(z.any())).optional().nullable(),
  criticalProcessParameters: z.array(z.record(z.any())).optional().nullable(),
  processControls: z.array(z.record(z.any())).optional().nullable(),
  equipmentList: z.array(z.record(z.any())).optional().nullable(),
  facilityInfo: z.record(z.any()).optional().nullable(),
  batchSize: z.string().optional().nullable(),
  yieldData: z.record(z.any()).optional().nullable(),
  scaleUpData: z.record(z.any()).optional().nullable(),
  processDevelopment: z.string().optional().nullable(),
  reprocessing: z.string().optional().nullable(),
  validationStatus: z.string().optional().nullable(),
});

router.post('/analytical-methods', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = analyticalMethodBody.parse(req.body);
    // createInsertSchemaOmit widens the parsed type to `{}`, so cast the
    // Zod-validated values to the table insert type at this boundary.
    const [method] = await db.insert(analyticalMethods).values({ ...validatedData, organizationId: orgId } as typeof analyticalMethods.$inferInsert).returning();
    // Write-through: upsert canonical source object for Module 3
    // projectId is not persisted on this table; it is supplied by the caller for canonical linkage.
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughAnalyticalMethod(orgId, projectId, String(method.id), method).catch(err =>
        observeWriteThroughFailure('write_through_analytical_method', method.id, err)
      );
    }
    res.json({ success: true, data: method });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create analytical method');
  }
});

router.put('/analytical-methods/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = analyticalMethodBody.partial().parse(req.body);
    // Strip organizationId so the tenant scope cannot be overridden by the request body.
    const safeData = withoutOrgId(validatedData as Record<string, unknown>);
    const [method] = await db
      .update(analyticalMethods)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(analyticalMethods.id, id), eq(analyticalMethods.organizationId, orgId)))
      .returning();
    // Write-through: upsert canonical source object for Module 3
    const projectId = (req.body as { projectId?: string }).projectId;
    if (method && projectId) {
      writeThroughAnalyticalMethod(orgId, projectId, String(method.id), method).catch(err =>
        observeWriteThroughFailure('write_through_analytical_method', method.id, err)
      );
    }
    if (!method) return res.status(404).json({ success: false, error: 'Analytical method not found' });
    res.json({ success: true, data: method });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update analytical method');
  }
});

// Process Validation Routes
router.get('/process-validation', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validation = await db
      .select()
      .from(processValidation)
      .where(eq(processValidation.organizationId, orgId));
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error fetching process validation:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch process validation' });
  }
});

router.post('/process-validation', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = processValidationBody.parse(req.body);
    const [validation] = await db.insert(processValidation).values({ ...validatedData, organizationId: orgId } as typeof processValidation.$inferInsert).returning();
    // Write-through: upsert canonical source object for Module 3
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughProcessValidation(orgId, projectId, String(validation.id), validation).catch(err =>
        observeWriteThroughFailure('write_through_process_validation', validation.id, err)
      );
    }
    res.json({ success: true, data: validation });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create process validation');
  }
});

/**
 * Advance a process-validation record through the three-stage lifecycle
 * (process design → qualification → continued verification). Without this the
 * stage a record was created at was the stage it kept forever.
 */
router.put('/process-validation/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = processValidationBody.partial().parse(req.body);
    const [validation] = await db
      .update(processValidation)
      .set({ ...withoutOrgId(validatedData as Record<string, unknown>), updatedAt: new Date() })
      .where(and(eq(processValidation.id, id), eq(processValidation.organizationId, orgId)))
      .returning();
    if (!validation) return res.status(404).json({ success: false, error: 'Process validation record not found' });
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughProcessValidation(orgId, projectId, String(validation.id), validation).catch(err =>
        observeWriteThroughFailure('write_through_process_validation', validation.id, err)
      );
    }
    res.json({ success: true, data: validation });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update process validation');
  }
});

// Stability Studies Routes
router.get('/stability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    /* The projection carries the columns a stability coordinator works from —
       the batch and scope the study is run on, its climatic zone, the pull
       points and parameters it tests, the recorded results, and the shelf life
       it supports. The previous six-column projection could describe a study
       but never its data, so §3.2.S.7 / §3.2.P.8 had nothing to compose from. */
    const studies = await db
      .select({
        id: stabilityStudies.id,
        studyTitle: stabilityStudies.studyTitle,
        productName: stabilityStudies.productName,
        batchNumber: stabilityStudies.batchNumber,
        dosageForm: stabilityStudies.dosageForm,
        strength: stabilityStudies.strength,
        scope: stabilityStudies.scope,
        climaticZone: stabilityStudies.climaticZone,
        studyType: stabilityStudies.studyType,
        storageConditions: stabilityStudies.storageConditions,
        duration: stabilityStudies.duration,
        testParameters: stabilityStudies.testParameters,
        timePoints: stabilityStudies.timePoints,
        stabilityData: stabilityStudies.stabilityData,
        shelfLife: stabilityStudies.shelfLife,
        notes: stabilityStudies.notes,
        status: stabilityStudies.status,
        startDate: stabilityStudies.startDate,
        plannedEndDate: stabilityStudies.plannedEndDate,
        organizationId: stabilityStudies.organizationId,
        createdAt: stabilityStudies.createdAt,
        updatedAt: stabilityStudies.updatedAt,
      })
      .from(stabilityStudies)
      .where(eq(stabilityStudies.organizationId, orgId));
    res.json({ success: true, data: studies });
  } catch (error) {
    console.error('Error fetching stability studies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stability studies' });
  }
});

router.post('/stability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = stabilityStudyBody.parse(req.body);
    const [study] = await db.insert(stabilityStudies).values({ ...validatedData, organizationId: orgId } as typeof stabilityStudies.$inferInsert).returning();
    // Write-through: upsert canonical source object for Module 3
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughStabilityStudy(orgId, projectId, String(study.id), study).catch(err =>
        observeWriteThroughFailure('write_through_stability_study', study.id, err)
      );
    }
    res.json({ success: true, data: study });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create stability study');
  }
});

/**
 * Update a stability study over its life: pull-point results into
 * `stability_data`, the status as it moves DRAFT → ACTIVE → COMPLETED, and the
 * shelf life the study supports once the data justify it. A stability study is
 * a multi-year record; a create-only endpoint could never express it.
 */
router.put('/stability-studies/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = stabilityStudyBody.partial().parse(req.body);
    const [study] = await db
      .update(stabilityStudies)
      .set({ ...withoutOrgId(validatedData as Record<string, unknown>), updatedAt: new Date() })
      .where(and(eq(stabilityStudies.id, id), eq(stabilityStudies.organizationId, orgId)))
      .returning();
    if (!study) return res.status(404).json({ success: false, error: 'Stability study not found' });
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughStabilityStudy(orgId, projectId, String(study.id), study).catch(err =>
        observeWriteThroughFailure('write_through_stability_study', study.id, err)
      );
    }
    res.json({ success: true, data: study });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update stability study');
  }
});

// QC Testing Routes
router.get('/qc-testing', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const testing = await db.select().from(qcTesting).where(eq(qcTesting.organizationId, orgId));
    res.json({ success: true, data: testing });
  } catch (error) {
    console.error('Error fetching QC testing:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch QC testing' });
  }
});

router.post('/qc-testing', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = qcTestingBody.parse(req.body);
    const [test] = await db.insert(qcTesting).values({ ...validatedData, organizationId: orgId } as typeof qcTesting.$inferInsert).returning();
    /* Write-through: QC results ARE the batch analyses of §3.2.S.4.4 / §3.2.P.5.4.
       This register was the only one with no canonical write-through, so a
       recorded release result never reached the sections whose entire purpose is
       to carry it. */
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughQcTesting(orgId, projectId, String(test.id), test).catch(err =>
        observeWriteThroughFailure('write_through_qc_testing', test.id, err)
      );
    }
    res.json({ success: true, data: test });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create QC test');
  }
});

/**
 * Second-person QC review. A QC result is recorded by the analyst who ran it
 * and then verified by someone else before the material can be released — the
 * `reviewed_by` / `release_date` columns exist precisely for that step, and
 * with no update route they could never be set. `analyst` is deliberately not
 * updatable here: who performed the test is a matter of record, not an edit.
 */
router.put('/qc-testing/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = qcTestingBody.partial().parse(req.body);
    /* `analyst` is a matter of record, not an edit. `reviewedBy` is the OTHER
       half of the same fact and was accepted from the request body — so a
       caller could record a colleague as the second person who verified a
       release result they never saw. Both are now the session's fact: who
       reviewed is whoever is signed in, and a review is only recorded when the
       caller actually asks for one. */
    const {
      analyst: _analystIsARecord,
      reviewedBy: _reviewerIsTheSession,
      ...safeData
    } = withoutOrgId(validatedData as Record<string, unknown>) as {
      analyst?: unknown;
      reviewedBy?: unknown;
    } & Record<string, unknown>;
    const claimsReview = 'reviewedBy' in (req.body as Record<string, unknown>);
    const reviewerId = resolveActorUserId(req);
    if (claimsReview && !reviewerId) {
      return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });
    }
    /* Second-person review, enforced where it counts. The register surface
       disables the action for the analyst who ran the test; the API said
       nothing, so the rule held only for callers who chose to follow it. */
    if (claimsReview) {
      const [existing] = await db
        .select({ analyst: qcTesting.analyst })
        .from(qcTesting)
        .where(and(eq(qcTesting.id, id), eq(qcTesting.organizationId, orgId)));
      if (!existing) return res.status(404).json({ success: false, error: 'QC test record not found' });
      if (existing.analyst && existing.analyst === reviewerId) {
        return res.status(409).json({
          success: false,
          error: 'QC review must be a second person: you recorded this result.',
        });
      }
    }
    const [test] = await db
      .update(qcTesting)
      .set({
        ...safeData,
        ...(claimsReview ? { reviewedBy: reviewerId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(qcTesting.id, id), eq(qcTesting.organizationId, orgId)))
      .returning();
    if (!test) return res.status(404).json({ success: false, error: 'QC test record not found' });
    /* The review IS the state change that matters downstream: an unreviewed
       result is not releasable evidence, so the canonical source must be
       refreshed here too, not only on create. */
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughQcTesting(orgId, projectId, String(test.id), test).catch(err =>
        observeWriteThroughFailure('write_through_qc_testing', test.id, err)
      );
    }
    res.json({ success: true, data: test });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update QC test');
  }
});

// Change Control Routes
router.get('/change-control', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const changes = await db
      .select()
      .from(cmcChangeControl)
      .where(eq(cmcChangeControl.organizationId, orgId));
    res.json({ success: true, data: changes });
  } catch (error) {
    console.error('Error fetching change control:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch change control' });
  }
});

router.post('/change-control', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = changeControlBody.parse(req.body);
    const [change] = await db.insert(cmcChangeControl).values({ ...validatedData, organizationId: orgId } as typeof cmcChangeControl.$inferInsert).returning();
    // Write-through: upsert canonical source object for Module 3
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughChangeControl(orgId, projectId, String(change.id), change).catch(err =>
        observeWriteThroughFailure('write_through_change_control', change.id, err)
      );
    }
    res.json({ success: true, data: change });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create change control');
  }
});

/**
 * Move a change through its control lifecycle — assessed filing category,
 * status, planned implementation date. A change-control register in which
 * nothing can ever leave 'draft' is a list, not a register.
 */
router.put('/change-control/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = changeControlBody.partial().parse(req.body);
    const [change] = await db
      .update(cmcChangeControl)
      .set({ ...withoutOrgId(validatedData as Record<string, unknown>), updatedAt: new Date() })
      .where(and(eq(cmcChangeControl.id, id), eq(cmcChangeControl.organizationId, orgId)))
      .returning();
    if (!change) return res.status(404).json({ success: false, error: 'Change-control record not found' });
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughChangeControl(orgId, projectId, String(change.id), change).catch(err =>
        observeWriteThroughFailure('write_through_change_control', change.id, err)
      );
    }
    res.json({ success: true, data: change });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update change control');
  }
});

// Drug Substances Routes
router.get('/drug-substances', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const substances = await db
      .select({
        id: drugSubstances.id,
        substanceName: drugSubstances.substanceName,
        casNumber: drugSubstances.casNumber,
        molecularFormula: drugSubstances.molecularFormula,
        molecularWeight: drugSubstances.molecularWeight,
        inn: drugSubstances.inn,
        structuralFormula: drugSubstances.structuralFormula,
        manufacturingProcess: drugSubstances.manufacturingProcess,
        status: drugSubstances.status,
        developmentPhase: drugSubstances.developmentPhase,
        organizationId: drugSubstances.organizationId,
        createdAt: drugSubstances.createdAt,
        updatedAt: drugSubstances.updatedAt,
      })
      .from(drugSubstances)
      .where(eq(drugSubstances.organizationId, orgId));
    res.json({ success: true, data: substances });
  } catch (error) {
    console.error('Error fetching drug substances:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drug substances' });
  }
});

router.post('/drug-substances', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = drugSubstanceBody.parse(req.body);
    const [substance] = await db.insert(drugSubstances).values({ ...validatedData, organizationId: orgId } as typeof drugSubstances.$inferInsert).returning();
    // Write-through: upsert canonical source object for Module 3
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughDrugSubstance(orgId, projectId, String(substance.id), substance).catch(err =>
        observeWriteThroughFailure('write_through_drug_substance', substance.id, err)
      );
    }
    res.json({ success: true, data: substance });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create drug substance');
  }
});

/** Edit a §3.2.S drug substance and re-feed the Module 3 canonical layer. */
router.put('/drug-substances/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = drugSubstanceBody.partial().parse(req.body);
    const [substance] = await db
      .update(drugSubstances)
      .set({ ...withoutOrgId(validatedData as Record<string, unknown>), updatedAt: new Date() })
      .where(and(eq(drugSubstances.id, id), eq(drugSubstances.organizationId, orgId)))
      .returning();
    if (!substance) return res.status(404).json({ success: false, error: 'Drug substance not found' });
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughDrugSubstance(orgId, projectId, String(substance.id), substance).catch(err =>
        observeWriteThroughFailure('write_through_drug_substance', substance.id, err)
      );
    }
    res.json({ success: true, data: substance });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update drug substance');
  }
});

// Drug Products Routes
router.get('/drug-products', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const products = await db
      .select({
        id: drugProducts.id,
        productName: drugProducts.productName,
        dosageForm: drugProducts.dosageForm,
        strength: drugProducts.strength,
        routeOfAdministration: drugProducts.routeOfAdministration,
        composition: drugProducts.composition,
        manufacturingProcess: drugProducts.manufacturingProcess,
        packagingMaterials: drugProducts.packagingMaterials,
        status: drugProducts.status,
        organizationId: drugProducts.organizationId,
        createdAt: drugProducts.createdAt,
        updatedAt: drugProducts.updatedAt,
      })
      .from(drugProducts)
      .where(eq(drugProducts.organizationId, orgId));
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching drug products:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drug products' });
  }
});

router.post('/drug-products', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = drugProductBody.parse(req.body);
    const [product] = await db.insert(drugProducts).values({ ...validatedData, organizationId: orgId } as typeof drugProducts.$inferInsert).returning();
    // Write-through: upsert canonical source object for Module 3
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughDrugProduct(orgId, projectId, String(product.id), product).catch(err =>
        observeWriteThroughFailure('write_through_drug_product', product.id, err)
      );
    }
    res.json({ success: true, data: product });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create drug product');
  }
});

/** Edit a §3.2.P drug product and re-feed the Module 3 canonical layer. */
router.put('/drug-products/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = drugProductBody.partial().parse(req.body);
    const [product] = await db
      .update(drugProducts)
      .set({ ...withoutOrgId(validatedData as Record<string, unknown>), updatedAt: new Date() })
      .where(and(eq(drugProducts.id, id), eq(drugProducts.organizationId, orgId)))
      .returning();
    if (!product) return res.status(404).json({ success: false, error: 'Drug product not found' });
    const projectId = (req.body as { projectId?: string }).projectId;
    if (projectId) {
      writeThroughDrugProduct(orgId, projectId, String(product.id), product).catch(err =>
        observeWriteThroughFailure('write_through_drug_product', product.id, err)
      );
    }
    res.json({ success: true, data: product });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update drug product');
  }
});


/* ── Container closure systems and reference standards ───────────────────────
 *
 * The two registers behind §3.2.S.5 / §3.2.S.6 / §3.2.P.6 / §3.2.P.7, which had
 * no capture path at all. Both the write-through and the composed section read
 * `scope` to decide which side a record is evidence for, so it is stored on the
 * row and never inferred.
 *
 * Three rules these two endpoints hold that the older registers do not:
 *
 *   1. `projectId` is a COLUMN, so the record knows its program after the
 *      request that created it, and it is IMMUTABLE after creation — silently
 *      repointing a qualified system's evidence at another program is not an
 *      edit, it is a different record.
 *   2. The canonical write-through is AWAITED and its real outcome reported.
 *      `module3Linked: true` over a write that failed would be the exact lie
 *      the field exists to prevent.
 *   3. Qualification is a governed signature (POST .../:id/qualify), never a
 *      field on an ordinary save: `status`, `qualifiedBy` and
 *      `qualificationDate` cannot be written through create or update.
 */

/**
 * Scope a register read to one program when the caller names one.
 *
 * These two registers store `project_id`, so an org-wide list mixes the
 * packaging systems of every program a CMC group runs — and the row a staffer
 * then edits may belong to a different dossier than the one on screen. A record
 * with NO project is always included: it is unfiled rather than another
 * program's, and hiding it would leave a saved record nobody can find.
 */
function projectFilter(req: express.Request, column: AnyPgColumn): SQL | undefined {
  const raw = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  if (!raw) return undefined;
  return or(eq(column as never, raw), isNull(column as never));
}

/** The project a canonical write-through is keyed on, row first. */
function writeThroughProjectId(row: { projectId?: string | null }, req: express.Request): string | null {
  const stored = typeof row.projectId === 'string' ? row.projectId.trim() : '';
  if (stored) return stored;
  const sent = (req.body as { projectId?: string }).projectId;
  return typeof sent === 'string' && sent.trim() ? sent.trim() : null;
}

/**
 * Link a saved register row into the Module 3 canonical layer and report what
 * actually happened.
 *
 * The older registers fire the write-through and forget it, which is fine while
 * nothing claims it succeeded. These endpoints DO claim it — so the claim is
 * awaited. `writeThroughToCanonicalSource` returns null on failure (it logs and
 * rolls back rather than throwing), and a null is reported here as not linked,
 * with the reason, and metered like any other propagation failure. The register
 * row itself is never rolled back: it is real recorded data whether or not the
 * dossier layer accepted it this second.
 */
async function linkToModule3(
  propagation: string,
  orgId: number,
  /* manufacturing_processes is keyed by uuid; every other register by serial.
     The id is only ever stringified into the source key, so both are fine. */
  row: { id: number | string; projectId?: string | null },
  req: express.Request,
  writeThrough: (
    orgId: number,
    projectId: string,
    recordId: string,
    record: Record<string, any>,
  ) => Promise<unknown>,
): Promise<{ module3Linked: boolean; module3Warning?: string }> {
  const projectId = writeThroughProjectId(row, req);
  if (!projectId) {
    return {
      module3Linked: false,
      module3Warning:
        'Saved to the register only. No project is set on this record, so it does not feed Module 3 yet.',
    };
  }
  try {
    const result = await writeThrough(orgId, projectId, String(row.id), row as Record<string, any>);
    if (result) return { module3Linked: true };
    observeWriteThroughFailure(propagation, row.id, new Error('canonical write-through returned no result'));
  } catch (err) {
    observeWriteThroughFailure(propagation, row.id, err);
  }
  return {
    module3Linked: false,
    module3Warning:
      'Saved to the register. The Module 3 canonical write did not complete, so this record is not composed into the dossier yet; saving it again re-attempts the link.',
  };
}

/**
 * Strip everything a caller must not set on an ordinary save.
 *
 * `qualifiedBy` is attribution — a signed fact about a person — and accepting it
 * from a request body lets any caller record a colleague as having qualified a
 * container closure system on a date they never touched it. `status` and
 * `qualificationDate` move only through the governed signature endpoint below,
 * so an ordinary PUT cannot reach 'qualified' by the side door.
 */
function withoutGovernedFields<T extends Record<string, unknown>>(
  data: T,
): Omit<T, 'organizationId' | 'qualifiedBy' | 'qualificationDate'> {
  const {
    organizationId: _org,
    qualifiedBy: _by,
    qualificationDate: _on,
    ...rest
  } = data as {
    organizationId?: unknown;
    qualifiedBy?: unknown;
    qualificationDate?: unknown;
  } & T;
  return rest as Omit<T, 'organizationId' | 'qualifiedBy' | 'qualificationDate'>;
}

/**
 * Refuse a self-declared qualification rather than accepting it silently.
 *
 * Returning 409 with the governed path named is the honest answer: the caller
 * asked for a state change the product does allow, by a route that cannot
 * record who made it.
 */
function refusesUngovernedQualification(
  res: express.Response,
  status: unknown,
  registerPath: string,
  storedStatus?: unknown,
  /* The vocabulary differs by register: a reference standard is `qualified`
     and signed at /qualify; a manufacturing process is `validated` and signed
     at /validate. The RULE is one rule, so it is parameterised rather than
     copied — the second copy is where the two drift. */
  vocab: { signedValue: string; verb: string; path: string } = {
    signedValue: 'qualified',
    verb: 'Qualification',
    path: 'qualify',
  },
): boolean {
  const signed = vocab.signedValue;
  const incoming = String(status ?? '').trim().toLowerCase();
  const stored = String(storedStatus ?? '').trim().toLowerCase();
  /* Refuse the TRANSITION into qualified, not the word. A record that is
     already qualified must be able to round-trip its own status through an
     ordinary edit — otherwise correcting a typo in a qualified record is
     impossible without a second signature. */
  if (incoming === signed && stored !== signed) {
    res.status(409).json({
      success: false,
      error:
        `${vocab.verb} is a governed action and is recorded with a signature. ` +
        `POST /api/cmc/${registerPath}/:id/${vocab.path} with a reason and re-authentication.`,
    });
    return true;
  }
  /* And refuse the transition OUT of it. Pressing Update on a qualified record
     silently reverted it to draft while leaving qualified_by and
     qualification_date populated — an unsigned de-qualification that left the
     signature stranded on a record that no longer claimed to be qualified.
     Retiring a qualified record is still allowed: that is a lifecycle end, not
     a reversal of the conclusion. */
  if (stored === signed && incoming && incoming !== signed && incoming !== 'retired') {
    res.status(409).json({
      success: false,
      error:
        `This record is ${signed} under a recorded signature and cannot be returned to "${incoming}" by an ordinary edit. ` +
        `Retire it, or record a new assessment.`,
    });
    return true;
  }
  return false;
}

/**
 * The governed qualification of a register record, on the same primitives as
 * the specification approval and the batch release: re-auth first, the state
 * change and the signature in ONE transaction, then the canonical write-through.
 *
 * `table` is a literal from a closed set, never caller input.
 */
async function qualifyRegisterRecord(
  req: express.Request,
  res: express.Response,
  spec: {
    table:
      | 'cmc_container_closures'
      | 'cmc_reference_standards'
      | 'cmc_impurity_profiles'
      | 'cmc_characterization_studies'
      | 'manufacturing_processes';
    target: string;
    surface: string;
    subject: string;
    propagation: string;
    /**
     * The register's own signing vocabulary and column names. A manufacturing
     * process is `validated` and records it on validation_status /
     * validated_by / validation_date; every other register is `qualified` on
     * status / qualified_by / qualification_date. Defaults are the common case,
     * so only the process register states them.
     */
    signing?: {
      statusColumn: string;
      signedValue: string;
      signedByColumn: string;
      signedAtColumn: string;
    };
    /** manufacturing_processes has a uuid primary key; the rest are serial. */
    idKind?: 'int' | 'uuid';
    reselect: (id: string, orgId: number) => Promise<Record<string, any> | undefined>;
    writeThrough: (
      orgId: number,
      projectId: string,
      recordId: string,
      record: Record<string, any>,
    ) => Promise<unknown>;
    /**
     * A register-specific condition the record must meet to be signable,
     * evaluated on the row LOCKED inside the signing transaction. Returns the
     * refusal message, or null when the record may be signed.
     */
    precondition?: (row: Record<string, any>) => string | null;
  },
): Promise<express.Response> {
  const parsed = governedSignatureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid input data', details: parsed.error.errors });
  }
  const { reason, meaning, reauth, idempotencyKey } = parsed.data;

  const signing = spec.signing ?? {
    statusColumn: 'status',
    signedValue: 'qualified',
    signedByColumn: 'qualified_by',
    signedAtColumn: 'qualification_date',
  };
  const rawId = String(req.params.id ?? '').trim();
  if ((spec.idKind ?? 'int') === 'uuid') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
      return res.status(400).json({ success: false, error: `A ${spec.subject} id is required` });
    }
  } else if (!Number.isInteger(Number(rawId)) || Number(rawId) <= 0) {
    return res.status(400).json({ success: false, error: `A ${spec.subject} id is required` });
  }
  const id: string | number = (spec.idKind ?? 'int') === 'uuid' ? rawId : parseInt(rawId, 10);
  let orgId: number;
  try {
    orgId = getOrgId(req);
  } catch {
    return res.status(401).json({ success: false, error: 'Organization context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });

  const reauthResult = await verifyReauth(userId, reauth);
  if (!reauthResult.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ success: false, error: reauthResult.error ?? 'REAUTH_REQUIRED' });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM ${spec.table} WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, orgId],
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: `${spec.subject} not found` });
    }
    /* Already signed. Re-signing would stamp a second person over the first and
       lose who actually qualified it, so it is refused with the record's own
       facts rather than overwritten. */
    if (String(current.rows[0][signing.statusColumn] || '').toLowerCase() === signing.signedValue) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `This ${spec.subject} is already ${signing.signedValue}`,
        qualifiedAt: current.rows[0][signing.signedAtColumn] ?? null,
      });
    }
    const unmet = spec.precondition ? spec.precondition(current.rows[0]) : null;
    if (unmet) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: unmet });
    }
    /* Every interpolated name here is a literal from this file's own closed
       set — the table union above and the `signing` defaults — never caller
       input; the values still travel as parameters. */
    await client.query(
      `UPDATE ${spec.table}
          SET ${signing.statusColumn} = '${signing.signedValue}',
              ${signing.signedByColumn} = $3,
              ${signing.signedAtColumn} = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId, userId],
    );
    const governance = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target: `${spec.target}:${id}`,
      reason,
      payload: { meaning },
      domain: 'biopharma',
      surface: spec.surface,
      idempotencyKey: idempotencyKey ?? null,
    });
    await client.query('COMMIT');

    /* Re-read through Drizzle so the response carries the same camelCase row
       shape every other endpoint of this register returns — the register table
       adopts the server row after a write, and a snake_case body would blank
       every column it just filled in. */
    const row = await spec.reselect(String(id), orgId);
    const linkage = row
      ? await linkToModule3(spec.propagation, orgId, row as { id: number | string; projectId?: string | null }, req, spec.writeThrough)
      : { module3Linked: false, module3Warning: `Signed. The record could not be re-read to link it into Module 3.` };
    return res.json({
      success: true,
      data: row,
      governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      ...linkage,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return respondWriteError(res, error, `Failed to ${signing.signedValue === 'validated' ? 'validate' : 'qualify'} ${spec.subject}`);
  } finally {
    client.release();
  }
}

router.get('/container-closures', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcContainerClosures)
      .where(and(eq(cmcContainerClosures.organizationId, orgId), projectFilter(req, cmcContainerClosures.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch container closure systems');
  }
});

const reselectContainerClosure = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(cmcContainerClosures)
    .where(and(eq(cmcContainerClosures.id, parseInt(id, 10)), eq(cmcContainerClosures.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

router.post('/container-closures', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = containerClosureBody.parse(req.body);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'container-closures')) return;
    const [row] = await db
      .insert(cmcContainerClosures)
      .values({ ...withoutGovernedFields(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcContainerClosures.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_container_closure', orgId, row, req, writeThroughContainerClosure);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create container closure system');
  }
});

/**
 * Attach the E&L package, correct the record, or add the suitability
 * justification. A container closure system is qualified over months — the
 * justification and the extractables/leachables results almost never exist on
 * the day the system is first recorded, so a create-only endpoint could never
 * carry the section.
 *
 * `projectId` is dropped here: which program a system is evidence for is fixed
 * at creation, and a silent repoint would move a qualified system's evidence
 * to another dossier.
 */
router.put('/container-closures/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = containerClosureBody.partial().parse(req.body);
    const stored = await reselectContainerClosure(String(id), orgId);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'container-closures', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutGovernedFields(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcContainerClosures)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcContainerClosures.id, id), eq(cmcContainerClosures.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Container closure system not found' });
    const linkage = await linkToModule3('write_through_container_closure', orgId, row, req, writeThroughContainerClosure);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update container closure system');
  }
});

/** The governed qualification of a container closure system (21 CFR Part 11). */
router.post('/container-closures/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    table: 'cmc_container_closures',
    target: 'container_closure',
    surface: 'cmc-container-closures',
    subject: 'container closure system',
    propagation: 'write_through_container_closure',
    reselect: reselectContainerClosure,
    writeThrough: writeThroughContainerClosure,
  });
});

/* ── Reference standards — §3.2.S.5 / §3.2.P.6 ───────────────────────────────
 *
 * Every potency and purity number the QC register holds is reported against a
 * reference standard. Until now the standard itself was recorded nowhere, so
 * the two sections that exist to describe it composed from nothing.
 */
router.get('/reference-standards', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcReferenceStandards)
      .where(and(eq(cmcReferenceStandards.organizationId, orgId), projectFilter(req, cmcReferenceStandards.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch reference standards');
  }
});

const reselectReferenceStandard = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(cmcReferenceStandards)
    .where(and(eq(cmcReferenceStandards.id, parseInt(id, 10)), eq(cmcReferenceStandards.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

router.post('/reference-standards', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = referenceStandardBody.parse(req.body);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'reference-standards')) return;
    const [row] = await db
      .insert(cmcReferenceStandards)
      .values({ ...withoutGovernedFields(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcReferenceStandards.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_reference_standard', orgId, row, req, writeThroughReferenceStandard);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create reference standard');
  }
});

/** Record the characterisation, correct the record, or retire the standard. */
router.put('/reference-standards/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = referenceStandardBody.partial().parse(req.body);
    const stored = await reselectReferenceStandard(String(id), orgId);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'reference-standards', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutGovernedFields(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcReferenceStandards)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcReferenceStandards.id, id), eq(cmcReferenceStandards.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Reference standard not found' });
    const linkage = await linkToModule3('write_through_reference_standard', orgId, row, req, writeThroughReferenceStandard);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update reference standard');
  }
});

/** The governed qualification of a reference standard (21 CFR Part 11). */
router.post('/reference-standards/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    table: 'cmc_reference_standards',
    target: 'reference_standard',
    surface: 'cmc-reference-standards',
    subject: 'reference standard',
    propagation: 'write_through_reference_standard',
    reselect: reselectReferenceStandard,
    writeThrough: writeThroughReferenceStandard,
  });
});


/* ── Impurity profiles — §3.2.S.3.2 / §3.2.P.5.5 ─────────────────────────────
 *
 * One row per impurity. `scope` decides which side it files under, on the same
 * rule as the registers above; `project_id` is a column and is immutable after
 * creation; the canonical write-through is awaited and its true outcome
 * reported; and qualification is a Part 11 signature over a recorded
 * qualification basis, never a status a save can set.
 */
router.get('/impurity-profiles', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcImpurityProfiles)
      .where(and(eq(cmcImpurityProfiles.organizationId, orgId), projectFilter(req, cmcImpurityProfiles.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch impurity profiles');
  }
});

const reselectImpurityProfile = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(cmcImpurityProfiles)
    .where(and(eq(cmcImpurityProfiles.id, parseInt(id, 10)), eq(cmcImpurityProfiles.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

router.post('/impurity-profiles', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = impurityProfileBody.parse(req.body);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'impurity-profiles')) return;
    const [row] = await db
      .insert(cmcImpurityProfiles)
      .values({ ...withoutGovernedFields(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcImpurityProfiles.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_impurity_profile', orgId, row, req, writeThroughImpurityProfile);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create impurity profile');
  }
});

/**
 * Record the level from a new batch, attach the qualification basis, or correct
 * the entry. An impurity's file grows over a programme: the level is measured
 * long before the toxicological qualification that justifies it exists.
 */
router.put('/impurity-profiles/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = impurityProfileBody.partial().parse(req.body);
    const stored = await reselectImpurityProfile(String(id), orgId);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'impurity-profiles', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutGovernedFields(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcImpurityProfiles)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcImpurityProfiles.id, id), eq(cmcImpurityProfiles.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Impurity profile not found' });
    const linkage = await linkToModule3('write_through_impurity_profile', orgId, row, req, writeThroughImpurityProfile);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update impurity profile');
  }
});

/**
 * The governed qualification of an impurity (21 CFR Part 11).
 *
 * ICH Q3A/Q3B qualification is a toxicological conclusion about a specific
 * level of a specific impurity. Signing it records who reached that conclusion
 * and on what basis; the register REFUSES the signature when no qualification
 * basis is recorded, because a signature over an empty basis is the exact shape
 * of a qualification nobody can point at.
 */
router.post('/impurity-profiles/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    table: 'cmc_impurity_profiles',
    target: 'impurity_profile',
    surface: 'cmc-impurity-profiles',
    subject: 'impurity profile',
    propagation: 'write_through_impurity_profile',
    reselect: reselectImpurityProfile,
    writeThrough: writeThroughImpurityProfile,
    /* A signature over an empty basis qualifies nothing. Enforced INSIDE the
       signing transaction, on the row locked FOR UPDATE — as a pre-check before
       it, a concurrent edit that cleared the basis between the check and the
       signature produced a signed qualification with nothing behind it, and the
       check also disclosed the record's state before re-authentication. */
    precondition: (row) =>
      String(row.qualification_basis || '').trim()
        ? null
        : 'This impurity has no qualification basis recorded. Qualification is a signature over the study, comparator exposure or monograph that qualifies the level — record that first.',
  });
});

/* ── Dissolution profiles — §3.2.P.2 / §3.2.P.5 ──────────────────────────────
 *
 * `purpose` plays the part `scope` plays above: a development profile is
 * §3.2.P.2 evidence and a release-specification profile is §3.2.P.5 evidence,
 * and one must not complete the other's section.
 *
 * There is no qualify endpoint here: a dissolution profile is a measurement,
 * not a state somebody signs. What IS signed is the specification it supports,
 * which lives in the specification register and already has one.
 */
router.get('/dissolution-profiles', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcDissolutionProfiles)
      .where(and(eq(cmcDissolutionProfiles.organizationId, orgId), projectFilter(req, cmcDissolutionProfiles.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch dissolution profiles');
  }
});

router.post('/dissolution-profiles', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = dissolutionProfileBody.parse(req.body);
    const [row] = await db
      .insert(cmcDissolutionProfiles)
      .values({ ...withoutOrgId(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcDissolutionProfiles.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_dissolution_profile', orgId, row, req, writeThroughDissolutionProfile);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create dissolution profile');
  }
});

/** Add the later timepoints, attach the reference profile, correct the record. */
router.put('/dissolution-profiles/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = dissolutionProfileBody.partial().parse(req.body);
    const { projectId: _fixedAtCreation, ...editable } = withoutOrgId(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcDissolutionProfiles)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcDissolutionProfiles.id, id), eq(cmcDissolutionProfiles.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Dissolution profile not found' });
    const linkage = await linkToModule3('write_through_dissolution_profile', orgId, row, req, writeThroughDissolutionProfile);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update dissolution profile');
  }
});

/**
 * Exactly one formulation version may claim to be the current one.
 *
 * §3.2.P.1 renders the CURRENT composition; two records claiming it means the
 * governing composition is not established, and the section says so. Refusing
 * the second write is better than composing the ambiguity: the staffer marking
 * a new version current is told to supersede the old one first.
 */
async function currentFormulationConflict(
  orgId: number,
  incoming: Record<string, unknown>,
  excludeId: number | null,
  /* The project the record ACTUALLY belongs to. On an update the body does not
     carry it — projectId is fixed at creation and the client's patch never
     sends it — so scoping the check to the body meant every edit that promoted
     a version to current was compared against unfiled records instead of the
     project's own, and the guard was dead on the exact action it governs. */
  storedProjectId?: string | null,
): Promise<string | null> {
  if (String(incoming.status ?? '').trim().toLowerCase() !== 'current') return null;
  const fromRow = typeof storedProjectId === 'string' ? storedProjectId.trim() : '';
  const projectId = fromRow || (typeof incoming.projectId === 'string' ? incoming.projectId.trim() : '');
  const existing = await db
    .select({ id: cmcFormulationRecords.id, name: cmcFormulationRecords.formulationName, version: cmcFormulationRecords.version })
    .from(cmcFormulationRecords)
    .where(
      and(
        eq(cmcFormulationRecords.organizationId, orgId),
        eq(cmcFormulationRecords.status, 'current'),
        projectId ? eq(cmcFormulationRecords.projectId, projectId) : isNull(cmcFormulationRecords.projectId),
      ),
    );
  const other = existing.filter((r) => r.id !== excludeId);
  if (other.length === 0) return null;
  const named = other.map((r) => `${r.name}${r.version ? ` (${r.version})` : ''}`).join(', ');
  return `${named} is already the current formulation for this project. Mark it superseded before making another version current — §3.2.P.1 renders one governing composition.`;
}


/* ── Material specifications — §3.2.P.4 excipients, §3.2.S.2.3 raw materials ──
 *
 * One register, two canonical source types: `materialRole` decides which, so an
 * excipient files under §3.2.P.4 and a starting material under §3.2.S.2.3
 * without either completing the other's section.
 */
router.get('/material-specs', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcMaterialSpecs)
      .where(and(eq(cmcMaterialSpecs.organizationId, orgId), projectFilter(req, cmcMaterialSpecs.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch material specifications');
  }
});

router.post('/material-specs', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = materialSpecBody.parse(req.body);
    const [row] = await db
      .insert(cmcMaterialSpecs)
      .values({ ...withoutOrgId(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcMaterialSpecs.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_material_spec', orgId, row, req, writeThroughMaterialSpec);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create material specification');
  }
});

/** Record the supplier's origin declaration, attach the TSE certificate, or correct the entry. */
router.put('/material-specs/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = materialSpecBody.partial().parse(req.body);
    const { projectId: _fixedAtCreation, ...editable } = withoutOrgId(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcMaterialSpecs)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcMaterialSpecs.id, id), eq(cmcMaterialSpecs.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Material specification not found' });
    const linkage = await linkToModule3('write_through_material_spec', orgId, row, req, writeThroughMaterialSpec);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update material specification');
  }
});

/* ── Formulation records — §3.2.P.1 composition, §3.2.P.3.2 batch formula ───── */
router.get('/formulation-records', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcFormulationRecords)
      .where(and(eq(cmcFormulationRecords.organizationId, orgId), projectFilter(req, cmcFormulationRecords.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch formulation records');
  }
});

/**
 * Record a formulation version.
 *
 * Exactly one version may be `current` at a time: §3.2.P.1 renders the current
 * composition, and two records claiming it means the governing composition is
 * not established. The register enforces that in the same transaction as the
 * write, rather than letting the section discover the ambiguity later.
 */
router.post('/formulation-records', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = formulationRecordBody.parse(req.body);
    const conflict = await currentFormulationConflict(orgId, validatedData as Record<string, unknown>, null);
    if (conflict) return res.status(409).json({ success: false, error: conflict });
    const [row] = await db
      .insert(cmcFormulationRecords)
      .values({ ...withoutOrgId(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcFormulationRecords.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_formulation_record', orgId, row, req, writeThroughFormulationRecord);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create formulation record');
  }
});

/** Revise a formulation, or mark it superseded when a new version takes over. */
router.put('/formulation-records/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = formulationRecordBody.partial().parse(req.body);
    const [storedRow] = await db
      .select({ projectId: cmcFormulationRecords.projectId })
      .from(cmcFormulationRecords)
      .where(and(eq(cmcFormulationRecords.id, id), eq(cmcFormulationRecords.organizationId, orgId)));
    if (!storedRow) return res.status(404).json({ success: false, error: 'Formulation record not found' });
    const conflict = await currentFormulationConflict(
      orgId, validatedData as Record<string, unknown>, id, storedRow.projectId,
    );
    if (conflict) return res.status(409).json({ success: false, error: conflict });
    const { projectId: _fixedAtCreation, ...editable } = withoutOrgId(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcFormulationRecords)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcFormulationRecords.id, id), eq(cmcFormulationRecords.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Formulation record not found' });
    const linkage = await linkToModule3('write_through_formulation_record', orgId, row, req, writeThroughFormulationRecord);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update formulation record');
  }
});

/* ── Manufacturing processes — §3.2.S.2.2 / §3.2.P.3.3 ───────────────────────
 *
 * The register writes `manufacturing_processes`, which already existed: it was
 * reconstructed from its two readers (server/services/cmc/ich-compliance-
 * checker.ts and server/services/cmc/qbd-analyzer.ts) because no writer had
 * ever been built for it, and it is cmc_process_steps' FK target. A second
 * table would have left those readers pointed at rows nobody writes.
 *
 * `processType` is the side: a drug-substance process is §3.2.S.2 content and a
 * drug-product one is §3.2.P.3, and neither completes the other's section.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/manufacturing-processes', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    /* This register's project_id is a uuid column, unlike its siblings' text.
       Postgres rejects a malformed uuid with 22P02, which would have surfaced
       as a 500 on a mistyped query string; a bad filter is a bad request. */
    const projectQuery = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
    if (projectQuery && !UUID_RE.test(projectQuery)) {
      return res.status(400).json({ success: false, error: 'projectId must be a uuid' });
    }
    const rows = await db
      .select()
      .from(manufacturingProcesses)
      .where(and(eq(manufacturingProcesses.organizationId, orgId), projectFilter(req, manufacturingProcesses.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch manufacturing processes');
  }
});

const reselectManufacturingProcess = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(manufacturingProcesses)
    .where(and(eq(manufacturingProcesses.id, id), eq(manufacturingProcesses.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

/* A process is `validated` under a signature, not by typing the word. Same rule
   as qualification on the other registers, different vocabulary because this
   table's lifecycle column is validation_status and its readers already use it. */
const PROCESS_SIGNING = {
  statusColumn: 'validation_status',
  signedValue: 'validated',
  signedByColumn: 'validated_by',
  signedAtColumn: 'validation_date',
} as const;
const PROCESS_VOCAB = { signedValue: 'validated', verb: 'Process validation', path: 'validate' };

router.post('/manufacturing-processes', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = manufacturingProcessBody.parse(req.body);
    if (refusesUngovernedQualification(res, validatedData.validationStatus, 'manufacturing-processes', undefined, PROCESS_VOCAB)) return;
    const [row] = await db
      .insert(manufacturingProcesses)
      .values({ ...validatedData, organizationId: orgId } as typeof manufacturingProcesses.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_manufacturing_process', orgId, row, req, writeThroughManufacturingProcess);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create manufacturing process');
  }
});

/** Add the later steps, attach the parameters, or correct the record. */
router.put('/manufacturing-processes/:id', async (req, res) => {
  try {
    const id = String(req.params.id ?? '').trim();
    /* Same guard as the GET on this table: its primary key is a uuid, and
       Postgres answers a malformed one with 22P02, which respondWriteError
       turned into a 500 and logged as a CMC write failure. A client-side typo
       is a bad request, not a server fault. */
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ success: false, error: 'A manufacturing process id must be a uuid' });
    }
    const orgId = getOrgId(req);
    const validatedData = manufacturingProcessBody.partial().parse(req.body);
    const stored = await reselectManufacturingProcess(id, orgId);
    if (!stored) return res.status(404).json({ success: false, error: 'Manufacturing process not found' });
    const sentStatus = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'validationStatus');
    const clearedStatus = sentStatus && !String(validatedData.validationStatus ?? '').trim();
    /* An EXPLICIT clear is a de-signing. refusesUngovernedQualification's
       out-of-signed-state branch is guarded on a truthy incoming value, so a
       null or empty string slipped past both branches and wrote SQL NULL over
       validation_status — stranding validated_by and validation_date on a
       record that no longer claimed to be validated, and re-opening the
       governed route for a second person to sign over the first. */
    if (clearedStatus) {
      if (String(stored.validationStatus ?? '').toLowerCase() === PROCESS_SIGNING.signedValue) {
        return res.status(409).json({
          success: false,
          error:
            'This process is validated under a recorded signature and its validation status cannot be cleared by an ordinary edit. ' +
            'Retire it, or record a new assessment.',
        });
      }
    } else if (refusesUngovernedQualification(res, validatedData.validationStatus, 'manufacturing-processes', stored.validationStatus, PROCESS_VOCAB)) {
      return;
    }
    /* The state a validation signature was refused over must not be reachable
       one PUT after signing. The /validate precondition refuses to sign a
       process that records no steps; clearing the steps afterwards would leave
       the signature attached to a process the register does not describe. */
    if (String(stored.validationStatus ?? '').toLowerCase() === PROCESS_SIGNING.signedValue
        && Object.prototype.hasOwnProperty.call(req.body ?? {}, 'processSteps')
        && (validatedData.processSteps ?? []).length === 0) {
      return res.status(409).json({
        success: false,
        error:
          'This process is validated under a recorded signature. Removing its steps would leave that signature ' +
          'attached to a process the register does not describe — retire it, or record a new process.',
      });
    }
    /* The signature columns are written by the governed route only, and the
       project a process belongs to is fixed at creation. */
    const {
      projectId: _fixedAtCreation,
      validatedBy: _signedBy,
      validationDate: _signedAt,
      ...editable
    } = validatedData as Record<string, unknown>;
    /* Never write an empty lifecycle: an omitted or cleared status leaves the
       stored one alone rather than nulling the column. */
    if (clearedStatus) delete (editable as Record<string, unknown>).validationStatus;
    const [row] = await db
      .update(manufacturingProcesses)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(manufacturingProcesses.id, id), eq(manufacturingProcesses.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Manufacturing process not found' });
    const linkage = await linkToModule3('write_through_manufacturing_process', orgId, row, req, writeThroughManufacturingProcess);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update manufacturing process');
  }
});

/** The governed validation of a manufacturing process (21 CFR Part 11). */
router.post('/manufacturing-processes/:id/validate', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    table: 'manufacturing_processes',
    target: 'manufacturing_process',
    surface: 'cmc-manufacturing-processes',
    subject: 'manufacturing process',
    propagation: 'write_through_manufacturing_process',
    signing: PROCESS_SIGNING,
    idKind: 'uuid',
    reselect: reselectManufacturingProcess,
    writeThrough: writeThroughManufacturingProcess,
    /* A process nobody has described cannot be signed as validated. The
       signature would attest to a sequence of unit operations the register does
       not hold. */
    precondition: (row) => {
      const steps = Array.isArray(row.process_steps) ? row.process_steps : [];
      if (steps.length === 0) {
        return 'This process records no steps. A validation signature would attest to a process the register does not describe — record the unit operations first.';
      }
      return null;
    },
  });
});

/* ── Characterisation studies — §3.2.S.3.1 ───────────────────────────────────
 *
 * The composer has demanded a `characterization` source since it was written
 * and nothing produced one. Each study is typed by which of the section's three
 * questions it answers, so three studies of one kind cannot green all three.
 */
router.get('/characterization-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db
      .select()
      .from(cmcCharacterizationStudies)
      .where(and(eq(cmcCharacterizationStudies.organizationId, orgId), projectFilter(req, cmcCharacterizationStudies.projectId)));
    res.json({ success: true, data: rows });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to fetch characterisation studies');
  }
});

const reselectCharacterizationStudy = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(cmcCharacterizationStudies)
    .where(and(eq(cmcCharacterizationStudies.id, parseInt(id, 10)), eq(cmcCharacterizationStudies.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

router.post('/characterization-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = characterizationStudyBody.parse(req.body);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'characterization-studies')) return;
    const [row] = await db
      .insert(cmcCharacterizationStudies)
      .values({ ...withoutGovernedFields(validatedData as Record<string, unknown>), organizationId: orgId } as typeof cmcCharacterizationStudies.$inferInsert)
      .returning();
    const linkage = await linkToModule3('write_through_characterization_study', orgId, row, req, writeThroughCharacterizationStudy);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create characterisation study');
  }
});

/** Record the result when the study reads out, or correct the entry. */
router.put('/characterization-studies/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = characterizationStudyBody.partial().parse(req.body);
    const stored = await reselectCharacterizationStudy(String(id), orgId);
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'characterization-studies', stored?.status)) return;
    /* The /qualify precondition refuses to sign a study that establishes
       nothing; clearing the result afterwards would leave the signature
       attached to exactly that. What the incoming edit leaves behind is what
       matters, so the check runs over the merged state, not the patch. */
    if (stored && String(stored.status ?? '').toLowerCase() === 'qualified') {
      const body = req.body as Record<string, unknown>;
      const merged = (key: 'result' | 'conclusion') =>
        Object.prototype.hasOwnProperty.call(body ?? {}, key)
          ? String((validatedData as Record<string, unknown>)[key] ?? '').trim()
          : String(stored[key] ?? '').trim();
      if (!merged('result') && !merged('conclusion')) {
        return res.status(409).json({
          success: false,
          error:
            'This study is qualified under a recorded signature. Clearing what it established would leave that ' +
            'signature attesting to nothing — retire it, or record a new study.',
        });
      }
    }
    const { projectId: _fixedAtCreation, ...editable } = withoutGovernedFields(
      validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const [row] = await db
      .update(cmcCharacterizationStudies)
      .set({ ...editable, updatedAt: new Date() })
      .where(and(eq(cmcCharacterizationStudies.id, id), eq(cmcCharacterizationStudies.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ success: false, error: 'Characterisation study not found' });
    const linkage = await linkToModule3('write_through_characterization_study', orgId, row, req, writeThroughCharacterizationStudy);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update characterisation study');
  }
});

/** The governed qualification of a characterisation study (21 CFR Part 11). */
router.post('/characterization-studies/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    table: 'cmc_characterization_studies',
    target: 'characterization_study',
    surface: 'cmc-characterization-studies',
    subject: 'characterisation study',
    propagation: 'write_through_characterization_study',
    reselect: reselectCharacterizationStudy,
    writeThrough: writeThroughCharacterizationStudy,
    /* A study with neither a result nor a conclusion establishes nothing; a
       signature on it would attest to a finding the register does not hold. */
    precondition: (row) =>
      String(row.result ?? '').trim() || String(row.conclusion ?? '').trim()
        ? null
        : 'This study records neither a result nor a conclusion. Record what it established before signing it.',
  });
});

// POST /api/cmc/insights/take-action - Take action on AI insights (DB-backed)
router.post('/insights/take-action', async (req, res) => {
  try {
    const actionSchema = z.object({
      insightId: z.string().min(1, 'Insight ID is required'),
      action: z.string().min(1, 'Action is required'),
      type: z.string().min(1, 'Type is required'),
    });

    const validationResult = actionSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const { insightId, action, type } = validationResult.data;
    const orgId = getOrgId(req);

    // Persist task to project_workflows table
    let taskResult: any;
    try {
      const pool = getPool();

      const priority = type === 'compliance' ? 'high' : 'medium';
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await pool.query(
        `INSERT INTO project_workflows (organization_id, workflow_name, workflow_data, status, progress, assigned_to, start_date, end_date)
         VALUES ($1, $2, $3, 'active', 0, $4, NOW(), $5)
         RETURNING *`,
        [
          orgId,
          `Insight Action: ${action}`,
          JSON.stringify({ insightId, action, type, priority, source: 'cmc-insights' }),
          'CMC Team Lead',
          dueDate,
        ]
      );

      const row = result.rows[0];
      taskResult = {
        taskId: row.id,
        action,
        status: row.status,
        assignedTo: row.assigned_to,
        priority,
        dueDate: row.end_date,
        createdAt: row.created_at,
      };
    } catch (e) {
      console.error('[CMC] Could not persist to project_workflows:', e);
      return res.status(500).json({ success: false, error: 'Failed to persist workflow task' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Action taken successfully',
      task: taskResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC] Error taking action on insight:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to take action on insight',
    });
  }
});

// POST /api/cmc/compliance/check-rules - Check compliance rules (DB-backed)
router.post('/compliance/check-rules', async (req, res) => {
  try {
    const rulesSchema = z.object({
      insightId: z.string().min(1, 'Insight ID is required'),
      type: z.string().min(1, 'Type is required'),
      section: z.string().optional(),
    });

    const validationResult = rulesSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid input data',
        details: validationResult.error.errors,
      });
    }

    const { insightId, type, section } = validationResult.data;

    console.log(
      `[CMC] Checking compliance rules for insight ${insightId} (type: ${type}, section: ${section})`
    );

    // Query complianceTracking table for real violations
    let rules: any[] = [];
    let complianceScore = 100;
    let recommendedActions: string[] = [];

    try {
      const pool = getPool();

      const orgId = getOrgId(req);
      const result = await pool.query(
        `SELECT * FROM compliance_tracking WHERE organization_id = $1 OR organization_id IS NULL ORDER BY created_at DESC LIMIT 50`,
        [orgId]
      );

      const trackingRows = result.rows;

      if (trackingRows.length > 0) {
        for (const row of trackingRows) {
          const ruleStatus = row.status === 'compliant' ? 'compliant' : 'violation';
          rules.push({
            rule: row.guideline,
            status: ruleStatus,
            severity: row.risk_level || 'medium',
            description: row.requirement,
            trackingId: row.id,
          });
          if (ruleStatus === 'violation') {
            complianceScore -= 8;
            if (row.mitigation) {
              recommendedActions.push(row.mitigation);
            }
          }
        }
      } else {
        // No compliance tracking records exist yet — return clean state
        rules = [];
        complianceScore = 100;
        recommendedActions = [];
      }
    } catch (e) {
      console.error('[CMC] Could not query compliance_tracking:', e);
      return res.status(500).json({ success: false, error: 'Failed to check compliance rules' });
    }

    complianceScore = Math.max(complianceScore, 0);
    const violations = rules.filter((r: any) => r.status === 'violation').length;

    const complianceCheck = {
      insightId,
      violations,
      rules,
      complianceScore,
      recommendedActions,
      checkedAt: new Date().toISOString(),
    };

    res.status(200).json({
      status: 'success',
      message: 'Compliance rules checked successfully',
      violations: complianceCheck.violations,
      complianceCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CMC] Error checking compliance rules:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check compliance rules',
    });
  }
});

// =====================================================
// Comparability Studies Routes (canonical DB-backed persistence)
// =====================================================

router.get('/comparability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, assessment_name as title, changed_element as product, change_type as type, status,
              created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
              justification as outcome, reviewed_by as owner
       FROM cmc_comparability_assessments
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    const studies = rows.map((r: any) => ({ ...r, methods: r.methods || [] }));
    res.json({ success: true, data: studies });
  } catch (error) {
    console.error('Error fetching comparability studies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comparability studies' });
  }
});

router.post('/comparability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO cmc_comparability_assessments (
         organization_id, project_id, assessment_name, change_type, changed_element,
         affected_process_parameters, justification, reviewed_by, status, tenant_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       RETURNING id, project_id, assessment_name as title, changed_element as product, change_type as type, status,
                 created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
                 justification as outcome, reviewed_by as owner`,
      [
        orgId,
        req.body.projectId,
        req.body.title || '',
        req.body.type || '',
        req.body.product || '',
        JSON.stringify(req.body.methods || []),
        req.body.outcome || null,
        req.body.owner || null,
        req.body.status || 'draft',
        String(orgId),
      ]
    );
    // Write-through: read projectId from DB return, not request body
    if (rows[0]?.project_id) {
      writeThroughComparability(orgId, rows[0].project_id, String(rows[0].id), rows[0]).catch(err =>
        observeWriteThroughFailure('write_through_comparability', rows[0].id, err)
      );
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating comparability study:', error);
    res.status(500).json({ success: false, error: 'Failed to create comparability study' });
  }
});

router.put('/comparability-studies/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE cmc_comparability_assessments
       SET assessment_name = COALESCE($1, assessment_name),
           changed_element = COALESCE($2, changed_element),
           change_type = COALESCE($3, change_type),
           affected_process_parameters = COALESCE($4::jsonb, affected_process_parameters),
           justification = COALESCE($5, justification),
           reviewed_by = COALESCE($6, reviewed_by),
           status = COALESCE($7, status),
           updated_at = NOW()
       WHERE id = $8 AND organization_id = $9
       RETURNING id, project_id, assessment_name as title, changed_element as product, change_type as type, status,
                 created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
                 justification as outcome, reviewed_by as owner`,
      [
        req.body.title,
        req.body.product,
        req.body.type,
        req.body.methods ? JSON.stringify(req.body.methods) : null,
        req.body.outcome,
        req.body.owner,
        req.body.status,
        req.params.id,
        orgId,
      ]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Study not found' });
    }
    // Write-through: read projectId from DB, not request body
    if (rows[0].project_id) {
      writeThroughComparability(orgId, rows[0].project_id, String(req.params.id), rows[0]).catch(err =>
        observeWriteThroughFailure('write_through_comparability', req.params.id, err)
      );
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating comparability study:', error);
    res.status(500).json({ success: false, error: 'Failed to update comparability study' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED BLUEPRINT GENERATION (CMCHub)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/cmc/generate-enhanced-blueprint
 * Generate ICH Q-series compliant Module 3.2.S/P section content
 */
router.post('/generate-enhanced-blueprint', async (req: express.Request, res: express.Response) => {
  try {
    const { projectId, section, drugSubstance, drugProduct, submissionType } = req.body;

    if (!section) {
      return res.status(400).json({ success: false, error: 'section is required' });
    }

    // Build prompt context from drug substance/product form data
    const dsInfo = drugSubstance
      ? `Drug Substance: ${drugSubstance.name || 'N/A'}, INN: ${drugSubstance.inn || 'N/A'}, Route: ${drugSubstance.route || 'N/A'}, Dosage Form: ${drugSubstance.dosageForm || 'N/A'}`
      : 'Drug substance information not provided.';
    const dpInfo = drugProduct
      ? `Drug Product: ${drugProduct.name || 'N/A'}, Strength: ${drugProduct.strength || 'N/A'}, Container: ${drugProduct.container || 'N/A'}`
      : 'Drug product information not provided.';

    const { ai: aiClient } = await import('../../lib/unified-ai-client.js');

    const result = await aiClient.chat(
      [
        {
          role: 'system',
          content: `You are a CMC regulatory writer generating Module 3 content for an ${submissionType || 'IND'} submission following ICH Q1-Q14 guidelines. Generate a compliant draft for section ${section} with regulatory-grade technical language. Include relevant specifications, acceptance criteria, and cross-references to ICH guidelines where applicable.`,
        },
        {
          role: 'user',
          content: `Generate section ${section} content.

${dsInfo}
${dpInfo}
Submission Type: ${submissionType || 'IND'}
Project ID: ${projectId || 'N/A'}

Write a comprehensive draft for this CMC section following ICH guidelines.`,
        },
      ],
      { taskType: 'regulatory_review', temperature: 0.3, maxTokens: 3000, callerModule: 'cmc-blueprint-generator' }
    );

    res.json({
      success: true,
      data: {
        section,
        content: result.content || '',
        wordCount: (result.content || '').split(/\s+/).length,
        submissionType: submissionType || 'IND',
      },
    });
  } catch (error) {
    console.error('CMC blueprint generation error:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Generation failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA-DRIVEN QUALITY ANALYSIS (replaces hardcoded CQA/CPP heuristics for
// projects that have CMC source data). The blueprint-generator route keeps
// its type-string heuristics for upfront blueprint creation where no
// project data exists yet.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/cmc/quality/qbd/:projectId
 * Derive CQAs and CPPs from the project's actual stored data
 * (specifications, methods, stability, processes, source objects).
 */
router.get('/quality/qbd/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.params.projectId;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }
    const { analyzeQbdFromSources } = await import('../../services/cmc/qbd-analyzer');
    const result = await analyzeQbdFromSources(orgId, projectId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('QbD analysis error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'QbD analysis failed',
    });
  }
});

/**
 * POST /api/cmc/ich-compliance
 * Deterministic ICH compliance check for a project. Runs rule-based
 * checks across Q1A/Q2/Q3A-B/Q3D/Q6A-B/Q8/Q9/Q10 against the project's
 * actual stored data. Every finding cites the underlying guideline.
 */
router.post('/ich-compliance', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.body?.projectId;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, error: 'projectId (string UUID) is required' });
    }
    const { runIchComplianceCheck } = await import('../../services/cmc/ich-compliance-checker');
    const report = await runIchComplianceCheck(orgId, projectId);
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('ICH compliance check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'ICH compliance check failed',
    });
  }
});

/**
 * POST /api/cmc/variations/classify
 * Deterministic SUPAC / variations classifier. Takes a proposed change
 * description and returns the FDA reporting category, EMA variation
 * category, SUPAC tier, bioequivalence requirement, impacted CTD
 * sections, validation requirements, estimated timeline, and the
 * cross-module impact analysis. Grounded in 21 CFR 314.70, SUPAC-IR /
 * MR / SS, Commission Regulation 1234/2008, and ICH Q12.
 */
router.post('/variations/classify', async (req, res) => {
  try {
    getOrgId(req); // tenant scope enforcement
    const { classifyVariation } = await import('../../services/cmc/supac-classifier');
    const input = req.body ?? {};
    if (!input.dosageFormFamily || !input.changeCategory) {
      return res.status(400).json({
        success: false,
        error: 'dosageFormFamily and changeCategory are required',
      });
    }
    const classification = classifyVariation(input);
    res.json({ success: true, data: classification });
  } catch (error) {
    console.error('Variations classifier error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Classification failed',
    });
  }
});

/**
 * POST /api/cmc/control-strategy
 * Deterministic ICH Q8/Q9/Q10/Q11-grade control strategy generator.
 * Reads CMC source objects, specs, methods, stability — produces a
 * structured control strategy with risk-based justifications and
 * cited guidance. Replaces the fallback playbook string.
 */
router.post('/control-strategy', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectId = req.body?.projectId;
    const scope = req.body?.scope ?? 'both';
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ success: false, error: 'projectId (string UUID) is required' });
    }
    if (scope !== 'drug_substance' && scope !== 'drug_product' && scope !== 'both') {
      return res.status(400).json({
        success: false,
        error: 'scope must be one of drug_substance | drug_product | both',
      });
    }
    const { generateControlStrategy } = await import('../../services/cmc/control-strategy-generator');
    const strategy = await generateControlStrategy(orgId, projectId, scope);
    res.json({ success: true, data: strategy });
  } catch (error) {
    console.error('Control strategy generator error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Control strategy generation failed',
    });
  }
});

/**
 * POST /api/cmc/stability-studies/:id/shelf-life
 * Estimate the shelf life a study's OWN recorded data support, by ICH Q1E.
 *
 * ── Why this route exists ─────────────────────────────────────────────────────
 * `services/cmc/shelf-life.ts` is a tested, deterministic ICH Q1E estimator —
 * ordinary least squares of the attribute against time, solved to where the
 * one-sided 95% confidence limit meets the specification limit, with the
 * t-quantile taken from the project's tested Student-t CDF so the number
 * reproduces exactly. It has never had an HTTP route in the CMC family, so the
 * one calculation a stability programme exists to produce could not be reached
 * from the product, and a shelf life could only ever be typed in by hand.
 *
 * The estimator needs a per-timepoint series. That is exactly what the stability
 * surface now records into `stability_data.results`, so this route reads the
 * study's own series, groups it by parameter, and estimates per parameter.
 *
 * ── What it refuses to do ─────────────────────────────────────────────────────
 * Nothing is invented to make an estimate possible:
 *   • a parameter needs ≥ 3 usable points and a numeric specification limit, or
 *     it is reported as not estimable WITH THE REASON — never dropped, and never
 *     given a default limit;
 *   • the spec limit and trend direction are read from what was recorded
 *     ("<= 2.0%" ⇒ increasing toward an upper limit of 2.0), and a criterion
 *     that cannot be parsed is reported as such;
 *   • the estimate is NOT written to `shelf_life`. That column is the shelf life
 *     the organisation CLAIMS, which is a regulatory decision a person makes on
 *     the close-out form. This route computes evidence for that decision.
 *   • ICH Q1E batch poolability (ANCOVA across batches) is a separate concern —
 *     `services/cmc/shelf-life-poolability.ts` — and this single-study estimate
 *     says so rather than implying a pooled claim.
 */
router.post('/stability-studies/:id/shelf-life', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const orgId = getOrgId(req);
    const [study] = await db
      .select({
        id: stabilityStudies.id,
        studyTitle: stabilityStudies.studyTitle,
        productName: stabilityStudies.productName,
        batchNumber: stabilityStudies.batchNumber,
        storageConditions: stabilityStudies.storageConditions,
        duration: stabilityStudies.duration,
        stabilityData: stabilityStudies.stabilityData,
      })
      .from(stabilityStudies)
      .where(and(eq(stabilityStudies.id, id), eq(stabilityStudies.organizationId, orgId)));
    if (!study) return res.status(404).json({ success: false, error: 'Stability study not found' });

    /* One implementation, shared with AnA's recorded-estimate tool: the fit a
       registered shelf life is set from must not have two versions. */
    const { estimateRecordedShelfLife } = await import('../../services/cmc/recorded-stability');
    const outcome = await estimateRecordedShelfLife(study);
    if (!outcome.ok) {
      return res.status(409).json({ success: false, error: outcome.error });
    }
    return res.json({ success: true, data: outcome.data });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to estimate shelf life');
  }
});

/**
 * POST /api/cmc/stability-studies/poolability
 * Can these batches be combined into ONE shelf-life claim? — ICH Q1E ANCOVA.
 *
 * ── Why this route exists ─────────────────────────────────────────────────────
 * `services/cmc/shelf-life-poolability.ts` implements the ICH Q1E combinability
 * test exactly — the sequential slope-equality then intercept-equality F-tests at
 * α = 0.25, with the F-quantiles from the project's tested F-CDF — and it has
 * been reachable only as an AnA tool that takes hand-supplied numbers. So the
 * decision that governs whether a registered shelf life may be one pooled figure
 * or must fall back to the shortest batch could not be run against the studies of
 * record. This route runs it on the recorded data, per attribute.
 *
 * ── The refusals are the design ───────────────────────────────────────────────
 * A poolability result asserted from mismatched inputs is worse than none, so
 * this route stops rather than guesses:
 *   • every study must share ONE storage condition. Q1E combinability is assessed
 *     within a storage condition; pooling 25°C with 40°C fits a line through two
 *     different degradation regimes and the F-tests would be meaningless;
 *   • batch numbers must be distinct. Two studies on the same batch are replicate
 *     testing of one batch, not two batches, and treating them as two understates
 *     between-batch variability — the exact error the test exists to detect;
 *   • an attribute is assessed only where ≥ 2 batches recorded it, and where those
 *     batches agree on the acceptance criterion. Disagreement is reported as a
 *     data conflict to resolve, never averaged away;
 *   • nothing is written. The pooled figure is evidence for the shelf life a
 *     person claims on the close-out form, not the claim itself.
 */
const poolabilityRequest = z.object({
  studyIds: z.array(z.coerce.number().int().positive()).min(2).max(30),
});

router.post('/stability-studies/poolability', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { studyIds } = poolabilityRequest.parse(req.body ?? {});
    const wanted = Array.from(new Set(studyIds));
    if (wanted.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Poolability compares batches, so it needs at least two DIFFERENT studies.',
      });
    }

    const studies = await db
      .select({
        id: stabilityStudies.id,
        studyTitle: stabilityStudies.studyTitle,
        productName: stabilityStudies.productName,
        batchNumber: stabilityStudies.batchNumber,
        storageConditions: stabilityStudies.storageConditions,
        duration: stabilityStudies.duration,
        stabilityData: stabilityStudies.stabilityData,
      })
      .from(stabilityStudies)
      .where(and(inArray(stabilityStudies.id, wanted), eq(stabilityStudies.organizationId, orgId)));

    if (studies.length !== wanted.length) {
      const found = new Set(studies.map(s => s.id));
      return res.status(404).json({
        success: false,
        error: `Stability ${wanted.filter(id => !found.has(id)).length === 1 ? 'study' : 'studies'} not found: ${wanted.filter(id => !found.has(id)).join(', ')}`,
      });
    }

    const outcome = await assessRecordedPoolability(studies);
    if (!outcome.ok) {
      return res.status(outcome.status).json({ success: false, error: outcome.error });
    }
    return res.json({ success: true, data: outcome.data });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to assess batch poolability');
  }
});

export default router;
