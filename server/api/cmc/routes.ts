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
} from '../../services/cmc-write-through';
import {
  analyticalMethods,
  processValidation,
  stabilityStudies,
  qcTesting,
  cmcChangeControl,
  drugSubstances,
  drugProducts,
  insertAnalyticalMethodSchema,
  insertProcessValidationSchema,
  insertStabilityStudySchema,
  insertQcTestingSchema,
  insertCmcChangeControlSchema,
  insertDrugSubstanceSchema,
  insertDrugProductSchema,
} from '../../../shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
/* Reading a stability programme's recorded series, and the ICH Q1E poolability
   assessment over it, both live in services/cmc/recorded-stability. The
   eligibility rules there are the safety story for a shelf-life claim and have
   two callers — this route and AnA's `assess_recorded_batch_poolability` tool —
   so there is exactly one copy of them. */
import {
  readRecordedStabilityResults,
  parseNumeric,
  parseAcceptanceCriterion,
  groupByParameter,
  assessRecordedPoolability,
} from '../../services/cmc/recorded-stability';
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
const analyticalMethodBody = insertAnalyticalMethodSchema.omit({ organizationId: true }).extend({
  validationDate: optionalDate,
});
const processValidationBody = insertProcessValidationSchema.omit({ organizationId: true }).extend({
  approvalDate: optionalDate,
});
const stabilityStudyBody = insertStabilityStudySchema.omit({ organizationId: true }).extend({
  startDate: requiredDate,
  plannedEndDate: optionalDate,
});
const qcTestingBody = insertQcTestingSchema.omit({ organizationId: true }).extend({
  testDate: requiredDate,
  releaseDate: optionalDate,
});
const changeControlBody = insertCmcChangeControlSchema.omit({ organizationId: true }).extend({
  implementationDate: optionalDate,
});
const drugSubstanceBody = insertDrugSubstanceSchema.omit({ organizationId: true });
const drugProductBody = insertDrugProductSchema.omit({ organizationId: true });

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
    const { analyst: _analystIsARecord, ...safeData } = withoutOrgId(
      validatedData as Record<string, unknown>
    ) as { analyst?: unknown } & Record<string, unknown>;
    const [test] = await db
      .update(qcTesting)
      .set({ ...safeData, updatedAt: new Date() })
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

    const { estimateShelfLife } = await import('../../services/cmc/shelf-life');
    const series = readRecordedStabilityResults(study.stabilityData);
    if (series.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'This study has no recorded pull-point results — there is nothing to fit.',
      });
    }

    /* `storage_conditions` is an ARRAY, and results carry no per-result
       condition. A study placed at more than one condition therefore has ONE
       undifferentiated series spanning two degradation regimes, and a straight
       line through it describes neither. This is a refusal and not a caveat
       because the output is a month count someone sets a registered shelf life
       from — a footnote on a plausible-looking number does not survive being
       copied into a summary. */
    const placedAt = (Array.isArray(study.storageConditions) ? study.storageConditions : [])
      .map(c => String(c ?? '').trim())
      .filter(Boolean);
    if (placedAt.length > 1) {
      return res.status(409).json({
        success: false,
        error: `This study is placed at ${placedAt.length} storage conditions (${placedAt.join(', ')}) and its results are not recorded against a condition, so the points for one condition cannot be separated from the others. Register one study per condition to fit a shelf life.`,
      });
    }

    // Group by the attribute being trended. Q1E fits ONE attribute at a time.
    const byParameter = groupByParameter(series);

    const maxTime = Number.isFinite(study.duration) && (study.duration as number) > 0
      ? Math.max(120, (study.duration as number) * 2)
      : 120;

    const estimates: Array<Record<string, unknown>> = [];
    for (const [parameter, points] of byParameter) {
      const usable = points
        .map(p => ({ time: parseNumeric(p.timePoint), value: parseNumeric(p.result) }))
        .filter((p): p is { time: number; value: number } => p.time !== null && p.value !== null);
      const criterion = parseAcceptanceCriterion(points.map(p => p.specification));

      if (usable.length < 3) {
        estimates.push({
          parameter,
          estimable: false,
          reason: `ICH Q1E regression needs at least 3 numeric timepoints; ${usable.length} of ${points.length} recorded ${points.length === 1 ? 'result is' : 'results are'} numeric.`,
          pointsRecorded: points.length,
          pointsUsable: usable.length,
        });
        continue;
      }
      if (!criterion) {
        estimates.push({
          parameter,
          estimable: false,
          reason:
            'No numeric specification limit was recorded against these results, so there is no limit for the confidence bound to intersect. Record the acceptance criterion (e.g. "<= 2.0%" or ">= 95.0%") on the pull-point results.',
          pointsRecorded: points.length,
          pointsUsable: usable.length,
        });
        continue;
      }

      try {
        const result = estimateShelfLife({
          data: usable,
          specLimit: criterion.limit,
          direction: criterion.direction,
          maxTime,
        });
        estimates.push({
          parameter,
          estimable: true,
          specLimit: criterion.limit,
          direction: criterion.direction,
          pointsUsed: usable.length,
          ...result,
        });
      } catch (e) {
        estimates.push({
          parameter,
          estimable: false,
          reason: e instanceof Error ? e.message : String(e),
          pointsRecorded: points.length,
          pointsUsable: usable.length,
        });
      }
    }

    // The programme-level answer is the most constraining attribute, which is
    // what a shelf-life claim is actually limited by.
    const estimable = estimates.filter(e => e.estimable) as Array<{ parameter: string; shelfLife: number }>;
    const limiting = estimable.length
      ? estimable.reduce((min, e) => (e.shelfLife < min.shelfLife ? e : min))
      : null;

    return res.json({
      success: true,
      data: {
        studyId: study.id,
        studyTitle: study.studyTitle,
        productName: study.productName,
        batchNumber: study.batchNumber,
        storageConditions: study.storageConditions,
        basis: 'ICH Q1E — ordinary least squares, one-sided 95% mean confidence limit vs the specification limit',
        scopeLimit:
          'Single attribute, single factor, one batch. Batch poolability (ICH Q1E ANCOVA) is assessed separately and is not implied by this estimate.',
        maxTimeEvaluated: maxTime,
        limitingParameter: limiting ? limiting.parameter : null,
        supportedShelfLife: limiting ? limiting.shelfLife : null,
        estimates,
      },
    });
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
