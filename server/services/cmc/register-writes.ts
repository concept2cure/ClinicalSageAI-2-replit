/**
 * The CMC register creates, as service functions.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Every register's canonical write used to be the body of an Express handler
 * in server/api/cmc/routes.ts — zod parse, governed-field stripping, the
 * drizzle insert, and the awaited Module 3 link. Nothing beneath it could be
 * called in-process, so the guided CMC interview's commit projector
 * (services/cmc/interview-commit.ts) had no way to write what an interview
 * captured except by re-implementing those steps, which would have been a
 * second write path for the same registers. Each create now lives here ONCE;
 * the route and the projector both call it.
 *
 * A create parses the body with the register's own zod schema (a bad field
 * throws the ZodError the route turns into a 400), refuses a self-declared
 * qualification or a second `current` formulation with RegisterWriteRefusal
 * (the route's 409), inserts under the caller's tenant, and links the row
 * into the Module 3 canonical layer through the one shared path, reporting
 * whether that link landed. The row is never rolled back on a link failure.
 *
 * @module server/services/cmc/register-writes
 */
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db, getPool } from '../../db';
import { withoutTenantKey, withoutOrgId } from '../../utils/authedOrgId';
import {
  cmcCharacterizationStudies,
  cmcContainerClosures,
  cmcFormulationRecords,
  cmcMaterialSpecs,
  drugProducts,
  drugSubstances,
  insertCmcCharacterizationStudySchema,
  insertCmcContainerClosureSchema,
  insertCmcFormulationRecordSchema,
  insertCmcMaterialSpecSchema,
  insertDrugProductSchema,
  insertDrugSubstanceSchema,
} from '../../../shared/schema';
/* manufacturing_processes predates this register family and is modelled in
   shared/cmc-schema.ts, not shared/schema.ts. */
import { manufacturingProcesses } from '../../../shared/cmc-schema';
import {
  writeThroughCharacterizationStudy,
  writeThroughContainerClosure,
  writeThroughDrugProduct,
  writeThroughDrugSubstance,
  writeThroughFormulationRecord,
  writeThroughManufacturingProcess,
  writeThroughMaterialSpec,
} from '../cmc-write-through';
import { linkToModule3, type Module3Linkage, type ProjectSource } from './link-to-module3';
/* The row and the record of WHO recorded it, in one transaction (§11.10(e)).
   Shared with the registers whose create lives in its route. */
import { insertRegisterRow, type RegisterActor } from './register-audit';
import { SIGNED_REGISTERS, signedRegisterByPath, withoutSignatureFields } from './signed-record';
import { projectBelongsToTenant } from './project-membership';

/* ─── Body primitives, shared with the routes ─────────────────────────────── */

/**
 * Timestamps arrive from a form as ISO strings. These accept an ISO string (or
 * a Date) and normalise blank/absent to undefined, so an optional timestamp
 * left empty is "not set" rather than `new Date('')` → Invalid Date.
 */
export const requiredDate = z.coerce.date();
export const optionalDate = z.preprocess(
  v => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.date().optional(),
);

/** The tenant key is taken from the authenticated context, never the body.
 *  The canonical pair lives in server/utils/authedOrgId.ts; re-exported here
 *  for the CMC routers that import it from this module. */
export { withoutTenantKey, withoutOrgId };

/* ─── The register bodies ─────────────────────────────────────────────────── */

export const drugSubstanceBody = withoutTenantKey(insertDrugSubstanceSchema);
export const drugProductBody = withoutTenantKey(insertDrugProductSchema);
export const containerClosureBody = withoutTenantKey(insertCmcContainerClosureSchema).extend({
  qualificationDate: optionalDate,
});
export const materialSpecBody = withoutTenantKey(insertCmcMaterialSpecSchema);
export const formulationRecordBody = withoutTenantKey(insertCmcFormulationRecordSchema);
export const characterizationStudyBody = withoutTenantKey(insertCmcCharacterizationStudySchema).extend({
  performedDate: optionalDate,
  qualificationDate: optionalDate,
});
/* Its projectId is a uuid column, so the body takes it as a uuid string;
   organizationId is set by the caller's tenant. */
