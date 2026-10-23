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
  insertCmcReferenceStandardSchema,
  insertCmcImpurityProfileSchema,
  insertCmcDissolutionProfileSchema,
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
import { assessRecordedPoolability, readRecordedStabilityResults } from '../../services/cmc/recorded-stability';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import { BINDING_BASIS, persistGovernedActionSignature } from '../../services/part11/signature-persistence';
import { clientIpOf } from '../../utils/client-ip';
import { verifiedReauthFactors } from './cmc-signer';
import { checkSigningAuthority } from '../../services/part11/signing-authority-gate';
import { resolveSignerIdentity } from '../../services/part11/resolve-signer-identity';
import { governedSignatureSchema, resolveActorUserId } from './governance';
import { governedActorId } from '../../middleware/orgMembership';
import {
  SIGNED_REGISTERS,
  type SignedRegister,
  isSigned,
  retireSignedRecord,
  signedRegisterEditRefusal,
  withoutSignatureFields,
} from '../../services/cmc/signed-record';
import { createScopedLogger } from '../../utils/logger';
import { compositionRefusalBody, compositionRefusalStatus } from '../../services/cmc/composition-scope';
import * as metricsModule from '../../metrics.js';
import { serverError } from '../../lib/api-response';
import { launchScopeEnforced } from '../../services/entitlements/launch-scope';
/* The one path from a register save to the Module 3 canonical layer, shared
   with the batch record and specification routes: it awaits the write,
   reports { module3Linked, module3Warning } and meters a failure. */
import { linkToModule3, type LinkableRow, type WriteThroughFn } from '../../services/cmc/link-to-module3';
/* A register row and the record of WHO recorded it, on one transaction
   (§11.10(e); services/cmc/register-audit.ts). The registers below are created
   in this module rather than in the register service, and are recorded the
   same way, from the same helper. */
import { createOnConnection, insertRegisterRow } from '../../services/cmc/register-audit';
/* §11.10(e)'s other half: who CHANGED the row, and what they changed, on the
   row's own transaction. Every PUT below was a bare db.update with no audit row
   and no middleware behind it, so the register layer recorded who entered a
   value and never who changed it
   (services/cmc/register-edit-audit.ts). */
import { updateOnConnection, updateRegisterRow } from '../../services/cmc/register-edit-audit';
import { type CmcRegisterHistoryPath } from '../../../shared/constants/cmc-register-history';
import {
  MissingAuditStore,
  REGISTER_HISTORY_PATHS,
  REGISTER_HISTORY_PATH_NAMES,
  readRegisterHistory,
  registerRecordIsTenants,
} from '../../services/cmc/register-history';
import { setTenantContextTx } from '../../services/tenant/governed-tenant-context';
import { getTableName } from 'drizzle-orm';
/* The register creates, their body schemas and the governed-state refusals
   live in ONE service, called by these routes and by the guided interview's
   commit projector alike (services/cmc/interview-commit.ts). */
import {
  PROGRAM_FILED_REGISTERS,
  RegisterWriteRefusal,
  characterizationStudyBody,
  containerClosureBody,
  createCharacterizationStudy,
  createContainerClosure,
  createDrugProduct,
  createDrugSubstance,
  createFormulationRecord,
  createManufacturingProcess,
  createMaterialSpec,
  currentFormulationConflict,
  drugProductBody,
  drugSubstanceBody,
  filedProjectOnCreate,
  formulationRecordBody,
  manufacturingProcessBody,
  materialSpecBody,
  optionalDate,
  projectOnEdit,
  requiredDate,
  ungovernedQualificationRefusal,
  withoutOrgId,
  withoutProject,
  withoutTenantKey,
} from '../../services/cmc/register-writes';

const router = express.Router();
const logger = createScopedLogger('cmc-routes');

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

/**
 * Normalise a failed write into an honest response.
 *
 * A rejected field is the client's problem to fix and must say which field;
 * reporting it as `500 Failed to create X` (as every handler here did) tells the
 * operator the server is broken when the real answer is "matrix is required".
 */
/**
 * Who is recording a register row, as the service's §11.10(e) actor.
 *
 * `resolveActorUserId` answers 0 when the session names nobody; the register
 * service refuses that rather than writing an unattributable regulated record,
 * which is the right answer here because every `/api/cmc` route is behind
 * `requireOrgMembership` and a session with no user is a server defect.
 */
function recordedBy(req: express.Request): { userId: number } {
  return { userId: resolveActorUserId(req) };
}

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
  /* A governed-state refusal from the register service: the write the caller
     asked for exists, by a route that records who made it. */
  if (error instanceof RegisterWriteRefusal) {
    return res.status(error.status).json({ success: false, error: error.message });
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
        projectId: analyticalMethods.projectId,
        status: analyticalMethods.status,
        organizationId: analyticalMethods.organizationId,
        createdAt: analyticalMethods.createdAt,
        updatedAt: analyticalMethods.updatedAt,
      })
      .from(analyticalMethods)
      .where(and(eq(analyticalMethods.organizationId, orgId), projectFilter(req, analyticalMethods.projectId)));
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
const referenceStandardBody = withoutTenantKey(insertCmcReferenceStandardSchema).extend({
  expiryDate: optionalDate,
  retestDate: optionalDate,
  qualificationDate: optionalDate,
});
const impurityProfileBody = withoutTenantKey(insertCmcImpurityProfileSchema).extend({
  /* The register's own GET returns qualificationDate as an ISO string, so a
     client that reads a row and writes it back would have been rejected by the
     z.date() drizzle-zod generates for the column. The field is stripped by
     withoutSignatureFields regardless — the coercion is what stops the whole
     request failing before it gets there. */
  qualificationDate: optionalDate,
});
const dissolutionProfileBody = withoutTenantKey(insertCmcDissolutionProfileSchema).extend({
  testDate: optionalDate,
});

const reselectAnalyticalMethod = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(analyticalMethods)
    .where(and(eq(analyticalMethods.id, parseInt(id, 10)), eq(analyticalMethods.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

router.post('/analytical-methods', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = analyticalMethodBody.parse(req.body);
    /* A method is not born validated. `status: 'validated'` with its own
       `validatedBy` and `validationDate` was a plain create field until
       2026-10-18, and the value is read as a completed ICH Q2 exercise by
       §3.2.S.4.3's 'Validation Status' column, by the Q2 engine's VALIDATED
       set and by the contradiction sweep's method_validation_gap. */
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'analytical-methods')) return;
    const projectId = await filedProjectOnCreate(orgId, (validatedData as { projectId?: unknown }).projectId);
    // createInsertSchemaOmit widens the parsed type to `{}`, so cast the
    // Zod-validated values to the table insert type at this boundary.
    const method = await insertRegisterRow(orgId, recordedBy(req), 'analytical_method', analyticalMethods, {
      ...withoutSignatureFields(SIGNED_REGISTERS.analyticalMethods, validatedData as Record<string, unknown>),
      projectId,
      organizationId: orgId,
    } as typeof analyticalMethods.$inferInsert);
    const linkage = await linkToModule3('write_through_analytical_method', orgId, method, writeThroughAnalyticalMethod, req);
    res.json({ success: true, data: method, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to create analytical method');
  }
});

router.put('/analytical-methods/:id', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const orgId = getOrgId(req);
    const validatedData = analyticalMethodBody.partial().parse(req.body);
    const filing = await projectOnEdit(orgId, PROGRAM_FILED_REGISTERS.analyticalMethod, id, req.body?.projectId);
    if (!filing.found) return res.status(404).json({ success: false, error: 'Analytical method not found' });
    const stored = await reselectAnalyticalMethod(String(id), orgId);
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.analyticalMethods, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectAnalyticalMethod(String(id), orgId),
      (row) => linkToModule3('write_through_analytical_method', orgId, row, writeThroughAnalyticalMethod, req),
    )) return;
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'analytical-methods', stored?.status)) return;
    // Strip organizationId so the tenant scope cannot be overridden by the request body.
    const safeData = withoutProject(withoutSignatureFields(SIGNED_REGISTERS.analyticalMethods, validatedData as Record<string, unknown>));
    const method = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'analytical_method',
      table: analyticalMethods,
      where: and(eq(analyticalMethods.id, id), eq(analyticalMethods.organizationId, orgId)),
      patch: { ...safeData, ...filing.set, updatedAt: new Date() },
    });
    if (!method) return res.status(404).json({ success: false, error: 'Analytical method not found' });
    const linkage = await linkToModule3('write_through_analytical_method', orgId, method, writeThroughAnalyticalMethod, req);
    res.json({ success: true, data: method, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update analytical method');
  }
});

