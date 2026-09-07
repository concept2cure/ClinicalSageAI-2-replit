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
import { db } from '../../db';
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

/** The tenant key is taken from the authenticated context, never the body. */
export function withoutTenantKey<S extends z.AnyZodObject>(schema: S): S {
  return schema.omit({ organizationId: true } as never) as unknown as S;
}

/** Strip the tenant key from a validated body. */
export function withoutOrgId<T extends Record<string, unknown>>(data: T): Omit<T, 'organizationId'> {
  const { organizationId: _discard, ...rest } = data as { organizationId?: unknown } & T;
  return rest as Omit<T, 'organizationId'>;
}

/**
 * Strip the tenant key AND the signature columns. Who qualified a record, and
 * when, is written only by the governed /qualify path under a verified
 * signature — never by a create or an ordinary edit.
 */
export function withoutGovernedFields<T extends Record<string, unknown>>(
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

export interface QualificationVocab {
  signedValue: string;
  verb: string;
  path: string;
}

/** A reference standard, container closure or study is `qualified`, signed at /qualify. */
export const QUALIFICATION_VOCAB: QualificationVocab = {
  signedValue: 'qualified',
  verb: 'Qualification',
  path: 'qualify',
};

/** A manufacturing process is `validated`, signed at /validate. Same rule, other words. */
export const PROCESS_VOCAB: QualificationVocab = {
  signedValue: 'validated',
  verb: 'Process validation',
  path: 'validate',
};

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
  vocab: QualificationVocab = QUALIFICATION_VOCAB,
): string | null {
  const signed = vocab.signedValue;
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
 * `link` names the program for the registers whose tables carry no project
 * column (drug substance, drug product): the route passes its request so the
 * body's projectId is read; the projector passes the session's project.
 */
export async function createDrugSubstance(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof drugSubstances.$inferSelect>> {
  const validated = drugSubstanceBody.parse(body);
  const [row] = await db
    .insert(drugSubstances)
    .values({ ...validated, organizationId: orgId } as typeof drugSubstances.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_drug_substance', orgId, row, writeThroughDrugSubstance, link);
  return { row, ...linkage };
}

export async function createDrugProduct(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof drugProducts.$inferSelect>> {
  const validated = drugProductBody.parse(body);
  const [row] = await db
    .insert(drugProducts)
    .values({ ...validated, organizationId: orgId } as typeof drugProducts.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_drug_product', orgId, row, writeThroughDrugProduct, link);
  return { row, ...linkage };
}

export async function createContainerClosure(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcContainerClosures.$inferSelect>> {
  const validated = containerClosureBody.parse(body) as Record<string, unknown>;
  const refusal = ungovernedQualificationRefusal(validated.status, 'container-closures');
  if (refusal) throw new RegisterWriteRefusal(refusal);
  const [row] = await db
    .insert(cmcContainerClosures)
    .values({ ...withoutGovernedFields(validated), organizationId: orgId } as typeof cmcContainerClosures.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_container_closure', orgId, row, writeThroughContainerClosure, link);
  return { row, ...linkage };
}

export async function createMaterialSpec(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcMaterialSpecs.$inferSelect>> {
  const validated = materialSpecBody.parse(body) as Record<string, unknown>;
  const [row] = await db
    .insert(cmcMaterialSpecs)
    .values({ ...withoutOrgId(validated), organizationId: orgId } as typeof cmcMaterialSpecs.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_material_spec', orgId, row, writeThroughMaterialSpec, link);
  return { row, ...linkage };
}

export async function createFormulationRecord(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcFormulationRecords.$inferSelect>> {
  const validated = formulationRecordBody.parse(body) as Record<string, unknown>;
  const conflict = await currentFormulationConflict(orgId, validated, null);
  if (conflict) throw new RegisterWriteRefusal(conflict);
  const [row] = await db
    .insert(cmcFormulationRecords)
    .values({ ...withoutOrgId(validated), organizationId: orgId } as typeof cmcFormulationRecords.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_formulation_record', orgId, row, writeThroughFormulationRecord, link);
  return { row, ...linkage };
}

export async function createManufacturingProcess(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof manufacturingProcesses.$inferSelect>> {
  const validated = manufacturingProcessBody.parse(body);
  const refusal = ungovernedQualificationRefusal(validated.validationStatus, 'manufacturing-processes', undefined, PROCESS_VOCAB);
  if (refusal) throw new RegisterWriteRefusal(refusal);
  const [row] = await db
    .insert(manufacturingProcesses)
    .values({ ...validated, organizationId: orgId } as typeof manufacturingProcesses.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_manufacturing_process', orgId, row, writeThroughManufacturingProcess, link);
  return { row, ...linkage };
}

export async function createCharacterizationStudy(
  orgId: number,
  body: unknown,
  link?: ProjectSource,
): Promise<RegisterCreated<typeof cmcCharacterizationStudies.$inferSelect>> {
  const validated = characterizationStudyBody.parse(body) as Record<string, unknown>;
  const refusal = ungovernedQualificationRefusal(validated.status, 'characterization-studies');
  if (refusal) throw new RegisterWriteRefusal(refusal);
  const [row] = await db
    .insert(cmcCharacterizationStudies)
    .values({ ...withoutGovernedFields(validated), organizationId: orgId } as typeof cmcCharacterizationStudies.$inferInsert)
    .returning();
  const linkage = await linkToModule3('write_through_characterization_study', orgId, row, writeThroughCharacterizationStudy, link);
  return { row, ...linkage };
}