export const manufacturingProcessBody = z.object({
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

/* ─── Governed-state refusals ─────────────────────────────────────────────── */

/** A write the register allows only through a governed path — the route's 409. */
export class RegisterWriteRefusal extends Error {
  readonly status = 409 as const;
  constructor(message: string) {
    super(message);
    this.name = 'RegisterWriteRefusal';
  }
}

/* ─── The program a register record is filed under ────────────────────────── */

export const PROJECT_NOT_IN_TENANT_REFUSAL =
  'The program named is not one of this organisation’s programs, so the record was not filed under it.';

/**
 * The program a NEW register record is filed under: the body's, once it is
 * shown to be this organisation's. A create used to store (or forward) a body
 * projectId without asking, so a record could be filed under a program the
 * caller does not hold (discovery map, create-paths-skip-project-membership).
 */
export async function filedProjectOnCreate(orgId: number, sent: unknown): Promise<string | null> {
  const projectId = typeof sent === 'string' ? sent.trim() : '';
  if (!projectId) return null;
  if (!(await projectBelongsToTenant({ organizationId: orgId, projectId }))) {
    throw new RegisterWriteRefusal(PROJECT_NOT_IN_TENANT_REFUSAL);
  }
  return projectId;
}

/** A register table that carries its program, and the source type its rows file as. */
export interface ProgramFiledRegister {
  table: string;
  sourceType: string;
}

export const PROGRAM_FILED_REGISTERS = {
  drugSubstance: { table: 'drug_substances', sourceType: 'drug_substance' },
  drugProduct: { table: 'drug_products', sourceType: 'drug_product' },
  stabilityStudy: { table: 'stability_studies', sourceType: 'stability' },
  analyticalMethod: { table: 'analytical_methods', sourceType: 'method' },
  processValidation: { table: 'process_validation', sourceType: 'process_validation' },
  changeControl: { table: 'cmc_change_control', sourceType: 'change_control' },
} as const satisfies Record<string, ProgramFiledRegister>;

/**
 * What an edit may do to a record's program. A filed record keeps its
 * program: an edit never moves it, whatever the body says. A legacy record
 * with no program (written before migrations/20261005_cmc_core_registers_
 * project.sql) is filed under the body's program on its first edit — once that
 * program is shown to be this organisation's, and only if no OTHER program
 * already holds the record's canonical source object. That last case is the
 * fork the column exists to end: editing program A's substance while program B
 * was open filed a second copy under B. It is refused, and nothing is written.
 *
 * Returns `found: false` when the record is not this organisation's.
 */
export async function projectOnEdit(
  orgId: number,
  register: ProgramFiledRegister,
  id: number,
  sent: unknown,
): Promise<{ found: boolean; set: { projectId?: string } }> {
  const pool = getPool();
  const stored = await pool.query(
    `SELECT project_id FROM ${register.table} WHERE id = $1 AND organization_id = $2`,
    [id, orgId],
  );
  if (stored.rows.length === 0) return { found: false, set: {} };
  if (stored.rows[0].project_id) return { found: true, set: {} };
  const projectId = typeof sent === 'string' ? sent.trim() : '';
  if (!projectId) return { found: true, set: {} };
  if (!(await projectBelongsToTenant({ organizationId: orgId, projectId }))) {
    throw new RegisterWriteRefusal(PROJECT_NOT_IN_TENANT_REFUSAL);
  }
  const elsewhere = await pool.query(
    `SELECT DISTINCT project_id FROM cmc_source_objects
      WHERE organization_id = $1 AND source_type = $2 AND source_key = $3 AND project_id <> $4
      LIMIT 1`,
    [orgId, register.sourceType, `${register.sourceType}:${id}`, projectId],
  );
  if (elsewhere.rows.length > 0) {
    throw new RegisterWriteRefusal(
      'This record is already part of another program’s Module 3, so it was not filed under this one and nothing ' +
        'was changed. Open that program to edit it, or record it again in this program.',
    );
  }
  return { found: true, set: { projectId } };
}

/** An edit body without its program: a filed record's program is fixed at creation. */
export function withoutProject<T extends Record<string, unknown>>(data: T): Omit<T, 'projectId'> {
  const rest: Record<string, unknown> = { ...data };
  delete rest.projectId;
  return rest as Omit<T, 'projectId'>;
}

export interface QualificationVocab {
  signedValue: string;
  verb: string;
  path: string;
}

/**
 * A register's signing words, read from the one descriptor table
 * (services/cmc/signed-record.ts `SIGNED_REGISTERS`). Until 2026-10-18 these
 * were two exported constants that every call site chose between, so adding a
 * register meant adding a third constant and remembering to pass it — and the
 * eight registers that had no constant simply had no rule.
 *
 * An unknown path throws rather than defaulting to `qualified`: a refusal
 * naming the wrong endpoint is worse than a crash in the one test that would
 * see it.
 */
export function vocabFor(registerPath: string): QualificationVocab {
  const register = signedRegisterByPath(registerPath);
  if (!register) {
    throw new Error(
      `[cmc] no signed register is registered for "${registerPath}". ` +
        'Add it to SIGNED_REGISTERS (services/cmc/signed-record.ts) before guarding its status.',
    );
  }
  return { signedValue: register.signedValue, verb: register.verb, path: register.signPath };
}

/**
 * Why a self-declared qualification is refused, or null when the write is an
 * ordinary one. The route turns the message into a 409; the projector throws
 * it as a RegisterWriteRefusal.
 *
 * Refuses the TRANSITION into the signed state (a record already there must
 * be able to round-trip its own status through an edit), and the transition
 * out of it (an unsigned de-qualification would strand the signature on a
 * record that no longer claims it). Retiring a signed record is a lifecycle
 * end, not a reversal, and is allowed.
 */
export function ungovernedQualificationRefusal(
  status: unknown,
  registerPath: string,
  storedStatus?: unknown,
): string | null {
  const vocab = vocabFor(registerPath);
  /* Lower-cased, because a register keeps its own casing for its own
     vocabulary: the stability register's words are upper-case (COMPLETED) and
     every other register's are lower-case, and a comparison that respected
     either one would silently stop guarding the other. */
  const signed = vocab.signedValue.toLowerCase();
  const incoming = String(status ?? '').trim().toLowerCase();
  const stored = String(storedStatus ?? '').trim().toLowerCase();
  if (incoming === signed && stored !== signed) {
    return (
      `${vocab.verb} is a governed action and is recorded with a signature. ` +
      `POST /api/cmc/${registerPath}/:id/${vocab.path} with a reason and re-authentication.`
    );
  }
  if (stored === signed && incoming && incoming !== signed && incoming !== 'retired') {
    return (
      `This record is ${signed} under a recorded signature and cannot be returned to "${incoming}" by an ordinary edit. ` +
      `Retire it, or record a new assessment.`
    );
  }
  return null;
}

/**
 * Exactly one formulation version may be `current` per project: §3.2.P.1
 * renders the current composition, and two records claiming it means the
 * governing composition is not established. Returns the refusal, or null.
 *
 * `storedProjectId` is the project the record ACTUALLY belongs to on an
 * update — the patch never carries it — so the check is scoped to the
 * project's own records rather than to unfiled ones.
 */
export async function currentFormulationConflict(
  orgId: number,
  incoming: Record<string, unknown>,
  excludeId: number | null,
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

/* ─── The creates ─────────────────────────────────────────────────────────── */

/** A created register row, with what the response says about its Module 3 link. */
export interface RegisterCreated<Row> extends Module3Linkage {
  row: Row;
}

/**
 * `actor` is the person recording the row (§11.10(e)) — the route's session,
 * the interview projector's commit scope. It is required: a create with nobody
 * to name refuses and writes nothing.
 *
 * `link` names the program for the registers whose tables carry no project
 * column (drug substance, drug product): the route passes its request so the
 * body's projectId is read; the projector passes the session's project.
 */
export async function createDrugSubstance(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof drugSubstances.$inferSelect>> {
  const validated = drugSubstanceBody.parse(body);
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const row = await insertRegisterRow(orgId, actor, 'drug_substance', drugSubstances, {
    ...validated,
    projectId,
    organizationId: orgId,
  } as typeof drugSubstances.$inferInsert);
  const linkage = await linkToModule3('write_through_drug_substance', orgId, row, writeThroughDrugSubstance, link);
  return { row, ...linkage };
}

export async function createDrugProduct(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof drugProducts.$inferSelect>> {
  const validated = drugProductBody.parse(body);
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const row = await insertRegisterRow(orgId, actor, 'drug_product', drugProducts, {
    ...validated,
    projectId,
    organizationId: orgId,
  } as typeof drugProducts.$inferInsert);
  const linkage = await linkToModule3('write_through_drug_product', orgId, row, writeThroughDrugProduct, link);
  return { row, ...linkage };
}

export async function createContainerClosure(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcContainerClosures.$inferSelect>> {
  const validated = containerClosureBody.parse(body) as Record<string, unknown>;
  const refusal = ungovernedQualificationRefusal(validated.status, 'container-closures');
  if (refusal) throw new RegisterWriteRefusal(refusal);
  /* The program the record is filed under must be this organisation's.
     Without this the create wrote the body's projectId straight into the
     row: a typo filed an invisible record, and a programme id belonging
     to another organisation filed one under a dossier this tenant does
     not hold. `filedProjectOnCreate` returns null for an absent program,
     which is an org-wide record, and refuses one that is not ours. */
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const row = await insertRegisterRow(orgId, actor, 'container_closure', cmcContainerClosures, {
    ...withoutSignatureFields(SIGNED_REGISTERS.containerClosures, validated),
    projectId,
    organizationId: orgId,
  } as typeof cmcContainerClosures.$inferInsert);
  const linkage = await linkToModule3('write_through_container_closure', orgId, row, writeThroughContainerClosure, link);
  return { row, ...linkage };
}

export async function createMaterialSpec(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcMaterialSpecs.$inferSelect>> {
  const validated = materialSpecBody.parse(body) as Record<string, unknown>;
  /* The program the record is filed under must be this organisation's.
     Without this the create wrote the body's projectId straight into the
     row: a typo filed an invisible record, and a programme id belonging
     to another organisation filed one under a dossier this tenant does
     not hold. `filedProjectOnCreate` returns null for an absent program,
     which is an org-wide record, and refuses one that is not ours. */
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const row = await insertRegisterRow(orgId, actor, 'material_spec', cmcMaterialSpecs, {
    ...withoutOrgId(validated),
    projectId,
    organizationId: orgId,
  } as typeof cmcMaterialSpecs.$inferInsert);
  const linkage = await linkToModule3('write_through_material_spec', orgId, row, writeThroughMaterialSpec, link);
  return { row, ...linkage };
}

export async function createFormulationRecord(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcFormulationRecords.$inferSelect>> {
  const validated = formulationRecordBody.parse(body) as Record<string, unknown>;
  /* The program the record is filed under must be this organisation's.
     Without this the create wrote the body's projectId straight into the
     row: a typo filed an invisible record, and a programme id belonging
     to another organisation filed one under a dossier this tenant does
     not hold. `filedProjectOnCreate` returns null for an absent program,
     which is an org-wide record, and refuses one that is not ours. */
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const conflict = await currentFormulationConflict(orgId, validated, null);
  if (conflict) throw new RegisterWriteRefusal(conflict);
  const row = await insertRegisterRow(orgId, actor, 'formulation_record', cmcFormulationRecords, {
    ...withoutOrgId(validated),
    projectId,
    organizationId: orgId,
  } as typeof cmcFormulationRecords.$inferInsert);
  const linkage = await linkToModule3('write_through_formulation_record', orgId, row, writeThroughFormulationRecord, link);
  return { row, ...linkage };
}

export async function createManufacturingProcess(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof manufacturingProcesses.$inferSelect>> {
  const validated = manufacturingProcessBody.parse(body);
  /* The program the record is filed under must be this organisation's.
     Without this the create wrote the body's projectId straight into the
     row: a typo filed an invisible record, and a programme id belonging
     to another organisation filed one under a dossier this tenant does
     not hold. `filedProjectOnCreate` returns null for an absent program,
     which is an org-wide record, and refuses one that is not ours. */
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const refusal = ungovernedQualificationRefusal(validated.validationStatus, 'manufacturing-processes');
  if (refusal) throw new RegisterWriteRefusal(refusal);
  const row = await insertRegisterRow(orgId, actor, 'manufacturing_process', manufacturingProcesses, {
    ...validated,
    projectId,
    organizationId: orgId,
  } as typeof manufacturingProcesses.$inferInsert);
  const linkage = await linkToModule3('write_through_manufacturing_process', orgId, row, writeThroughManufacturingProcess, link);
  return { row, ...linkage };
}

export async function createCharacterizationStudy(
  orgId: number,
  body: unknown,
  actor: RegisterActor,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcCharacterizationStudies.$inferSelect>> {
  const validated = characterizationStudyBody.parse(body) as Record<string, unknown>;
  const refusal = ungovernedQualificationRefusal(validated.status, 'characterization-studies');
  if (refusal) throw new RegisterWriteRefusal(refusal);
  /* The program the record is filed under must be this organisation's.
     Without this the create wrote the body's projectId straight into the
     row: a typo filed an invisible record, and a programme id belonging
     to another organisation filed one under a dossier this tenant does
     not hold. `filedProjectOnCreate` returns null for an absent program,
     which is an org-wide record, and refuses one that is not ours. */
  const projectId = await filedProjectOnCreate(orgId, (validated as { projectId?: unknown }).projectId);
  const row = await insertRegisterRow(orgId, actor, 'characterization_study', cmcCharacterizationStudies, {
    ...withoutSignatureFields(SIGNED_REGISTERS.characterizationStudies, validated),
    projectId,
    organizationId: orgId,
  } as typeof cmcCharacterizationStudies.$inferInsert);
  const linkage = await linkToModule3('write_through_characterization_study', orgId, row, writeThroughCharacterizationStudy, link);
  return { row, ...linkage };
}

/* ─── Plan validation ─────────────────────────────────────────────────────── */

export type RegisterName =
  | 'drug_substance'
  | 'drug_product'
  | 'container_closure'
  | 'manufacturing_process'
  | 'formulation_record'
  | 'material_spec'
  | 'characterization_study';

const REGISTER_BODIES: Record<RegisterName, z.ZodTypeAny> = {
  drug_substance: drugSubstanceBody,
  drug_product: drugProductBody,
  container_closure: containerClosureBody,
  manufacturing_process: manufacturingProcessBody,
  formulation_record: formulationRecordBody,
  material_spec: materialSpecBody,
  characterization_study: characterizationStudyBody,
};

/**
 * Would this body be accepted by the register's create? The reason it would
 * not, or null. Used to check a whole commit plan BEFORE its first write, so a
 * plan with one doomed entry refuses with nothing written rather than landing
 * the entries before it and stopping.
 */
export function registerBodyRefusal(register: RegisterName, body: unknown): string | null {
  const parsed = REGISTER_BODIES[register].safeParse(body);
  if (parsed.success) return null;
  const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`);
  const projectIssue = parsed.error.issues.find((i) => i.path[0] === 'projectId');
  const hint =
    register === 'manufacturing_process' && projectIssue
      ? ' The manufacturing register keys its program by uuid; a legacy numeric project id cannot file a process — run the interview under a program.'
      : '';
  return `${register}: ${issues.join('; ')}.${hint}`;
}