/**
 * The governed validation of an analytical method (ICH Q2(R2), 21 CFR Part 11).
 *
 * The register carried `validated_by` and `validation_date` from the day it
 * was created and nothing ever signed them: a staffer picked 'validated' from
 * the status dropdown and the ICH Q2 engine stopped reporting the method as a
 * shortfall. A method's validation is the conclusion of an exercise — the
 * protocol executed, the report accepted — so it is signed, with a reason,
 * like every other register's.
 *
 * The precondition is the Q2 record itself: a signature over no validation
 * parameters attests to an exercise the register does not hold.
 */
router.post('/analytical-methods/:id/validate', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.analyticalMethods,
    target: 'analytical_method',
    surface: 'cmc-analytical-methods',
    propagation: 'write_through_analytical_method',
    reselect: reselectAnalyticalMethod,
    writeThrough: writeThroughAnalyticalMethod,
    precondition: (row) => {
      const q2 = row.ich_q2_parameters;
      const recorded = q2 && typeof q2 === 'object' && Object.keys(q2 as object).length > 0;
      return recorded
        ? null
        : 'This method records no ICH Q2 validation parameters, so there is nothing to sign: ' +
          'a validated method states specificity, accuracy, precision, range and the rest of the Q2(R2) package. ' +
          'Record the parameters on the method first.';
    },
  });
});

const reselectProcessValidation = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(processValidation)
    .where(and(eq(processValidation.id, parseInt(id, 10)), eq(processValidation.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

// Process Validation Routes
router.get('/process-validation', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validation = await db
      .select()
      .from(processValidation)
      .where(and(eq(processValidation.organizationId, orgId), projectFilter(req, processValidation.projectId)));
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
    /* The table has carried `approved_by` and `approval_date` since it was
       created and nothing but an ordinary write ever filled them. The composer
       reads this register's status as §3.2.S.2 / §3.2.P.3's process-validation
       statement, so an approval recorded here is an approval the dossier
       states. */
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'process-validation')) return;
    const projectId = await filedProjectOnCreate(orgId, (validatedData as { projectId?: unknown }).projectId);
    const validation = await insertRegisterRow(orgId, recordedBy(req), 'process_validation', processValidation, {
      ...withoutSignatureFields(SIGNED_REGISTERS.processValidation, validatedData as Record<string, unknown>),
      projectId,
      organizationId: orgId,
    } as typeof processValidation.$inferInsert);
    const linkage = await linkToModule3('write_through_process_validation', orgId, validation, writeThroughProcessValidation, req);
    res.json({ success: true, data: validation, ...linkage });
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
    const filing = await projectOnEdit(orgId, PROGRAM_FILED_REGISTERS.processValidation, id, req.body?.projectId);
    if (!filing.found) return res.status(404).json({ success: false, error: 'Process validation record not found' });
    const stored = await reselectProcessValidation(String(id), orgId);
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.processValidation, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectProcessValidation(String(id), orgId),
      (row) => linkToModule3('write_through_process_validation', orgId, row, writeThroughProcessValidation, req),
    )) return;
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'process-validation', stored?.status)) return;
    const validation = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'process_validation',
      table: processValidation,
      where: and(eq(processValidation.id, id), eq(processValidation.organizationId, orgId)),
      patch: {
        ...withoutProject(withoutSignatureFields(SIGNED_REGISTERS.processValidation, validatedData as Record<string, unknown>)),
        ...filing.set,
        updatedAt: new Date(),
      },
    });
    if (!validation) return res.status(404).json({ success: false, error: 'Process validation record not found' });
    const linkage = await linkToModule3('write_through_process_validation', orgId, validation, writeThroughProcessValidation, req);
    res.json({ success: true, data: validation, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update process validation');
  }
});

/**
 * The governed approval of a process-validation record (21 CFR Part 11).
 *
 * `approved_by` and `approval_date` existed from the table's creation and only
 * an ordinary write ever filled them, so the register could name an approver
 * who never approved anything. The composer reads this register's status as
 * the process-validation statement of §3.2.S.2 and §3.2.P.3, which is why the
 * approval is the signed act and not a dropdown value.
 *
 * The precondition is the report: FDA's three-stage guidance makes the
 * approval the acceptance of a validation report, so a record that names none
 * cannot be approved.
 */
router.post('/process-validation/:id/approve', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.processValidation,
    target: 'process_validation',
    surface: 'cmc-process-validation',
    propagation: 'write_through_process_validation',
    reselect: reselectProcessValidation,
    writeThrough: writeThroughProcessValidation,
    precondition: (row) =>
      String(row.validation_report ?? '').trim()
        ? null
        : 'This record names no validation report, so an approval would accept a report that is not identified. ' +
          'Record the report (and its protocol) on the record first.',
  });
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
        projectId: stabilityStudies.projectId,
        createdAt: stabilityStudies.createdAt,
        updatedAt: stabilityStudies.updatedAt,
      })
      .from(stabilityStudies)
      .where(and(eq(stabilityStudies.organizationId, orgId), projectFilter(req, stabilityStudies.projectId)));
    res.json({ success: true, data: studies });
  } catch (error) {
    console.error('Error fetching stability studies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stability studies' });
  }
});

const reselectStabilityStudy = async (id: string, orgId: number) => {
  const [row] = await db
    .select()
    .from(stabilityStudies)
    .where(and(eq(stabilityStudies.id, parseInt(id, 10)), eq(stabilityStudies.organizationId, orgId)));
  return row as Record<string, any> | undefined;
};

router.post('/stability-studies', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = stabilityStudyBody.parse(req.body);
    /* A study is not born closed out. `status: 'COMPLETED'` with a shelf life
       was a plain create until 2026-10-19, and the shelf life is what
       §3.2.S.7.1 / §3.2.P.8.1 prints as the dossier's claim and what the ICH
       Q1E rule judges the programme against. */
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'stability-studies')) return;
    const projectId = await filedProjectOnCreate(orgId, (validatedData as { projectId?: unknown }).projectId);
    const study = await insertRegisterRow(orgId, recordedBy(req), 'stability_study', stabilityStudies, {
      ...withoutSignatureFields(SIGNED_REGISTERS.stabilityStudies, validatedData as Record<string, unknown>),
      projectId,
      organizationId: orgId,
    } as typeof stabilityStudies.$inferInsert);
    const linkage = await linkToModule3('write_through_stability_study', orgId, study, writeThroughStabilityStudy, req);
    res.json({ success: true, data: study, ...linkage });
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
    const filing = await projectOnEdit(orgId, PROGRAM_FILED_REGISTERS.stabilityStudy, id, req.body?.projectId);
    if (!filing.found) return res.status(404).json({ success: false, error: 'Stability study not found' });
    const stored = await reselectStabilityStudy(String(id), orgId);
    /* A closed-out study is closed to content edits: the shelf life, the
       recorded series and the conditions are what the signature accepted, and
       §3.2.S.7 / §3.2.P.8 prints them. Retiring it is a lifecycle end, not a
       reversal, and is allowed. */
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.stabilityStudies, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectStabilityStudy(String(id), orgId),
      (row) => linkToModule3('write_through_stability_study', orgId, row, writeThroughStabilityStudy, req),
    )) return;
    /* ...and the close-out itself is reached only through the ceremony. The
       shelf life may still be RECORDED by an ordinary edit — that is the
       evidence the signature then accepts, audited with both values on the
       chain — but the terminal status is the signed act. */
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'stability-studies', stored?.status)) return;
    const study = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'stability_study',
      table: stabilityStudies,
      where: and(eq(stabilityStudies.id, id), eq(stabilityStudies.organizationId, orgId)),
      patch: {
        ...withoutProject(withoutOrgId(withoutSignatureFields(
          SIGNED_REGISTERS.stabilityStudies, validatedData as Record<string, unknown>,
        ))),
        ...filing.set,
        updatedAt: new Date(),
      },
    });
    if (!study) return res.status(404).json({ success: false, error: 'Stability study not found' });
    const linkage = await linkToModule3('write_through_stability_study', orgId, study, writeThroughStabilityStudy, req);
    res.json({ success: true, data: study, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update stability study');
  }
});

/**
 * The governed close-out of a stability study (21 CFR Part 11, ICH Q1A(R2)/Q1E).
 *
 * This is the act that turns a running study into the dossier's shelf-life
 * claim. §3.2.S.7.1 / §3.2.P.8.1 print `shelf_life` verbatim as the proposed
 * storage period, the ICH Q1E rule judges the programme's claim against the
 * recorded coverage, and the contradiction sweep reads the terminal status —
 * and until 2026-10-19 all of it was an ordinary PUT:
 * `{"shelfLife":"36 months at 25C/60%RH","status":"COMPLETED"}` answered 200
 * with no signature, no reason and no re-authentication.
 *
 * The shelf life itself is still recorded by an ordinary edit, as the Q2
 * package and the validation report are for their registers: the evidence is
 * entered, then the signature accepts it. What the ceremony writes is the
 * terminal status, the signer and the date; after it, the record's content is
 * closed (`answeredSignedRecordEdit`).
 */
router.post('/stability-studies/:id/close-out', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.stabilityStudies,
    target: 'stability_study',
    surface: 'cmc-stability',
    propagation: 'write_through_stability_study',
    reselect: reselectStabilityStudy,
    writeThrough: writeThroughStabilityStudy,
    precondition: (row) => {
      /* Two things must be true of a study before a shelf life may be signed
         for, and they fail differently:

         1. A shelf life must be RECORDED. A signature over an empty claim
            accepts nothing, and §3.2.S.7.1 would print a blank period.
         2. The study must have produced RESULTS. A shelf-life claim over a
            study with nothing pulled is the fabrication the Q1E rule exists to
            catch (docs/evidence/CMC-M3-GA/2026-10-18/06-ich-q1e-verdict/: the
            planned schedule is not data), and a signature would make it a
            governed one. A column that holds something unreadable is NOT the
            same as a study with no results, and is refused as its own case. */
      const claim = String(row.shelf_life ?? row.shelfLife ?? '').trim();
      if (!claim) {
        return (
          'This study records no shelf life, so there is nothing to sign for: a closed-out study states the period ' +
          'and the storage condition §3.2.S.7.1 / §3.2.P.8.1 will print (for example "36 months at 25°C/60% RH"). ' +
          'Record the shelf life on the study first.'
        );
      }
      const recorded = readRecordedStabilityResults(row.stability_data ?? row.stabilityData);
      if (recorded.unreadable) {
        return (
          'This study’s recorded results could not be read, so what the shelf life rests on cannot be established. ' +
          'A signature is not made over data the platform cannot parse. Correct the recorded series first.'
        );
      }
      if (recorded.points.length === 0) {
        return (
          `This study has no recorded pull-point results, so "${claim}" is a claim over no data. A planned schedule ` +
          'is not data: record the results pulled at each time point, then close the study out.'
        );
      }
      return null;
    },
  });
});

// QC Testing Routes
router.get('/qc-testing', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    /* qc_testing carries project_id, and this read ignored it — so a register
       opened on one program listed every program's release and stability
       testing, while the create on the same card filed into the open program.
       The two halves of one card disagreeing about scope is the defect; the
       shared helper is the fix. */
    const testing = await db
      .select()
      .from(qcTesting)
      .where(and(eq(qcTesting.organizationId, orgId), projectFilter(req, qcTesting.projectId)));
    res.json({ success: true, data: testing });
  } catch (error) {
    console.error('Error fetching QC testing:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch QC testing' });
  }
});

/**
 * Why a QC result cannot be recorded as already reviewed.
 *
 * `reviewed_by` non-null IS the §3.2.S.4.4 / §3.2.P.5.4 second-person review,
 * and the batch-release gate reads it as such: `reviewed: r.reviewed_by != null`
 * (services/cmc/batch-release-evidence.ts), and a FULL release is refused while
 * any result is unreviewed. The PUT has governed that fact since it was written
 * — the reviewer is the session, never the body, and a reviewer who is the
 * analyst is refused — but the CREATE spread the whole parsed body into the
 * insert, so one ordinary POST filed a result already stamped as reviewed and
 * released, by a colleague who never saw it, and turned a conditional release
 * into a signed full one. The second-person check was reachable only by callers
 * who chose to go through the edit.
 */
function refusesPreStampedReview(res: express.Response, body: unknown): boolean {
  const claimed = ['reviewedBy', 'releaseDate'].filter(
    (k) => (body as Record<string, unknown> | null)?.[k] !== undefined
      && (body as Record<string, unknown>)[k] !== null
      && (body as Record<string, unknown>)[k] !== '',
  );
  if (claimed.length === 0) return false;
  res.status(409).json({
    success: false,
    code: 'REVIEW_IS_A_SECOND_PERSON',
    error:
      'A QC result is recorded by whoever ran the test and reviewed afterwards by somebody else, so it cannot be ' +
      `created already reviewed (${claimed.join(' and ')}). Record the result, then PUT /api/cmc/qc-testing/:id ` +
      'with reviewedBy to record the review: the reviewer is the signed-in user, and the analyst who ran the test ' +
      'is refused.',
    fields: claimed,
  });
  return true;
}

router.post('/qc-testing', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const validatedData = qcTestingBody.parse(req.body);
    if (refusesPreStampedReview(res, req.body)) return;
    const test = await insertRegisterRow(orgId, recordedBy(req), 'qc_test', qcTesting, {
      ...validatedData,
      organizationId: orgId,
    } as typeof qcTesting.$inferInsert);
    /* Write-through: QC results ARE the batch analyses of §3.2.S.4.4 / §3.2.P.5.4.
       This register was the only one with no canonical write-through, so a
       recorded release result never reached the sections whose entire purpose is
       to carry it. */
    const linkage = await linkToModule3('write_through_qc_testing', orgId, test, writeThroughQcTesting, req);
    res.json({ success: true, data: test, ...linkage });
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
    const test = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'qc_test',
      table: qcTesting,
      where: and(eq(qcTesting.id, id), eq(qcTesting.organizationId, orgId)),
      patch: {
        ...safeData,
        ...(claimsReview ? { reviewedBy: reviewerId } : {}),
        updatedAt: new Date(),
      },
    });
    if (!test) return res.status(404).json({ success: false, error: 'QC test record not found' });
    /* The review IS the state change that matters downstream: an unreviewed
       result is not releasable evidence, so the canonical source must be
       refreshed here too, not only on create. */
    const linkage = await linkToModule3('write_through_qc_testing', orgId, test, writeThroughQcTesting, req);
    res.json({ success: true, data: test, ...linkage });
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
      .where(and(eq(cmcChangeControl.organizationId, orgId), projectFilter(req, cmcChangeControl.projectId)));
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
    const projectId = await filedProjectOnCreate(orgId, (validatedData as { projectId?: unknown }).projectId);
    const change = await insertRegisterRow(orgId, recordedBy(req), 'change_control', cmcChangeControl, {
      ...validatedData,
      projectId,
      organizationId: orgId,
    } as typeof cmcChangeControl.$inferInsert);
    const linkage = await linkToModule3('write_through_change_control', orgId, change, writeThroughChangeControl, req);
    res.json({ success: true, data: change, ...linkage });
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
    const filing = await projectOnEdit(orgId, PROGRAM_FILED_REGISTERS.changeControl, id, req.body?.projectId);
    if (!filing.found) return res.status(404).json({ success: false, error: 'Change-control record not found' });
    const change = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'change_control',
      table: cmcChangeControl,
      where: and(eq(cmcChangeControl.id, id), eq(cmcChangeControl.organizationId, orgId)),
      patch: { ...withoutProject(withoutOrgId(validatedData as Record<string, unknown>)), ...filing.set, updatedAt: new Date() },
    });
    if (!change) return res.status(404).json({ success: false, error: 'Change-control record not found' });
    const linkage = await linkToModule3('write_through_change_control', orgId, change, writeThroughChangeControl, req);
    res.json({ success: true, data: change, ...linkage });
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
        projectId: drugSubstances.projectId,
        createdAt: drugSubstances.createdAt,
        updatedAt: drugSubstances.updatedAt,
      })
      .from(drugSubstances)
      .where(and(eq(drugSubstances.organizationId, orgId), projectFilter(req, drugSubstances.projectId)));
    res.json({ success: true, data: substances });
  } catch (error) {
    console.error('Error fetching drug substances:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drug substances' });
  }
});

router.post('/drug-substances', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { row, ...linkage } = await createDrugSubstance(orgId, req.body, recordedBy(req), req);
    res.json({ success: true, data: row, ...linkage });
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
    const filing = await projectOnEdit(orgId, PROGRAM_FILED_REGISTERS.drugSubstance, id, req.body?.projectId);
    if (!filing.found) return res.status(404).json({ success: false, error: 'Drug substance not found' });
    const substance = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'drug_substance',
      table: drugSubstances,
      where: and(eq(drugSubstances.id, id), eq(drugSubstances.organizationId, orgId)),
      patch: { ...withoutProject(withoutOrgId(validatedData as Record<string, unknown>)), ...filing.set, updatedAt: new Date() },
    });
    if (!substance) return res.status(404).json({ success: false, error: 'Drug substance not found' });
    const linkage = await linkToModule3('write_through_drug_substance', orgId, substance, writeThroughDrugSubstance, req);
    res.json({ success: true, data: substance, ...linkage });
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
        /* §3.2.P.3.2's batch formula. Left out of this projection, the register
           card never received it, the edit form defaulted it to blank, and the
           PUT wrote {} back over the column — so recording a batch formula and
           then editing anything else about the product silently erased the only
           producer §3.2.P.3 has. A field the product can capture and cannot
           read back is a field it loses. */
        batchFormula: drugProducts.batchFormula,
        manufacturingProcess: drugProducts.manufacturingProcess,
        packagingMaterials: drugProducts.packagingMaterials,
        status: drugProducts.status,
        organizationId: drugProducts.organizationId,
        projectId: drugProducts.projectId,
        createdAt: drugProducts.createdAt,
        updatedAt: drugProducts.updatedAt,
      })
      .from(drugProducts)
      .where(and(eq(drugProducts.organizationId, orgId), projectFilter(req, drugProducts.projectId)));
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching drug products:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch drug products' });
  }
});

router.post('/drug-products', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { row, ...linkage } = await createDrugProduct(orgId, req.body, recordedBy(req), req);
    res.json({ success: true, data: row, ...linkage });
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
    const filing = await projectOnEdit(orgId, PROGRAM_FILED_REGISTERS.drugProduct, id, req.body?.projectId);
    if (!filing.found) return res.status(404).json({ success: false, error: 'Drug product not found' });
    const product = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'drug_product',
      table: drugProducts,
      where: and(eq(drugProducts.id, id), eq(drugProducts.organizationId, orgId)),
      patch: { ...withoutProject(withoutOrgId(validatedData as Record<string, unknown>)), ...filing.set, updatedAt: new Date() },
    });
    if (!product) return res.status(404).json({ success: false, error: 'Drug product not found' });
    const linkage = await linkToModule3('write_through_drug_product', orgId, product, writeThroughDrugProduct, req);
    res.json({ success: true, data: product, ...linkage });
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
 *      the field exists to prevent. (Every register now holds this one — see
 *      services/cmc/link-to-module3 — it was first held here.)
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
/**
 * The same scope as `projectFilter`, for a handler written in raw SQL.
 *
 * Returns null when the caller named no program, so the predicate
 * `($n IS NULL OR project_id = $n OR project_id IS NULL)` degrades to "no
 * filter" — and, as above, a record with NO project is always included: it is
 * unfiled rather than another program's.
 */
function projectScopeParam(req: express.Request): string | null {
  const raw = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  return raw || null;
}

function projectFilter(req: express.Request, column: AnyPgColumn): SQL | undefined {
  const raw = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  if (!raw) return undefined;
  return or(eq(column as never, raw), isNull(column as never));
}

/**
 * Refuse a self-declared qualification with a 409 naming the governed path.
 * The rule itself is `ungovernedQualificationRefusal` in the register
 * service, shared with the interview commit projector.
 */
function refusesUngovernedQualification(
  res: express.Response,
  status: unknown,
  registerPath: string,
  storedStatus?: unknown,
): boolean {
  const refusal = ungovernedQualificationRefusal(status, registerPath, storedStatus);
  if (!refusal) return false;
  res.status(409).json({ success: false, error: refusal });
  return true;
}

/**
 * An edit of a SIGNED register record (services/cmc/signed-record): its
 * content is closed to ordinary edits, and retiring it needs a governed
 * reason, written with a chained audit row in one transaction. Returns true
 * when it answered the request; false for a record that is not signed.
 */
async function answeredSignedRecordEdit(
  req: express.Request,
  res: express.Response,
  register: SignedRegister,
  storedStatus: unknown,
  patch: Record<string, unknown>,
  orgId: number,
  reselect: () => Promise<Record<string, unknown> | null | undefined>,
  link: (row: LinkableRow) => Promise<object>,
): Promise<boolean> {
  if (!isSigned(register, storedStatus)) return false;
  const refusal = signedRegisterEditRefusal(register, storedStatus, patch);
  if (refusal) {
    res.status(409).json({ success: false, error: refusal, code: 'SIGNED_RECORD' });
    return true;
  }
  const userId = governedActorId(req);
  if (!userId) {
    res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });
    return true;
  }
  const out = await retireSignedRecord({
    register,
    id: String(req.params.id),
    organizationId: orgId,
    userId,
    reason: (req.body ?? {}).reason,
    ipAddress: clientIpOf(req) ?? undefined,
    userAgent: req.headers['user-agent'],
  });
  if (!out.ok) {
    res.status(out.status).json({ success: false, error: out.code, message: out.message, field: 'reason' });
    return true;
  }
  const row = await reselect();
  if (!row) {
    res.status(404).json({ success: false, error: `${register.noun} not found` });
    return true;
  }
  res.json({ success: true, data: row, ...(await link(row as unknown as LinkableRow)) });
  return true;
}

/**
 * The governed qualification of a register record, on the same primitives as
 * the specification approval and the batch release: the signer's authority
 * (checkSigningAuthority) and re-authentication first, the state
 * change and the signature in ONE transaction, then the canonical write-through.
 *
 * `table` is a literal from a closed set, never caller input.
 */
async function qualifyRegisterRecord(
  req: express.Request,
  res: express.Response,
  spec: {
    /**
     * Which register this is, from the one descriptor table
     * (services/cmc/signed-record.ts). It supplies the table, the status
     * column, the signed word, both signature columns, the id shape and the
     * noun — so a register whose create and edit refuse a word cannot be
     * signed with a different one, which was possible while each ceremony
     * declared its own `signing` block.
     */
    register: SignedRegister;
    target: string;
    surface: string;
    propagation: string;
    reselect: (id: string, orgId: number) => Promise<Record<string, any> | undefined>;
    writeThrough: WriteThroughFn;
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

  const signing = {
    statusColumn: spec.register.statusColumn,
    signedValue: spec.register.signedValue,
    signedByColumn: spec.register.signedByColumn,
    signedAtColumn: spec.register.signedAtColumn,
  };
  /** The act, as the compliance statement and the failure message name it. */
  const act = {
    qualify: 'qualification', validate: 'validation', approve: 'approval',
    'close-out': 'close-out',
  }[spec.register.signPath];
  const subject = spec.register.noun;
  const table = spec.register.table;
  const rawId = String(req.params.id ?? '').trim();
  if (spec.register.idKind === 'uuid') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
      return res.status(400).json({ success: false, error: `A ${subject} id is required` });
    }
  } else if (!Number.isInteger(Number(rawId)) || Number(rawId) <= 0) {
    return res.status(400).json({ success: false, error: `A ${subject} id is required` });
  }
  const id: string | number = spec.register.idKind === 'uuid' ? rawId : parseInt(rawId, 10);
  let orgId: number;
  try {
    orgId = getOrgId(req);
  } catch {
    return res.status(401).json({ success: false, error: 'Organization context required' });
  }
  const userId = resolveActorUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });

  // Signing authority (§11.10(g)), then the re-auth gate, before any write.
  // Until the P0-10b fix round only the password was checked, so a viewer
  // could qualify a record.
  const authority = await checkSigningAuthority(userId, orgId);
  if (authority) return res.status(authority.status).json({ success: false, error: authority.code, message: authority.message });
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
      `SELECT * FROM ${table} WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [id, orgId],
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: `${subject} not found` });
    }
    /* Already signed. Re-signing would stamp a second person over the first and
       lose who actually qualified it, so it is refused with the record's own
       facts rather than overwritten. */
    /* Both sides lowercased: a register keeps its own casing for its own
       vocabulary (the stability words are upper-case), and comparing a
       lowercased stored value to a raw upper-case signed word made this check
       never fire — a second close-out answered 200 and re-stamped the signature
       date over the first signer's
       (docs/evidence/CMC-M3-GA/2026-10-19/11-stability-close-out/). */
    if (String(current.rows[0][signing.statusColumn] || '').toLowerCase() === signing.signedValue.toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `This ${subject} is already ${signing.signedValue}`,
        qualifiedAt: current.rows[0][signing.signedAtColumn] ?? null,
      });
    }
    const unmet = spec.precondition ? spec.precondition(current.rows[0]) : null;
    if (unmet) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: unmet });
    }
    /* What the signer column holds: a users.id for every register but the
       comparability one, whose column is the printed name §3.2.P.8 renders.
       Resolved on THIS client, inside the signing transaction, through the same
       lookup the §11.50 row uses — so the row and the register cannot name
       different people, and an unattributable signer fails the whole act
       rather than writing a number into a name. */
    const signedBy = spec.register.signedByKind === 'name'
      ? (await resolveSignerIdentity(client, userId, orgId, 'governed sign')).name
      : userId;
    /* Every interpolated name here is a literal from this file's own closed
       set — the descriptor table above — never caller input; the values still
       travel as parameters. */
    await client.query(
      `UPDATE ${table}
          SET ${signing.statusColumn} = '${signing.signedValue}',
              ${signing.signedByColumn} = $3,
              ${signing.signedAtColumn} = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [id, orgId, signedBy],
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
    // 21 CFR Part 11 signature row, same transaction as the ledger pair; none
    // was written until 2026-10-01 (P0-10b, DP-02). Factors as verified above.
    await persistGovernedActionSignature(client, {
      orgId, userId, target: `${spec.target}:${id}`, reason, payload: { meaning },
      actionId: governance.actionId, auditId: governance.auditId, sha256Chain: governance.sha256Chain,
      ...verifiedReauthFactors(reauth),
      ipAddress: clientIpOf(req),
      occurredAt: new Date(),
      binding: { digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: `No content digest is registered for a ${subject}, so none is claimed: bound_payload_digest is the governed action audit sha256 chain hash (target, payload hash, actor, time), not a content hash.` },
      extraManifest: { act: { [signing.statusColumn]: signing.signedValue } },
      complianceStatement: `${subject} ${act} applied under 21 CFR Part 11 §11.50/§11.70/§11.200; ledger-chained to the audit_logs sha256 chain.`,
    });
    await client.query('COMMIT');

    /* Re-read through Drizzle so the response carries the same camelCase row
       shape every other endpoint of this register returns — the register table
       adopts the server row after a write, and a snake_case body would blank
       every column it just filled in. */
    const row = await spec.reselect(String(id), orgId);
    const linkage = row
      ? await linkToModule3(spec.propagation, orgId, row as LinkableRow, spec.writeThrough, req)
      : { module3Linked: false, module3Warning: `Signed. The record could not be re-read to link it into Module 3.` };
    return res.json({
      success: true,
      data: row,
      governance: { actionId: governance.actionId, sha256Chain: governance.sha256Chain },
      ...linkage,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return respondWriteError(res, error, `Failed to record the ${act} of ${subject}`);
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
    const { row, ...linkage } = await createContainerClosure(orgId, req.body, recordedBy(req), req);
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
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.containerClosures, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectContainerClosure(String(id), orgId),
      (row) => linkToModule3('write_through_container_closure', orgId, row, writeThroughContainerClosure, req),
    )) return;
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'container-closures', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutSignatureFields(
      SIGNED_REGISTERS.containerClosures, validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'container_closure',
      table: cmcContainerClosures,
      where: and(eq(cmcContainerClosures.id, id), eq(cmcContainerClosures.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Container closure system not found' });
    const linkage = await linkToModule3('write_through_container_closure', orgId, row, writeThroughContainerClosure, req);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update container closure system');
  }
});

/** The governed qualification of a container closure system (21 CFR Part 11). */
router.post('/container-closures/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.containerClosures,
    target: 'container_closure',
    surface: 'cmc-container-closures',
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
    const row = await insertRegisterRow(orgId, recordedBy(req), 'reference_standard', cmcReferenceStandards, {
      ...withoutSignatureFields(SIGNED_REGISTERS.referenceStandards, validatedData as Record<string, unknown>),
      organizationId: orgId,
    } as typeof cmcReferenceStandards.$inferInsert);
    const linkage = await linkToModule3('write_through_reference_standard', orgId, row, writeThroughReferenceStandard, req);
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
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.referenceStandards, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectReferenceStandard(String(id), orgId),
      (row) => linkToModule3('write_through_reference_standard', orgId, row, writeThroughReferenceStandard, req),
    )) return;
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'reference-standards', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutSignatureFields(
      SIGNED_REGISTERS.referenceStandards, validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'reference_standard',
      table: cmcReferenceStandards,
      where: and(eq(cmcReferenceStandards.id, id), eq(cmcReferenceStandards.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Reference standard not found' });
    const linkage = await linkToModule3('write_through_reference_standard', orgId, row, writeThroughReferenceStandard, req);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update reference standard');
  }
});

/** The governed qualification of a reference standard (21 CFR Part 11). */
router.post('/reference-standards/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.referenceStandards,
    target: 'reference_standard',
    surface: 'cmc-reference-standards',
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
    const row = await insertRegisterRow(orgId, recordedBy(req), 'impurity_profile', cmcImpurityProfiles, {
      ...withoutSignatureFields(SIGNED_REGISTERS.impurityProfiles, validatedData as Record<string, unknown>),
      organizationId: orgId,
    } as typeof cmcImpurityProfiles.$inferInsert);
    const linkage = await linkToModule3('write_through_impurity_profile', orgId, row, writeThroughImpurityProfile, req);
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
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.impurityProfiles, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectImpurityProfile(String(id), orgId),
      (row) => linkToModule3('write_through_impurity_profile', orgId, row, writeThroughImpurityProfile, req),
    )) return;
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'impurity-profiles', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutSignatureFields(
      SIGNED_REGISTERS.impurityProfiles, validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'impurity_profile',
      table: cmcImpurityProfiles,
      where: and(eq(cmcImpurityProfiles.id, id), eq(cmcImpurityProfiles.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Impurity profile not found' });
    const linkage = await linkToModule3('write_through_impurity_profile', orgId, row, writeThroughImpurityProfile, req);
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
    register: SIGNED_REGISTERS.impurityProfiles,
    target: 'impurity_profile',
    surface: 'cmc-impurity-profiles',
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
    const row = await insertRegisterRow(orgId, recordedBy(req), 'dissolution_profile', cmcDissolutionProfiles, {
      ...withoutOrgId(validatedData as Record<string, unknown>),
      organizationId: orgId,
    } as typeof cmcDissolutionProfiles.$inferInsert);
    const linkage = await linkToModule3('write_through_dissolution_profile', orgId, row, writeThroughDissolutionProfile, req);
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
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'dissolution_profile',
      table: cmcDissolutionProfiles,
      where: and(eq(cmcDissolutionProfiles.id, id), eq(cmcDissolutionProfiles.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Dissolution profile not found' });
    const linkage = await linkToModule3('write_through_dissolution_profile', orgId, row, writeThroughDissolutionProfile, req);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update dissolution profile');
  }
});



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
    const { row, ...linkage } = await createMaterialSpec(orgId, req.body, recordedBy(req), req);
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
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'material_spec',
      table: cmcMaterialSpecs,
      where: and(eq(cmcMaterialSpecs.id, id), eq(cmcMaterialSpecs.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Material specification not found' });
    const linkage = await linkToModule3('write_through_material_spec', orgId, row, writeThroughMaterialSpec, req);
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
    const { row, ...linkage } = await createFormulationRecord(orgId, req.body, recordedBy(req), req);
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
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'formulation_record',
      table: cmcFormulationRecords,
      where: and(eq(cmcFormulationRecords.id, id), eq(cmcFormulationRecords.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Formulation record not found' });
    const linkage = await linkToModule3('write_through_formulation_record', orgId, row, writeThroughFormulationRecord, req);
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

router.post('/manufacturing-processes', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { row, ...linkage } = await createManufacturingProcess(orgId, req.body, recordedBy(req), req);
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
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.manufacturingProcesses, stored.validationStatus, validatedData as Record<string, unknown>, orgId,
      () => reselectManufacturingProcess(id, orgId),
      (row) => linkToModule3('write_through_manufacturing_process', orgId, row, writeThroughManufacturingProcess, req),
    )) return;
    const sentStatus = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'validationStatus');
    const clearedStatus = sentStatus && !String(validatedData.validationStatus ?? '').trim();
    /* A validated process was answered above (answeredSignedRecordEdit): its
       content is closed, so clearing its status or its steps under the
       signature is refused there. What remains is the transition INTO the
       signed state, which only /validate makes. */
    if (!clearedStatus && refusesUngovernedQualification(res, validatedData.validationStatus, 'manufacturing-processes', stored.validationStatus)) {
      return;
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
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'manufacturing_process',
      table: manufacturingProcesses,
      where: and(eq(manufacturingProcesses.id, id), eq(manufacturingProcesses.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Manufacturing process not found' });
    const linkage = await linkToModule3('write_through_manufacturing_process', orgId, row, writeThroughManufacturingProcess, req);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update manufacturing process');
  }
});

/** The governed validation of a manufacturing process (21 CFR Part 11). */
router.post('/manufacturing-processes/:id/validate', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.manufacturingProcesses,
    target: 'manufacturing_process',
    surface: 'cmc-manufacturing-processes',
    propagation: 'write_through_manufacturing_process',
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
    const { row, ...linkage } = await createCharacterizationStudy(orgId, req.body, recordedBy(req), req);
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
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.characterizationStudies, stored?.status, validatedData as Record<string, unknown>, orgId,
      () => reselectCharacterizationStudy(String(id), orgId),
      (row) => linkToModule3('write_through_characterization_study', orgId, row, writeThroughCharacterizationStudy, req),
    )) return;
    if (refusesUngovernedQualification(res, (validatedData as { status?: unknown }).status, 'characterization-studies', stored?.status)) return;
    const { projectId: _fixedAtCreation, ...editable } = withoutSignatureFields(
      SIGNED_REGISTERS.characterizationStudies, validatedData as Record<string, unknown>,
    ) as { projectId?: unknown } & Record<string, unknown>;
    const row = await updateRegisterRow({
      orgId,
      actor: recordedBy(req),
      register: 'characterization_study',
      table: cmcCharacterizationStudies,
      where: and(eq(cmcCharacterizationStudies.id, id), eq(cmcCharacterizationStudies.organizationId, orgId)),
      patch: { ...editable, updatedAt: new Date() },
    });
    if (!row) return res.status(404).json({ success: false, error: 'Characterisation study not found' });
    const linkage = await linkToModule3('write_through_characterization_study', orgId, row, writeThroughCharacterizationStudy, req);
    res.json({ success: true, data: row, ...linkage });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to update characterisation study');
  }
});

/** The governed qualification of a characterisation study (21 CFR Part 11). */
router.post('/characterization-studies/:id/qualify', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.characterizationStudies,
    target: 'characterization_study',
    surface: 'cmc-characterization-studies',
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

// =====================================================
// Comparability Studies Routes (canonical DB-backed persistence)
// =====================================================

/* The row shape every comparability endpoint returns — the register table
   adopts the server row after a write, so the signature's response has to
   carry the same camelCase projection as the GET.

   This is a frozen COLUMN LIST, not a value: it is defined here, in code, and
   no request can reach it. `ci:sql-interpolation` counts it anyway, which is
   the right default — a value in SQL text is an injection waiting for an input
   — so this file's baseline is 7 rather than 6, for this identifier list. The
   register's other three projections (the GET, and the RETURNING of the create
   and the update) are still written out longhand; consolidating them onto this
   constant would quadruple the interpolation count to buy tidiness, which is
   the wrong trade against an injection gate. */
const COMPARABILITY_COLUMNS = `id, project_id, assessment_name as title, changed_element as product,
         change_type as type, status, created_at as "createdAt", updated_at as "updatedAt",
         affected_process_parameters as methods, justification as outcome, reviewed_by as owner`;

const reselectComparabilityAssessment = async (id: string, orgId: number) => {
  const { rows } = await getPool().query(
    `SELECT ${COMPARABILITY_COLUMNS} FROM cmc_comparability_assessments WHERE id = $1 AND organization_id = $2`,
    [id, orgId],
  );
  return rows[0] as Record<string, any> | undefined;
};

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
         AND ($2::text IS NULL OR project_id::text = $2 OR project_id IS NULL)
       ORDER BY created_at DESC`,
      [orgId, projectScopeParam(req)]
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
    /* An assessment is not born approved. §3.2.P.8's 'Comparability Assessments
       (ICH Q5E)' table prints this status and this reviewer, and both were
       request-body fields: an ordinary create could file an approved assessment
       naming any reviewer, with no signature and no reason. */
    if (refusesUngovernedQualification(res, req.body?.status, 'comparability-studies')) return;
    /* And the program it is filed under must be this organisation's. The raw
       INSERT below wrote req.body.projectId straight into the column, so a
       typo filed an assessment under a programme that does not exist and
       another organisation's id filed one under a dossier this tenant does not
       hold — while the fifteen Drizzle creates beside it refused the same body
       (docs/evidence/CMC-M3-GA/2026-10-19/10-unverified-programme/). */
    const filedProject = await filedProjectOnCreate(orgId, req.body?.projectId);
    const created = await createOnConnection(
      getPool(),
      {
        organizationId: orgId,
        actor: recordedBy(req),
        register: 'comparability_study',
        table: 'cmc_comparability_assessments',
      },
      async (client) => {
        const { rows } = await client.query(
          `INSERT INTO cmc_comparability_assessments (
             organization_id, project_id, assessment_name, change_type, changed_element,
             affected_process_parameters, justification, reviewed_by, status, tenant_id
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
           RETURNING id, project_id, assessment_name as title, changed_element as product, change_type as type, status,
                     created_at as "createdAt", updated_at as "updatedAt", affected_process_parameters as methods,
                     justification as outcome, reviewed_by as owner`,
          [
            orgId,
            filedProject,
            req.body.title || '',
            req.body.type || '',
            req.body.product || '',
            JSON.stringify(req.body.methods || []),
            req.body.outcome || null,
            /* `reviewed_by` is written by the approval signature only
               (POST /comparability-studies/:id/approve), which records the
               signer's own id. Taken from the body it named a reviewer nobody
               could verify — the column is free TEXT with no FK to users. */
            null,
            req.body.status || 'draft',
            String(orgId),
          ]
        );
        return rows[0] as { id: number | string };
      },
    );
    /* The program is the stored row's (project_id), never the request body's. */
    const linkage = await linkToModule3('write_through_comparability', orgId, created as LinkableRow, writeThroughComparability);
    res.json({ success: true, data: created, ...linkage });
  } catch (error) {
    /* Through the same reader as every other register create: a refusal the
       caller can act on — a programme that is not this organisation's, a
       governed status claimed on a create — is a 409 naming it, not a 500.
       It answered 500 'Failed to create comparability study' for an unknown
       programme until 2026-10-19, which reads as a server fault for what is a
       bad request (docs/evidence/CMC-M3-GA/2026-10-19/10-unverified-programme/). */
    return respondWriteError(res, error, 'Failed to create comparability study');
  }
});

/**
 * The governed approval of a comparability assessment (ICH Q5E, 21 CFR Part 11).
 *
 * This is what justifies a post-change equivalence claim in §3.2.P.8, and the
 * section prints both the status and the reviewer. Until 2026-10-18 the status
 * was a dropdown value and the reviewer was a free-text body field with no FK
 * to users, so an 'approved' row could name a reviewer who does not exist. The
 * signature writes the signer's own id into `reviewed_by`.
 *
 * The precondition is the justification: Q5E comparability is an argument, and
 * a signature over an assessment that states none approves nothing.
 */
router.post('/comparability-studies/:id/approve', async (req, res) => {
  return qualifyRegisterRecord(req, res, {
    register: SIGNED_REGISTERS.comparabilityAssessments,
    target: 'comparability_study',
    surface: 'cmc-comparability-studies',
    propagation: 'write_through_comparability',
    reselect: reselectComparabilityAssessment,
    writeThrough: writeThroughComparability,
    precondition: (row) =>
      String(row.justification ?? '').trim()
        ? null
        : 'This assessment states no justification, so there is no comparability argument to approve. ' +
          'Record the justification — what was compared, against which acceptance criteria, and what it showed.',
  });
});

router.put('/comparability-studies/:id', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const pool = getPool();
    const stored = await reselectComparabilityAssessment(String(req.params.id), orgId);
    if (!stored) return res.status(404).json({ success: false, error: 'Study not found' });
    if (await answeredSignedRecordEdit(
      req, res, SIGNED_REGISTERS.comparabilityAssessments, stored.status, req.body ?? {}, orgId,
      () => reselectComparabilityAssessment(String(req.params.id), orgId),
      (row) => linkToModule3('write_through_comparability', orgId, row, writeThroughComparability),
    )) return;
    if (refusesUngovernedQualification(res, req.body?.status, 'comparability-studies', stored.status)) return;
    /* The one register whose edit is raw SQL rather than a Drizzle update, so
       it takes the pinned-connection door: the stored row is re-read FOR UPDATE
       on the same connection as the UPDATE and the audit row, and the three
       commit together. The `stored` read above is the signed-state check, which
       runs before the transaction opens; the diff is computed against the row
       read INSIDE it, because a diff against a row read outside would name a
       `from` some other writer had already replaced. */
    const updated = await updateOnConnection<{ id: number | string }>(
      pool,
      {
        organizationId: orgId,
        actor: recordedBy(req),
        register: 'comparability_study',
        table: 'cmc_comparability_assessments',
      },
      /* `SELECT *` and `RETURNING *`, not the camelCase projection: the diff is
         computed over these two rows, and the trail should name the TABLE's own
         columns (`assessment_name`, `changed_element`) rather than the aliases
         the API happens to answer with. It also keeps the column list out of
         the SQL text — `ci:sql-interpolation` counts an interpolated identifier,
         and this is the better answer than raising its baseline again. The
         response's shape is re-read below through the one projection. */
      async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM cmc_comparability_assessments
            WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [req.params.id, orgId],
        );
        return rows[0];
      },
      async (client) => {
        const { rows } = await client.query(
          `UPDATE cmc_comparability_assessments
           SET assessment_name = COALESCE($1, assessment_name),
               changed_element = COALESCE($2, changed_element),
               change_type = COALESCE($3, change_type),
               affected_process_parameters = COALESCE($4::jsonb, affected_process_parameters),
               justification = COALESCE($5, justification),
               status = COALESCE($6, status),
               updated_at = NOW()
           WHERE id = $7 AND organization_id = $8
           RETURNING *`,
          [
            req.body.title,
            req.body.product,
            req.body.type,
            req.body.methods ? JSON.stringify(req.body.methods) : null,
            req.body.outcome,
            /* `owner` (reviewed_by) is dropped here for the same reason it is
               dropped on the create: it is the approver, written by the
               signature. */
            req.body.status,
            req.params.id,
            orgId,
          ],
        );
        return rows[0] as { id: number | string } | undefined;
      },
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Study not found' });
    }
    /* Re-read through the one projection, so the response carries the same
       camelCase shape every other comparability endpoint returns — the register
       table adopts the server row after a write, and a snake_case body would
       blank every column it just filled in. */
    const projected = (await reselectComparabilityAssessment(String(req.params.id), orgId)) ?? updated;
    /* The program is the stored row's (project_id), never the request body's. */
    const linkage = await linkToModule3('write_through_comparability', orgId, projected as LinkableRow, writeThroughComparability);
    res.json({ success: true, data: projected, ...linkage });
  } catch (error) {
    console.error('Error updating comparability study:', error);
    res.status(500).json({ success: false, error: 'Failed to update comparability study' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATA-DRIVEN QUALITY ANALYSIS: CQAs, CPPs, the ICH compliance check and the
// control strategy, each derived deterministically from the program's
// recorded data. Nothing heuristic or model-drafted sits beside them: the
// blueprint router's drug-type CQA/CPP heuristics (blueprintRoutes.ts) were
// retired, and POST /generate-enhanced-blueprint, a model drafting Module 3
// text with no organisation and no record, was deleted on 2026-10-05 with no
// caller (server/api/cmc/__tests__/cmc-retired-routers.contract.test.ts).
// Module 3 text is composed from the record by POST /api/cmc/module3-os/compile.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Is this programme one the organisation holds? Every route below derives,
 * judges or projects over ONE programme's records, and until 2026-10-19 none of
 * them asked.
 *
 * `POST /api/cmc/ich-compliance` answered **200 with a complete
 * eleven-guideline verdict and nine findings** for a programme that does not
 * exist, for another organisation's programme, and for the string
 * `not-a-uuid`. The findings were the "nothing is recorded" ones, so a mistyped
 * id read as a confident compliance report about an empty register — which is
 * what the process-capability route's own docstring, three screens down, calls
 * the one thing it must never produce.
 *
 * A 404, not a 403: that a programme exists in another organisation is not this
 * caller's to learn. Returns true when the caller may proceed; the refusal is
 * already written when it returns false.
 */
/**
 * The composition boundary (decision P-28: small-molecule Module 3 for a US
 * IND), asked by every route here that states regulatory content for a
 * program: the QbD designation, the ICH compliance verdict, the control
 * strategy, the Q1E shelf life and batch poolability. Each of these used to
 * answer a monoclonal antibody with small-molecule content (Q3A(R2) impurity
 * bases, Q6A release defaults, a Q1E-extrapolated shelf life). True when it
 * has answered: the boundary's own 409 body, and nothing was computed.
 */
async function refusedAtCompositionBoundary(res: express.Response, orgId: number, projectId: string): Promise<boolean> {
  const { assessProgramCompositionScope } = await import('../../services/cmc/module3-compile');
  const refusal = await assessProgramCompositionScope(orgId, projectId);
  if (!refusal) return false;
  res.status(compositionRefusalStatus(refusal)).json(compositionRefusalBody(refusal));
  return true;
}

/**
 * The boundary for stability studies: each is judged on the program it is
 * filed under (services/cmc/study-composition-scope.ts, which AnA's stability
 * tools ask too).
 */
async function studiesRefusedAtCompositionBoundary(
  res: express.Response,
  orgId: number,
  studies: ReadonlyArray<{ id: number; projectId: string | null }>,
): Promise<boolean> {
  const { studiesCompositionRefusal } = await import('../../services/cmc/study-composition-scope');
  const refusal = await studiesCompositionRefusal(orgId, studies);
  if (!refusal) return false;
  res.status(compositionRefusalStatus(refusal)).json(compositionRefusalBody(refusal));
  return true;
}

async function answeredUnknownProgram(res: express.Response, orgId: number, projectId: string): Promise<boolean> {
  const { projectBelongsToTenant } = await import('../../services/cmc/project-membership');
  if (await projectBelongsToTenant({ organizationId: orgId, projectId })) return false;
  res.status(404).json({
    success: false,
    error: 'No such program in this organization — nothing was assessed.',
  });
  return true;
}

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
    if (await answeredUnknownProgram(res, orgId, projectId)) return;
    if (await refusedAtCompositionBoundary(res, orgId, projectId)) return;
    const { analyzeQbdFromSources } = await import('../../services/cmc/qbd-analyzer');
    const result = await analyzeQbdFromSources(orgId, projectId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('QbD analysis error:', error);
    return serverError(res, logger, 'loading QbD', error);
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
    if (await answeredUnknownProgram(res, orgId, projectId)) return;
    if (await refusedAtCompositionBoundary(res, orgId, projectId)) return;
    const { runIchComplianceCheck } = await import('../../services/cmc/ich-compliance-checker');
    const report = await runIchComplianceCheck(orgId, projectId);
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('ICH compliance check error:', error);
    return serverError(res, logger, 'saving ICH compliance', error);
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
    if (launchScopeEnforced()) {
      return res.status(409).json({ success: false, error: 'CMC_VARIATIONS_OUT_OF_SCOPE', message: 'Postapproval variation assessment is outside this release. This release composes small-molecule Module 3 for a US IND; a PAS, CBE or international marketing variation does not classify an IND change.' });
    }
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
    return serverError(res, logger, 'classifying variations', error);
  }
});

/**
 * POST /api/cmc/control-strategy
 * Deterministic ICH Q8/Q9/Q10/Q11-grade control strategy generator.
 * Reads CMC source objects, specs, methods, stability — produces a
 * structured control strategy with risk-based justifications and
 * cited guidance. It is the only control-strategy path: the playbook
 * router's model-prompted control strategy (playbookRoutes.ts) was retired.
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
    if (await answeredUnknownProgram(res, orgId, projectId)) return;
    if (await refusedAtCompositionBoundary(res, orgId, projectId)) return;
    const { generateControlStrategy } = await import('../../services/cmc/control-strategy-generator');
    const strategy = await generateControlStrategy(orgId, projectId, scope);
    res.json({ success: true, data: strategy });
  } catch (error) {
    console.error('Control strategy generator error:', error);
    return serverError(res, logger, 'saving control strategy', error);
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
        projectId: stabilityStudies.projectId,
      })
      .from(stabilityStudies)
      .where(and(eq(stabilityStudies.id, id), eq(stabilityStudies.organizationId, orgId)));
    if (!study) return res.status(404).json({ success: false, error: 'Stability study not found' });
    if (await studiesRefusedAtCompositionBoundary(res, orgId, [study])) return;

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
 * POST /api/cmc/stability-studies/:id/trending — out-of-trend assessment of a
 * recorded study. Same function the composed §3.2.S.7 / §3.2.P.8 and the AnA
 * tool call (services/cmc/recorded-stability.assessRecordedTrending); the
 * study-level refusal is a 409, per-series refusals travel in the data.
 */
router.post('/stability-studies/:id/trending', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    /* stability_studies.id is a serial: a non-numeric segment reaches Postgres
       as the literal 'NaN', which answers 22P02 and reached the client as a 500
       logged as a CMC write failure. A client-side typo is a bad request, and
       this route writes nothing. */
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'A numeric stability study id is required.' });
    }
    const orgId = getOrgId(req);
    const [study] = await db
      .select({
        id: stabilityStudies.id,
        storageConditions: stabilityStudies.storageConditions,
        stabilityData: stabilityStudies.stabilityData,
      })
      .from(stabilityStudies)
      .where(and(eq(stabilityStudies.id, id), eq(stabilityStudies.organizationId, orgId)));
    if (!study) return res.status(404).json({ success: false, error: 'Stability study not found' });
    const { assessRecordedTrending } = await import('../../services/cmc/recorded-stability');
    const outcome = assessRecordedTrending(study);
    if (!outcome.ok) return res.status(409).json({ success: false, error: outcome.error });
    return res.json({ success: true, data: outcome.data });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to assess the stability trend');
  }
});

/**
 * GET /api/cmc/projects/:projectId/process-capability — the capability indices
 * over the project's RECORDED batch results, per test, for each side.
 *
 * ── Why this route exists ────────────────────────────────────────────────────
 * The Pp/Ppk/Cp/Cpk a reviewer reads in the compiled §3.2.S.4.4 and §3.2.P.5.4
 * could only be seen by compiling the section. "Is this process capable against
 * the specification we set" is a question a CMC lead asks before compiling, and
 * during a deviation, and the answer existed nowhere it could be asked.
 *
 * It reads the project's canonical `qc_result` source objects — the same rows
 * the section composes from — and runs the same assessment
 * (services/cmc/recorded-capability), so this route and the document can never
 * disagree.
 *
 * Nothing is written, and nothing is refused as a whole: a series that cannot
 * be assessed is RETURNED with its reason (criteria that disagree, fewer than
 * six batches, no variation), because a test silently missing from a capability
 * report reads as a test that passed.
 */
router.get('/projects/:projectId/process-capability', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const projectId = String(req.params.projectId);
    /* A project this tenant does not hold is a 404, not a capability report
       with no findings. Without this, a mistyped uuid and another org's program
       both answered 200 with two empty series — a completed assessment over a
       register that was never read, which is the one reading this route's own
       docstring forbids. */
    const { projectBelongsToTenant } = await import('../../services/cmc/project-membership');
    if (!(await projectBelongsToTenant({ organizationId: orgId, projectId }))) {
      return res.status(404).json({
        success: false,
        error: 'No such project in this organization — no capability was assessed.',
      });
    }
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT source_payload as "sourcePayload"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2 AND source_type = 'qc_result'
       ORDER BY updated_at DESC`,
      [orgId, projectId],
    );
    const payloads = rows.map((r: { sourcePayload: Record<string, unknown> | null }) => r.sourcePayload || {});
    const { assessRecordedCapability, capabilitySentence, isBatchAnalysisFor } = await import(
      '../../services/cmc/recorded-capability'
    );
    const sides = ['drug_substance', 'drug_product'] as const;
    const bySide = Object.fromEntries(
      sides.map((side) => {
        const series = assessRecordedCapability(payloads.filter((p) => isBatchAnalysisFor(p, side)));
        return [side, { series, statements: series.map(capabilitySentence) }];
      }),
    ) as Record<(typeof sides)[number], { series: unknown[]; statements: string[] }>;
    /* "Assessed" means a SERIES was produced, not that rows exist. Keying it on
       the row count reported a successful, empty capability report for a
       project whose every QC row is a cleaning swab or a reference-standard
       qualification (not batch evidence) or carries no test method — N results
       on file, no test named, and nothing said. A report that names no test
       reads as a set of tests that passed, which is the one thing this endpoint
       must never produce. */
    const seriesCount = sides.reduce((n, side) => n + bySide[side].series.length, 0);
    const data = {
      projectId,
      resultsOnFile: payloads.length,
      assessed: seriesCount > 0,
      statement:
        seriesCount > 0
          ? null
          : payloads.length === 0
            ? 'No batch results are recorded for this project, so process capability is NOT assessed. ' +
              'Record the QC results, each with its batch number and the acceptance criterion it was judged against.'
            : `${payloads.length} QC result(s) are on file for this project and none of them is batch-analysis ` +
              'evidence with a named test method — cleaning-verification and reference-standard results are not ' +
              'batch data, and a result with no test method opens no series. Process capability is NOT assessed.',
      sides: bySide,
    };
    return res.json({ success: true, data });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to assess process capability');
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
        projectId: stabilityStudies.projectId,
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

    if (await studiesRefusedAtCompositionBoundary(res, orgId, studies)) return;

    const outcome = await assessRecordedPoolability(studies);
    if (!outcome.ok) {
      return res.status(outcome.status).json({ success: false, error: outcome.error });
    }
    return res.json({ success: true, data: outcome.data });
  } catch (error) {
    return respondWriteError(res, error, 'Failed to assess batch poolability');
  }
});

/**
 * GET /api/cmc/register-history/:register/:id — every chained act recorded
 * against one register record, oldest first, each with the fields that moved
 * and both values.
 *
 * 21 CFR 11.10(e): "Record changes shall not obscure previously recorded
 * information." The before-values reached the chain on 2026-10-18
 * (URS-CMC-025) and no working route returned them — the tenant ledger carries
 * the act and the actor but no changed fields and no way to ask about one
 * record, and the per-entity Part 11 route is deliberately disconnected. See
 * `services/cmc/register-history.ts`.
 *
 * ── Why its own namespace, and not `/:register/:id/history` ──────────────────
 * Two reasons, both found by running the checks rather than reasoning about it:
 *
 *  1. This router is mounted on the bare `/api/cmc` BEFORE the specifications
 *     and batch-records routers (`bootstrap/register-core-routes.ts`), so a
 *     parameter route here swallows `/api/cmc/specifications/:id/history` —
 *     a working capability over a different store — and answers 404 for it.
 *  2. `ci:launch-scope-api` refused the client call: a path whose FIRST
 *     segment is a variable normalises to `/api/cmc/:p/:p/history`, which no
 *     surface prefix can claim. P-28 deliberately does not claim the bare
 *     `/api/cmc`, so the alternative would have been to widen the catalog's
 *     narrowest claim to make a read route attributable. A fixed namespace is
 *     one prefix, declared with its reason, and exactly as narrow as the thing
 *     it serves (`shared/constants/ui-surface-registry.ts`).
 *
 * `specifications` is deliberately not one of the registers served here: it has
 * its own history route over `specification_audit_log` (`specificationRoutes.ts`).
 */
router.get('/register-history/:register/:id', async (req, res) => {
  const registerPath = String(req.params.register);
  const target = (REGISTER_HISTORY_PATHS as Record<string, (typeof REGISTER_HISTORY_PATHS)[CmcRegisterHistoryPath]>)[
    registerPath
  ];
  if (!target) {
    return res.status(404).json({
      success: false,
      error:
        `No change history is kept for /api/cmc/${registerPath}. Registers with one: ` +
        `${REGISTER_HISTORY_PATH_NAMES.join(', ')}.`,
    });
  }
  const recordId = String(req.params.id);
  let client;
  try {
    const orgId = getOrgId(req);
    /* The record must be this organisation's before its history is read, and
       another tenant's record is a 404: that it exists at all is not this
       caller's to learn. */
    if (!(await registerRecordIsTenants(target, recordId, orgId))) {
      return res.status(404).json({ success: false, error: `No such ${target.noun} in this organization.` });
    }
    client = await getPool().connect();
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const history = await readRegisterHistory(client, {
      orgId,
      tableName: getTableName(target.table),
      recordId,
    });
    await client.query('COMMIT');
    const entries = history.entries;
    return res.json({
      success: true,
      data: {
        register: target.register,
        recordId,
        entries,
        /* A record with more acts than one read returns loses its OLDEST,
           possibly its create — so the reader is told, rather than shown a
           history that begins in the middle as if it began there. */
        earlierActsNotShown: history.earlierActsNotShown,
        /* What an empty history is, said plainly: no act was chained against
           this record, which is not the same as nothing having happened to it.
           A record written before 2026-10-18 has no operator on the chain, and
           an edit made before that date has no change record. */
        note:
          entries.length === 0
            ? 'No chained act is recorded against this record. A record created before 2026-10-18 carries no ' +
              'operator, and an edit made before that date carries no change history.'
            : null,
      },
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    /* Fail closed. An empty §11.10(e) history and a history that could not be
       read are indistinguishable to an inspector, and only one of them is
       something this route may claim. */
    if (error instanceof MissingAuditStore) {
      return res.status(503).json({ success: false, error: 'AUDIT_TABLE_MISSING' });
    }
    return respondWriteError(res, error, `Failed to read the ${target.noun} history`);
  } finally {
    client?.release();
  }
});

export default router;
